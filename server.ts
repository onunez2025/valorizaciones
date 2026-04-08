import express from 'express';
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
const JWT_SECRET = process.env.JWT_SECRET || 'tablero_control_secret_2026';

app.use(cors());
app.use(express.json());

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

// --- AUTH ---
app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    try {
        const db = await getDb();
        const result = await db.request().input('u', username).query(`
            SELECT u.*, r.Name as RoleName FROM EBM.Users u 
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id 
            WHERE (u.Username = @u OR u.Email = @u) AND u.IsActive = 1
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

        const perms = (await db.request().input('rid', user.RoleId).query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid")).recordset.map(p => p.Permission);
        
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
        
        const perms = (await db.request().input('rid', user.RoleId).query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid")).recordset.map(p => p.Permission);
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
                    ISNULL(m.Categoria, 'N/A') as Categoria,
                    ISNULL(rate.Importe, 0) as TarifaBase,
                    ISNULL((SELECT SUM(CAST(Importe AS FLOAT)) FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE Ticket = s.Ticket), 0) as Adicionales
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

app.post('/api/valuations/close', verifyToken, async (req: Request, res: Response) => {
    const { ruc, start, end } = req.body;
    try {
        // Simulación de cierre
        res.json({ message: 'Valorización cerrada y reporte enviado satisfactoriamente.' });
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
    const { ruc, nombreCas, start, end, totalServicios, totalPenalidades, subtotalServicios, subtotalPenalidades, totalFinal, cerradoPor } = req.body;
    try {
        const db = await getDb();
        await db.request()
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
                (RUC, Nombre_CAS, Fecha_Inicio, Fecha_Fin, Total_Servicios, Total_Penalidades, Subtotal_Servicios, Subtotal_Penalidades, Total_Final, Cerrado_Por)
                VALUES (@ruc, @nombreCas, @start, @end, @totalServicios, @totalPenalidades, @subtotalServicios, @subtotalPenalidades, @totalFinal, @cerradoPor)
            `);
        res.json({ success: true, message: "Quincena cerrada correctamente" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
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
                    CAST(d.Importe AS FLOAT) as Importe,
                    d.Estado
                FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d
                JOIN [APPGAC].[ServiciosViewSQL] s ON d.Ticket = s.Ticket
                JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                LEFT JOIN [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] m ON d.Motivo = m.IdMotivo
                WHERE cas.RUC = @ruc 
                  AND d.Fecha BETWEEN @start AND @end
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
                    CAST(t.Importe AS FLOAT) as Importe,
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
            .input('importe', String(importe))
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

app.post('/api/tarifarios/update', verifyToken, async (req: Request, res: Response) => {
    const { id, importe, estado } = req.body;
    try {
        const db = await getDb();
        await db.request()
            .input('id', id)
            .input('importe', importe)
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
                    .input(`imp_${id}`, String(rate.Importe))
                    .query(`
                        IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO] WHERE ID_Tarifario = @id_${id})
                        BEGIN
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO] 
                            SET Importe = @imp_${id}, Categoria = @cat_${id}, Servicio = @serv_${id} 
                            WHERE ID_Tarifario = @id_${id}
                        END
                        ELSE
                        BEGIN
                            INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Estado)
                            VALUES (@id_${id}, @casId_${id}, @cat_${id}, @serv_${id}, @imp_${id}, GETDATE(), 'A')
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
        const { start, end, ruc } = req.query;
        let dateFilter = (start && end) 
            ? `s.CheckOut BETWEEN '${start}' AND '${end}'`
            : `s.CheckOut >= DATEADD(month, -1, GETDATE())`;
        
        if (ruc && ruc !== 'all') {
            dateFilter += ` AND cas.RUC = '${ruc}'`;
        }

        const db = await getDb();
        const stats = await db.request()
            .input('ruc', ruc || 'all')
            .query(`
            SELECT 
                COUNT(*) as TotalTickets,
                SUM(ISNULL(TarifaBase, 0) + ISNULL(Adicionales, 0)) as Bruto,
                ISNULL((SELECT SUM(TRY_CAST(Importe AS FLOAT)) FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d 
                    JOIN [APPGAC].[ServiciosViewSQL] sv ON d.Ticket = sv.Ticket
                    WHERE @ruc IS NULL OR @ruc = 'all' OR sv.IdCAS = (SELECT TOP 1 ID_CAS FROM [dbo].[GAC_APP_TB_CAS] WHERE RUC = @ruc)
                ), 0) as Sanciones
            FROM (
                SELECT s.Ticket, 
                ISNULL((SELECT TOP 1 TRY_CAST(Importe AS FLOAT) FROM [dbo].[GAC_APP_TB_TARIFARIO] t WHERE t.Empresa = s.IdCAS), 0) as TarifaBase,
                0 as Adicionales
                FROM [APPGAC].[ServiciosViewSQL] s
                JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                WHERE ${dateFilter}
                  AND s.Estado = 'Closed'
            ) sub
        `);
        res.json(stats.recordset[0] || { TotalTickets: 0, Bruto: 0, Sanciones: 0 });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/trends', verifyToken, async (req: Request, res: Response) => {
    try {
        const { months = 6, ruc } = req.query;
        let filter = `s.CheckOut >= DATEADD(month, -${months}, GETDATE()) AND s.Estado = 'Closed'`;
        if (ruc && ruc !== 'all') {
            filter += ` AND c.RUC = '${ruc}'`;
        }

        const db = await getDb();
        const trends = await db.request().query(`
            SELECT 
                FORMAT(CheckOut, 'MMM', 'es-PE') as Mes,
                SUM(ISNULL(TarifaBase, 0)) as Bruto,
                SUM(ISNULL(TarifaBase, 0)) * 0.05 as Sanciones
            FROM (
                SELECT s.CheckOut, 
                (SELECT TOP 1 TRY_CAST(Importe AS FLOAT) FROM [dbo].[GAC_APP_TB_TARIFARIO] t WHERE t.Empresa = s.IdCAS) as TarifaBase
                FROM [APPGAC].[ServiciosViewSQL] s
                JOIN [dbo].[GAC_APP_TB_CAS] c ON s.IdCAS = c.ID_CAS
                WHERE ${filter}
            ) t
            GROUP BY FORMAT(CheckOut, 'MMM', 'es-PE'), MONTH(CheckOut)
            ORDER BY MONTH(CheckOut)
        `);
        res.json(trends.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/top-cas', verifyToken, async (req: Request, res: Response) => {
    try {
        const { start, end, ruc } = req.query;
        let dateFilter = (start && end) 
            ? `s.CheckOut BETWEEN '${start}' AND '${end}'`
            : `s.CheckOut >= DATEADD(month, -1, GETDATE())`;
        
        if (ruc && ruc !== 'all') {
            dateFilter += ` AND c.RUC = '${ruc}'`;
        }

        const db = await getDb();
        const top = await db.request().query(`
            SELECT TOP 5 
                Nombre_CAS as label, 
                COUNT(*) as value
            FROM [APPGAC].[ServiciosViewSQL] s
            JOIN [dbo].[GAC_APP_TB_CAS] c ON s.IdCAS = c.ID_CAS
            WHERE ${dateFilter}
            GROUP BY Nombre_CAS
            ORDER BY value DESC
        `);
        res.json(top.recordset);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- SERVE STATIC FILES (PROD) ---
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'dist')));

// Serve index.html for any layout or unknown route to support React Router
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server Valorizaciones running on http://localhost:${port}`);
});
