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

// --- Trozos compartidos por /stats y /trends -------------------------------------------------
//
// Las dos consultas calculaban la tarifa de cada ticket con una subconsulta correlacionada: por
// CADA ticket se buscaba en el tarifario. Con 162.895 tickets en seis meses eso son 162.895
// busquedas, y ademas `TRIM(t.Categoria) = TRIM(tc.Categoria)` envuelve la columna indexada en una
// funcion, asi que el indice IX_GAC_TARIFARIO_LOOKUP no podia usarse para esa parte.
//
// Ahora el tarifario se normaliza UNA vez (3.397 filas) y se cruza con los tickets en un solo
// join, quedandose con la fila vigente mas reciente mediante ROW_NUMBER. Comprobado que no hay
// ninguna clave con la misma Fecha_inicio y dos importes distintos, asi que el desempate es
// identico al `TOP 1 ... ORDER BY Fecha_inicio DESC` del original.
//
// Ademas los tickets se materializan en #Tickets. Un CTE no se materializa: /stats referenciaba
// TicketsCAS cuatro veces y SQL Server lo recalculaba en cada referencia.
//
// Verificado contra la version anterior sobre una ventana cerrada en el pasado (junio 2026, para
// que no entren tickets nuevos a mitad de la medicion): 0 discrepancias en tickets, base,
// adicionales y sanciones, y 0 discrepancias en los 7 meses de /trends.

const PREAMBULO_TEMPORALES = `
    SET NOCOUNT ON;
    -- Las temporales viven en la conexion, y la conexion vuelve al pool. Si una peticion
    -- anterior murio antes de su DROP, la siguiente fallaria al crearlas.
    IF OBJECT_ID('tempdb..#Tickets') IS NOT NULL DROP TABLE #Tickets;
    IF OBJECT_ID('tempdb..#Tar') IS NOT NULL DROP TABLE #Tar;`;

// Se espera un CTE `TicketsFilt` ya definido.
const SELECT_TICKETS = `
    SELECT
        ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) as Fila,
        tf.Ticket, tf.CheckOut, tf.IdServicio, tf.CodigoExternoEquipo, tf.FechaVisita,
        tf.Ciudad, tf.Distrito, cas.ID_CAS, cas.RUC,
        ISNULL(m.Categoria, 'N/A') as Categoria,
        -- MATERIALES.Categoria es varchar(max) (no vale como clave de indice) y el tarifario la
        -- tiene en varchar(100). Convertir al tipo del tarifario no puede cambiar el resultado:
        -- un valor mas largo de 100 nunca podria casar con el otro lado.
        CAST(TRIM(ISNULL(m.Categoria, 'N/A')) AS VARCHAR(100)) as CategoriaNorm
    INTO #Tickets
    FROM TicketsFilt tf
    LEFT JOIN [dbo].[GAC_APP_TB_CAS] cas ON TRIM(tf.Prefix) = TRIM(cas.Abrev_nombre_colaboradores)
    OUTER APPLY (
        SELECT TOP 1 Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = tf.CodigoExternoEquipo
    ) m`;

const INDICES_Y_TARIFARIO = `
    CREATE CLUSTERED INDEX IX_Tickets ON #Tickets (ID_CAS, IdServicio, CategoriaNorm);

    SELECT Empresa, Servicio, CAST(TRIM(Categoria) AS VARCHAR(100)) as CategoriaNorm,
           Importe, Fecha_inicio, Fecha_fin
    INTO #Tar
    FROM [dbo].[GAC_APP_TB_TARIFARIO] WHERE Estado = 'A';
    CREATE CLUSTERED INDEX IX_Tar ON #Tar (Empresa, Servicio, CategoriaNorm);`;

const EXCEPCION_POR_TICKET = `ExcTop AS (
        SELECT t.Fila, ex.Importe,
               ROW_NUMBER() OVER (PARTITION BY t.Fila ORDER BY ex.Prioridad DESC, ex.Creado_El DESC) as rn
        FROM #Tickets t
        JOIN [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
          ON ex.Empresa = t.ID_CAS
         AND ex.Estado = 'A'
         AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = t.Categoria))
         AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = t.IdServicio))
         AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = t.Ciudad OR value = t.Distrito))
         AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = t.Ciudad OR value = t.Distrito))
         -- Portado de main (b422713): vigencia de la excepcion. Sin esto se aplicaban Casos
         -- Especiales fuera de su periodo de validez.
         AND (ex.Fecha_Inicio IS NULL OR t.CheckOut >= ex.Fecha_Inicio)
         AND (ex.Fecha_Fin IS NULL OR t.CheckOut <= ex.Fecha_Fin)
    )`;

const TARIFA_POR_TICKET = `TarTop AS (
        SELECT t.Fila, tar.Importe,
               ROW_NUMBER() OVER (PARTITION BY t.Fila ORDER BY tar.Fecha_inicio DESC) as rn
        FROM #Tickets t
        JOIN #Tar tar
          ON tar.Empresa = t.ID_CAS
         AND tar.Servicio = t.IdServicio
         AND tar.CategoriaNorm = t.CategoriaNorm
         AND t.CheckOut >= tar.Fecha_inicio
         AND (tar.Fecha_fin IS NULL OR t.CheckOut <= tar.Fecha_fin)
    )`;

const ES_VALIDO = `CASE
                        WHEN t.IdServicio = 'Visita' THEN 0
                        WHEN DATEDIFF(day, t.FechaVisita, t.CheckOut) > 1 THEN 0
                        WHEN LEFT(t.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                        ELSE 1
                    END as EsValido`;

