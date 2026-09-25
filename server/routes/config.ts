import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import { z } from 'zod';
import { getReadPool, getWritePool } from '../db.js';
import { pedirFilas } from '@siatc/c4c-client';
import { addInput } from '../lib/db.js';
import { safeError, sanitizeLog } from '../lib/security.js';
import { validateBody } from '../lib/validate.js';
import { verifyPermission, verifyToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py: ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

router.get('/api/config', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG]");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

const crearConfigSchema = z.object({
    clave: z.string().min(1).max(100),
    valor: z.string().max(500),
    descripcion: z.string().max(200).optional(),
});
router.post('/api/config', verifyToken, verifyPermission('val.config.admin'), validateBody(crearConfigSchema), async (req: Request, res: Response) => {
    try {
        const { clave, valor, descripcion } = req.body;
        const db = await getWritePool();
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
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/config-distritos', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] ORDER BY Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

/**
 * Esquemas de las dos reglas de importe que se aplican por distrito y por canal institucional.
 *
 * Una sola de estas filas fija lo que se paga por CADA ticket de los distritos o del área que liste, así
 * que su importe es tan sensible como el del cierre. Los dos endpoints escribían `Importe decimal(18,2)`
 * y dos `date` de vigencia con lo que llegase en el body.
 *
 * Perfilado el 2026-09-25: 2 reglas de distrito (importes 5 y 10) y 1 de canal (25). `CAS_Ids` y
 * `Distritos` se guardan como JSON en `nvarchar(MAX)`, y las fechas de vigencia son `date`.
 */
const fechaVigencia = z.string().trim()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'Se esperaba una fecha yyyy-mm-dd.')
    .transform((v) => v.slice(0, 10));

/** Importe unitario de la regla: positivo y dentro de `decimal(18,2)`. */
const importeRegla = z.number().finite().positive().max(99_999_999.99);

const configDistritoSchema = z.object({
    id: z.number().int().positive().nullish(),
    cas_ids: z.array(z.string().trim().min(1).max(50)).min(1).max(500),
    distritos: z.array(z.string().trim().min(1).max(120)).min(1).max(2_000),
    importe: importeRegla,
    fecha_inicio: fechaVigencia,
    fecha_fin: fechaVigencia.nullish(),
    activo: z.boolean().nullish(),
}).refine((v) => !v.fecha_fin || v.fecha_inicio <= v.fecha_fin, {
    message: 'La vigencia no puede terminar antes de empezar.', path: ['fecha_fin'],
});

const configCanalSchema = z.object({
    id: z.number().int().positive().nullish(),
    cupo_area: z.string().trim().min(1).max(50),
    importe: importeRegla,
    fecha_inicio: fechaVigencia,
    fecha_fin: fechaVigencia.nullish(),
    activo: z.boolean().nullish(),
}).refine((v) => !v.fecha_fin || v.fecha_inicio <= v.fecha_fin, {
    message: 'La vigencia no puede terminar antes de empezar.', path: ['fecha_fin'],
});

router.post('/api/config-distritos', verifyToken, validateBody(configDistritoSchema), async (req: Request, res: Response) => {
    try {
        const { id, cas_ids, distritos, importe, fecha_inicio, fecha_fin, activo } = req.body;
        const user = (req as AuthRequest).user!.username;
        const db = await getWritePool();
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
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.delete('/api/config-distritos/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const idNum = parseInt(req.params.id as string, 10);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ error: 'ID inválido' });
        const user = (req as AuthRequest).user!;
        const db = await getWritePool();
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
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/distritos', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query('SELECT DISTINCT Ciudad, Distrito FROM APPGAC.ServiciosViewSQL WHERE Ciudad IS NOT NULL AND Distrito IS NOT NULL ORDER BY Ciudad, Distrito');
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/config-canal-institucional', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] ORDER BY Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/config-canal-institucional', verifyToken, validateBody(configCanalSchema), async (req: Request, res: Response) => {
    try {
        const { id, cupo_area, fecha_inicio, fecha_fin, importe, activo } = req.body;
        const user = (req as AuthRequest).user!.username;
        const db = await getWritePool();
        const request = db.request();
        addInput(request, 'ca', sql.NVarChar(50), cupo_area);
        addInput(request, 'fi', sql.DateTime, fecha_inicio);
        addInput(request, 'ff', sql.DateTime, fecha_fin ?? null);
        addInput(request, 'imp', sql.Decimal(18, 2), importe);
        addInput(request, 'act', sql.Bit, activo ? 1 : 0);
        addInput(request, 'usr', sql.NVarChar(255), user);

        console.log(`[CONFIG] Saving rule for ${sanitizeLog(user)}, ID: ${id || 'NEW'}`);

        if (id) {
            await request.input('id', sql.Int, Number(id)).query(`
                UPDATE [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL]
                SET Cupo_Area = @ca, Fecha_Inicio = @fi, Fecha_Fin = @ff, Importe = @imp, Activo = @act
                WHERE Id = @id
            `);
        } else {
            await request.query(`
                INSERT INTO [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL]
                (Cupo_Area, Usuario_Creador, Keywords, Validacion_Tipo, Fecha_Inicio, Fecha_Fin, Importe, Activo, Creado_Por)
                VALUES (@ca, '', '', 'CONTIENE', @fi, @ff, @imp, @act, @usr)
            `);
        }
        res.json({ success: true });
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});

router.delete('/api/config-canal-institucional/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getWritePool();
        const idNum = parseInt(String(id), 10);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ error: 'ID inválido' });
        console.log(`[CONFIG] Deleting rule ID: ${idNum}`);
        await db.request().input('id', sql.Int, idNum).query("DELETE FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] WHERE Id = @id");
        res.json({ success: true });
    } catch (err: unknown) { 
        console.error('[CONFIG] Error deleting rule:', err);
        res.status(500).json({ error: safeError(err) }); 
    }
});

router.get('/api/c4c-creators', verifyToken, async (_req: Request, res: Response) => {
    try {
        const items = await pedirFilas('ServiceRequestCollection?$select=CreatedBy&$top=2000&$orderby=CreationDateTime desc');
        const creators = Array.from(new Set(items.map((item) => String(item.CreatedBy ?? '')))).filter(Boolean).sort();
        res.json(creators);
    } catch (err: unknown) {
        console.error('C4C Creators Error:', safeError(err));
        res.status(500).json({ error: "No se pudieron obtener los creadores de C4C." });
    }
});

router.get('/api/penalty-motives', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query('SELECT IdMotivo, Motivo FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] ORDER BY Motivo');
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/discount-motivos', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query('SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] ORDER BY Motivo ASC');
        res.json(result.recordset);
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});

router.get('/api/config/preferences', verifyToken, (_req: Request, res: Response) => {
    res.json({});
});

router.post('/api/config/preferences', verifyToken, (_req: Request, res: Response) => {
    res.json({ success: true });
});

export default router;
