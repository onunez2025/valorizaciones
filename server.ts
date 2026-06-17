import express from 'express';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import sql from 'mssql';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { assertCasRuc, enforceCasRuc } from './lib/casFilter.js';
import { addInput } from './lib/db.js';
import { validateBody } from './lib/validate.js';
import bcrypt from 'bcrypt';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const APP_IDENTIFIER = 'VAL';
const C4C_BASE_URL = process.env.C4C_BASE_URL;
const C4C_AUTH = Buffer.from(`${process.env.C4C_USER}:${process.env.C4C_PASSWORD}`).toString('base64');
const JWT_SECRET = process.env.JWT_SECRET || '';
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
    console.error('CRITICAL FATAL ERROR: JWT_SECRET environment variable is not set. Server cannot start securely.');
    process.exit(1);
}

// MS Graph API Config
const MS_GRAPH_TENANT_ID = process.env.MS_GRAPH_TENANT_ID;
const MS_GRAPH_CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
const MS_GRAPH_CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
const MS_GRAPH_SENDER_EMAIL = process.env.MS_GRAPH_SENDER_EMAIL;

async function getGraphToken() {
    const url = `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
        client_id: MS_GRAPH_CLIENT_ID || '',
        client_secret: MS_GRAPH_CLIENT_SECRET || '',
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default'
    });
    const resp = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return resp.data.access_token;
}

const cleanApps = (str: string) => [...new Set((str || '').split(',').map(s => s.trim()).filter(Boolean))].join(', ');

// Helper for Auditing
async function logAudit(req: Request, action: string, entity: string, entityId: string, details: Record<string, unknown>) {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return;
    const db = await getDb();
    const auditReq = db.request();
    addInput(auditReq, 'uid', sql.UniqueIdentifier, user.id);
    addInput(auditReq, 'un', sql.NVarChar(255), user.full_name || user.username);
    addInput(auditReq, 'acc', sql.NVarChar(100), action);
    addInput(auditReq, 'ent', sql.NVarChar(100), entity);
    addInput(auditReq, 'eid', sql.NVarChar(100), entityId);
    addInput(auditReq, 'det', sql.NVarChar(4000), JSON.stringify(details));
    await auditReq.query(`INSERT INTO [dbo].[GAC_APP_TB_AUDIT_LOG] (UsuarioID, UsuarioNombre, Accion, Entidad, EntidadID, Detalle, Fecha)
              VALUES (@uid, @un, @acc, @ent, @eid, @det, GETDATE())`);
  } catch (err) {
    console.error('❌ Falla en Log de Auditoría VAL:', err);
  }
}

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
            baseUri: ["'self'"],
        }
    }
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use(limiter);

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: { error: 'Too many login attempts, please try again after an hour.' }
});
app.use('/api/auth/login', authLimiter);

app.use(cors({
    origin: (origin, callback) => {
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`Blocked CORS attempt from: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

const dbConfig: sql.config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    server: process.env.DB_SERVER || '',
    port: 1433,
    pool: { max: 30, min: 0, idleTimeoutMillis: 30000 },
    options: { encrypt: true, trustServerCertificate: false, requestTimeout: 60000 }
};

let pool: sql.ConnectionPool | null = null;

async function getDb() {
    if (!pool) {
        try {
            pool = await new sql.ConnectionPool(dbConfig).connect();
            console.log('✅ Conectado a Azure SQL: ' + dbConfig.database);
        } catch (err: unknown) {
            console.error('❌ Error de conexión DB:', err instanceof Error ? err.message : String(err));
            pool = null;
            throw err;
        }
    }
    return pool;
}

interface JwtUserPayload {
    id: string;
    username: string;
    full_name?: string;
    role: string;
    role_name?: string;
    perms: string[];
    permissions?: string[];
    casId: string | null;
    casRUC: string | null;
    iat?: number;
    exp?: number;
}

interface AuthRequest extends Request {
    user?: JwtUserPayload;
}

const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token no encontrado' });
    try {
        (req as AuthRequest).user = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
        next();
    } catch (_err) { res.status(403).json({ error: 'Token inválido' }); }
};

app.get('/api/applications', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const activeOnly = req.query.activeOnly === 'true';
        let query = 'SELECT Id as id, Code as code, Label as label, Url as url, LogoUrl as logo_url, CAST(IsActive AS BIT) as is_active, DisplayOrder as display_order FROM [dbo].[GAC_APP_TB_CONSOLE_APPLICATIONS]';
        if (activeOnly) {
            query += ' WHERE IsActive = 1';
        }
        query += ' ORDER BY DisplayOrder ASC';
        const result = await db.request().query(query);
        res.json(result.recordset);
    } catch (err: unknown) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

const verifyPermission = (permission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = (req as AuthRequest).user;
        if (!user) return res.status(401).json({ error: 'No autenticado' });

        // Handles both local and SSO token payloads
        const roleName = (user.role || user.role_name || '').trim().toLowerCase();
        if (roleName === 'administrador') return next();

        const perms = user.perms || user.permissions || [];
        if (perms.includes(permission)) return next();

        await logAudit(req, 'ACCESO_DENEGADO', `Endpoint: ${req.method} ${req.path}`, permission, {
            ip: req.ip,
            userAgent: req.get('user-agent'),
            params: req.params,
            query: req.query
        });

        res.status(403).json({ error: `Permiso denegado: ${permission}` });
    };
};

