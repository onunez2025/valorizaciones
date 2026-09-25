import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import sql from 'mssql';
import crypto from 'crypto';
import { getReadPool, getWritePool } from '../db.js';
import { addInput } from '../lib/db.js';
import { validateBody } from '../lib/validate.js';
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

/**
 * Esquemas del tarifario: es la tabla que fija cuanto se paga por cada servicio y categoria, asi que su
 * importe pesa tanto como el del cierre. Los cuatro endpoints de abajo escribian en `Importe
 * decimal(18,2)` lo que llegase.
 *
 * Perfilado el 2026-09-25 sobre las 3.423 tarifas vigentes: importes de 20 a 375, `Categoria` hasta 38
 * caracteres (columna 100), `Servicio` hasta 20 (columna 50), `Empresa` hasta 8 (columna 50), y el unico
 * estado presente es 'A' (el codigo usa 'I' para inactivar, de ahi el enum de dos).
 *
 * La vista previa de la importacion NO se valida con el mismo rigor, y es deliberado: su trabajo es
 * detectar filas malas y marcarlas en rojo para que el usuario las corrija. Un esquema estricto
 * devolveria 400 y la pantalla dejaria de poder senalar el problema. Ahi solo se comprueba la forma.
 */
const importeTarifario = z.number().finite().min(0).max(1_000_000);
const estadoTarifa = z.enum(['A', 'I']);
const fechaTarifaria = z.string().trim().min(1).max(40)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Fecha no interpretable.');

const crearTarifaSchema = z.object({
    empresa: z.string().trim().min(1).max(50),
    categoria: z.string().trim().min(1).max(100),
    servicio: z.string().trim().min(1).max(100),
    importe: importeTarifario,
    fecha_inicio: fechaTarifaria,
    fecha_fin: fechaTarifaria.nullish(),
    estado: estadoTarifa.nullish(),
});

const actualizarTarifaSchema = z.object({
    id: z.string().trim().min(1).max(8),
    importe: importeTarifario,
    estado: estadoTarifa,
});

const tarifasEnBloqueSchema = z.object({
    casId: z.string().trim().min(1).max(50),
    rates: z.array(z.object({
        ID_TARIFARIO: z.string().max(8).nullish(),
        Categoria: z.string().trim().min(1).max(100),
        Servicio: z.string().trim().min(1).max(100),
        Importe: importeTarifario,
        Fecha_inicio: fechaTarifaria.nullish(),
        Fecha_fin: fechaTarifaria.nullish(),
        Estado: estadoTarifa.nullish(),
    })).min(1).max(20_000),
});

/** Una lista vacia significa «sin restriccion»: el handler ya la normaliza a null antes de guardar. */
const listaDeZonas = z.array(z.string().max(200)).max(2_000).nullish();

const excepcionTarifariaSchema = z.object({
    id: z.string().max(8).nullish(),
    empresa: z.string().trim().min(1).max(50),
    nombre: z.string().trim().min(1).max(255),
    zonasIncluidas: listaDeZonas,
    zonasExcluidas: listaDeZonas,
    categorias: listaDeZonas,
    servicios: listaDeZonas,
    importe: importeTarifario,
    prioridad: z.number().int().min(0).max(100_000).nullish(),
    estado: estadoTarifa.nullish(),
    servicioInicial: z.string().max(100).nullish(),
    fechaInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Se esperaba yyyy-mm-dd.').nullish(),
    fechaFin: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Se esperaba yyyy-mm-dd.').nullish(),
});

/** Laxo a proposito: la previa tiene que poder recibir filas malas para marcarlas. */
const previaTarifarioSchema = z.object({
    rows: z.array(z.record(z.string().max(300), z.unknown())).min(1).max(20_000),
});

