import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import { getReadPool } from '../db.js';
import { enforceCasRuc } from '../lib/casFilter.js';
import { safeError } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';
import type { AuthRequest, JwtUserPayload } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la misma posicion en que se
// definian en index.ts. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas
// de esta app puede casar la misma URL, asi que el orden no es critico, pero se conserva.

const router = Router();

// --- DASHBOARD ANALYTICS ---
router.get('/api/dashboard/stats', verifyToken, async (req: Request, res: Response) => {
    try {
        const { start, end } = req.query as { start?: string; end?: string; ruc?: string };
        const currentUser = (req as AuthRequest).user as JwtUserPayload;
        const efectiveRuc = enforceCasRuc(currentUser, req.query.ruc as string | undefined);
        const db = await getReadPool();
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
            request.input('ruc', sql.VarChar(255), efectiveRuc);
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
                           AND tc.CheckOut >= t.Fecha_inicio
                           AND (t.Fecha_fin IS NULL OR tc.CheckOut <= t.Fecha_fin)
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

        const t0 = Date.now();
        const stats = await request.query(query);
        console.log(`[DASHBOARD] stats — ${stats.recordset.length} filas en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        const result = stats.recordset[0];
        const bruto = (result.BaseImporte || 0) + (result.Adicionales || 0);

        res.json({
            TotalTickets: result.TotalTickets || 0,
            Bruto: bruto,
            Sanciones: result.Sanciones || 0,
            Neto: bruto - (result.Sanciones || 0)
        });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/dashboard/trends', verifyToken, async (req: Request, res: Response) => {
    try {
        const { months = 6 } = req.query as { months?: string; ruc?: string };
        const currentUser = (req as AuthRequest).user as JwtUserPayload;
        const efectiveRuc = enforceCasRuc(currentUser, req.query.ruc as string | undefined);
        const db = await getReadPool();
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
            request.input('ruc', sql.VarChar(255), efectiveRuc);
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
                           AND tc.CheckOut >= t.Fecha_inicio
                           AND (t.Fecha_fin IS NULL OR tc.CheckOut <= t.Fecha_fin)
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

        const t0 = Date.now();
        const trends = await request.query(query);
        console.log(`[DASHBOARD] trends — ${trends.recordset.length} filas en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        res.json(trends.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/dashboard/top-cas', verifyToken, async (req: Request, res: Response) => {
    try {
        const { start, end } = req.query as { start?: string; end?: string; ruc?: string };
        const currentUser = (req as AuthRequest).user as JwtUserPayload;
        const efectiveRuc = enforceCasRuc(currentUser, req.query.ruc as string | undefined);
        const db = await getReadPool();
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
            request.input('ruc', sql.VarChar(255), efectiveRuc);
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

        const t0 = Date.now();
        const top = await request.query(query);
        console.log(`[DASHBOARD] top-cas — ${top.recordset.length} filas en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        res.json(top.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
