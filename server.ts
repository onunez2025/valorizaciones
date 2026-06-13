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
async function logAudit(req: Request, action: string, entity: string, entityId: string, details: any) {
  try {
    const user = (req as any).user;
    if (!user) return;
    const db = await getDb();
    await db.request()
      .input('uid', user.id)
      .input('un', user.full_name || user.username)
      .input('acc', action)
      .input('ent', entity)
      .input('eid', entityId)
      .input('det', JSON.stringify(details))
      .query(`INSERT INTO [dbo].[GAC_APP_TB_AUDIT_LOG] (UsuarioID, UsuarioNombre, Accion, Entidad, EntidadID, Detalle, Fecha) 
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
        } catch (err: any) {
            console.error('❌ Error de conexión DB:', err.message);
            pool = null;
            throw err;
        }
    }
    return pool;
}

const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token no encontrado' });
    try {
        (req as any).user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) { res.status(403).json({ error: 'Token inválido' }); }
};

app.get('/api/applications', async (req: Request, res: Response) => {
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
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

const verifyPermission = (permission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
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
            SELECT u.*, r.Name as RoleName, m.Name as ManagementName FROM EBM.Users u 
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id 
            LEFT JOIN EBM.Managements m ON u.ManagementId = m.Id
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

        const perms = (await db.request().input('rid', sql.Int, Number(user.RoleId)).input('app', sql.NVarChar, APP_IDENTIFIER).query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map(p => p.Permission);
        
        const token = jwt.sign({ id: user.Id, username: user.Username, role: user.RoleName, perms }, JWT_SECRET, { expiresIn: '12h' });

        res.json({ token, user: { id: user.Id, username: user.Username, full_name: user.FullName, email: user.Email, role_name: user.RoleName, management_id: user.ManagementId, management_name: user.ManagementName, avatar_url: user.AvatarUrl, permissions: perms, apps: user.Apps, requires_password_change: user.RequiresPasswordChange === 1 } });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = (req as any).user;
        const db = await getDb();
        const result = await db.request().input('id', sql.UniqueIdentifier, id).query(`
            SELECT u.*, r.Name as RoleName, m.Name as ManagementName FROM EBM.Users u
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id 
            LEFT JOIN EBM.Managements m ON u.ManagementId = m.Id
            WHERE u.Id = @id
        `);
        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        
        const perms = (await db.request().input('rid', sql.Int, Number(user.RoleId)).input('app', sql.NVarChar, APP_IDENTIFIER).query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map(p => p.Permission);
        res.json({ user: { id: user.Id, username: user.Username, full_name: user.FullName, email: user.Email, role_name: user.RoleName, management_id: user.ManagementId, management_name: user.ManagementName, avatar_url: user.AvatarUrl, permissions: perms, apps: user.Apps } });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- CAS ---
app.get('/api/cas', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CAS] ORDER BY Nombre_CAS");
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- CONFIGURATION ---
app.get('/api/config', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG]");
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config', verifyToken, async (req: Request, res: Response) => {
    try {
        const { clave, valor, descripcion } = req.body;
        const db = await getDb();
        await db.request()
            .input('clave', clave)
            .input('valor', valor)
            .input('descripcion', descripcion)
            .query(`
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- CONFIG ADICIONAL POR DISTRITO ---
app.get('/api/config-distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] ORDER BY Creado_El DESC");
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config-distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id, cas_ids, distritos, importe, fecha_inicio, fecha_fin, activo } = req.body;
        const user = (req as any).user.username;
        const db = await getDb();
        const request = db.request()
            .input('cas', sql.NVarChar, JSON.stringify(cas_ids))
            .input('dist', sql.NVarChar, JSON.stringify(distritos))
            .input('imp', sql.Decimal(18, 2), importe)
            .input('fi', fecha_inicio)
            .input('ff', fecha_fin)
            .input('act', activo ? 1 : 0)
            .input('usr', user);

        if (id) {
            await request.input('id', id).query(`
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/config-distritos/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const idNum = parseInt(req.params.id as string, 10);
        if (isNaN(idNum)) return res.status(400).json({ error: 'ID inválido' });
        const user = (req as any).user;
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query('SELECT DISTINCT Ciudad, Distrito FROM APPGAC.ServiciosViewSQL WHERE Ciudad IS NOT NULL AND Distrito IS NOT NULL ORDER BY Ciudad, Distrito');
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- CONFIG CANAL INSTITUCIONAL ---
app.get('/api/config-canal-institucional', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] ORDER BY Creado_El DESC");
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config-canal-institucional', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id, usuario_creador, fecha_inicio, fecha_fin, importe, keywords, validacion_tipo, activo } = req.body;
        const user = (req as any).user.username;
        const db = await getDb();
        const request = db.request()
            .input('uc', usuario_creador)
            .input('fi', fecha_inicio)
            .input('ff', fecha_fin)
            .input('imp', sql.Decimal(18, 2), importe)
            .input('key', keywords || '')
            .input('type', validacion_tipo || 'CONTIENE')
            .input('act', activo ? 1 : 0)
            .input('usr', user);

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
    } catch (err: any) { 
        console.error('[CONFIG] Error saving rule:', err);
        res.status(500).json({ error: err.message }); 
    }
});

app.delete('/api/config-canal-institucional/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        const idNum = parseInt(id as string);
        console.log(`[CONFIG] Deleting rule ID: ${idNum}`);
        await db.request().input('id', sql.Int, idNum).query("DELETE FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] WHERE Id = @id");
        res.json({ success: true });
    } catch (err: any) { 
        console.error('[CONFIG] Error deleting rule:', err);
        res.status(500).json({ error: err.message }); 
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
                items.forEach((item: any) => {
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
        const creators = Array.from(new Set(items.map((item: any) => item.CreatedBy))).sort();
        res.json(creators);
    } catch (err: any) {
        console.error('C4C Creators Error:', err.message);
        res.status(500).json({ error: "No se pudieron obtener los creadores de C4C." });
    }
});

// --- VALORIZACIONES ---
app.get('/api/valuations/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const { start, end } = req.query; 

    console.log(`[VALUATION] Starting request - RUC: ${ruc}, Range: ${start} to ${end}`);

    try {
        const db = await getDb();
        const request = db.request()
            .input('ruc', ruc)
            .input('start', sql.VarChar, `${start} 00:00:00`)
            .input('end', sql.VarChar, `${end} 23:59:59`);

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

        let tickets: any[] = sqlResult.recordset;
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
    } catch (err: any) { 
        console.error('[VALUATION] Server Error:', err.message);
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/penalty-motives', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query('SELECT IdMotivo, Motivo FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] ORDER BY Motivo');
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/penalties', verifyToken, async (req: Request, res: Response) => {
    const { ticket, fecha, motivo, descripcion, importe, ruc } = req.body;
    const userId = (req as any).user.username;
    const penaltyId = crypto.randomBytes(4).toString('hex');
    try {
        const db = await getDb();
        await db.request()
            .input('id', penaltyId)
            .input('ticket', ticket)
            .input('fecha', fecha)
            .input('motivo', motivo)
            .input('desc', descripcion)
            .input('importe', importe.toString())
            .input('user', userId)
            .query(`
                INSERT INTO [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] 
                (ID_Descuentos_CAS, Ticket, Fecha, Motivo, Descripcion, Importe, Creado_por, Creado_el, Estado)
                VALUES (@id, @ticket, @fecha, @motivo, @desc, @importe, @user, GETDATE(), 'Pendiente')
            `);
        res.status(201).json({ id: penaltyId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/penalties/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { fecha, motivo, descripcion, importe } = req.body;
    try {
        const db = await getDb();
        
        // Validation: Check if already in a closure
        const check = await db.request().input('id', id).query(`
            SELECT 1 FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] 
            WHERE ID_Referencia = @id
        `);
        if (check.recordset.length > 0) {
            return res.status(403).json({ error: "No se puede editar una penalidad que ya ha sido cerrada en una valorización." });
        }

        const existing = await db.request().input('id', id).query("SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] WHERE ID_Descuentos_CAS = @id");
        
        await db.request()
            .input('id', id)
            .input('fecha', fecha)
            .input('motivo', motivo)
            .input('desc', descripcion)
            .input('importe', importe.toString())
            .query(`
                UPDATE [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] 
                SET Fecha = @fecha, Motivo = @motivo, Descripcion = @desc, Importe = @importe 
                WHERE ID_Descuentos_CAS = @id
            `);
            
        await logAudit(req, 'UPDATE', 'PENALTY', id as string, { 
            before: existing.recordset[0], 
            after: { fecha, motivo, descripcion, importe } 
        });
        
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/adicionales', verifyToken, async (req: Request, res: Response) => {
    const { ticket, motivo, importe } = req.body;
    const id = crypto.randomBytes(4).toString('hex');
    try {
        const db = await getDb();
        await db.request()
            .input('id', id)
            .input('ticket', ticket)
            .input('motivo', motivo)
            .input('importe', importe.toString())
            .query(`
                INSERT INTO [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] 
                (ID_valorizacion_adicional, Ticket, Motivo, Importe)
                VALUES (@id, @ticket, @motivo, @importe)
            `);
        await logAudit(req, 'CREATE', 'ADICIONAL', ticket, { id, motivo, importe });
        res.status(201).json({ id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/adicionales/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo, importe } = req.body;
    try {
        const db = await getDb();
        const existing = await db.request().input('id', id).query("SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");
        
        await db.request()
            .input('id', id)
            .input('motivo', motivo)
            .input('importe', importe.toString())
            .query(`
                UPDATE [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] 
                SET Motivo = @motivo, Importe = @importe 
                WHERE ID_valorizacion_adicional = @id
            `);
            
        await logAudit(req, 'UPDATE', 'ADICIONAL', id as string, { 
            before: existing.recordset[0], 
            after: { motivo, importe } 
        });
        
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/adicionales/:ticket', verifyToken, async (req: Request, res: Response) => {
    const { ticket } = req.params;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('ticket', ticket)
            .query(`
                SELECT ID_valorizacion_adicional as Id, Ticket, Motivo, CAST(Importe AS FLOAT) as Importe
                FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                WHERE Ticket = @ticket
                ORDER BY ID_valorizacion_adicional
            `);
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/adicionales/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        const existing = await db.request().input('id', id)
            .query("SELECT Ticket, Motivo, Importe FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");
        await db.request().input('id', id)
            .query("DELETE FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");
        await logAudit(req, 'DELETE', 'ADICIONAL', id as string, existing.recordset[0] || {});
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/valuations/batch-adjustment', verifyToken, async (req: Request, res: Response) => {
    const { tickets, targetAmount, motivo, ruc } = req.body;
    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar una lista de tickets." });
    }

    try {
        const db = await getDb();
        const pool = await getDb();
        
        // 1. Fetch TarifaBase for these tickets to calculate Delta
        // Replicating logic from /api/valuations/:ruc
        const request = pool.request();
        request.input('ruc', ruc);
        
        // Create parameter list for the IN clause
        const paramNames = tickets.map((_, i) => `@t${i}`);
        tickets.forEach((t, i) => request.input(`t${i}`, t));

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
                await transaction.request()
                    .input('ticket', ticket)
                    .query("DELETE FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE Ticket = @ticket");

                // Insert new delta
                if (delta !== 0) {
                    await transaction.request()
                        .input('id', adjustmentId)
                        .input('ticket', ticket)
                        .input('motivo', motivo)
                        .input('importe', delta)
                        .query(`
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
    } catch (err: any) {
        console.error("Batch Adjustment Error:", err);
        res.status(500).json({ error: err.message });
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
    const user = (req as any).user;

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
    try {
        const db = await getDb();
        const field = isCas ? 'Adjunto_motivo' : 'Adjunto_motivo'; // Usaremos el mismo campo para simplificar la traza de texto
        await db.request()
            .input('id', id)
            .input('status', status)
            .input('obs', observation)
            .query(`UPDATE [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] SET Estado = @status, Adjunto_motivo = @obs WHERE ID_Descuentos_CAS = @id`);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
    } catch (err: any) { 
        console.error('Error in ticket find:', err);
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/tickets/search/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const { q } = req.query;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('ruc', ruc)
            .input('q', `%${q}%`)
            .query(`
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
                const checkDraft = await new sql.Request(transaction)
                    .input('ruc', ruc)
                    .input('start', start)
                    .input('end', end)
                    .query("SELECT IdCierre, Codigo_Valorizacion FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE RUC = @ruc AND Fecha_Inicio = @start AND Fecha_Fin = @end AND Estado = 'BORRADOR'");
                
                if (checkDraft.recordset.length > 0) {
                    actualIdCierre = checkDraft.recordset[0].IdCierre;
                    businessCode = checkDraft.recordset[0].Codigo_Valorizacion;
                }
            }

            if (actualIdCierre) {
                // 1. Actualizar Cabecera
                await new sql.Request(transaction)
                    .input('id', actualIdCierre)
                    .input('totalServicios', totalServicios)
                    .input('totalPenalidades', totalPenalidades)
                    .input('subtotalServicios', subtotalServicios)
                    .input('subtotalPenalidades', subtotalPenalidades)
                    .input('totalFinal', totalFinal)
                    .input('estado', finalEstado)
                    .input('user', cerradoPor)
                    .query(`
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
                    const codeResult = await new sql.Request(transaction)
                        .input('id', actualIdCierre)
                        .query("SELECT Codigo_Valorizacion FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
                    businessCode = codeResult.recordset[0]?.Codigo_Valorizacion;
                }

                // 2. Limpiar detalles antiguos
                await new sql.Request(transaction)
                    .input('id', actualIdCierre)
                    .query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE IdCierre = @id");

            } else {
                // 1. Insertar Cabecera Nueva
                const result = await new sql.Request(transaction)
                    .input('ruc', ruc)
                    .input('nombreCas', nombreCas)
                    .input('start', start)
                    .input('end', end)
                    .input('totalServicios', totalServicios)
                    .input('totalPenalidades', totalPenalidades)
                    .input('subtotalServicios', subtotalServicios)
                    .input('subtotalPenalidades', subtotalPenalidades)
                    .input('totalFinal', totalFinal)
                    .input('cerradoPor', cerradoPor)
                    .input('estado', finalEstado)
                    .query(`
                        INSERT INTO [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] 
                        (RUC, Nombre_CAS, Fecha_Inicio, Fecha_Fin, Total_Servicios, Total_Penalidades, Subtotal_Servicios, Subtotal_Penalidades, Total_Final, Cerrado_Por, Cerrado_El, Estado)
                        VALUES (@ruc, @nombreCas, @start, @end, @totalServicios, @totalPenalidades, @subtotalServicios, @subtotalPenalidades, @totalFinal, @cerradoPor, GETDATE(), @estado)
                        SELECT SCOPE_IDENTITY() as IdCierre
                    `);
                
                actualIdCierre = result.recordset[0].IdCierre;
                const year = new Date().getFullYear();
                businessCode = `VAL-${year}-${actualIdCierre.toString().padStart(5, '0')}`;

                // 1.1 Actualizar con el código de negocio
                await new sql.Request(transaction)
                    .input('id', actualIdCierre)
                    .input('code', businessCode)
                    .query("UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] SET Codigo_Valorizacion = @code WHERE IdCierre = @id");
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
    } catch (err: any) { 
        console.error("Error en operación de valorización:", err);
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/valuations/finalize/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        await db.request()
            .input('id', id)
            .query("UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] SET Estado = 'CERRADO', Cerrado_El = GETDATE() WHERE IdCierre = @id");
        
        await logAudit(req, 'FINALIZE_DRAFT', 'VALUATION', id as string, { status: 'CERRADO' });
        res.json({ success: true, message: "Valorización cerrada correctamente." });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


app.post('/api/valuations/reopen/:id', verifyToken, verifyPermission('VAL.REOPEN'), async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction).input('id', id);
            
            // Get closure info for audit
            const closureInfo = await request.query("SELECT Codigo_Valorizacion, RUC, Total_Final FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            if (closureInfo.recordset.length === 0) {
                return res.status(404).json({ error: 'Cierre no encontrado' });
            }

            // 1. Delete details
            await new sql.Request(transaction).input('id', id).query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE IdCierre = @id");
            
            // 2. Delete header
            await new sql.Request(transaction).input('id', id).query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");

            await transaction.commit();
            
            const info = closureInfo.recordset[0];
            await logAudit(req, 'REOPEN_FORTNIGHT', 'VALUATION', info.Codigo_Valorizacion, { id, ruc: info.RUC, total: info.Total_Final });

            res.json({ success: true, message: "Quincena reaperturada correctamente. Los tickets vuelven a estar disponibles." });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: any) {
        console.error("Error reopening valuation:", err);
        res.status(500).json({ error: err.message });
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
    } catch (err: any) {
        console.error('Error enviando email:', err.response?.data || err.message);
        res.status(500).json({ error: 'No se pudo enviar el correo: ' + (err.response?.data?.error?.message || err.message) });
    }
});

app.get('/api/penalties/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const { start, end } = req.query;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('ruc', ruc)
            .input('start', sql.VarChar, `${start} 00:00:00`)
            .input('end', sql.VarChar, `${end} 23:59:59`)
            .query(`
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/closures', verifyToken, async (req: Request, res: Response) => {
    const { ruc, start, end } = req.query;
    try {
        const db = await getDb();
        const request = db.request();
        let query = `SELECT * FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES]`;
        
        const conditions: string[] = [];
        if (ruc) {
            conditions.push(`TRIM(RUC) = TRIM(@ruc)`);
            request.input('ruc', sql.VarChar, ruc as string);
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/valuations/details/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('id', id)
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});


app.get('/api/tarifarios/:casId', verifyToken, async (req: Request, res: Response) => {
    const { casId } = req.params;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('casId', casId)
            .query(`
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tarifarios/create', verifyToken, async (req: Request, res: Response) => {
    const { empresa, categoria, servicio, importe, fecha_inicio, fecha_fin, estado } = req.body;
    try {
        const db = await getDb();
        const newId = crypto.randomBytes(4).toString('hex');
        await db.request()
            .input('id', newId)
            .input('empresa', empresa)
            .input('categoria', categoria)
            .input('servicio', servicio)
            .input('importe', sql.Decimal(18, 2), importe)
            .input('fecha_inicio', fecha_inicio)
            .input('fecha_fin', fecha_fin || null)
            .input('estado', estado || 'A')
            .query(`
                INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (
                    ID_Tarifario, Empresa, Categoria, Servicio, 
                    Fecha_inicio, Fecha_fin, Importe, Estado
                ) VALUES (
                    @id, @empresa, @categoria, @servicio, 
                    @fecha_inicio, @fecha_fin, @importe, @estado
                )
            `);
        res.json({ success: true, id: newId });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- MATERIALES ---
app.get('/api/materials', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT ID_Material, ID_Externo, Nombre, Categoria, Estado, Sector FROM [dbo].[GAC_APP_TB_MATERIALES] ORDER BY Categoria, Nombre");
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/materials/categories', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT DISTINCT Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE Categoria IS NOT NULL AND Categoria != '' ORDER BY Categoria");
        res.json(result.recordset.map(r => r.Categoria));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/materials', verifyToken, async (req: Request, res: Response) => {
    const { idExterno, nombre, categoria, sector } = req.body;
    try {
        const db = await getDb();
        const check = await db.request().input('ext', idExterno).query("SELECT ID_Material FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = @ext");
        
        if (check.recordset.length > 0) {
            const id = check.recordset[0].ID_Material;
            await db.request()
                .input('id', id)
                .input('nombre', nombre)
                .input('cat', categoria)
                .input('sec', sector || 'GAC')
                .query(`UPDATE [dbo].[GAC_APP_TB_MATERIALES] SET Nombre = @nombre, Categoria = @cat, Sector = @sec WHERE ID_Material = @id`);
            res.json({ success: true, id, action: 'updated' });
        } else {
            const newId = crypto.randomBytes(4).toString('hex');
            await db.request()
                .input('id', newId)
                .input('ext', idExterno)
                .input('nombre', nombre)
                .input('cat', categoria)
                .input('sec', sector || 'GAC')
                .query(`INSERT INTO [dbo].[GAC_APP_TB_MATERIALES] (ID_Material, ID_Externo, Nombre, Categoria, Sector, Estado, EstadoEnCatalogo) VALUES (@id, @ext, @nombre, @cat, @sec, 'Activo', 'Publicado')`);
            res.json({ success: true, id: newId, action: 'created' });
        }
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tarifarios/update', verifyToken, async (req: Request, res: Response) => {
    const { id, importe, estado } = req.body;
    try {
        const db = await getDb();
        await db.request()
            .input('id', id)
            .input('importe', sql.Decimal(18, 2), importe)
            .input('estado', estado)
            .query(`
                UPDATE [dbo].[GAC_APP_TB_TARIFARIO] 
                SET Importe = @importe, Estado = @estado 
                WHERE ID_Tarifario = @id
            `);
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tarifarios/batch', verifyToken, async (req: Request, res: Response) => {
    const { casId, rates } = req.body;
    try {
        const db = await getDb();
        const transaction = new sql.Transaction(db);
        await transaction.begin();
        
        try {
            for (const rate of rates) {
                const req = transaction.request();
                const id = rate.ID_TARIFARIO || crypto.randomBytes(4).toString('hex');
                await req
                    .input('id', id)
                    .input('casId', casId)
                    .input('cat', rate.Categoria)
                    .input('serv', rate.Servicio)
                    .input('imp', sql.Decimal(18, 2), rate.Importe)
                    .input('f_ini', rate.Fecha_inicio ? new Date(rate.Fecha_inicio) : new Date())
                    .input('f_fin', rate.Fecha_fin ? new Date(rate.Fecha_fin) : null)
                    .query(`
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- TARIFARIO EXCEPCIONES ---
app.get('/api/tarifarios/exceptions/:casId', verifyToken, async (req: Request, res: Response) => {
    const { casId } = req.params;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('casId', casId)
            .query("SELECT * FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE Empresa = @casId AND Estado = 'A' ORDER BY Prioridad DESC, Creado_El DESC");
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tarifarios/exceptions/save', verifyToken, async (req: Request, res: Response) => {
    const { id, empresa, nombre, zonasIncluidas, zonasExcluidas, categorias, servicios, importe, prioridad, estado } = req.body;
    try {
        const db = await getDb();
        const finalId = id || crypto.randomBytes(4).toString('hex');
        
        await db.request()
            .input('id', finalId)
            .input('empresa', empresa)
            .input('nombre', nombre)
            .input('zi', JSON.stringify(zonasIncluidas || null))
            .input('ze', JSON.stringify(zonasExcluidas || null))
            .input('cat', JSON.stringify(categorias || null))
            .input('serv', JSON.stringify(servicios || null))
            .input('imp', sql.Decimal(18, 2), importe)
            .input('prio', prioridad || 0)
            .input('est', estado || 'A')
            .query(`
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tarifarios/exceptions/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        await db.request().input('id', id).query("UPDATE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] SET Estado = 'I' WHERE IdExcepcion = @id");
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- DASHBOARD ANALYTICS ---
app.get('/api/dashboard/stats', verifyToken, async (req: Request, res: Response) => {
    try {
        const { start, end, ruc } = req.query as any;
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

        if (ruc && ruc !== 'all') {
            query += ` AND cas.RUC = @ruc `;
            request.input('ruc', sql.VarChar, ruc);
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/trends', verifyToken, async (req: Request, res: Response) => {
    try {
        const { months = 6, ruc } = req.query as any;
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

        if (ruc && ruc !== 'all') {
            query += ` AND cas.RUC = @ruc `;
            request.input('ruc', sql.VarChar, ruc);
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/top-cas', verifyToken, async (req: Request, res: Response) => {
    try {
        const { start, end, ruc } = req.query as any;
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

        if (ruc && ruc !== 'all') {
            query += ` AND cas.RUC = @ruc `;
            request.input('ruc', sql.VarChar, ruc);
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
        let report = attachments.find((a: any) => 
            a.MimeType === 'application/pdf' && 
            (a.Name.toLowerCase().includes('informe') || a.Name.toLowerCase().includes('report'))
        );

        // Fallback: take any PDF if no specific name match
        if (!report) {
            report = attachments.find((a: any) => a.MimeType === 'application/pdf');
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

    } catch (err: any) {
        console.error('C4C Proxy Error:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json({ 
            error: 'Failed to retrieve report from C4C',
            details: err.response?.data?.error?.message?.value || err.message
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
    } catch (err: any) {
        res.status(500).json({ error: err.message });
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
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { full_name, username, email, password_hash, role_id, apps, avatar_url } = req.body;
        const db = await getDb();

        const checkResult = await db.request()
            .input('u', username).input('e', email)
            .query("SELECT Id, Apps FROM EBM.Users WHERE Username = @u OR Email = @e");

        if (checkResult.recordset.length > 0) {
            // UPSERT/REACTIVATE
            const existing = checkResult.recordset[0];
            const mergedApps = cleanApps(existing.Apps + ', ' + APP_IDENTIFIER);
            await db.request()
                .input('id', existing.Id)
                .input('name', full_name)
                .input('rid', role_id)
                .input('apps', mergedApps)
                .input('photo', avatar_url)
                .query(`UPDATE EBM.Users SET FullName = @name, RoleId = @rid, Apps = @apps, AvatarUrl = @photo, IsActive = 1 WHERE Id = @id`);
            await logAudit(req, 'REACTIVATE', 'USERS', username, { apps: mergedApps });
            return res.json({ id: existing.Id, username });
        }

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password_hash || 'temp1234', salt);
        const appsInsert = cleanApps(apps || APP_IDENTIFIER);

        const result = await db.request()
            .input('name', full_name).input('u', username).input('e', email)
            .input('pass', hashed).input('rid', role_id).input('apps', appsInsert)
            .input('photo', avatar_url)
            .query(`
                INSERT INTO EBM.Users (FullName, Username, Email, PasswordHash, RoleId, Apps, AvatarUrl, IsActive, RequiresPasswordChange)
                OUTPUT INSERTED.Id as id
                VALUES (@name, @u, @e, @pass, @rid, @apps, @photo, 1, 1)
            `);
        await logAudit(req, 'CREATE', 'USERS', username, { apps: appsInsert });
        res.status(201).json(result.recordset[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { full_name, username, email, role_id, is_active, apps, avatar_url } = req.body;
        const db = await getDb();
        const appsSave = cleanApps(apps);

        await db.request()
            .input('id', id).input('name', full_name).input('u', username).input('e', email)
            .input('rid', role_id).input('active', is_active ? 1 : 0).input('apps', appsSave)
            .input('photo', avatar_url)
            .query(`UPDATE EBM.Users SET FullName = @name, Username = @u, Email = @e, RoleId = @rid, IsActive = @active, Apps = @apps, AvatarUrl = @photo WHERE Id = @id`);
        
        await logAudit(req, 'UPDATE', 'USERS', id as string, { apps: appsSave });
        res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        await db.request().input('id', id).query("UPDATE EBM.Users SET IsActive = 0 WHERE Id = @id");
        await logAudit(req, 'DEACTIVATE', 'USERS', id as string, {});
        res.status(204).send();
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ROLES
app.get('/api/roles', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const roles = (await db.request().query("SELECT Id as id, Name as name, Apps as apps FROM EBM.Roles")).recordset;
        const allPerms = (await db.request().query("SELECT RoleId, Permission FROM EBM.RolePermissions")).recordset;
        const result = roles.map((r: any) => ({
            ...r,
            permissions: allPerms.filter((p: any) => p.RoleId === r.id).map((p: any) => p.Permission)
        }));
        res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/roles', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { name, permissions, apps } = req.body;
        const db = await getDb();
        const appsSave = cleanApps(apps || APP_IDENTIFIER);
        const roleId = crypto.randomUUID().toUpperCase();

        await db.request()
            .input('id', roleId)
            .input('name', name)
            .input('apps', appsSave)
            .query("INSERT INTO EBM.Roles (Id, Name, Apps) VALUES (@id, @name, @apps)");

        if (permissions && permissions.length > 0) {
            for (const p of permissions) {
                await db.request().input('rid', roleId).input('p', p).query("INSERT INTO EBM.RolePermissions (RoleId, Permission) VALUES (@rid, @p)");
            }
        }
        await logAudit(req, 'CREATE', 'ROLES', name, { apps: appsSave });
        res.status(201).json({ id: roleId, name, permissions });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/roles/:id', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, permissions, apps } = req.body;
        const db = await getDb();
        const appsSave = cleanApps(apps || APP_IDENTIFIER);

        await db.request()
            .input('id', id)
            .input('name', name)
            .input('apps', appsSave)
            .query("UPDATE EBM.Roles SET Name = @name, Apps = @apps WHERE Id = @id");

        await db.request().input('rid', id).query("DELETE FROM EBM.RolePermissions WHERE RoleId = @rid");
        if (permissions && permissions.length > 0) {
            for (const p of permissions) {
                await db.request().input('rid', id).input('p', p).query("INSERT INTO EBM.RolePermissions (RoleId, Permission) VALUES (@rid, @p)");
            }
        }
        await logAudit(req, 'UPDATE', 'ROLES', name, { apps: appsSave });
        res.json({ id, name, permissions });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/roles/:id', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getDb();
        
        // Check if users are assigned to this role
        const usersInRole = await db.request().input('rid', id).query("SELECT COUNT(*) as count FROM EBM.Users WHERE RoleId = @rid AND IsActive = 1");
        if (usersInRole.recordset[0].count > 0) {
            return res.status(400).json({ error: "No se puede eliminar el perfil porque tiene usuarios asignados." });
        }

        await db.request().input('rid', id).query("DELETE FROM EBM.RolePermissions WHERE RoleId = @rid");
        await db.request().input('id', id).query("DELETE FROM EBM.Roles WHERE Id = @id");
        
        await logAudit(req, 'DELETE', 'ROLES', id as string, {});
        res.status(204).send();
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// AUDIT LOGS
app.get('/api/config/audit-logs', verifyToken, verifyPermission('val.config.audit'), async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().input('app', APP_IDENTIFIER).query(`
            SELECT ID as id, UsuarioID as user_id, UsuarioNombre as user_name, Accion as action, Entidad as entity, Detalle as details, Fecha as created_at
            FROM [dbo].[GAC_APP_TB_AUDIT_LOG]
            WHERE Accion LIKE @app + ':%' OR Entidad LIKE @app + ':%' OR Detalle LIKE '%' + @app + '%'
            ORDER BY Fecha DESC
        `);
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
        const result = await db.request()
            .input('code', code)
            .query(`SELECT Label, LogoUrl, Url FROM [dbo].[GAC_APP_TB_CONSOLE_APPLICATIONS] WHERE UPPER(Code) = UPPER(@code)`);
        if (result.recordset.length > 0) {
            const row = result.recordset[0];
            appMeta = { label: row.Label, logoUrl: row.LogoUrl, url: row.Url };
            console.log(`[AppConfig] Loaded meta for ${code}: ${appMeta.label}`);
        }
    } catch (err: any) {
        console.warn('[AppConfig] Could not fetch app meta from DB:', err.message);
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

app.listen(port, () => {
    console.log(`Server Valorizaciones running on http://localhost:${port}`);
    // Fetch app metadata from DB for OG tags
    fetchAppMeta();
});