router.post('/api/tarifarios/create', verifyToken, verifyPermission('val.tarifario.edit'), validateBody(crearTarifaSchema), async (req: Request, res: Response) => {
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

router.post('/api/tarifarios/update', verifyToken, verifyPermission('val.tarifario.edit'), validateBody(actualizarTarifaSchema), async (req: Request, res: Response) => {
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

router.post('/api/tarifarios/batch', verifyToken, verifyPermission('val.tarifario.edit'), validateBody(tarifasEnBloqueSchema), async (req: Request, res: Response) => {
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

router.post('/api/tarifarios/exceptions/save', verifyToken, verifyPermission('val.tarifario.edit'), validateBody(excepcionTarifariaSchema), async (req: Request, res: Response) => {
    const { id, empresa, nombre, zonasIncluidas, zonasExcluidas, categorias, servicios, importe, prioridad, estado, servicioInicial, fechaInicio, fechaFin } = req.body;
    try {
        const db = await getWritePool();
        const finalId = id || crypto.randomBytes(4).toString('hex');

        const excSaveReq = db.request();
        addInput(excSaveReq, 'id', sql.VarChar(8), finalId);
        addInput(excSaveReq, 'empresa', sql.VarChar(50), empresa);
        addInput(excSaveReq, 'nombre', sql.NVarChar(255), nombre);
        // Portado de main (b422713). Un array vacio ([]) significa "sin restriccion" (aplica a
        // todo), igual que null o ausente. Pero `JSON.stringify([])` produce '[]', que NO encaja
        // con el comodin ('null' / IS NULL) que usan las consultas de resolucion de precio, asi
        // que la excepcion no se aplicaba nunca. Se normaliza a null antes de guardar.
        const arr = (v: unknown) => JSON.stringify(Array.isArray(v) && v.length ? v : null);
        addInput(excSaveReq, 'zi', sql.NVarChar(sql.MAX), arr(zonasIncluidas));
        addInput(excSaveReq, 'ze', sql.NVarChar(sql.MAX), arr(zonasExcluidas));
        addInput(excSaveReq, 'cat', sql.NVarChar(sql.MAX), arr(categorias));
        addInput(excSaveReq, 'serv', sql.NVarChar(sql.MAX), arr(servicios));
        addInput(excSaveReq, 'imp', sql.Decimal(18, 2), importe);
        addInput(excSaveReq, 'prio', sql.Int, prioridad || 0);
        addInput(excSaveReq, 'est', sql.VarChar(1), estado || 'A');
        addInput(excSaveReq, 'servInicial', sql.NVarChar(100), servicioInicial || null);
        addInput(excSaveReq, 'fechaIni', sql.Date, fechaInicio || null);
        addInput(excSaveReq, 'fechaFin', sql.Date, fechaFin || null);
        await excSaveReq.query(`
                IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE IdExcepcion = @id)
                BEGIN
                    UPDATE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES]
                    SET Nombre = @nombre, Zonas_Incluidas = @zi, Zonas_Excluidas = @ze, 
                        Categorias = @cat, Servicios = @serv, Importe = @imp, 
                        Prioridad = @prio, Estado = @est,
                        ServicioInicial = @servInicial, Fecha_Inicio = @fechaIni, Fecha_Fin = @fechaFin
                    WHERE IdExcepcion = @id
                END
                ELSE
                BEGIN
                    INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] 
                    (IdExcepcion, Empresa, Nombre, Zonas_Incluidas, Zonas_Excluidas, Categorias, Servicios, Importe, Prioridad, Estado, ServicioInicial, Fecha_Inicio, Fecha_Fin)
                    VALUES (@id, @empresa, @nombre, @zi, @ze, @cat, @serv, @imp, @prio, @est, @servInicial, @fechaIni, @fechaFin)
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

router.post('/api/tarifarios/import/preview', verifyToken, validateBody(previaTarifarioSchema), async (req: Request, res: Response) => {
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

/**
 * Esquema de la confirmación de la importación de tarifario — lo que se paga por servicio y categoría.
 *
 * El importe llega del Excel como texto y se escribía con `parseFloat(row.Importe)` sin comprobar el
 * resultado: una celda con texto da `NaN`, y `NaN` no se queda en el aire, se guarda. La vista previa de
 * este mismo fichero sí comprueba `isNaN` y marca la fila como ERROR; el confirm, que es el que escribe,
 * no comprobaba nada — y nada obliga a pasar por la previa antes de confirmar.
 *
 * La regla del importe es a propósito la MISMA que la de la previa (`parseFloat` a secas, sin admitir
 * coma decimal): si fuera más permisiva aquí, el confirm aceptaría filas que la previa marca en rojo, y si
 * fuera más estricta rechazaría filas que la previa da por buenas. Solo se añade que no sea negativo.
 *
 * Perfilado el 2026-09-25 sobre las 3.423 tarifas vigentes: importes de 20 a 375, `Categoria` hasta 38
 * caracteres (columna 100), `Servicio` hasta 20 (columna 50), `Empresa` hasta 8 (columna 50).
 */
const importeTarifa = z.union([z.string(), z.number()]).refine((v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 && n <= 1_000_000;
}, 'El importe de la tarifa debe ser un número no negativo.');

const fechaTarifa = z.string().trim()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'Se esperaba una fecha yyyy-mm-dd.');

const confirmarTarifarioSchema = z.object({
    rows: z.array(z.object({
        CAS_Nombre: z.string().max(255).nullish(),
        Categoria: z.string().trim().min(1).max(100),
        Servicio: z.string().trim().min(1).max(100),
        Fecha_inicio: fechaTarifa,
        Fecha_fin: fechaTarifa.nullish(),
        Importe: importeTarifa,
        // `VarChar(1)` en la BD: 'A' activa, 'I' inactiva.
        Estado: z.enum(['A', 'I']).nullish(),
        CAS_ID: z.number().int().nullish(),
        // Lo pone la vista previa; el confirm decide con ello si inserta o actualiza.
        Status: z.enum(['INSERT', 'UPDATE', 'OK']).nullish(),
        Message: z.string().max(500).nullish(),
        Importe_Actual: z.number().nullish(),
        ID_Tarifario: z.string().max(50).nullish(),
    })).min(1).max(20_000),
});

router.post('/api/tarifarios/import/confirm', verifyToken, validateBody(confirmarTarifarioSchema), async (req: Request, res: Response) => {
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
                        .input('imp', sql.Decimal(18, 2), parseFloat(String(row.Importe)))
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
                        .input('imp', sql.Decimal(18, 2), parseFloat(String(row.Importe)))
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