// --- AUTH ---
const loginSchema = z.object({
    username: z.string().min(1, 'Usuario requerido').max(255),
    password: z.string().min(1, 'Contraseña requerida').max(255),
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: 'Datos de login inválidos', details: parseResult.error.issues });
    }
    const { username, password } = parseResult.data;
    try {
        const db = await getDb();
        const result = await db.request().input('u', sql.NVarChar, username).input('app', sql.NVarChar, APP_IDENTIFIER).query(`
            SELECT u.*, r.Name as RoleName, m.Name as ManagementName,
                uc.CASId as cas_id, TRIM(c.RUC) as cas_ruc
            FROM EBM.Users u
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id
            LEFT JOIN EBM.Managements m ON u.ManagementId = m.Id
            LEFT JOIN EBM.UserCAS uc ON u.Id = uc.UserId
            LEFT JOIN dbo.GAC_APP_TB_CAS c ON uc.CASId = c.ID_CAS
            WHERE (u.Username = @u OR u.Email = @u) AND u.IsActive = 1 AND (u.Apps LIKE '%' + @app + '%' OR u.Apps LIKE '%ADMIN%')
        `);
        const user = result.recordset[0];
        if (!user || !(await bcrypt.compare(password, user.PasswordHash))) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        // Check access to Valuations (VAL) or Admin
        const isAdmin = user.RoleName?.toLowerCase() === 'administrador';
        const apps = (user.Apps || '').toUpperCase();
        if (!isAdmin && !apps.includes('VAL')) {
            return res.status(403).json({ error: 'Sin acceso a la aplicación de Valorizaciones' });
        }

        const permsReqLogin = db.request();
        addInput(permsReqLogin, 'rid', sql.UniqueIdentifier, user.RoleId);
        addInput(permsReqLogin, 'app', sql.NVarChar(20), APP_IDENTIFIER);
        const perms = (await permsReqLogin.query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map(p => p.Permission);

        const token = jwt.sign({ id: user.Id, username: user.Username, role: user.RoleName, perms, casId: user.cas_id || null, casRUC: user.cas_ruc || null }, JWT_SECRET, { expiresIn: '12h' });

        const ssoToken = jwt.sign(
            { id: user.Id, role: user.RoleName, role_name: user.RoleName, username: user.Username, apps: user.Apps || '', casId: user.cas_id || null },
            JWT_SECRET, { expiresIn: '12h' }
        );
        if (process.env.NODE_ENV === 'production') {
            res.cookie('token', ssoToken, { domain: '.siatc.cloud', maxAge: 12 * 60 * 60 * 1000, httpOnly: false, secure: true, sameSite: 'lax', path: '/' });
        }

        res.json({ token, user: { id: user.Id, username: user.Username, full_name: user.FullName, email: user.Email, role_name: user.RoleName, management_id: user.ManagementId, management_name: user.ManagementName, avatar_url: user.AvatarUrl, permissions: perms, apps: user.Apps, requires_password_change: user.RequiresPasswordChange === 1 } });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get('/api/auth/me', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = (req as AuthRequest).user!;
        const db = await getDb();
        const result = await db.request().input('id', sql.UniqueIdentifier, id).query(`
            SELECT u.*, r.Name as RoleName, m.Name as ManagementName,
                uc.CASId as cas_id, TRIM(c.RUC) as cas_ruc
            FROM EBM.Users u
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id
            LEFT JOIN EBM.Managements m ON u.ManagementId = m.Id
            LEFT JOIN EBM.UserCAS uc ON u.Id = uc.UserId
            LEFT JOIN dbo.GAC_APP_TB_CAS c ON uc.CASId = c.ID_CAS
            WHERE u.Id = @id
        `);
        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        
        const permsReqMe = db.request();
        addInput(permsReqMe, 'rid', sql.UniqueIdentifier, user.RoleId);
        addInput(permsReqMe, 'app', sql.NVarChar(20), APP_IDENTIFIER);
        const perms = (await permsReqMe.query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map(p => p.Permission);
        // Emitir token fresco con casRUC para soporte SSO cross-app
        const freshToken = jwt.sign(
            { id: user.Id, username: user.Username, role: user.RoleName, perms, casId: user.cas_id || null, casRUC: user.cas_ruc || null },
            JWT_SECRET,
            { expiresIn: '12h' }
        );
        const ssoTokenMe = jwt.sign(
            { id: user.Id, role: user.RoleName, role_name: user.RoleName, username: user.Username, apps: user.Apps || '', casId: user.cas_id || null },
            JWT_SECRET, { expiresIn: '12h' }
        );
        if (process.env.NODE_ENV === 'production') {
            res.cookie('token', ssoTokenMe, { domain: '.siatc.cloud', maxAge: 12 * 60 * 60 * 1000, httpOnly: false, secure: true, sameSite: 'lax', path: '/' });
        }
        res.json({ token: freshToken, user: { id: user.Id, username: user.Username, full_name: user.FullName, email: user.Email, role_name: user.RoleName, management_id: user.ManagementId, management_name: user.ManagementName, avatar_url: user.AvatarUrl, permissions: perms, apps: user.Apps, casId: user.cas_id || null, casRUC: user.cas_ruc || null } });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- CAS ---
app.get('/api/cas', verifyToken, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as AuthRequest).user as JwtUserPayload;
        const db = await getDb();

        if (currentUser.casId) {
            const casReq = db.request();
            addInput(casReq, 'casId', sql.VarChar(50), currentUser.casId);
            const result = await casReq.query("SELECT * FROM [dbo].[GAC_APP_TB_CAS] WHERE ID_CAS = @casId");
            return res.json(result.recordset);
        }

        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CAS] ORDER BY Nombre_CAS");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- CONFIGURATION ---
app.get('/api/config', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG]");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

const crearConfigSchema = z.object({
    clave: z.string().min(1).max(100),
    valor: z.string().max(500),
    descripcion: z.string().max(200).optional(),
});
app.post('/api/config', verifyToken, verifyPermission('val.config.admin'), validateBody(crearConfigSchema), async (req: Request, res: Response) => {
    try {
        const { clave, valor, descripcion } = req.body;
        const db = await getDb();
        const configReq = db.request();
        addInput(configReq, 'clave', sql.NVarChar(100), clave);
        addInput(configReq, 'valor', sql.NVarChar(500), valor);
        addInput(configReq, 'descripcion', sql.NVarChar(200), descripcion ?? null);
        await configReq.query(`
                IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] WHERE Clave = @clave)
                BEGIN
                    UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] SET Valor = @valor, Descripcion = @descripcion WHERE Clave = @clave
                END
                ELSE
                BEGIN
                    INSERT INTO [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] (Clave, Valor, Descripcion) VALUES (@clave, @valor, @descripcion)
                END
            `);
        res.json({ message: 'Config updated' });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- CONFIG ADICIONAL POR DISTRITO ---
app.get('/api/config-distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] ORDER BY Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/config-distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id, cas_ids, distritos, importe, fecha_inicio, fecha_fin, activo } = req.body;
        const user = (req as AuthRequest).user!.username;
        const db = await getDb();
        const request = db.request();
        addInput(request, 'cas', sql.NVarChar(sql.MAX), JSON.stringify(cas_ids));
        addInput(request, 'dist', sql.NVarChar(sql.MAX), JSON.stringify(distritos));
        addInput(request, 'imp', sql.Decimal(18, 2), importe);
        addInput(request, 'fi', sql.DateTime, fecha_inicio);
        addInput(request, 'ff', sql.DateTime, fecha_fin ?? null);
        addInput(request, 'act', sql.Bit, activo ? 1 : 0);
        addInput(request, 'usr', sql.NVarChar(255), user);

        if (id) {
            addInput(request, 'id', sql.Int, Number(id));
            await request.query(`
                UPDATE [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO]
                SET CAS_Ids = @cas, Distritos = @dist, Importe = @imp, Fecha_Inicio = @fi, Fecha_Fin = @ff, Activo = @act
                WHERE Id = @id
            `);
        } else {
            await request.query(`
                INSERT INTO [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] (CAS_Ids, Distritos, Importe, Fecha_Inicio, Fecha_Fin, Activo, Creado_Por)
                VALUES (@cas, @dist, @imp, @fi, @ff, @act, @usr)
            `);
        }
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.delete('/api/config-distritos/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const idNum = parseInt(req.params.id as string, 10);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ error: 'ID inválido' });
        const user = (req as AuthRequest).user!;
        const db = await getDb();
        const existing = await db.request()
            .input('id', sql.Int, idNum)
            .query("SELECT Creado_Por FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] WHERE Id = @id");
        if (!existing.recordset[0]) return res.status(404).json({ error: 'Registro no encontrado' });
        const isAdmin = (user.role || '').toLowerCase() === 'administrador';
        if (!isAdmin && existing.recordset[0].Creado_Por !== user.username) {
            return res.status(403).json({ error: 'Sin permiso para eliminar este registro' });
        }
        await db.request()
            .input('id', sql.Int, idNum)
            .query("DELETE FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] WHERE Id = @id");
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get('/api/distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query('SELECT DISTINCT Ciudad, Distrito FROM APPGAC.ServiciosViewSQL WHERE Ciudad IS NOT NULL AND Distrito IS NOT NULL ORDER BY Ciudad, Distrito');
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- CONFIG CANAL INSTITUCIONAL ---
app.get('/api/config-canal-institucional', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] ORDER BY Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/config-canal-institucional', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id, usuario_creador, fecha_inicio, fecha_fin, importe, keywords, validacion_tipo, activo } = req.body;
        const user = (req as AuthRequest).user!.username;
        const db = await getDb();
        const request = db.request();
        addInput(request, 'uc', sql.NVarChar(255), usuario_creador);
        addInput(request, 'fi', sql.DateTime, fecha_inicio);
        addInput(request, 'ff', sql.DateTime, fecha_fin ?? null);
        addInput(request, 'imp', sql.Decimal(18, 2), importe);
        addInput(request, 'key', sql.NVarChar(500), keywords || '');
        addInput(request, 'type', sql.NVarChar(50), validacion_tipo || 'CONTIENE');
        addInput(request, 'act', sql.Bit, activo ? 1 : 0);
        addInput(request, 'usr', sql.NVarChar(255), user);

        console.log(`[CONFIG] Saving rule for ${usuario_creador}, ID: ${id || 'NEW'}`);

        if (id) {
            await request.input('id', sql.Int, Number(id)).query(`
                UPDATE [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL]
                SET Usuario_Creador = @uc, Fecha_Inicio = @fi, Fecha_Fin = @ff, Importe = @imp, 
                    Keywords = @key, Validacion_Tipo = @type, Activo = @act
                WHERE Id = @id
            `);
        } else {
            await request.query(`
                INSERT INTO [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] 
                (Usuario_Creador, Fecha_Inicio, Fecha_Fin, Importe, Keywords, Validacion_Tipo, Activo, Creado_Por)
                VALUES (@uc, @fi, @ff, @imp, @key, @type, @act, @usr)
            `);
        }
        res.json({ success: true });
    } catch (err: unknown) { 
        console.error('[CONFIG] Error saving rule:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); 
    }
});

app.delete('/api/config-canal-institucional/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        const idNum = parseInt(String(id), 10);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ error: 'ID inválido' });
        console.log(`[CONFIG] Deleting rule ID: ${idNum}`);
        await db.request().input('id', sql.Int, idNum).query("DELETE FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] WHERE Id = @id");
        res.json({ success: true });
    } catch (err: unknown) { 
        console.error('[CONFIG] Error deleting rule:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); 
    }
});


// --- VALORIZACIONES ---
// --- VALORIZACIONES HELPERS ---
async function getC4CDetails(ticketIds: string[]) {
    if (ticketIds.length === 0) return {};
    const results: Record<string, { creator: string; subject: string }> = {};
    const chunkSize = 60; // Increased chunk size for better performance
    const promises = [];

    for (let i = 0; i < ticketIds.length; i += chunkSize) {
        const chunk = ticketIds.slice(i, i + chunkSize);
        const filter = chunk.map(id => `ID eq '${id}'`).join(' or ');
        const url = `${C4C_BASE_URL}/ServiceRequestCollection?$filter=${encodeURIComponent(filter)}&$select=ID,CreatedBy,Name`;
        
        promises.push(
            axios.get(url, { 
                headers: { 'Authorization': `Basic ${C4C_AUTH}` },
                timeout: 15000 // 15s timeout per chunk
            })
            .then(resp => {
                const items = resp.data.d.results;
                items.forEach((item: { ID: string; CreatedBy: string; Name: string }) => {
                    results[item.ID] = {
                        creator: item.CreatedBy,
                        subject: item.Name
                    };
                });
            })
            .catch(err => {
                console.error(`C4C OData Chunk Error (Tickets ${i} to ${i + chunkSize}):`, err.message);
                // We don't throw here to allow partial results
            })
        );
    }

    await Promise.all(promises);
    return results;
}
app.get('/api/c4c-creators', verifyToken, async (req: Request, res: Response) => {
    try {
        const url = `${C4C_BASE_URL}/ServiceRequestCollection?$select=CreatedBy&$top=2000&$orderby=CreationDateTime desc`;
        const resp = await axios.get(url, { headers: { 'Authorization': `Basic ${C4C_AUTH}` } });
        const items = resp.data.d.results;
        const creators = Array.from(new Set(items.map((item: { CreatedBy: string }) => item.CreatedBy))).sort();
        res.json(creators);
    } catch (err: unknown) {
        console.error('C4C Creators Error:', err instanceof Error ? err.message : String(err));
        res.status(500).json({ error: "No se pudieron obtener los creadores de C4C." });
    }
});

// --- VALORIZACIONES ---
app.get('/api/valuations/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (currentUser.casId) {
        if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada' });
        if (currentUser.casRUC !== String(ruc).trim()) return res.status(403).json({ error: 'Acceso denegado' });
    }
    const { start, end } = req.query;

    console.log(`[VALUATION] Starting request - RUC: ${ruc}, Range: ${start} to ${end}`);

    try {
        const db = await getDb();
        const request = db.request();
        addInput(request, 'ruc', sql.VarChar(20), ruc);
        addInput(request, 'start', sql.VarChar(30), `${start} 00:00:00`);
        addInput(request, 'end', sql.VarChar(30), `${end} 23:59:59`);

        const sqlResult = await request.query(`
            DECLARE @diasMax INT;
            SELECT @diasMax = CAST(Valor AS INT) FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] WHERE Clave = 'DIAS_MAX_CIERRE';
            IF @diasMax IS NULL SET @diasMax = 1;

            SELECT 
                s.Ticket, s.CheckOut as Fecha, s.Servicio as ServicioNombre, 
                s.IdServicio as Servicio,
                s.CodigoExternoEquipo as CodigoEquipo,
                s.NombreEquipo as NombreEquipo,
                s.FechaVisita, s.CheckOut as FechaCierre,
                s.CodigoTecnico,
                s.IdCAS,
                s.Distrito,
                s.Ciudad as Departamento,
                s.NombreTecnico,
                s.ApellidoTecnico,
                s.ComentarioTecnico,
                DATEDIFF(day, s.FechaVisita, s.CheckOut) as DiasDiferencia,
                ISNULL(m.Categoria, 'N/A') as Categoria,
                CASE 
                    WHEN UPPER(TRIM(s.Servicio)) = 'VISITA' THEN 0
                    WHEN DATEDIFF(day, s.FechaVisita, s.CheckOut) > @diasMax THEN 0 
                    WHEN LEFT(s.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                    ELSE ISNULL(rate.Importe, 0) 
                END as TarifaBaseCalculada,
                CASE 
                    WHEN LEFT(s.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                    ELSE (
                        ISNULL((SELECT SUM(CAST(Importe AS FLOAT)) FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE Ticket = s.Ticket), 0) +
                        ISNULL((
                            SELECT SUM(Importe) 
                            FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] cfg
                            WHERE cfg.Activo = 1
                              AND EXISTS (SELECT 1 FROM OPENJSON(cfg.CAS_Ids) WHERE value = s.IdCAS)
                              AND EXISTS (SELECT 1 FROM OPENJSON(cfg.Distritos) WHERE value = s.Distrito)
                              AND s.CheckOut >= cfg.Fecha_Inicio 
                              AND (cfg.Fecha_Fin IS NULL OR s.CheckOut <= cfg.Fecha_Fin)
                        ), 0)
                    )
                END as Adicionales
            FROM [APPGAC].[ServiciosViewSQL] s
            JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
            OUTER APPLY (
                SELECT TOP 1 Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = s.CodigoExternoEquipo
            ) m
            OUTER APPLY (
                SELECT TOP 1 CAST(Importe AS FLOAT) as Importe 
                FROM (
                    -- 1. Buscar en Excepciones
                    SELECT ex.Importe, ex.Prioridad, ex.Creado_El, 1 as Source
                    FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                    WHERE ex.Empresa = s.IdCAS
                      AND ex.Estado = 'A'
                      AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = ISNULL(m.Categoria, 'N/A')))
                      AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = s.IdServicio OR value = s.Servicio))
                      AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                      AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                    
                    UNION ALL
                    
                    -- 2. Tarifario Base
                    SELECT t.Importe, 0 as Prioridad, t.Fecha_inicio as Creado_El, 0 as Source
                    FROM [dbo].[GAC_APP_TB_TARIFARIO] t 
                    WHERE t.Empresa = s.IdCAS 
                      AND (t.Servicio = s.IdServicio OR t.Servicio = s.Servicio)
                      AND TRIM(t.Categoria) = TRIM(ISNULL(m.Categoria, 'N/A'))
                      AND s.CheckOut >= t.Fecha_inicio 
                      AND (t.Fecha_fin IS NULL OR s.CheckOut <= t.Fecha_fin)
                      AND t.Estado = 'A'
                ) all_rates
                ORDER BY Source DESC, Prioridad DESC, Creado_El DESC
            ) rate
            WHERE TRIM(cas.RUC) = TRIM(@ruc) 
              AND s.CheckOut BETWEEN @start AND @end
              AND s.Estado = 'Closed'
              AND s.VisitaRealizada = 'true'
              AND s.TrabajoRealizado = 'true'
              AND s.Ticket NOT IN (SELECT Ticket FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE Tipo = 'SERVICIO')
        `);

        interface SqlTicket { Ticket: string; TarifaBaseCalculada: number; FechaCierre: string; [key: string]: unknown; }
        let tickets: SqlTicket[] = sqlResult.recordset;
        console.log(`[VALUATION] SQL query returned ${tickets.length} tickets`);

        // Fetch Institutional Rules
        const rules = (await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] WHERE Activo = 1")).recordset;

        if (tickets.length > 0 && rules.length > 0) {
            console.log(`[VALUATION] Fetching OData for ${tickets.length} tickets (Rules active: ${rules.length})`);
            const ticketIds = tickets.map(t => t.Ticket);
            const c4cDetails = await getC4CDetails(ticketIds);
            const detailCount = Object.keys(c4cDetails).length;
            console.log(`[VALUATION] OData results: ${detailCount}/${tickets.length} found`);

            tickets = tickets.map(t => {
                const details = c4cDetails[t.Ticket];
                let finalTarifaBase = t.TarifaBaseCalculada;
                let esInstitucional = false;

                if (details) {
                    const matchingRule = rules.find(r => {
                        const tDate = new Date(t.FechaCierre);
                        const rStart = new Date(r.Fecha_Inicio);
                        const rEnd = new Date(r.Fecha_Fin);
                        
                        tDate.setHours(0,0,0,0);
                        rStart.setHours(0,0,0,0);
                        rEnd.setHours(23,59,59,999);
                        
                        const dateMatch = tDate.getTime() >= rStart.getTime() && tDate.getTime() <= rEnd.getTime();
                        const userMatch = details.creator && r.Usuario_Creador && details.creator.trim().toUpperCase() === r.Usuario_Creador.trim().toUpperCase();
                        return dateMatch && userMatch;
                    });

                    if (matchingRule) {
                        finalTarifaBase = matchingRule.Importe;
                        esInstitucional = true;
                    }
                }

                return {
                    ...t,
                    TarifaBase: finalTarifaBase,
                    UsuarioCreador: details?.creator || 'N/D',
                    C4CSubject: details?.subject || '',
                    EsInstitucional: esInstitucional
                };
            });
        } else {
            if (tickets.length > 0) {
                console.log(`[VALUATION] Returning ${tickets.length} tickets (No institutional rules apply)`);
                tickets = tickets.map(t => ({ ...t, TarifaBase: t.TarifaBaseCalculada }));
            }
        }

        res.json(tickets);
    } catch (err: unknown) {
        console.error('[VALUATION] Server Error:', err instanceof Error ? err.message : String(err));
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

app.get('/api/penalty-motives', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query('SELECT IdMotivo, Motivo FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] ORDER BY Motivo');
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

const crearPenalidadSchema = z.object({
    ticket: z.string().min(1).max(50),
    fecha: z.string().min(1),
    motivo: z.string().min(1).max(200),
    descripcion: z.string().max(500).optional(),
    importe: z.number().positive(),
    ruc: z.string().min(1).max(20),
});
app.post('/api/penalties', verifyToken, validateBody(crearPenalidadSchema), async (req: Request, res: Response) => {
    const { ticket, fecha, motivo, descripcion, importe, ruc } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    const userId = currentUser.username;
    const penaltyId = crypto.randomBytes(4).toString('hex');
    try {
        const db = await getDb();

        if (currentUser.casId) {
            if (!currentUser.casRUC || String(ruc).trim() !== String(currentUser.casRUC).trim()) {
                return res.status(403).json({ error: 'No puede crear penalidades para otra empresa.' });
            }
        }
        const penReq = db.request();
        addInput(penReq, 'id', sql.VarChar(8), penaltyId);
        addInput(penReq, 'ticket', sql.VarChar(50), ticket);
        addInput(penReq, 'fecha', sql.Date, fecha);
        addInput(penReq, 'motivo', sql.NVarChar(200), motivo);
        addInput(penReq, 'desc', sql.NVarChar(500), descripcion ?? null);
        addInput(penReq, 'importe', sql.Decimal(10, 2), importe);
        addInput(penReq, 'user', sql.NVarChar(255), userId);
        await penReq.query(`
                INSERT INTO [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS]
                (ID_Descuentos_CAS, Ticket, Fecha, Motivo, Descripcion, Importe, Creado_por, Creado_el, Estado)
                VALUES (@id, @ticket, @fecha, @motivo, @desc, @importe, @user, GETDATE(), 'Pendiente')
            `);
        res.status(201).json({ id: penaltyId });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.put('/api/penalties/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { fecha, motivo, descripcion, importe } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getDb();

        if (currentUser.casId) {
            const ownerCheck = await db.request()
                .input('id', sql.VarChar(8), id)
                .input('casId', sql.VarChar(50), currentUser.casId)
                .query(`
                    SELECT 1
                    FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] D
                    INNER JOIN [dbo].[GAC_PAGOS_CACHE] PC ON PC.Ticket_Original = D.Ticket
                    WHERE D.ID_Descuentos_CAS = @id AND PC.ID_cas = @casId
                `);
            if (ownerCheck.recordset.length === 0) {
                return res.status(403).json({ error: 'La penalidad no pertenece a su empresa.' });
            }
        }

        // Validation: Check if already in a closure
        const check = await db.request().input('id', sql.VarChar(8), id).query(`
            SELECT 1 FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE]
            WHERE ID_Referencia = @id
        `);
        if (check.recordset.length > 0) {
            return res.status(403).json({ error: "No se puede editar una penalidad que ya ha sido cerrada en una valorización." });
        }

        const existing = await db.request().input('id', sql.VarChar(8), id).query("SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] WHERE ID_Descuentos_CAS = @id");

        const updPenReq = db.request();
        addInput(updPenReq, 'id', sql.VarChar(8), id);
        addInput(updPenReq, 'fecha', sql.Date, fecha);
        addInput(updPenReq, 'motivo', sql.NVarChar(200), motivo);
        addInput(updPenReq, 'desc', sql.NVarChar(500), descripcion ?? null);
        addInput(updPenReq, 'importe', sql.Decimal(10, 2), importe);
        await updPenReq.query(`
                UPDATE [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS]
                SET Fecha = @fecha, Motivo = @motivo, Descripcion = @desc, Importe = @importe
                WHERE ID_Descuentos_CAS = @id
            `);
            
        await logAudit(req, 'UPDATE', 'PENALTY', id as string, { 
            before: existing.recordset[0], 
            after: { fecha, motivo, descripcion, importe } 
        });
        
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

const crearAdicionalSchema = z.object({
    ticket: z.string().min(1).max(50),
    motivo: z.string().min(1).max(200),
    importe: z.number().positive(),
});
app.post('/api/adicionales', verifyToken, validateBody(crearAdicionalSchema), async (req: Request, res: Response) => {
    const { ticket, motivo, importe } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    const id = crypto.randomBytes(4).toString('hex');
    try {
        const db = await getDb();

        if (currentUser.casId) {
            if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada.' });
            const ticketCheck = await db.request()
                .input('ticket', sql.NVarChar(50), ticket)
                .input('casRUC', sql.VarChar(20), currentUser.casRUC)
                .query(`
                    SELECT 1
                    FROM [APPGAC].[ServiciosViewSQL] s
                    JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                    WHERE TRIM(s.Ticket) = @ticket AND TRIM(cas.RUC) = TRIM(@casRUC)
                `);
            if (ticketCheck.recordset.length === 0)
                return res.status(403).json({ error: 'El ticket no pertenece a su empresa.' });
        }

        const addReq = db.request();
        addInput(addReq, 'id', sql.VarChar(8), id);
        addInput(addReq, 'ticket', sql.VarChar(50), ticket);
        addInput(addReq, 'motivo', sql.NVarChar(200), motivo);
        addInput(addReq, 'importe', sql.Decimal(10, 2), importe);
        await addReq.query(`
                INSERT INTO [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                (ID_valorizacion_adicional, Ticket, Motivo, Importe)
                VALUES (@id, @ticket, @motivo, @importe)
            `);
        await logAudit(req, 'CREATE', 'ADICIONAL', ticket, { id, motivo, importe });
        res.status(201).json({ id });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.put('/api/adicionales/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo, importe } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getDb();

        if (currentUser.casId) {
            if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada.' });
            const ownerCheck = await db.request()
                .input('id', sql.VarChar(8), id)
                .input('casRUC', sql.VarChar(20), currentUser.casRUC)
                .query(`
                    SELECT 1
                    FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] a
                    JOIN [APPGAC].[ServiciosViewSQL] s ON TRIM(s.Ticket) = TRIM(a.Ticket)
                    JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                    WHERE a.ID_valorizacion_adicional = @id AND TRIM(cas.RUC) = TRIM(@casRUC)
                `);
            if (ownerCheck.recordset.length === 0)
                return res.status(403).json({ error: 'El adicional no pertenece a su empresa.' });
        }

        const existing = await db.request()
            .input('id', sql.VarChar(8), id)
            .query("SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");

        const updAddReq = db.request();
        addInput(updAddReq, 'id', sql.VarChar(8), id);
        addInput(updAddReq, 'motivo', sql.NVarChar(200), motivo);
        addInput(updAddReq, 'importe', sql.Decimal(10, 2), importe);
        await updAddReq.query(`
                UPDATE [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                SET Motivo = @motivo, Importe = @importe
                WHERE ID_valorizacion_adicional = @id
            `);
            
        await logAudit(req, 'UPDATE', 'ADICIONAL', id as string, { 
            before: existing.recordset[0], 
            after: { motivo, importe } 
        });
        
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get('/api/adicionales/:ticket', verifyToken, async (req: Request, res: Response) => {
    const { ticket } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getDb();

        // Verificar que el ticket pertenece al CAS del usuario
        if (currentUser.casId) {
            const ticketCheck = await db.request()
                .input('ticket', sql.NVarChar(50), ticket)
                .input('casRUC', sql.VarChar(20), currentUser.casRUC || '')
                .query(`
                    SELECT 1
                    FROM [APPGAC].[ServiciosViewSQL] s
                    JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                    WHERE TRIM(s.Ticket) = @ticket AND TRIM(cas.RUC) = TRIM(@casRUC)
                `);
            if (ticketCheck.recordset.length === 0) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
        }

        const result = await db.request()
            .input('ticket', sql.NVarChar(50), ticket)
            .query(`
                SELECT ID_valorizacion_adicional as Id, Ticket, Motivo, CAST(Importe AS FLOAT) as Importe
                FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                WHERE Ticket = @ticket
                ORDER BY ID_valorizacion_adicional
            `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.delete('/api/adicionales/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getDb();

        if (currentUser.casId) {
            if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada.' });
            const ownerCheck = await db.request()
                .input('id', sql.VarChar(8), id)
                .input('casRUC', sql.VarChar(20), currentUser.casRUC)
                .query(`
                    SELECT 1
                    FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] a
                    JOIN [APPGAC].[ServiciosViewSQL] s ON TRIM(s.Ticket) = TRIM(a.Ticket)
                    JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                    WHERE a.ID_valorizacion_adicional = @id AND TRIM(cas.RUC) = TRIM(@casRUC)
                `);
            if (ownerCheck.recordset.length === 0)
                return res.status(403).json({ error: 'El adicional no pertenece a su empresa.' });
        }

        const existing = await db.request()
            .input('id', sql.VarChar(8), id)
            .query("SELECT Ticket, Motivo, Importe FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");
        await db.request()
            .input('id', sql.VarChar(8), id)
            .query("DELETE FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");
        await logAudit(req, 'DELETE', 'ADICIONAL', id as string, existing.recordset[0] || {});
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/valuations/batch-adjustment', verifyToken, async (req: Request, res: Response) => {
    const { tickets, targetAmount, motivo, ruc } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (!assertCasRuc(currentUser, ruc, res)) return;

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar una lista de tickets." });
    }

    try {
        const db = await getDb();
        const pool = await getDb();
        
        // 1. Fetch TarifaBase for these tickets to calculate Delta
        // Replicating logic from /api/valuations/:ruc
        const request = pool.request();
        addInput(request, 'ruc', sql.VarChar(20), ruc);

        // Create parameter list for the IN clause
        const paramNames = tickets.map((_: string, i: number) => `@t${i}`);
        tickets.forEach((t: string, i: number) => addInput(request, `t${i}`, sql.VarChar(50), t));

        const query = `
            SELECT 
                s.Ticket,
                ISNULL(rate.Importe, 0) as TarifaBaseCalculada
            FROM [APPGAC].[ServiciosViewSQL] s
            JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
            OUTER APPLY (
                SELECT TOP 1 Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = s.CodigoExternoEquipo
            ) m
            OUTER APPLY (
                SELECT TOP 1 CAST(Importe AS FLOAT) as Importe 
                FROM [dbo].[GAC_APP_TB_TARIFARIO] t 
                WHERE t.Empresa = cas.ID_CAS 
                  AND (t.Servicio = s.IdServicio OR t.Servicio = s.Servicio)
                  AND TRIM(t.Categoria) = TRIM(m.Categoria)
                  AND s.CheckOut >= t.Fecha_inicio 
                  AND (t.Fecha_fin IS NULL OR s.CheckOut <= t.Fecha_fin)
                ORDER BY t.Estado DESC, t.Fecha_inicio DESC
            ) rate
            WHERE TRIM(cas.RUC) = @ruc 
              AND s.Ticket IN (${paramNames.join(',')})
        `;

        const ratesResult = await request.query(query);
        const foundTickets = ratesResult.recordset;

        // Start transaction for updates
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            for (const item of foundTickets) {
                const ticket = item.Ticket;
                const base = item.TarifaBaseCalculada;
                const delta = targetAmount - base;
                const adjustmentId = crypto.randomBytes(4).toString('hex');

                // Delete existing adicionales for this ticket
                const delReq = transaction.request();
                addInput(delReq, 'ticket', sql.VarChar(50), ticket);
                await delReq.query("DELETE FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE Ticket = @ticket");

                // Insert new delta
                if (delta !== 0) {
                    const insReq = transaction.request();
                    addInput(insReq, 'id', sql.VarChar(8), adjustmentId);
                    addInput(insReq, 'ticket', sql.VarChar(50), ticket);
                    addInput(insReq, 'motivo', sql.NVarChar(200), motivo);
                    addInput(insReq, 'importe', sql.Decimal(10, 2), delta);
                    await insReq.query(`
                            INSERT INTO [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                            (ID_valorizacion_adicional, Ticket, Motivo, Importe)
                            VALUES (@id, @ticket, @motivo, @importe)
                        `);
                }
            }

            await transaction.commit();
            await logAudit(req, 'BATCH_ADJUST', 'VALUATION', ruc, { 
                tickets_total: tickets.length, 
                processed: foundTickets.length,
                targetAmount, 
                motivo 
            });
            
            res.json({ 
                success: true, 
                processed: foundTickets.length, 
                ignored: tickets.length - foundTickets.length 
            });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err: unknown) {
        console.error("Batch Adjustment Error:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

app.get('/api/discount-motivos', verifyToken, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] ORDER BY Motivo ASC');
        res.json(result.recordset);
    } catch (error) {
        console.error("Error fetching discount motivos:", error);
        res.status(500).json({ message: "Error al obtener motivos de descuento" });
    }
});

app.post('/api/valuations/batch-discount', verifyToken, async (req: Request, res: Response) => {
    const { tickets, motivo, descripcion, ruc } = req.body;
    const user = (req as AuthRequest).user!;
    const currentUser = user as JwtUserPayload;
    if (!assertCasRuc(currentUser, ruc, res)) return;

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar una lista de tickets." });
    }

    try {
        const db = await getDb();
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            for (const item of tickets) {
                const ticketId = item.id;
                const ticketAmount = item.amount;

                if (!ticketId || isNaN(ticketAmount)) continue;

                const penaltyId = crypto.randomBytes(4).toString('hex');
                const fecha = new Date().toISOString().split('T')[0];

                await transaction.request()
                    .input('id', sql.VarChar, penaltyId)
                    .input('ticket', sql.VarChar, ticketId)
                    .input('fecha', sql.Date, fecha)
                    .input('motivo', sql.VarChar, motivo)
                    .input('desc', sql.VarChar, descripcion)
                    .input('importe', sql.Decimal(10, 2), ticketAmount)
                    .input('user', sql.VarChar, user.username)
                    .query(`
                        INSERT INTO [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] 
                        (ID_Descuentos_CAS, Ticket, Fecha, Motivo, Descripcion, Importe, Creado_por, Creado_el, Estado)
                        VALUES (@id, @ticket, @fecha, @motivo, @desc, @importe, @user, GETDATE(), 'Pendiente')
                    `);
            }

            await transaction.commit();
            await logAudit(req, 'BATCH_DISCOUNT', 'VALUATION', ruc, { 
                tickets_total: tickets.length, 
                motivo 
            });
            
            res.json({ success: true, processed: tickets.length });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error("Error applying batch discount:", error);
        res.status(500).json({ message: "Error al aplicar el descuento masivo" });
    }
});

app.post('/api/penalties/:id/status', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, observation, isCas } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getDb();

        if (currentUser.casId) {
            const ownerCheck = await db.request()
                .input('id', sql.VarChar(8), id)
                .input('casId', sql.VarChar(50), currentUser.casId)
                .query(`
                    SELECT 1
                    FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] D
                    INNER JOIN [dbo].[GAC_PAGOS_CACHE] PC ON PC.Ticket_Original = D.Ticket
                    WHERE D.ID_Descuentos_CAS = @id AND PC.ID_cas = @casId
                `);
            if (ownerCheck.recordset.length === 0)
                return res.status(403).json({ error: 'La penalidad no pertenece a su empresa.' });
        }

        const _field = isCas ? 'Adjunto_motivo' : 'Adjunto_motivo';
        const statusReq = db.request();
        addInput(statusReq, 'id', sql.VarChar(8), id);
        addInput(statusReq, 'status', sql.NVarChar(50), status);
        addInput(statusReq, 'obs', sql.NVarChar(1000), observation ?? null);
        await statusReq.query(`UPDATE [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] SET Estado = @status, Adjunto_motivo = @obs WHERE ID_Descuentos_CAS = @id`);
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});



app.get('/api/tickets/find/:ticket', verifyToken, async (req: Request, res: Response) => {
    const ticket = (req.params.ticket as string).trim();
    if (!ticket) return res.status(400).json({ error: 'Ticket es requerido' });

    try {
        const db = await getDb();
        const result = await db.request()
            .input('ticket', sql.NVarChar, ticket)
            .query(`
                SELECT TOP 1
                    s.Ticket, s.CheckOut as Fecha, s.Servicio as ServicioNombre,
                    s.IdServicio as Servicio, cas.RUC, cas.Nombre_CAS as CAS_Nombre
                FROM [APPGAC].[ServiciosViewSQL] s
                JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                WHERE TRIM(s.Ticket) = @ticket
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket no encontrado' });
        }
        res.json(result.recordset[0]);
    } catch (err: unknown) { 
        console.error('Error in ticket find:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); 
    }
});

app.get('/api/tickets/search/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (currentUser.casId) {
        if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada' });
        if (currentUser.casRUC !== String(ruc).trim()) return res.status(403).json({ error: 'Acceso denegado' });
    }
    const { q } = req.query;
    try {
        const db = await getDb();
        const searchReq = db.request();
        addInput(searchReq, 'ruc', sql.VarChar(20), ruc);
        addInput(searchReq, 'q', sql.NVarChar(255), `%${q}%`);
        const result = await searchReq.query(`
                SELECT TOP 20
                    s.Ticket, s.CheckOut as Fecha, s.Servicio as ServicioNombre,
                    s.IdServicio as Servicio
                FROM [APPGAC].[ServiciosViewSQL] s
                JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                WHERE cas.RUC = @ruc
                  AND (s.Ticket LIKE @q OR s.Servicio LIKE @q)
                  AND s.Estado = 'Closed'
                ORDER BY s.CheckOut DESC
            `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/valuations/close', verifyToken, async (req: Request, res: Response) => {
    const {
        idCierre, // Si viene idCierre, es una actualización de un borrador
        ruc, nombreCas, start, end,
        totalServicios, totalPenalidades,
        subtotalServicios, subtotalPenalidades,
        totalFinal, cerradoPor,
        estado, // 'BORRADOR' o 'CERRADO'
        details
    } = req.body;

    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (!assertCasRuc(currentUser, ruc, res)) return;

    const finalEstado = estado || 'CERRADO';

    try {
        const db = await getDb();
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            let actualIdCierre = idCierre;
            let businessCode = '';

            if (!actualIdCierre) {
                // Fail-safe: Check if a draft already exists for this RUC and period to avoid duplicates
                const draftReq = new sql.Request(transaction);
                addInput(draftReq, 'ruc', sql.VarChar(20), ruc);
                addInput(draftReq, 'start', sql.VarChar(30), start);
                addInput(draftReq, 'end', sql.VarChar(30), end);
                const checkDraft = await draftReq.query("SELECT IdCierre, Codigo_Valorizacion FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE RUC = @ruc AND Fecha_Inicio = @start AND Fecha_Fin = @end AND Estado = 'BORRADOR'");
                
                if (checkDraft.recordset.length > 0) {
                    actualIdCierre = checkDraft.recordset[0].IdCierre;
                    businessCode = checkDraft.recordset[0].Codigo_Valorizacion;
                }
            }

            if (actualIdCierre) {
                // 1. Actualizar Cabecera
                const updHdrReq = new sql.Request(transaction);
                addInput(updHdrReq, 'id', sql.Int, actualIdCierre);
                addInput(updHdrReq, 'totalServicios', sql.Decimal(18, 2), totalServicios);
                addInput(updHdrReq, 'totalPenalidades', sql.Decimal(18, 2), totalPenalidades);
                addInput(updHdrReq, 'subtotalServicios', sql.Decimal(18, 2), subtotalServicios);
                addInput(updHdrReq, 'subtotalPenalidades', sql.Decimal(18, 2), subtotalPenalidades);
                addInput(updHdrReq, 'totalFinal', sql.Decimal(18, 2), totalFinal);
                addInput(updHdrReq, 'estado', sql.VarChar(20), finalEstado);
                addInput(updHdrReq, 'user', sql.NVarChar(255), cerradoPor);
                await updHdrReq.query(`
                        UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES]
                        SET Total_Servicios = @totalServicios,
                            Total_Penalidades = @totalPenalidades,
                            Subtotal_Servicios = @subtotalServicios,
                            Subtotal_Penalidades = @subtotalPenalidades,
                            Total_Final = @totalFinal,
                            Estado = @estado,
                            Cerrado_Por = @user,
                            Cerrado_El = GETDATE()
                        WHERE IdCierre = @id
                    `);

                if (!businessCode) {
                    const codeReq = new sql.Request(transaction);
                    addInput(codeReq, 'id', sql.Int, actualIdCierre);
                    const codeResult = await codeReq.query("SELECT Codigo_Valorizacion FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
                    businessCode = codeResult.recordset[0]?.Codigo_Valorizacion;
                }

                // 2. Limpiar detalles antiguos
                const delDetReq = new sql.Request(transaction);
                addInput(delDetReq, 'id', sql.Int, actualIdCierre);
                await delDetReq.query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE IdCierre = @id");

            } else {
                // 1. Insertar Cabecera Nueva
                const insHdrReq = new sql.Request(transaction);
                addInput(insHdrReq, 'ruc', sql.VarChar(20), ruc);
                addInput(insHdrReq, 'nombreCas', sql.NVarChar(255), nombreCas);
                addInput(insHdrReq, 'start', sql.VarChar(30), start);
                addInput(insHdrReq, 'end', sql.VarChar(30), end);
                addInput(insHdrReq, 'totalServicios', sql.Decimal(18, 2), totalServicios);
                addInput(insHdrReq, 'totalPenalidades', sql.Decimal(18, 2), totalPenalidades);
                addInput(insHdrReq, 'subtotalServicios', sql.Decimal(18, 2), subtotalServicios);
                addInput(insHdrReq, 'subtotalPenalidades', sql.Decimal(18, 2), subtotalPenalidades);
                addInput(insHdrReq, 'totalFinal', sql.Decimal(18, 2), totalFinal);
                addInput(insHdrReq, 'cerradoPor', sql.NVarChar(255), cerradoPor);
                addInput(insHdrReq, 'estado', sql.VarChar(20), finalEstado);
                const result = await insHdrReq.query(`
                        INSERT INTO [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES]
                        (RUC, Nombre_CAS, Fecha_Inicio, Fecha_Fin, Total_Servicios, Total_Penalidades, Subtotal_Servicios, Subtotal_Penalidades, Total_Final, Cerrado_Por, Cerrado_El, Estado)
                        VALUES (@ruc, @nombreCas, @start, @end, @totalServicios, @totalPenalidades, @subtotalServicios, @subtotalPenalidades, @totalFinal, @cerradoPor, GETDATE(), @estado)
                        SELECT SCOPE_IDENTITY() as IdCierre
                    `);

                actualIdCierre = result.recordset[0].IdCierre;
                const year = new Date().getFullYear();
                businessCode = `VAL-${year}-${actualIdCierre.toString().padStart(5, '0')}`;

                // 1.1 Actualizar con el código de negocio
                const codeUpdReq = new sql.Request(transaction);
                addInput(codeUpdReq, 'id', sql.Int, actualIdCierre);
                addInput(codeUpdReq, 'code', sql.VarChar(50), businessCode);
                await codeUpdReq.query("UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] SET Codigo_Valorizacion = @code WHERE IdCierre = @id");
            }

            // 2. Insertar Detalles (Nuevos o Actualizados)
            if (details && Array.isArray(details) && details.length > 0) {
                const table = new sql.Table('[dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE]');
                table.create = false;
                table.columns.add('IdCierre', sql.Int, { nullable: false });
                table.columns.add('Ticket', sql.VarChar(50), { nullable: true });
                table.columns.add('Monto', sql.Decimal(18, 2), { nullable: true });
                table.columns.add('Fecha_Ticket', sql.DateTime, { nullable: true });
                table.columns.add('Tipo', sql.VarChar(20), { nullable: true });
                table.columns.add('Servicio_Nombre', sql.VarChar(255), { nullable: true });
                table.columns.add('Categoria', sql.VarChar(100), { nullable: true });
                table.columns.add('Fecha_Visita', sql.DateTime, { nullable: true });
                table.columns.add('Fecha_Cierre', sql.DateTime, { nullable: true });
                table.columns.add('Dias_Diferencia', sql.Int, { nullable: true });
                table.columns.add('Codigo_Externo', sql.VarChar(100), { nullable: true });
                table.columns.add('Tarifa_Base', sql.Decimal(18, 2), { nullable: true });
                table.columns.add('Adicionales', sql.Decimal(18, 2), { nullable: true });
                table.columns.add('ID_Referencia', sql.VarChar(50), { nullable: true });
                table.columns.add('Distrito', sql.VarChar(100), { nullable: true });
                table.columns.add('Departamento', sql.VarChar(100), { nullable: true });
                table.columns.add('Nombre_Equipo', sql.NVarChar(255), { nullable: true });

                for (const item of details) {
                    table.rows.add(
                        actualIdCierre,
                        item.ticket,
                        item.monto,
                        item.fecha ? new Date(item.fecha) : null,
                        item.tipo,
                        item.servicio,
                        item.categoria,
                        item.fechaVisita ? new Date(item.fechaVisita) : null,
                        item.fechaCierre ? new Date(item.fechaCierre) : null,
                        item.diasDiferencia,
                        item.codigoExterno,
                        item.tarifaBase,
                        item.adicionales,
                        item.idReferencia ? item.idReferencia.toString() : null,
                        item.distrito,
                        item.departamento,
                        item.nombreEquipo
                    );
                }

                const request = new sql.Request(transaction);
                await request.bulk(table);
            }

            await transaction.commit();

            res.json({ 
                success: true, 
                message: finalEstado === 'BORRADOR' ? "Borrador guardado correctamente." : "Quincena cerrada correctamente.", 
                idCierre: actualIdCierre, 
                codigo: businessCode 
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: unknown) { 
        console.error("Error en operación de valorización:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); 
    }
});

app.post('/api/valuations/finalize/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getDb();

        // Verificar ownership para usuarios CAS
        if (currentUser.casId) {
            const closureResult = await db.request()
                .input('id', sql.Int, Number(id))
                .query("SELECT RUC FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            const closure = closureResult.recordset[0];
            if (!closure) return res.status(404).json({ error: 'Cierre no encontrado' });
            if (String(closure.RUC || '').trim() !== String(currentUser.casRUC || '').trim()) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
        }

        await db.request()
            .input('id', sql.Int, Number(id))
            .query("UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] SET Estado = 'CERRADO', Cerrado_El = GETDATE() WHERE IdCierre = @id");

        await logAudit(req, 'FINALIZE_DRAFT', 'VALUATION', id as string, { status: 'CERRADO' });
        res.json({ success: true, message: "Valorización cerrada correctamente." });
    } catch (err: unknown) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});


app.post('/api/valuations/reopen/:id', verifyToken, verifyPermission('VAL.REOPEN'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getDb();

        // Verificar ownership para usuarios CAS antes de abrir la transacción
        if (currentUser.casId) {
            const ownerCheck = await db.request()
                .input('id', sql.Int, Number(id))
                .query("SELECT RUC FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            const closure = ownerCheck.recordset[0];
            if (!closure) return res.status(404).json({ error: 'Cierre no encontrado' });
            if (String(closure.RUC || '').trim() !== String(currentUser.casRUC || '').trim()) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
        }

        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            const infoReq = new sql.Request(transaction);
            addInput(infoReq, 'id', sql.Int, Number(id));

            // Get closure info for audit
            const closureInfo = await infoReq.query("SELECT Codigo_Valorizacion, RUC, Total_Final FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            if (closureInfo.recordset.length === 0) {
                return res.status(404).json({ error: 'Cierre no encontrado' });
            }

            // 1. Delete details
            const delDetReq2 = new sql.Request(transaction);
            addInput(delDetReq2, 'id', sql.Int, Number(id));
            await delDetReq2.query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE IdCierre = @id");

            // 2. Delete header
            const delHdrReq = new sql.Request(transaction);
            addInput(delHdrReq, 'id', sql.Int, Number(id));
            await delHdrReq.query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");

            await transaction.commit();
            
            const info = closureInfo.recordset[0];
            await logAudit(req, 'REOPEN_FORTNIGHT', 'VALUATION', info.Codigo_Valorizacion, { id, ruc: info.RUC, total: info.Total_Final });

            res.json({ success: true, message: "Quincena reaperturada correctamente. Los tickets vuelven a estar disponibles." });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: unknown) {
        console.error("Error reopening valuation:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

app.post('/api/valuations/send-email', verifyToken, async (req: Request, res: Response) => {
    const { to, subject, body, attachmentName, attachmentBase64 } = req.body;
    try {
        const token = await getGraphToken();
        const url = `https://graph.microsoft.com/v1.0/users/${MS_GRAPH_SENDER_EMAIL}/sendMail`;
        
        const recipients = to.split(/[,;]/).filter((email: string) => email.trim() !== "").map((email: string) => ({
            emailAddress: { address: email.trim() }
        }));

        const emailData = {
            message: {
                subject: subject,
                body: {
                    contentType: 'HTML',
                    content: body
                },
                toRecipients: recipients,
                attachments: attachmentBase64 ? [
                    {
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        name: attachmentName || "Valorizacion.xlsx",
                        contentBytes: attachmentBase64
                    }
                ] : []
            }
        };

        await axios.post(url, emailData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        await logAudit(req, 'EMAIL_SENT', 'VALUATION', attachmentName, { recipients: to });
        res.json({ success: true, message: 'Email enviado correctamente' });
    } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
        console.error('Error enviando email:', axiosErr.response?.data || (err instanceof Error ? err.message : String(err)));
        res.status(500).json({ error: 'No se pudo enviar el correo: ' + (axiosErr.response?.data?.error?.message || (err instanceof Error ? err.message : String(err))) });
    }
});

app.get('/api/penalties/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (currentUser.casId) {
        if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada' });
        if (currentUser.casRUC !== String(ruc).trim()) return res.status(403).json({ error: 'Acceso denegado' });
    }
    const { start, end } = req.query;
    try {
        const db = await getDb();
        const penListReq = db.request();
        addInput(penListReq, 'ruc', sql.VarChar(20), ruc);
        addInput(penListReq, 'start', sql.VarChar(30), `${start} 00:00:00`);
        addInput(penListReq, 'end', sql.VarChar(30), `${end} 23:59:59`);
        const result = await penListReq.query(`
                SELECT
                    d.ID_Descuentos_CAS as Id,
                    d.Ticket,
                    d.Fecha,
                    COALESCE(m.Motivo, d.Motivo) as Motivo,
                    d.Descripcion,
                    d.Importe,
                    d.Estado,
                    d.Creado_por as CreadoPor,
                    d.Creado_el as CreadoEl
                FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d
                JOIN [APPGAC].[ServiciosViewSQL] s ON d.Ticket = s.Ticket
                JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                LEFT JOIN [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] m ON d.Motivo = m.IdMotivo
                WHERE cas.RUC = @ruc
                  AND d.Creado_el BETWEEN @start AND @end
                  AND NOT EXISTS (
                      SELECT 1 FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] det
                      WHERE det.ID_Referencia = d.ID_Descuentos_CAS
                  )
            `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get('/api/closures', verifyToken, async (req: Request, res: Response) => {
    const { start, end } = req.query;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    const efectiveRuc = enforceCasRuc(currentUser, req.query.ruc as string | undefined);
    try {
        const db = await getDb();
        const request = db.request();
        let query = `SELECT * FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES]`;

        const conditions: string[] = [];
        if (efectiveRuc !== null) {
            conditions.push(`TRIM(RUC) = TRIM(@ruc)`);
            request.input('ruc', sql.VarChar, efectiveRuc);
        }
        if (start) {
            conditions.push(`Fecha_Inicio = @start`);
            request.input('start', sql.VarChar, start as string);
        }
        if (end) {
            conditions.push(`Fecha_Fin = @end`);
            request.input('end', sql.VarChar, end as string);
        }
        
        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }
        
        query += ` ORDER BY Cerrado_El DESC`;
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get('/api/valuations/details/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getDb();

        // Verificar ownership del cierre para usuarios CAS
        if (currentUser.casId) {
            const closureCheck = await db.request()
                .input('id', sql.Int, Number(id))
                .query("SELECT RUC FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            const closure = closureCheck.recordset[0];
            if (!closure) return res.status(404).json({ error: 'No encontrado' });
            if (String(closure.RUC || '').trim() !== String(currentUser.casRUC || '').trim()) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
        }

        const result = await db.request()
            .input('id', sql.Int, Number(id))
            .query(`
                SELECT
                    d.IdDetalle,
                    d.Ticket,
                    d.Tipo,
                    d.Servicio_Nombre,
                    d.Categoria,
                    d.Monto,
                    d.Fecha_Ticket,
                    d.Fecha_Visita,
                    d.Fecha_Cierre,
                    d.Dias_Diferencia,
                    d.Codigo_Externo,
                    d.Tarifa_Base,
                    d.Adicionales,
                    d.ID_Referencia,
                    d.Distrito,
                    d.Departamento,
                    d.Nombre_Equipo
                FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] d
                WHERE d.IdCierre = @id
            `);
        res.json({ tickets: result.recordset });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});


app.get('/api/tarifarios/:casId', verifyToken, async (req: Request, res: Response) => {
    const { casId } = req.params;
    try {
        const db = await getDb();
        const tarListReq = db.request();
        addInput(tarListReq, 'casId', sql.VarChar(50), casId);
        const result = await tarListReq.query(`
                SELECT
                    t.ID_Tarifario as Id,
                    t.Categoria,
                    COALESCE(s.Id, t.Servicio) as ServicioCode,
                    COALESCE(s.Descripcion, t.Servicio) as ServicioNombre,
                    t.Fecha_inicio,
                    t.Fecha_fin,
                    t.Importe,
                    t.Estado
                FROM [dbo].[GAC_APP_TB_TARIFARIO] t
                LEFT JOIN [SIATC].[FSM_TipoServicio] s ON (t.Servicio = s.Id OR t.Servicio = s.Descripcion)
                WHERE t.Empresa = @casId
                ORDER BY t.Categoria, t.Servicio, t.Fecha_inicio DESC
            `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/tarifarios/create', verifyToken, async (req: Request, res: Response) => {
    const { empresa, categoria, servicio, importe, fecha_inicio, fecha_fin, estado } = req.body;
    try {
        const db = await getDb();
        const newId = crypto.randomBytes(4).toString('hex');
        const tarCrearReq = db.request();
        addInput(tarCrearReq, 'id', sql.VarChar(8), newId);
        addInput(tarCrearReq, 'empresa', sql.VarChar(50), empresa);
        addInput(tarCrearReq, 'categoria', sql.NVarChar(100), categoria);
        addInput(tarCrearReq, 'servicio', sql.NVarChar(100), servicio);
        addInput(tarCrearReq, 'importe', sql.Decimal(18, 2), importe);
        addInput(tarCrearReq, 'fecha_inicio', sql.DateTime, fecha_inicio);
        addInput(tarCrearReq, 'fecha_fin', sql.DateTime, fecha_fin || null);
        addInput(tarCrearReq, 'estado', sql.VarChar(1), estado || 'A');
        await tarCrearReq.query(`
                INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (
                    ID_Tarifario, Empresa, Categoria, Servicio,
                    Fecha_inicio, Fecha_fin, Importe, Estado
                ) VALUES (
                    @id, @empresa, @categoria, @servicio,
                    @fecha_inicio, @fecha_fin, @importe, @estado
                )
            `);
        res.json({ success: true, id: newId });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- MATERIALES ---
app.get('/api/materials', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT ID_Material, ID_Externo, Nombre, Categoria, Estado, Sector FROM [dbo].[GAC_APP_TB_MATERIALES] ORDER BY Categoria, Nombre");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get('/api/materials/categories', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT DISTINCT Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE Categoria IS NOT NULL AND Categoria != '' ORDER BY Categoria");
        res.json(result.recordset.map(r => r.Categoria));
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/materials', verifyToken, async (req: Request, res: Response) => {
    const { idExterno, nombre, categoria, sector } = req.body;
    try {
        const db = await getDb();
        const checkReq = db.request();
        addInput(checkReq, 'ext', sql.VarChar(50), idExterno);
        const check = await checkReq.query("SELECT ID_Material FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = @ext");

        if (check.recordset.length > 0) {
            const id = check.recordset[0].ID_Material;
            const matUpdReq = db.request();
            addInput(matUpdReq, 'id', sql.VarChar(8), id);
            addInput(matUpdReq, 'nombre', sql.NVarChar(255), nombre);
            addInput(matUpdReq, 'cat', sql.NVarChar(100), categoria);
            addInput(matUpdReq, 'sec', sql.NVarChar(50), sector || 'GAC');
            await matUpdReq.query(`UPDATE [dbo].[GAC_APP_TB_MATERIALES] SET Nombre = @nombre, Categoria = @cat, Sector = @sec WHERE ID_Material = @id`);
            res.json({ success: true, id, action: 'updated' });
        } else {
            const newId = crypto.randomBytes(4).toString('hex');
            const matInsReq = db.request();
            addInput(matInsReq, 'id', sql.VarChar(8), newId);
            addInput(matInsReq, 'ext', sql.VarChar(50), idExterno);
            addInput(matInsReq, 'nombre', sql.NVarChar(255), nombre);
            addInput(matInsReq, 'cat', sql.NVarChar(100), categoria);
            addInput(matInsReq, 'sec', sql.NVarChar(50), sector || 'GAC');
            await matInsReq.query(`INSERT INTO [dbo].[GAC_APP_TB_MATERIALES] (ID_Material, ID_Externo, Nombre, Categoria, Sector, Estado, EstadoEnCatalogo) VALUES (@id, @ext, @nombre, @cat, @sec, 'Activo', 'Publicado')`);
            res.json({ success: true, id: newId, action: 'created' });
        }
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/tarifarios/update', verifyToken, async (req: Request, res: Response) => {
    const { id, importe, estado } = req.body;
    try {
        const db = await getDb();
        const tarUpdReq = db.request();
        addInput(tarUpdReq, 'id', sql.VarChar(8), id);
        addInput(tarUpdReq, 'importe', sql.Decimal(18, 2), importe);
        addInput(tarUpdReq, 'estado', sql.VarChar(1), estado);
        await tarUpdReq.query(`
                UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                SET Importe = @importe, Estado = @estado
                WHERE ID_Tarifario = @id
            `);
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/tarifarios/batch', verifyToken, async (req: Request, res: Response) => {
    const { casId, rates } = req.body;
    try {
        const db = await getDb();
        const transaction = new sql.Transaction(db);
        await transaction.begin();
        
        try {
            for (const rate of rates) {
                const batchReq = transaction.request();
                const id = rate.ID_TARIFARIO || crypto.randomBytes(4).toString('hex');
                addInput(batchReq, 'id', sql.VarChar(8), id);
                addInput(batchReq, 'casId', sql.VarChar(50), casId);
                addInput(batchReq, 'cat', sql.NVarChar(100), rate.Categoria);
                addInput(batchReq, 'serv', sql.NVarChar(100), rate.Servicio);
                addInput(batchReq, 'imp', sql.Decimal(18, 2), rate.Importe);
                addInput(batchReq, 'f_ini', sql.DateTime, rate.Fecha_inicio ? new Date(rate.Fecha_inicio) : new Date());
                addInput(batchReq, 'f_fin', sql.DateTime, rate.Fecha_fin ? new Date(rate.Fecha_fin) : null);
                await batchReq.query(`
                        IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO] WHERE ID_Tarifario = @id)
                        BEGIN
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO] 
                            SET Importe = @imp, Categoria = @cat, Servicio = @serv,
                                Fecha_inicio = @f_ini, Fecha_fin = @f_fin
                            WHERE ID_Tarifario = @id
                        END
                        ELSE
                        BEGIN
                            INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Fecha_fin, Estado)
                            VALUES (@id, @casId, @cat, @serv, @imp, @f_ini, @f_fin, 'A')
                        END
                    `);
            }
            
            await transaction.commit();
            res.json({ success: true });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- TARIFARIO EXCEPCIONES ---
app.get('/api/tarifarios/exceptions/:casId', verifyToken, async (req: Request, res: Response) => {
    const { casId } = req.params;
    try {
        const db = await getDb();
        const excReq = db.request();
        addInput(excReq, 'casId', sql.VarChar(50), casId);
        const result = await excReq.query("SELECT * FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE Empresa = @casId AND Estado = 'A' ORDER BY Prioridad DESC, Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/tarifarios/exceptions/save', verifyToken, async (req: Request, res: Response) => {
    const { id, empresa, nombre, zonasIncluidas, zonasExcluidas, categorias, servicios, importe, prioridad, estado } = req.body;
    try {
        const db = await getDb();
        const finalId = id || crypto.randomBytes(4).toString('hex');

        const excSaveReq = db.request();
        addInput(excSaveReq, 'id', sql.VarChar(8), finalId);
        addInput(excSaveReq, 'empresa', sql.VarChar(50), empresa);
        addInput(excSaveReq, 'nombre', sql.NVarChar(255), nombre);
        addInput(excSaveReq, 'zi', sql.NVarChar(sql.MAX), JSON.stringify(zonasIncluidas || null));
        addInput(excSaveReq, 'ze', sql.NVarChar(sql.MAX), JSON.stringify(zonasExcluidas || null));
        addInput(excSaveReq, 'cat', sql.NVarChar(sql.MAX), JSON.stringify(categorias || null));
        addInput(excSaveReq, 'serv', sql.NVarChar(sql.MAX), JSON.stringify(servicios || null));
        addInput(excSaveReq, 'imp', sql.Decimal(18, 2), importe);
        addInput(excSaveReq, 'prio', sql.Int, prioridad || 0);
        addInput(excSaveReq, 'est', sql.VarChar(1), estado || 'A');
        await excSaveReq.query(`
                IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE IdExcepcion = @id)
                BEGIN
                    UPDATE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES]
                    SET Nombre = @nombre, Zonas_Incluidas = @zi, Zonas_Excluidas = @ze, 
                        Categorias = @cat, Servicios = @serv, Importe = @imp, 
                        Prioridad = @prio, Estado = @est
                    WHERE IdExcepcion = @id
                END
                ELSE
                BEGIN
                    INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] 
                    (IdExcepcion, Empresa, Nombre, Zonas_Incluidas, Zonas_Excluidas, Categorias, Servicios, Importe, Prioridad, Estado)
                    VALUES (@id, @empresa, @nombre, @zi, @ze, @cat, @serv, @imp, @prio, @est)
                END
            `);
        res.json({ success: true, id: finalId });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.delete('/api/tarifarios/exceptions/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        const excDelReq = db.request();
        addInput(excDelReq, 'id', sql.VarChar(8), id);
        await excDelReq.query("UPDATE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] SET Estado = 'I' WHERE IdExcepcion = @id");
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- TARIFARIO IMPORT ---
interface TarifarioImportRow {
    CAS_Nombre: string;
    Categoria: string;
    Servicio: string;
    Fecha_inicio: string;
    Fecha_fin: string;
    Importe: string;
    Estado?: string;
    CAS_ID?: number;
    Status?: string;
    Message?: string;
    Importe_Actual?: number | null;
    ID_Tarifario?: string;
}

app.post('/api/tarifarios/import/preview', verifyToken, async (req: Request, res: Response) => {
    const { rows } = req.body as { rows: TarifarioImportRow[] };
    try {
        const db = await getDb();
        const casResult = await db.request().query("SELECT ID_CAS, Nombre_CAS FROM [dbo].[GAC_APP_TB_CAS]");
        const casMap = new Map<string, number>();
        casResult.recordset.forEach((c: { Nombre_CAS: string; ID_CAS: number }) => casMap.set(c.Nombre_CAS.toUpperCase().trim(), c.ID_CAS));

        const preview: TarifarioImportRow[] = [];
        for (const row of rows) {
            const casName = (row.CAS_Nombre || '').trim().toUpperCase();
            const casId = casMap.get(casName);
            if (!casId) {
                preview.push({ ...row, Status: 'ERROR', Message: `CAS "${row.CAS_Nombre}" no encontrado en la BD` });
                continue;
            }
            const fi = new Date(row.Fecha_inicio);
            if (isNaN(fi.getTime())) {
                preview.push({ ...row, CAS_ID: casId, Status: 'ERROR', Message: `Fecha_inicio inválida: "${row.Fecha_inicio}"` });
                continue;
            }
            const importe = parseFloat(row.Importe);
            if (isNaN(importe)) {
                preview.push({ ...row, CAS_ID: casId, Status: 'ERROR', Message: `Importe inválido: "${row.Importe}"` });
                continue;
            }
            const existing = await db.request()
                .input('casId', sql.VarChar(50), casId)
                .input('cat', sql.VarChar(100), (row.Categoria || '').trim())
                .input('serv', sql.VarChar(100), (row.Servicio || '').trim())
                .input('fi', sql.Date, fi)
                .query(`
                    SELECT TOP 1 ID_Tarifario, CAST(Importe AS FLOAT) as Importe
                    FROM [dbo].[GAC_APP_TB_TARIFARIO]
                    WHERE Empresa = @casId
                      AND TRIM(Categoria) = TRIM(@cat)
                      AND TRIM(Servicio) = TRIM(@serv)
                      AND Fecha_inicio = @fi
                `);
            if (existing.recordset.length === 0) {
                preview.push({ ...row, CAS_ID: casId, Status: 'INSERT', Message: 'Nueva tarifa', Importe_Actual: null });
            } else {
                const cur = existing.recordset[0];
                if (Math.abs(parseFloat(cur.Importe) - importe) < 0.001) {
                    preview.push({ ...row, CAS_ID: casId, Status: 'OK', Message: 'Sin cambios', Importe_Actual: cur.Importe, ID_Tarifario: cur.ID_Tarifario });
                } else {
                    preview.push({ ...row, CAS_ID: casId, Status: 'UPDATE', Message: `${cur.Importe} → ${importe}`, Importe_Actual: cur.Importe, ID_Tarifario: cur.ID_Tarifario });
                }
            }
        }
        res.json({ preview });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/tarifarios/import/confirm', verifyToken, async (req: Request, res: Response) => {
    const { rows } = req.body as { rows: TarifarioImportRow[] };
    try {
        const db = await getDb();
        const transaction = new sql.Transaction(db);
        await transaction.begin();
        let inserted = 0, updated = 0;
        try {
            for (const row of rows) {
                const cat = row.Categoria.trim();
                const serv = row.Servicio.trim();
                const casId = row.CAS_ID;

                if (row.Status === 'INSERT') {
                    // Inactivar registros anteriores con la misma combinación (Empresa + Categoria + Servicio)
                    if (casId != null) {
                        const deacReq = new sql.Request(transaction);
                        addInput(deacReq, 'casId', sql.VarChar(50), String(casId));
                        addInput(deacReq, 'cat', sql.VarChar(100), cat);
                        addInput(deacReq, 'serv', sql.VarChar(100), serv);
                        await deacReq.query(`
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Estado = 'I'
                            WHERE Empresa = @casId
                              AND TRIM(Categoria) = TRIM(@cat)
                              AND TRIM(Servicio) = TRIM(@serv)
                              AND Estado = 'A'
                        `);
                    }
                    const newId = crypto.randomBytes(4).toString('hex');
                    await new sql.Request(transaction)
                        .input('id', sql.VarChar(8), newId)
                        .input('casId', sql.VarChar(50), row.CAS_ID)
                        .input('cat', sql.VarChar(100), cat)
                        .input('serv', sql.VarChar(100), serv)
                        .input('imp', sql.Decimal(18, 2), parseFloat(row.Importe))
                        .input('fi', sql.Date, new Date(row.Fecha_inicio))
                        .input('ff', sql.Date, row.Fecha_fin ? new Date(row.Fecha_fin) : null)
                        .input('est', sql.VarChar(10), row.Estado || 'A')
                        .query(`
                            INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO]
                            (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Fecha_fin, Estado)
                            VALUES (@id, @casId, @cat, @serv, @imp, @fi, @ff, @est)
                        `);
                    inserted++;
                } else if (row.Status === 'UPDATE') {
                    // Inactivar otros registros activos con la misma combinación (no el que se va a actualizar)
                    if (casId != null && row.ID_Tarifario) {
                        const deacReq = new sql.Request(transaction);
                        addInput(deacReq, 'casId', sql.VarChar(50), String(casId));
                        addInput(deacReq, 'cat', sql.VarChar(100), cat);
                        addInput(deacReq, 'serv', sql.VarChar(100), serv);
                        addInput(deacReq, 'id', sql.VarChar(8), row.ID_Tarifario);
                        await deacReq.query(`
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Estado = 'I'
                            WHERE Empresa = @casId
                              AND TRIM(Categoria) = TRIM(@cat)
                              AND TRIM(Servicio) = TRIM(@serv)
                              AND Estado = 'A'
                              AND ID_Tarifario != @id
                        `);
                    }
                    await new sql.Request(transaction)
                        .input('id', sql.VarChar(8), row.ID_Tarifario)
                        .input('imp', sql.Decimal(18, 2), parseFloat(row.Importe))
                        .input('ff', sql.Date, row.Fecha_fin ? new Date(row.Fecha_fin) : null)
                        .input('est', sql.VarChar(10), row.Estado || 'A')
                        .query(`
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Importe = @imp, Fecha_fin = @ff, Estado = @est
                            WHERE ID_Tarifario = @id
                        `);
                    updated++;
                }
            }
            await transaction.commit();
            res.json({ success: true, inserted, updated });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- DASHBOARD ANALYTICS ---
app.get('/api/dashboard/stats', verifyToken, async (req: Request, res: Response) => {
    try {
        const { start, end } = req.query as { start?: string; end?: string; ruc?: string };
        const currentUser = (req as AuthRequest).user as JwtUserPayload;
        const efectiveRuc = enforceCasRuc(currentUser, req.query.ruc as string | undefined);
        const db = await getDb();
        const request = db.request();

        request.input('start', sql.DateTime, start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        request.input('end', sql.DateTime, end || new Date());

        let query = `
            WITH TicketsFilt AS (
                SELECT s.Ticket,
                    CASE WHEN LEFT(s.NombreTecnico, 3) IN ('SB2', 'SS ', 'AC ', 'EMS', 'SIL', 'VYA', 'SEY', 'TP ', 'TYG', 'FSI', 'LM ', 'TCP', 'MG ', 'AYD', 'SLR', 'REY', 'VR ', 'LV ', 'MR ', 'AXX', 'COT', 'SNT', 'NUL')
                    THEN LEFT(s.NombreTecnico, 3) ELSE 'GAC' END as Prefix,
                    s.IdServicio, s.CodigoExternoEquipo, s.FechaVisita, s.CheckOut, s.Ciudad, s.Distrito, s.NombreEquipo
                FROM [SIATC].[Dashboard_FSM] s
                WHERE s.CheckOut >= @start AND s.CheckOut < DATEADD(DAY, 1, @end)
                  AND s.Estado = 'Closed'
                  AND s.VisitaRealizada = 'true'
                  AND s.TrabajoRealizado = 'true'
            ),
            TicketsCAS AS (
                SELECT tf.*, cas.ID_CAS, cas.RUC, ISNULL(m.Categoria, 'N/A') as Categoria
                FROM TicketsFilt tf
                LEFT JOIN [dbo].[GAC_APP_TB_CAS] cas ON TRIM(tf.Prefix) = TRIM(cas.Abrev_nombre_colaboradores)
                OUTER APPLY (
                    SELECT TOP 1 Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = tf.CodigoExternoEquipo
                ) m
                WHERE 1=1
        `;

        if (efectiveRuc !== null && efectiveRuc !== 'all') {
            query += ` AND cas.RUC = @ruc `;
            request.input('ruc', sql.VarChar, efectiveRuc);
        }

        query += `
            ),
            ResumenServicios AS (
                SELECT 
                    ID_CAS, 
                    IdServicio, 
                    Categoria, 
                    SUM(CASE 
                        WHEN IdServicio = 'Visita' THEN 0
                        WHEN DATEDIFF(day, FechaVisita, CheckOut) > 1 THEN 0 
                        WHEN LEFT(CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                        ELSE 1 
                    END) as CntValidos,
                    SUM(CASE 
                        WHEN DATEDIFF(day, FechaVisita, CheckOut) > 1 THEN 0 
                        WHEN LEFT(CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                        ELSE 1 
                    END) as Cnt -- Para compatibilidad
                FROM TicketsCAS
                GROUP BY ID_CAS, IdServicio, Categoria
            ),
            ValSanciones AS (
                SELECT SUM(d.Importe) as Total FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d
                WHERE d.Ticket IN (SELECT Ticket FROM TicketsCAS)
            ),
            ValAdicionales AS (
                SELECT (
                    ISNULL((SELECT SUM(a.Importe) FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] a WHERE a.Ticket IN (SELECT Ticket FROM TicketsCAS)), 0) +
                    ISNULL((
                        SELECT SUM(cfg.Importe)
                        FROM TicketsCAS tc
                        JOIN [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] cfg ON cfg.Activo = 1
                          AND tc.CheckOut >= cfg.Fecha_Inicio 
                          AND (cfg.Fecha_Fin IS NULL OR tc.CheckOut <= cfg.Fecha_Fin)
                        WHERE EXISTS (SELECT 1 FROM OPENJSON(cfg.CAS_Ids) WHERE value = tc.ID_CAS)
                          AND EXISTS (SELECT 1 FROM OPENJSON(cfg.Distritos) WHERE value = tc.Distrito)
                    ), 0)
                ) as Total
            ),
            CalculoTarifas AS (
                SELECT 
                    tc.ID_CAS,
                    tc.Ticket,
                    tc.IdServicio,
                    tc.Categoria,
                    tc.Ciudad,
                    tc.Distrito,
                    COALESCE(
                        -- 1. Buscar en Excepciones
                        (SELECT TOP 1 ex.Importe 
                         FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                         WHERE ex.Empresa = tc.ID_CAS
                           AND ex.Estado = 'A'
                           AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = tc.Categoria))
                           AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = tc.IdServicio))
                           AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = tc.Ciudad OR value = tc.Distrito))
                           AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = tc.Ciudad OR value = tc.Distrito))
                         ORDER BY ex.Prioridad DESC, ex.Creado_El DESC),
                        -- 2. Tarifario Base
                        (SELECT TOP 1 t.Importe 
                         FROM [dbo].[GAC_APP_TB_TARIFARIO] t
                         WHERE t.Empresa = tc.ID_CAS
                           AND (t.Servicio = tc.IdServicio)
                           AND TRIM(t.Categoria) = TRIM(tc.Categoria)
                           AND t.Estado = 'A'
                         ORDER BY t.Fecha_inicio DESC)
                    ) as ImporteAplicado,
                    -- Verificación de validos (mismos filtros que el original)
                    CASE 
                        WHEN tc.IdServicio = 'Visita' THEN 0
                        WHEN DATEDIFF(day, tc.FechaVisita, tc.CheckOut) > 1 THEN 0 
                        WHEN LEFT(tc.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                        ELSE 1 
                    END as EsValido
                FROM TicketsCAS tc
            )
            SELECT 
                (SELECT COUNT(*) FROM TicketsCAS) as TotalTickets,
                ISNULL((SELECT SUM(ImporteAplicado) FROM CalculoTarifas WHERE EsValido = 1), 0) as BaseImporte,
                ISNULL((SELECT Total FROM ValAdicionales), 0) as Adicionales,
                ISNULL((SELECT Total FROM ValSanciones), 0) as Sanciones
        `;

        const stats = await request.query(query);
        const result = stats.recordset[0];
        const bruto = (result.BaseImporte || 0) + (result.Adicionales || 0);

        res.json({
            TotalTickets: result.TotalTickets || 0,
            Bruto: bruto,
            Sanciones: result.Sanciones || 0,
            Neto: bruto - (result.Sanciones || 0)
        });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get('/api/dashboard/trends', verifyToken, async (req: Request, res: Response) => {
    try {
        const { months = 6 } = req.query as { months?: string; ruc?: string };
        const currentUser = (req as AuthRequest).user as JwtUserPayload;
        const efectiveRuc = enforceCasRuc(currentUser, req.query.ruc as string | undefined);
        const db = await getDb();
        const request = db.request();

        request.input('m', sql.Int, -Number(months));

        let query = `
            WITH TicketsFilt AS (
                SELECT s.Ticket, s.CheckOut, s.IdServicio, s.CodigoExternoEquipo, s.FechaVisita, s.Ciudad, s.Distrito,
                    CASE WHEN LEFT(s.NombreTecnico, 3) IN ('SB2', 'SS ', 'AC ', 'EMS', 'SIL', 'VYA', 'SEY', 'TP ', 'TYG', 'FSI', 'LM ', 'TCP', 'MG ', 'AYD', 'SLR', 'REY', 'VR ', 'LV ', 'MR ', 'AXX', 'COT', 'SNT', 'NUL')
                    THEN LEFT(s.NombreTecnico, 3) ELSE 'GAC' END as Prefix
                FROM [SIATC].[Dashboard_FSM] s
                WHERE s.CheckOut >= DATEADD(MONTH, @m, GETDATE()) AND s.Estado = 'Closed'
                  AND s.VisitaRealizada = 'true' AND s.TrabajoRealizado = 'true'
            ),
            TicketsCAS AS (
                SELECT tf.*, cas.ID_CAS, cas.RUC, ISNULL(m.Categoria, 'N/A') as Categoria
                FROM TicketsFilt tf
                LEFT JOIN [dbo].[GAC_APP_TB_CAS] cas ON TRIM(tf.Prefix) = TRIM(cas.Abrev_nombre_colaboradores)
                OUTER APPLY (
                    SELECT TOP 1 Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = tf.CodigoExternoEquipo
                ) m
                WHERE 1=1
        `;

        if (efectiveRuc !== null && efectiveRuc !== 'all') {
            query += ` AND cas.RUC = @ruc `;
            request.input('ruc', sql.VarChar, efectiveRuc);
        }

        query += `
            ),
            CalculoTarifas AS (
                SELECT 
                    YEAR(tc.CheckOut) as Anio,
                    MONTH(tc.CheckOut) as MesNum,
                    COALESCE(
                        -- 1. Buscar en Excepciones
                        (SELECT TOP 1 ex.Importe 
                         FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                         WHERE ex.Empresa = tc.ID_CAS
                           AND ex.Estado = 'A'
                           AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = tc.Categoria))
                           AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = tc.IdServicio))
                           AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = tc.Ciudad OR value = tc.Distrito))
                           AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = tc.Ciudad OR value = tc.Distrito))
                         ORDER BY ex.Prioridad DESC, ex.Creado_El DESC),
                        -- 2. Tarifario Base
                        (SELECT TOP 1 t.Importe 
                         FROM [dbo].[GAC_APP_TB_TARIFARIO] t
                         WHERE t.Empresa = tc.ID_CAS
                           AND (t.Servicio = tc.IdServicio)
                           AND TRIM(t.Categoria) = TRIM(tc.Categoria)
                           AND t.Estado = 'A'
                         ORDER BY t.Fecha_inicio DESC)
                    ) as ImporteAplicado,
                    CASE 
                        WHEN tc.IdServicio = 'Visita' THEN 0
                        WHEN DATEDIFF(day, tc.FechaVisita, tc.CheckOut) > 1 THEN 0 
                        WHEN LEFT(tc.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                        ELSE 1 
                    END as EsValido
                FROM TicketsCAS tc
            ),
            ResumenMensual AS (
                SELECT Anio, MesNum, SUM(ImporteAplicado) as Bruto
                FROM CalculoTarifas
                WHERE EsValido = 1
                GROUP BY Anio, MesNum
            ),
            SancionesMensuales AS (
                SELECT YEAR(twc.CheckOut) as Anio, MONTH(twc.CheckOut) as MesNum, SUM(d.Importe) as TotalSanciones
                FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d
                JOIN TicketsCAS twc ON d.Ticket = twc.Ticket
                GROUP BY YEAR(twc.CheckOut), MONTH(twc.CheckOut)
            )
            SELECT 
                CASE rm.MesNum
                    WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Abr'
                    WHEN 5 THEN 'May' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago'
                    WHEN 9 THEN 'Sep' WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dic'
                END as Mes,
                rm.Bruto,
                ISNULL(sm.TotalSanciones, 0) as Sanciones
            FROM ResumenMensual rm
            LEFT JOIN SancionesMensuales sm ON rm.Anio = sm.Anio AND rm.MesNum = sm.MesNum
            ORDER BY rm.Anio ASC, rm.MesNum ASC
        `;

        const trends = await request.query(query);
        res.json(trends.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.get('/api/dashboard/top-cas', verifyToken, async (req: Request, res: Response) => {
    try {
        const { start, end } = req.query as { start?: string; end?: string; ruc?: string };
        const currentUser = (req as AuthRequest).user as JwtUserPayload;
        const efectiveRuc = enforceCasRuc(currentUser, req.query.ruc as string | undefined);
        const db = await getDb();
        const request = db.request();

        request.input('start', sql.DateTime, start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        request.input('end', sql.DateTime, end || new Date());

        let query = `
            WITH RawTickets AS (
                SELECT
                    CASE WHEN LEFT(s.NombreTecnico, 3) IN ('SB2', 'SS ', 'AC ', 'EMS', 'SIL', 'VYA', 'SEY', 'TP ', 'TYG', 'FSI', 'LM ', 'TCP', 'MG ', 'AYD', 'SLR', 'REY', 'VR ', 'LV ', 'MR ', 'AXX', 'COT', 'SNT', 'NUL')
                    THEN LEFT(s.NombreTecnico, 3) ELSE 'GAC' END as Prefix
                FROM [SIATC].[Dashboard_FSM] s
                WHERE s.CheckOut >= @start AND s.CheckOut < DATEADD(DAY, 1, @end)
                  AND s.Estado = 'Closed'
                  AND s.VisitaRealizada = 'true' AND s.TrabajoRealizado = 'true'
            ),
            PrefixCounts AS (
                SELECT Prefix, COUNT(*) as Total FROM RawTickets GROUP BY Prefix
            ),
            TicketsWithCAS AS (
                SELECT cas.Nombre_CAS, pc.Total, cas.RUC
                FROM PrefixCounts pc
                JOIN [dbo].[GAC_APP_TB_CAS] cas ON TRIM(pc.Prefix) = TRIM(cas.Abrev_nombre_colaboradores)
                WHERE 1=1
        `;

        if (efectiveRuc !== null && efectiveRuc !== 'all') {
            query += ` AND cas.RUC = @ruc `;
            request.input('ruc', sql.VarChar, efectiveRuc);
        }

        query += `
            )
            SELECT TOP 5 
                Nombre_CAS as label, 
                SUM(Total) as value
            FROM TicketsWithCAS
            GROUP BY Nombre_CAS
            ORDER BY value DESC
        `;

        const top = await request.query(query);
        res.json(top.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- C4C INTEGRATION ---
app.get('/api/c4c/report/:ticketId', verifyToken, async (req: Request, res: Response) => {
    try {
        const { ticketId } = req.params;

        if (!C4C_BASE_URL || !process.env.C4C_USER || !process.env.C4C_PASSWORD) {
            return res.status(500).json({ 
                error: 'C4C Integration not configured', 
                details: 'Missing C4C_BASE_URL or credentials in environment variables' 
            });
        }
        
        // 1. Find the Service Request
        const searchUrl = `${C4C_BASE_URL}/ServiceRequestCollection?$filter=ID eq '${ticketId}'`;
        const searchResponse = await axios.get(searchUrl, {
            headers: { 'Authorization': `Basic ${C4C_AUTH}` }
        });

        const ticket = searchResponse.data.d.results[0];
        if (!ticket) {
            return res.status(404).json({ error: `Ticket ${ticketId} no encontrado en C4C` });
        }

        // 2. Fetch Attachments using the ObjectID
        // We try to get from the expanded folder or fetch it directly
        let attachments = ticket.ServiceRequestAttachmentFolder?.results;
        
        if (!attachments || attachments.length === 0) {
            const attachmentUrl = `${C4C_BASE_URL}/ServiceRequestCollection('${ticket.ObjectID}')/ServiceRequestAttachmentFolder`;
            try {
                const attachResponse = await axios.get(attachmentUrl, {
                    headers: { 'Authorization': `Basic ${C4C_AUTH}` }
                });
                attachments = attachResponse.data.d.results;
            } catch (attachErr) {
                console.warn('Could not fetch attachments directly:', attachErr);
            }
        }

        if (!attachments || attachments.length === 0) {
            return res.status(404).json({ 
                error: `No se encontraron adjuntos para el ticket ${ticketId}`,
                details: 'El ticket existe pero no tiene archivos asociados en la pestaña de Adjuntos de C4C.'
            });
        }

        // 3. Look for the technical report PDF
        // We prioritize PDFs with "Informe" or "Report" in the name
        let report = attachments.find((a: { MimeType: string; Name: string }) =>
            a.MimeType === 'application/pdf' &&
            (a.Name.toLowerCase().includes('informe') || a.Name.toLowerCase().includes('report'))
        );

        // Fallback: take any PDF if no specific name match
        if (!report) {
            report = attachments.find((a: { MimeType: string; Name: string }) => a.MimeType === 'application/pdf');
        }

        if (!report) {
            return res.status(404).json({ error: `No se encontró un informe en PDF para el ticket ${ticketId}` });
        }

        // 4. Fetch the actual PDF binary content
        // In C4C OData, the content is in the /Binary/$value endpoint of the attachment
        const downloadUrl = `${C4C_BASE_URL}/ServiceRequestAttachmentFolderCollection('${report.ObjectID}')/Binary/$value`;
        
        const pdfResponse = await axios.get(downloadUrl, {
            headers: { 'Authorization': `Basic ${C4C_AUTH}` },
            responseType: 'arraybuffer'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${report.Name}"`);
        res.send(pdfResponse.data);

    } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: { message?: { value?: string } } }; status?: number }; message?: string };
        console.error('C4C Proxy Error:', axiosErr.response?.data || (err instanceof Error ? err.message : String(err)));
        res.status(axiosErr.response?.status || 500).json({
            error: 'Failed to retrieve report from C4C',
            details: axiosErr.response?.data?.error?.message?.value || (err instanceof Error ? err.message : String(err))
        });
    }
});

// --- CONFIG & MANAGEMENT (Standardized) ---

// MANAGEMENTS
app.get('/api/managements', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query('SELECT Id as id, Name as name, Code as code FROM EBM.Managements');
        res.json(result.recordset);
    } catch (err: unknown) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

// PREFERENCES
app.get('/api/config/preferences', verifyToken, (req: Request, res: Response) => {
    res.json({});
});

app.post('/api/config/preferences', verifyToken, (req: Request, res: Response) => {
    res.json({ success: true });
});

// USERS
app.get('/api/users', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query(`
            SELECT u.Id as id, u.FullName as full_name, u.Username as username, u.Email as email,
                   u.RoleId as role_id, r.Name as role_name, CAST(u.IsActive AS BIT) as is_active, 
                   u.Apps as apps, u.AvatarUrl as avatar_url
            FROM EBM.Users u
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id
        `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/users', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { full_name, username, email, password_hash, role_id, apps, avatar_url } = req.body;
        const db = await getDb();

        const userChkReq = db.request();
        addInput(userChkReq, 'u', sql.NVarChar(255), username);
        addInput(userChkReq, 'e', sql.NVarChar(255), email);
        const checkResult = await userChkReq.query("SELECT Id, Apps FROM EBM.Users WHERE Username = @u OR Email = @e");

        if (checkResult.recordset.length > 0) {
            // UPSERT/REACTIVATE
            const existing = checkResult.recordset[0];
            const mergedApps = cleanApps(existing.Apps + ', ' + APP_IDENTIFIER);
            const reactReq = db.request();
            addInput(reactReq, 'id', sql.UniqueIdentifier, existing.Id);
            addInput(reactReq, 'name', sql.NVarChar(255), full_name);
            addInput(reactReq, 'rid', sql.UniqueIdentifier, role_id);
            addInput(reactReq, 'apps', sql.NVarChar(500), mergedApps);
            addInput(reactReq, 'photo', sql.NVarChar(500), avatar_url ?? null);
            await reactReq.query(`UPDATE EBM.Users SET FullName = @name, RoleId = @rid, Apps = @apps, AvatarUrl = @photo, IsActive = 1 WHERE Id = @id`);
            await logAudit(req, 'REACTIVATE', 'USERS', username, { apps: mergedApps });
            return res.json({ id: existing.Id, username });
        }

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password_hash || 'temp1234', salt);
        const appsInsert = cleanApps(apps || APP_IDENTIFIER);

        const userInsReq = db.request();
        addInput(userInsReq, 'name', sql.NVarChar(255), full_name);
        addInput(userInsReq, 'u', sql.NVarChar(255), username);
        addInput(userInsReq, 'e', sql.NVarChar(255), email);
        addInput(userInsReq, 'pass', sql.NVarChar(255), hashed);
        addInput(userInsReq, 'rid', sql.UniqueIdentifier, role_id);
        addInput(userInsReq, 'apps', sql.NVarChar(500), appsInsert);
        addInput(userInsReq, 'photo', sql.NVarChar(500), avatar_url ?? null);
        const result = await userInsReq.query(`
                INSERT INTO EBM.Users (FullName, Username, Email, PasswordHash, RoleId, Apps, AvatarUrl, IsActive, RequiresPasswordChange)
                OUTPUT INSERTED.Id as id
                VALUES (@name, @u, @e, @pass, @rid, @apps, @photo, 1, 1)
            `);
        await logAudit(req, 'CREATE', 'USERS', username, { apps: appsInsert });
        res.status(201).json(result.recordset[0]);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.put('/api/users/:id', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { full_name, username, email, role_id, is_active, apps, avatar_url } = req.body;
        const db = await getDb();
        const appsSave = cleanApps(apps);

        const userUpdReq = db.request();
        addInput(userUpdReq, 'id', sql.UniqueIdentifier, id);
        addInput(userUpdReq, 'name', sql.NVarChar(255), full_name);
        addInput(userUpdReq, 'u', sql.NVarChar(255), username);
        addInput(userUpdReq, 'e', sql.NVarChar(255), email);
        addInput(userUpdReq, 'rid', sql.UniqueIdentifier, role_id);
        addInput(userUpdReq, 'active', sql.Bit, is_active ? 1 : 0);
        addInput(userUpdReq, 'apps', sql.NVarChar(500), appsSave);
        addInput(userUpdReq, 'photo', sql.NVarChar(500), avatar_url ?? null);
        await userUpdReq.query(`UPDATE EBM.Users SET FullName = @name, Username = @u, Email = @e, RoleId = @rid, IsActive = @active, Apps = @apps, AvatarUrl = @photo WHERE Id = @id`);
        
        await logAudit(req, 'UPDATE', 'USERS', id as string, { apps: appsSave });
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.delete('/api/users/:id', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        const userDelReq = db.request();
        addInput(userDelReq, 'id', sql.UniqueIdentifier, id);
        await userDelReq.query("UPDATE EBM.Users SET IsActive = 0 WHERE Id = @id");
        await logAudit(req, 'DEACTIVATE', 'USERS', id as string, {});
        res.status(204).send();
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// ROLES
app.get('/api/roles', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const roles = (await db.request().query("SELECT Id as id, Name as name, Apps as apps FROM EBM.Roles")).recordset;
        const allPerms = (await db.request().query("SELECT RoleId, Permission FROM EBM.RolePermissions")).recordset;
        const result = roles.map((r: { id: string; name: string; apps: string }) => ({
            ...r,
            permissions: allPerms.filter((p: { RoleId: string; Permission: string }) => p.RoleId === r.id).map((p: { RoleId: string; Permission: string }) => p.Permission)
        }));
        res.json(result);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.post('/api/roles', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { name, permissions, apps } = req.body;
        const db = await getDb();
        const appsSave = cleanApps(apps || APP_IDENTIFIER);
        const roleId = crypto.randomUUID().toUpperCase();

        const roleInsReq = db.request();
        addInput(roleInsReq, 'id', sql.UniqueIdentifier, roleId);
        addInput(roleInsReq, 'name', sql.NVarChar(100), name);
        addInput(roleInsReq, 'apps', sql.NVarChar(500), appsSave);
        await roleInsReq.query("INSERT INTO EBM.Roles (Id, Name, Apps) VALUES (@id, @name, @apps)");

        if (permissions && permissions.length > 0) {
            for (const p of permissions) {
                const permInsReq = db.request();
                addInput(permInsReq, 'rid', sql.UniqueIdentifier, roleId);
                addInput(permInsReq, 'p', sql.NVarChar(100), p);
                await permInsReq.query("INSERT INTO EBM.RolePermissions (RoleId, Permission) VALUES (@rid, @p)");
            }
        }
        await logAudit(req, 'CREATE', 'ROLES', name, { apps: appsSave });
        res.status(201).json({ id: roleId, name, permissions });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.put('/api/roles/:id', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, permissions, apps } = req.body;
        const db = await getDb();
        const appsSave = cleanApps(apps || APP_IDENTIFIER);

        const roleUpdReq = db.request();
        addInput(roleUpdReq, 'id', sql.UniqueIdentifier, id);
        addInput(roleUpdReq, 'name', sql.NVarChar(100), name);
        addInput(roleUpdReq, 'apps', sql.NVarChar(500), appsSave);
        await roleUpdReq.query("UPDATE EBM.Roles SET Name = @name, Apps = @apps WHERE Id = @id");

        const delPermReq = db.request();
        addInput(delPermReq, 'rid', sql.UniqueIdentifier, id);
        await delPermReq.query("DELETE FROM EBM.RolePermissions WHERE RoleId = @rid");
        if (permissions && permissions.length > 0) {
            for (const p of permissions) {
                const permUpdReq = db.request();
                addInput(permUpdReq, 'rid', sql.UniqueIdentifier, id);
                addInput(permUpdReq, 'p', sql.NVarChar(100), p);
                await permUpdReq.query("INSERT INTO EBM.RolePermissions (RoleId, Permission) VALUES (@rid, @p)");
            }
        }
        await logAudit(req, 'UPDATE', 'ROLES', name, { apps: appsSave });
        res.json({ id, name, permissions });
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

app.delete('/api/roles/:id', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        
        // Check if users are assigned to this role
        const usersChkReq = db.request();
        addInput(usersChkReq, 'rid', sql.UniqueIdentifier, id);
        const usersInRole = await usersChkReq.query("SELECT COUNT(*) as count FROM EBM.Users WHERE RoleId = @rid AND IsActive = 1");
        if (usersInRole.recordset[0].count > 0) {
            return res.status(400).json({ error: "No se puede eliminar el perfil porque tiene usuarios asignados." });
        }

        const delRolePermReq = db.request();
        addInput(delRolePermReq, 'rid', sql.UniqueIdentifier, id);
        await delRolePermReq.query("DELETE FROM EBM.RolePermissions WHERE RoleId = @rid");

        const delRoleReq = db.request();
        addInput(delRoleReq, 'id', sql.UniqueIdentifier, id);
        await delRoleReq.query("DELETE FROM EBM.Roles WHERE Id = @id");
        
        await logAudit(req, 'DELETE', 'ROLES', id as string, {});
        res.status(204).send();
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});


// AUDIT LOGS
app.get('/api/config/audit-logs', verifyToken, verifyPermission('val.config.audit'), async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const auditLogReq = db.request();
        addInput(auditLogReq, 'app', sql.NVarChar(20), APP_IDENTIFIER);
        const result = await auditLogReq.query(`
            SELECT ID as id, UsuarioID as user_id, UsuarioNombre as user_name, Accion as action, Entidad as entity, Detalle as details, Fecha as created_at
            FROM [dbo].[GAC_APP_TB_AUDIT_LOG]
            WHERE Accion LIKE @app + ':%' OR Entidad LIKE @app + ':%' OR Detalle LIKE '%' + @app + '%'
            ORDER BY Fecha DESC
        `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// --- SERVE STATIC FILES (PROD) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '..', 'dist')));

interface AppMeta { label: string; logoUrl: string; url: string; }
let appMeta: AppMeta | null = null;

async function fetchAppMeta(): Promise<void> {
    try {
        const db = await getDb();
        const code = process.env.APP_CODE || APP_IDENTIFIER;
        const metaReq = db.request();
        addInput(metaReq, 'code', sql.NVarChar(20), code);
        const result = await metaReq.query(`SELECT Label, LogoUrl, Url FROM [dbo].[GAC_APP_TB_CONSOLE_APPLICATIONS] WHERE UPPER(Code) = UPPER(@code)`);
        if (result.recordset.length > 0) {
            const row = result.recordset[0];
            appMeta = { label: row.Label, logoUrl: row.LogoUrl, url: row.Url };
            console.log(`[AppConfig] Loaded meta for ${code}: ${appMeta.label}`);
        }
    } catch (err: unknown) {
        console.warn('[AppConfig] Could not fetch app meta from DB:', err instanceof Error ? err.message : String(err));
    }
}

// SPA Fallback: Serve index.html for any remaining routes
app.use((req: Request, res: Response) => {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    try {
        let html = fs.readFileSync(indexPath, 'utf-8');
        if (appMeta) {
            const ogTags = [
                `<meta property="og:type" content="website" />`,
                `<meta property="og:title" content="${appMeta.label} - SIATC" />`,
                `<meta property="og:description" content="${appMeta.label} - Plataforma de gestión SIATC." />`,
                `<meta property="og:image" content="${appMeta.logoUrl}" />`,
                `<meta property="og:url" content="${appMeta.url}" />`,
                `<meta name="twitter:card" content="summary_large_image" />`,
                `<meta name="twitter:title" content="${appMeta.label} - SIATC" />`,
                `<meta name="twitter:image" content="${appMeta.logoUrl}" />`,
                `<link rel="icon" type="image/png" href="${appMeta.logoUrl}" />`,
            ].join('\n    ');
            html = html.replace(/<meta property="og:[^"]+"[^>]*\/>/g, '');
            html = html.replace(/<link rel="icon"[^>]*\/>/g, '');
            html = html.replace('<title>', `${ogTags}\n  <title>`);
        }
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch {
        res.sendFile(indexPath);
    }
});

if (!process.env.JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET environment variable is missing. Server will not start.');
    process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !(process.env.ALLOWED_ORIGINS || '').trim()) {
    console.warn('⚠️  WARNING: ALLOWED_ORIGINS is not set. CORS will block all cross-origin requests in production.');
}

app.listen(port, () => {
    console.log(`Server Valorizaciones running on http://localhost:${port}`);
    // Fetch app metadata from DB for OG tags
    fetchAppMeta();
});
