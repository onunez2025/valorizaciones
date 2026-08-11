import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import crypto from 'crypto';
import { getReadPool, getWritePool } from '../db.js';
import { addInput } from '../lib/db.js';
import { safeError } from '../lib/security.js';
import { verifyPermission, verifyToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas de esta app
// puede casar la misma URL.

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

async function buildServicioCodigoResolver(db: sql.ConnectionPool): Promise<(servicio: string) => string> {
    const result = await db.request().query("SELECT Id, Descripcion FROM [SIATC].[FSM_TipoServicio]");
    const map = new Map<string, string>();
    result.recordset.forEach((r: { Id: string; Descripcion: string }) => map.set((r.Descripcion || '').trim().toUpperCase(), r.Id));
    return (servicio: string) => {
        const trimmed = (servicio || '').trim();
        if (/^CA_\d+$/i.test(trimmed)) return trimmed;
        return map.get(trimmed.toUpperCase()) || trimmed;
    };
}

const router = Router();

router.get('/api/tarifarios/:casId', verifyToken, async (req: Request, res: Response) => {
    const { casId } = req.params;
    const currentUser = (req as AuthRequest).user!;
    if (currentUser.casId !== null && currentUser.casId !== casId) {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }
    try {
        const db = await getReadPool();
        const tarListReq = db.request();
        addInput(tarListReq, 'casId', sql.VarChar(50), casId);
        const t0 = Date.now();
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
        console.log(`[TARIFARIO] ${result.recordset.length} filas en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/tarifarios/create', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { empresa, categoria, servicio, importe, fecha_inicio, fecha_fin, estado } = req.body;
    const currentUser = (req as AuthRequest).user!;
    try {
        const db = await getWritePool();
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
        addInput(tarCrearReq, 'creadoPor', sql.VarChar(100), currentUser.username);
        await tarCrearReq.query(`
                INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (
                    ID_Tarifario, Empresa, Categoria, Servicio,
                    Fecha_inicio, Fecha_fin, Importe, Estado,
                    Creado_El, Creado_Por
                ) VALUES (
                    @id, @empresa, @categoria, @servicio,
                    @fecha_inicio, @fecha_fin, @importe, @estado,
                    GETDATE(), @creadoPor
                )
            `);
        res.json({ success: true, id: newId });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/tarifarios/update', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { id, importe, estado } = req.body;
    const currentUser = (req as AuthRequest).user!;
    try {
        const db = await getWritePool();
        const tarUpdReq = db.request();
        addInput(tarUpdReq, 'id', sql.VarChar(8), id);
        addInput(tarUpdReq, 'importe', sql.Decimal(18, 2), importe);
        addInput(tarUpdReq, 'estado', sql.VarChar(1), estado);
        addInput(tarUpdReq, 'modificadoPor', sql.VarChar(100), currentUser.username);
        await tarUpdReq.query(`
                UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                SET Importe = @importe, Estado = @estado, Modificado_El = GETDATE(), Modificado_Por = @modificadoPor
                WHERE ID_Tarifario = @id
            `);
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/tarifarios/batch', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { casId, rates } = req.body;
    const currentUser = (req as AuthRequest).user!;
    try {
        const db = await getWritePool();
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
                addInput(batchReq, 'est', sql.VarChar(1), rate.Estado || 'A');
                addInput(batchReq, 'user', sql.VarChar(100), currentUser.username);
                await batchReq.query(`
                        IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO] WHERE ID_Tarifario = @id)
                        BEGIN
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Importe = @imp, Categoria = @cat, Servicio = @serv,
                                Fecha_inicio = @f_ini, Fecha_fin = @f_fin, Estado = @est,
                                Modificado_El = GETDATE(), Modificado_Por = @user
                            WHERE ID_Tarifario = @id
                        END
                        ELSE
                        BEGIN
                            INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Fecha_fin, Estado, Creado_El, Creado_Por)
                            VALUES (@id, @casId, @cat, @serv, @imp, @f_ini, @f_fin, @est, GETDATE(), @user)
                        END
                    `);
            }
            
            await transaction.commit();
            res.json({ success: true });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/tarifarios/exceptions/:casId', verifyToken, async (req: Request, res: Response) => {
    const { casId } = req.params;
    try {
        const db = await getReadPool();
        const excReq = db.request();
        addInput(excReq, 'casId', sql.VarChar(50), casId);
        const result = await excReq.query("SELECT * FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE Empresa = @casId AND Estado = 'A' ORDER BY Prioridad DESC, Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/tarifarios/exceptions/save', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { id, empresa, nombre, zonasIncluidas, zonasExcluidas, categorias, servicios, importe, prioridad, estado } = req.body;
    try {
        const db = await getWritePool();
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
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.delete('/api/tarifarios/exceptions/:id', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getWritePool();
        const excDelReq = db.request();
        addInput(excDelReq, 'id', sql.VarChar(8), id);
        await excDelReq.query("UPDATE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] SET Estado = 'I' WHERE IdExcepcion = @id");
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/tarifarios/import/preview', verifyToken, async (req: Request, res: Response) => {
    const { rows } = req.body as { rows: TarifarioImportRow[] };
    try {
        const db = await getWritePool();
        const casResult = await db.request().query("SELECT ID_CAS, Nombre_CAS FROM [dbo].[GAC_APP_TB_CAS]");
        const casMap = new Map<string, number>();
        casResult.recordset.forEach((c: { Nombre_CAS: string; ID_CAS: number }) => casMap.set(c.Nombre_CAS.toUpperCase().trim(), c.ID_CAS));

        const resolveServicio = await buildServicioCodigoResolver(db);

        // Todas las tarifas activas en una sola consulta, para lookup en memoria
        // en vez de 1 query SQL por fila (evita N+1 con archivos grandes).
        const existingResult = await db.request().query(`
            SELECT ID_Tarifario, Empresa, Categoria, Servicio, CAST(Importe AS FLOAT) as Importe
            FROM [dbo].[GAC_APP_TB_TARIFARIO]
            WHERE Estado = 'A'
        `);
        const existingMap = new Map<string, { ID_Tarifario: string; Importe: number }>();
        existingResult.recordset.forEach((r: { ID_Tarifario: string; Empresa: number; Categoria: string; Servicio: string; Importe: number }) => {
            const key = `${r.Empresa}|${(r.Categoria || '').trim()}|${(r.Servicio || '').trim()}`;
            existingMap.set(key, { ID_Tarifario: r.ID_Tarifario, Importe: r.Importe });
        });

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
            const servicioCodigo = resolveServicio(row.Servicio);
            const key = `${casId}|${(row.Categoria || '').trim()}|${servicioCodigo.trim()}`;
            const cur = existingMap.get(key);
            if (!cur) {
                preview.push({ ...row, CAS_ID: casId, Status: 'INSERT', Message: 'Nueva tarifa', Importe_Actual: null });
            } else if (Math.abs(cur.Importe - importe) < 0.001) {
                preview.push({ ...row, CAS_ID: casId, Status: 'OK', Message: 'Sin cambios', Importe_Actual: cur.Importe, ID_Tarifario: cur.ID_Tarifario });
            } else {
                preview.push({ ...row, CAS_ID: casId, Status: 'UPDATE', Message: `${cur.Importe} → ${importe}`, Importe_Actual: cur.Importe, ID_Tarifario: cur.ID_Tarifario });
            }
        }
        res.json({ preview });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/tarifarios/import/confirm', verifyToken, async (req: Request, res: Response) => {
    const { rows } = req.body as { rows: TarifarioImportRow[] };
    const currentUser = (req as AuthRequest).user!;
    try {
        const db = await getWritePool();
        const resolveServicio = await buildServicioCodigoResolver(db);
        const transaction = new sql.Transaction(db);
        await transaction.begin();
        let inserted = 0, updated = 0;
        try {
            for (const row of rows) {
                const cat = row.Categoria.trim();
                const serv = resolveServicio(row.Servicio);
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
                        .input('user', sql.VarChar(100), currentUser.username)
                        .query(`
                            INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO]
                            (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Fecha_fin, Estado, Creado_El, Creado_Por)
                            VALUES (@id, @casId, @cat, @serv, @imp, @fi, @ff, @est, GETDATE(), @user)
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
                        .input('user', sql.VarChar(100), currentUser.username)
                        .query(`
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Importe = @imp, Fecha_fin = @ff, Estado = @est,
                                Modificado_El = GETDATE(), Modificado_Por = @user
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
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