// La consulta son varias sentencias; `recordset` devuelve la primera y aqui interesa la ultima.
const ultimoRecordset = (r: sql.IResult<unknown>): Record<string, unknown>[] =>
    (r.recordsets[r.recordsets.length - 1] ?? []) as unknown as Record<string, unknown>[];

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
            ${PREAMBULO_TEMPORALES}
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
            )
            ${SELECT_TICKETS}
                WHERE 1=1
        `;

        if (efectiveRuc !== null && efectiveRuc !== 'all') {
            query += ` AND cas.RUC = @ruc `;
            request.input('ruc', sql.VarChar(255), efectiveRuc);
        }

        query += `;
            ${INDICES_Y_TARIFARIO}

            WITH ${EXCEPCION_POR_TICKET},
            ${TARIFA_POR_TICKET},
            Calculo AS (
                SELECT
                    COALESCE(e.Importe, r.Importe) as ImporteAplicado,
                    ${ES_VALIDO}
                FROM #Tickets t
                LEFT JOIN ExcTop e ON e.Fila = t.Fila AND e.rn = 1
                LEFT JOIN TarTop r ON r.Fila = t.Fila AND r.rn = 1
            )
            SELECT
                (SELECT COUNT(*) FROM #Tickets) as TotalTickets,
                ISNULL((SELECT SUM(ImporteAplicado) FROM Calculo WHERE EsValido = 1), 0) as BaseImporte,
                ISNULL((
                    ISNULL((SELECT SUM(a.Importe) FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] a WHERE a.Ticket IN (SELECT Ticket FROM #Tickets)), 0) +
                    ISNULL((
                        SELECT SUM(cfg.Importe)
                        FROM #Tickets tc
                        JOIN [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] cfg ON cfg.Activo = 1
                          AND tc.CheckOut >= cfg.Fecha_Inicio
                          AND (cfg.Fecha_Fin IS NULL OR tc.CheckOut <= cfg.Fecha_Fin)
                        WHERE EXISTS (SELECT 1 FROM OPENJSON(cfg.CAS_Ids) WHERE value = tc.ID_CAS)
                          AND EXISTS (SELECT 1 FROM OPENJSON(cfg.Distritos) WHERE value = tc.Distrito)
                    ), 0)
                ), 0) as Adicionales,
                ISNULL((SELECT SUM(d.Importe) FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d WHERE d.Ticket IN (SELECT Ticket FROM #Tickets)), 0) as Sanciones;

            DROP TABLE #Tickets; DROP TABLE #Tar;
        `;

        const t0 = Date.now();
        const stats = await request.query(query);
        const filas = ultimoRecordset(stats);
        console.log(`[DASHBOARD] stats — ${filas.length} filas en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        const result = filas[0] as Record<string, number>;
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
            ${PREAMBULO_TEMPORALES}
            WITH TicketsFilt AS (
                SELECT s.Ticket, s.CheckOut, s.IdServicio, s.CodigoExternoEquipo, s.FechaVisita, s.Ciudad, s.Distrito,
                    CASE WHEN LEFT(s.NombreTecnico, 3) IN ('SB2', 'SS ', 'AC ', 'EMS', 'SIL', 'VYA', 'SEY', 'TP ', 'TYG', 'FSI', 'LM ', 'TCP', 'MG ', 'AYD', 'SLR', 'REY', 'VR ', 'LV ', 'MR ', 'AXX', 'COT', 'SNT', 'NUL')
                    THEN LEFT(s.NombreTecnico, 3) ELSE 'GAC' END as Prefix
                FROM [SIATC].[Dashboard_FSM] s
                WHERE s.CheckOut >= DATEADD(MONTH, @m, GETDATE()) AND s.Estado = 'Closed'
                  AND s.VisitaRealizada = 'true' AND s.TrabajoRealizado = 'true'
            )
            ${SELECT_TICKETS}
                WHERE 1=1
        `;

        if (efectiveRuc !== null && efectiveRuc !== 'all') {
            query += ` AND cas.RUC = @ruc `;
            request.input('ruc', sql.VarChar(255), efectiveRuc);
        }

        query += `;
            ${INDICES_Y_TARIFARIO}

            WITH ${EXCEPCION_POR_TICKET},
            ${TARIFA_POR_TICKET},
            Calculo AS (
                SELECT
                    YEAR(t.CheckOut) as Anio,
                    MONTH(t.CheckOut) as MesNum,
                    COALESCE(e.Importe, r.Importe) as ImporteAplicado,
                    ${ES_VALIDO}
                FROM #Tickets t
                LEFT JOIN ExcTop e ON e.Fila = t.Fila AND e.rn = 1
                LEFT JOIN TarTop r ON r.Fila = t.Fila AND r.rn = 1
            ),
            ResumenMensual AS (
                SELECT Anio, MesNum, SUM(ImporteAplicado) as Bruto
                FROM Calculo
                WHERE EsValido = 1
                GROUP BY Anio, MesNum
            ),
            SancionesMensuales AS (
                SELECT YEAR(t.CheckOut) as Anio, MONTH(t.CheckOut) as MesNum, SUM(d.Importe) as TotalSanciones
                FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d
                JOIN #Tickets t ON d.Ticket = t.Ticket
                GROUP BY YEAR(t.CheckOut), MONTH(t.CheckOut)
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
            ORDER BY rm.Anio ASC, rm.MesNum ASC;

            DROP TABLE #Tickets; DROP TABLE #Tar;
        `;

        const t0 = Date.now();
        const trends = await request.query(query);
        const filas = ultimoRecordset(trends);
        console.log(`[DASHBOARD] trends — ${filas.length} filas en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        res.json(filas);
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
