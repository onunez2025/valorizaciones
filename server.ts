import express from 'express';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sql from 'mssql';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const APP_IDENTIFIER = 'VAL';
const JWT_SECRET = process.env.JWT_SECRET || 'tablero_control_secret_2026';

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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const dbConfig: sql.config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    server: process.env.DB_SERVER || '',
    port: 1433,
    pool: { max: 30, min: 0, idleTimeoutMillis: 30000 },
    options: { encrypt: true, trustServerCertificate: true, requestTimeout: 60000 }
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

const verifyPermission = (permission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user) return res.status(401).json({ error: 'No autenticado' });

        const roleName = (user.role || '').trim().toLowerCase();
        if (roleName === 'administrador') return next();

        if (user.perms && user.perms.includes(permission)) return next();

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
app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    try {
        const db = await getDb();
        const result = await db.request().input('u', username).input('app', APP_IDENTIFIER).query(`
            SELECT u.*, r.Name as RoleName FROM EBM.Users u 
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id 
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

        const perms = (await db.request().input('rid', user.RoleId).input('app', APP_IDENTIFIER).query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map(p => p.Permission);
        
        const token = jwt.sign({ id: user.Id, username: user.Username, role: user.RoleName, perms }, JWT_SECRET, { expiresIn: '12h' });

        res.json({ token, user: { id: user.Id, username: user.Username, full_name: user.FullName, role_name: user.RoleName, permissions: perms, requires_password_change: user.RequiresPasswordChange === 1 } });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = (req as any).user;
        const db = await getDb();
        const result = await db.request().input('id', id).query(`
            SELECT u.*, r.Name as RoleName FROM EBM.Users u 
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id 
            WHERE u.Id = @id
        `);
        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        
        const perms = (await db.request().input('rid', user.RoleId).input('app', APP_IDENTIFIER).query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map(p => p.Permission);
        res.json({ user: { id: user.Id, username: user.Username, full_name: user.FullName, role_name: user.RoleName, permissions: perms } });
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

// --- VALORIZACIONES ---
app.get('/api/valuations/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const { start, end } = req.query; 

    try {
        const db = await getDb();
        const tickets = await db.request()
            .input('ruc', ruc)
            .input('start', sql.VarChar, `${start} 00:00:00`)
            .input('end', sql.VarChar, `${end} 23:59:59`)
            .query(`
                SELECT 
                    s.Ticket, s.CheckOut as Fecha, s.Servicio as ServicioNombre, 
                    s.IdServicio as Servicio,
                    s.CodigoExternoEquipo as CodigoEquipo,
                    s.NombreEquipo as NombreEquipo,
                    s.FechaVisita, s.CheckOut as FechaCierre,
                    DATEDIFF(day, s.FechaVisita, s.CheckOut) as DiasDiferencia,
                    ISNULL(m.Categoria, 'N/A') as Categoria,
                    CASE 
                        WHEN UPPER(TRIM(s.Servicio)) = 'VISITA' THEN 0
                        WHEN DATEDIFF(day, s.FechaVisita, s.CheckOut) > 1 THEN 0 
                        WHEN LEFT(s.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                        ELSE ISNULL(rate.Importe, 0) 
                    END as TarifaBase,
                    CASE 
                        WHEN LEFT(s.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                        ELSE ISNULL((SELECT SUM(CAST(Importe AS FLOAT)) FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE Ticket = s.Ticket), 0)
                    END as Adicionales
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
                WHERE cas.RUC = @ruc 
                  AND s.CheckOut BETWEEN @start AND @end
                  AND s.Estado = 'Closed'
                  AND s.VisitaRealizada = 'true'
                  AND s.TrabajoRealizado = 'true'
                  AND s.Ticket NOT IN (SELECT Ticket FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE Tipo = 'SERVICIO')
            `);
        res.json(tickets.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
        res.status(201).json({ id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
    const { ticket } = req.params;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('ticket', ticket)
            .query(`
                SELECT TOP 1
                    s.Ticket, s.CheckOut as Fecha, s.Servicio as ServicioNombre,
                    s.IdServicio as Servicio, cas.RUC, cas.Nombre_CAS as CAS_Nombre
                FROM [APPGAC].[ServiciosViewSQL] s
                JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                WHERE s.Ticket = @ticket
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket no encontrado' });
        }
        res.json(result.recordset[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
        ruc, nombreCas, start, end, 
        totalServicios, totalPenalidades, 
        subtotalServicios, subtotalPenalidades, 
        totalFinal, cerradoPor,
        details // Esperamos un array de objetos { ticket, monto, fecha, tipo, servicio, categoria }
    } = req.body;

    try {
        const db = await getDb();
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);
            
            // 1. Insertar Cabecera
            const result = await request
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
                .query(`
                    INSERT INTO [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] 
                    (RUC, Nombre_CAS, Fecha_Inicio, Fecha_Fin, Total_Servicios, Total_Penalidades, Subtotal_Servicios, Subtotal_Penalidades, Total_Final, Cerrado_Por, Cerrado_El, Estado)
                    VALUES (@ruc, @nombreCas, @start, @end, @totalServicios, @totalPenalidades, @subtotalServicios, @subtotalPenalidades, @totalFinal, @cerradoPor, GETDATE(), 'CERRADO')
                    SELECT SCOPE_IDENTITY() as IdCierre
                `);
            
            const idCierre = result.recordset[0].IdCierre;
            const year = new Date().getFullYear();
            const businessCode = `VAL-${year}-${idCierre.toString().padStart(5, '0')}`;

            // 1.1 Actualizar con el código de negocio
            await new sql.Request(transaction)
                .input('id', idCierre)
                .input('code', businessCode)
                .query("UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] SET Codigo_Valorizacion = @code WHERE IdCierre = @id");

            // 2. Insertar Detalles
            if (details && Array.isArray(details)) {
                for (const item of details) {
                    const detailRequest = new sql.Request(transaction);
                    await detailRequest
                        .input('idCierre', idCierre)
                        .input('ticket', item.ticket)
                        .input('monto', item.monto)
                        .input('fecha', item.fecha)
                        .input('tipo', item.tipo)
                        .input('servicio', item.servicio)
                        .input('categoria', item.categoria)
                        .input('fv', item.fechaVisita || null)
                        .input('fc', item.fechaCierre || null)
                        .input('dd', item.diasDiferencia || null)
                        .input('ce', item.codigoExterno || null)
                        .input('tb', item.tarifaBase || 0)
                        .input('ad', item.adicionales || 0)
                        .query(`
                            INSERT INTO [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] 
                            (IdCierre, Ticket, Monto, Fecha_Ticket, Tipo, Servicio_Nombre, Categoria, Fecha_Visita, Fecha_Cierre, Dias_Diferencia, Codigo_Externo, Tarifa_Base, Adicionales)
                            VALUES (@idCierre, @ticket, @monto, @fecha, @tipo, @servicio, @categoria, @fv, @fc, @dd, @ce, @tb, @ad)
                        `);
                }
            }

            await transaction.commit();
            res.json({ success: true, message: "Quincena cerrada correctamente.", idCierre, codigo: businessCode });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: any) { 
        console.error("Error en cierre:", err);
        res.status(500).json({ error: err.message }); 
    }
});

app.get('/api/penalties/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const { start, end } = req.query;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('ruc', ruc)
            .input('start', start)
            .input('end', end)
            .query(`
                SELECT 
                    d.ID_Descuentos_CAS as Id,
                    d.Ticket,
                    d.Fecha,
                    COALESCE(m.Motivo, d.Motivo) as Motivo,
                    d.Descripcion,
                    d.Importe,
                    d.Estado
                FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d
                JOIN [APPGAC].[ServiciosViewSQL] s ON d.Ticket = s.Ticket
                JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                LEFT JOIN [dbo].[GAC_APP_TB_DESCUENTOS_MOTIVOS] m ON d.Motivo = m.IdMotivo
                WHERE cas.RUC = @ruc 
                  AND d.Fecha BETWEEN @start AND @end
                  AND NOT EXISTS (
                      SELECT 1 FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] det 
                      WHERE det.Ticket = d.Ticket AND det.Tipo = 'PENALIDAD'
                  )
            `);
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/closures', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query(`
            SELECT * FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] 
            ORDER BY Cerrado_El DESC
        `);
        res.json(result.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/closures/:id/details', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getDb();
        const result = await db.request()
            .input('id', id)
            .query(`
                SELECT 
                    d.*,
                    ISNULL(d.Fecha_Visita, s.FechaVisita) as Fecha_Visita,
                    ISNULL(d.Fecha_Cierre, s.CheckOut) as Fecha_Cierre,
                    ISNULL(d.Dias_Diferencia, DATEDIFF(day, s.FechaVisita, s.CheckOut)) as Dias_Diferencia,
                    COALESCE(NULLIF(d.Codigo_Externo, ''), s.CodigoExternoEquipo) as Codigo_Externo,
                    d.Tarifa_Base, d.Adicionales, d.Monto
                FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] d
                LEFT JOIN [APPGAC].[ServiciosViewSQL] s ON d.Ticket = s.Ticket AND d.Tipo = 'SERVICIO'
                WHERE d.IdCierre = @id
            `);
        res.json(result.recordset);
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
            const request = new sql.Request(transaction);
            
            // ELIMINAMOS PREVIOS PARA ESTE CAS (Opcional, según lógica de negocio, o actualizamos)
            // Para simplicidad en este batch, eliminamos y re-insertamos o actualizamos por lógica de batch.
            // Aquí lo haremos por cada registro para mantener historial básico si fuese necesario.
            
            for (const rate of rates) {
                const id = rate.ID_TARIFARIO || crypto.randomBytes(4).toString('hex');
                await request
                    .input(`id_${id}`, id)
                    .input(`casId_${id}`, casId)
                    .input(`cat_${id}`, rate.Categoria)
                    .input(`serv_${id}`, rate.Servicio)
                    .input(`imp_${id}`, sql.Decimal(18, 2), rate.Importe)
                    .input(`f_ini_${id}`, rate.Fecha_inicio ? new Date(rate.Fecha_inicio) : new Date())
                    .input(`f_fin_${id}`, rate.Fecha_fin ? new Date(rate.Fecha_fin) : null)
                    .query(`
                        IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO] WHERE ID_Tarifario = @id_${id})
                        BEGIN
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO] 
                            SET Importe = @imp_${id}, Categoria = @cat_${id}, Servicio = @serv_${id},
                                Fecha_inicio = @f_ini_${id}, Fecha_fin = @f_fin_${id}
                            WHERE ID_Tarifario = @id_${id}
                        END
                        ELSE
                        BEGIN
                            INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Fecha_fin, Estado)
                            VALUES (@id_${id}, @casId_${id}, @cat_${id}, @serv_${id}, @imp_${id}, @f_ini_${id}, @f_fin_${id}, 'A')
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
                    s.IdServicio, s.CodigoExternoEquipo, s.FechaVisita, s.CheckOut
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
                        WHEN s.IdServicio = 'Visita' OR s.Servicio = 'Visita' THEN 0
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
                SELECT SUM(a.Importe) as Total FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] a
                WHERE a.Ticket IN (SELECT Ticket FROM TicketsCAS)
            )
            SELECT 
                (SELECT COUNT(*) FROM TicketsCAS) as TotalTickets,
                (SELECT SUM(rs.CntValidos * ISNULL(t.Importe, 0)) 
                 FROM ResumenServicios rs 
                 LEFT JOIN [dbo].[GAC_APP_TB_TARIFARIO] t ON t.Empresa = rs.ID_CAS 
                    AND (t.Servicio = rs.IdServicio)
                    AND TRIM(t.Categoria) = TRIM(rs.Categoria)
                    AND t.Estado = 'A'
                ) as BaseImporte,
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
                SELECT s.Ticket, s.CheckOut, s.IdServicio, s.CodigoExternoEquipo, s.FechaVisita,
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
            ResumenMensual AS (
                SELECT 
                    YEAR(twc.CheckOut) as Anio,
                    MONTH(twc.CheckOut) as MesNum,
                    twc.ID_CAS, 
                    twc.IdServicio, 
                    twc.Categoria,
                    SUM(CASE 
                        WHEN twc.IdServicio = 'Visita' OR twc.ServicioNombre = 'Visita' THEN 0
                        WHEN DATEDIFF(day, twc.FechaVisita, twc.CheckOut) > 1 THEN 0 
                        WHEN LEFT(twc.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                        ELSE 1 
                    END) as Cnt
                FROM TicketsCAS twc
                GROUP BY YEAR(twc.CheckOut), MONTH(twc.CheckOut), twc.ID_CAS, twc.IdServicio, twc.Categoria
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
                SUM(rm.Cnt * ISNULL(t.Importe, 0)) as Bruto,
                ISNULL(MIN(sm.TotalSanciones), 0) as Sanciones
            FROM ResumenMensual rm
            LEFT JOIN [dbo].[GAC_APP_TB_TARIFARIO] t ON t.Empresa = rm.ID_CAS 
                AND (t.Servicio = rm.IdServicio)
                AND TRIM(t.Categoria) = TRIM(rm.Categoria) 
                AND t.Estado = 'A'
            LEFT JOIN SancionesMensuales sm ON rm.Anio = sm.Anio AND rm.MesNum = sm.MesNum
            GROUP BY rm.Anio, rm.MesNum
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

// --- CONFIG & MANAGEMENT (Standardized) ---

// USERS
app.get('/api/users', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().input('app', APP_IDENTIFIER).query(`
            SELECT u.Id as id, u.FullName as full_name, u.Username as username, u.Email as email,
                   u.RoleId as role_id, r.Name as role_name, CAST(u.IsActive AS BIT) as is_active, 
                   u.Apps as apps, u.AvatarUrl as avatar_url
            FROM EBM.Users u
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id
            WHERE u.Apps LIKE '%' + @app + '%'
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
        const roles = (await db.request().input('app', APP_IDENTIFIER).query("SELECT Id as id, Name as name, Apps as apps FROM EBM.Roles WHERE Apps LIKE '%' + @app + '%'")).recordset;
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

        const checkRole = await db.request().input('name', name).query("SELECT Id FROM EBM.Roles WHERE Name = @name");
        let roleId;
        if (checkRole.recordset.length > 0) {
            roleId = checkRole.recordset[0].Id;
            await db.request().input('id', roleId).input('apps', appsSave).query("UPDATE EBM.Roles SET Apps = @apps WHERE Id = @id");
        } else {
            const result = await db.request().input('name', name).input('apps', appsSave).query("INSERT INTO EBM.Roles (Id, Name, Apps) OUTPUT INSERTED.Id VALUES (NEWID(), @name, @apps)");
            roleId = result.recordset[0].Id;
        }

        await db.request().input('rid', roleId).query("DELETE FROM EBM.RolePermissions WHERE RoleId = @rid");
        if (permissions && permissions.length > 0) {
            for (const p of permissions) {
                await db.request().input('rid', roleId).input('p', p).query("INSERT INTO EBM.RolePermissions (RoleId, Permission) VALUES (@rid, @p)");
            }
        }
        await logAudit(req, 'CREATE/UPDATE', 'ROLES', name, { apps: appsSave });
        res.status(201).json({ id: roleId, name, permissions });
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

// SPA Fallback: Serve index.html for any remaining routes
app.use((req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server Valorizaciones running on http://localhost:${port}`);
});
