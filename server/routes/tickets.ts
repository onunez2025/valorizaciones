import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import { getReadPool } from '../db.js';
import { addInput } from '../lib/db.js';
import { safeError } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';
import type { AuthRequest, JwtUserPayload } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la misma posicion en que se
// definian en index.ts. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas
// de esta app puede casar la misma URL, asi que el orden no es critico, pero se conserva.

const router = Router();

router.get('/api/tickets/find/:ticket', verifyToken, async (req: Request, res: Response) => {
    const ticket = (req.params.ticket as string).trim();
    if (!ticket) return res.status(400).json({ error: 'Ticket es requerido' });

    try {
        const db = await getReadPool();
        const result = await db.request()
            .input('ticket', sql.NVarChar(sql.MAX), ticket)
            .query(`
                DECLARE @diasMax INT;
                SELECT @diasMax = CAST(Valor AS INT) FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] WHERE Clave = 'DIAS_MAX_CIERRE';
                IF @diasMax IS NULL SET @diasMax = 1;

                SELECT TOP 1
                    s.Ticket, s.CheckOut as Fecha, s.Servicio as ServicioNombre,
                    s.IdServicio as Servicio, cas.RUC, cas.Nombre_CAS as CAS_Nombre,
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
                        SELECT ex.Importe, ex.Prioridad, ex.Creado_El, 1 as Source
                        FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                        WHERE ex.Empresa = s.IdCAS
                          AND ex.Estado = 'A'
                          AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = ISNULL(m.Categoria, 'N/A')))
                          AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = s.IdServicio OR value = s.Servicio))
                          AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                          AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                          -- Portado de main (b422713): vigencia de la excepcion.
                          AND (ex.Fecha_Inicio IS NULL OR s.CheckOut >= ex.Fecha_Inicio)
                          AND (ex.Fecha_Fin IS NULL OR s.CheckOut <= ex.Fecha_Fin)
                        UNION ALL
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
                WHERE TRIM(s.Ticket) = @ticket
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket no encontrado' });
        }
        res.json(result.recordset[0]);
    } catch (err: unknown) {
        console.error('Error in ticket find:', err);
        res.status(500).json({ error: safeError(err) });
    }
});

router.get('/api/tickets/search/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (currentUser.casId) {
        if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada' });
        if (currentUser.casRUC !== String(ruc).trim()) return res.status(403).json({ error: 'Acceso denegado' });
    }
    const { q } = req.query;
    try {
        const db = await getReadPool();
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
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
