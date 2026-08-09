import { Router } from 'express';
import { C4C_BASE_URL, C4C_AUTH } from '../lib/config.js';
import type { Request, Response } from 'express';
import sql from 'mssql';
import crypto from 'crypto';
import axios from 'axios';
import { getReadPool, getWritePool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { assertCasRuc } from '../lib/casFilter.js';
import { MS_GRAPH_SENDER_EMAIL } from '../lib/config.js';
import { addInput } from '../lib/db.js';
import { getGraphToken } from '../lib/graph.js';
import { safeError, sanitizeLog } from '../lib/security.js';
import { verifyPermission, verifyToken } from '../middleware/auth.js';
import type { AuthRequest, JwtUserPayload } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas de esta app
// puede casar la misma URL.

const C4C_AREA_NAMES: Record<number, string> = {
    8:  'TALLER',
    11: 'OBRAS',
    // Cualquier otro código no listado aquí se muestra como 'GENERAL'
};

async function getC4CDetails(ticketIds: string[]) {
    if (ticketIds.length === 0) return {};
    const results: Record<string, { creator: string; subject: string; cupoArea: string }> = {};
    const chunkSize = 50;
    const promises = [];

    for (let i = 0; i < ticketIds.length; i += chunkSize) {
        const chunk = ticketIds.slice(i, i + chunkSize);
        const filter = chunk.map(id => `ID eq '${id}'`).join(' or ');
        const url = `${C4C_BASE_URL}/ServiceRequestCollection?$filter=${encodeURIComponent(filter)}&$select=ID,CreatedBy,Name,CupoTomado_SDK,zTicketArea_SDK&$format=json`;

        if (i === 0) console.log('[C4C] URL base:', url.split('?')[0]);

        promises.push(
            axios.get(url, {
                headers: { 'Authorization': `Basic ${C4C_AUTH}`, 'Accept': 'application/json' },
                timeout: 20000
            })
            .then(resp => {
                const items: Record<string, string>[] = resp.data?.d?.results ?? resp.data?.value ?? [];
                if (i === 0 && items.length > 0) {
                    console.log('[C4C DEBUG] Campos disponibles:', Object.keys(items[0]).join(', '));
                }
                items.forEach(item => {
                    results[item.ID] = {
                        creator: item.CreatedBy || '',
                        subject: item.Name || '',
                        cupoArea: (() => {
                            const code = parseInt(item.zTicketArea_SDK, 10);
                            if (!code) return 'GENERAL';
                            return C4C_AREA_NAMES[code] ?? 'GENERAL';
                        })()
                    };
                });
            })
            .catch(err => {
                const status = err.response?.status;
                const body = JSON.stringify(err.response?.data)?.slice(0, 300);
                console.error(`[C4C] Error chunk ${i}-${i + chunkSize}: HTTP ${status ?? 'N/A'} — ${body ?? err.message}`);
            })
        );
    }

    await Promise.all(promises);
    return results;
}

const router = Router();

router.get('/api/valuations/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (currentUser.casId) {
        if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada' });
        if (currentUser.casRUC !== String(ruc).trim()) return res.status(403).json({ error: 'Acceso denegado' });
    }
    const { start, end } = req.query;

    console.log(`[VALUATION] Starting request - RUC: ${sanitizeLog(ruc)}, Range: ${sanitizeLog(start)} to ${sanitizeLog(end)}`);

    try {
        const db = await getReadPool();
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

        if (tickets.length > 0) {
            // Siempre consultar C4C para obtener CupoArea y UsuarioCreador,
            // independientemente de si hay reglas institucionales activas.
            console.log(`[VALUATION] Fetching OData for ${tickets.length} tickets (Rules active: ${rules.length})`);
            const ticketIds = tickets.map(t => t.Ticket);
            const c4cDetails = await getC4CDetails(ticketIds);
            const detailCount = Object.keys(c4cDetails).length;
            console.log(`[VALUATION] OData results: ${detailCount}/${tickets.length} found`);

            tickets = tickets.map(t => {
                const details = c4cDetails[t.Ticket];
                let finalTarifaBase = t.TarifaBaseCalculada;
                let esInstitucional = false;

                if (rules.length > 0) {
                    const cupoArea = (details?.cupoArea || 'GENERAL').trim().toUpperCase();
                    const matchingRule = rules.find(r => {
                        const tDate = new Date(t.FechaCierre);
                        const rStart = new Date(r.Fecha_Inicio);
                        const rEnd = new Date(r.Fecha_Fin);
                        tDate.setHours(0, 0, 0, 0);
                        rStart.setHours(0, 0, 0, 0);
                        rEnd.setHours(23, 59, 59, 999);
                        const dateMatch = tDate >= rStart && tDate <= rEnd;
                        const areaMatch = r.Cupo_Area?.trim().toUpperCase() === cupoArea;
                        return dateMatch && areaMatch;
                    });

                    if (matchingRule) {
                        finalTarifaBase = matchingRule.Importe;
                        esInstitucional = true;
                    }
                }

                return {
                    ...t,
                    TarifaBase: finalTarifaBase,
                    UsuarioCreador: details?.creator || '',
                    C4CSubject: details?.subject || '',
                    EsInstitucional: esInstitucional,
                    CupoArea: details?.cupoArea || ''
                };
            });
        }

        res.json(tickets);
    } catch (err: unknown) {
        console.error('[VALUATION] Server Error:', safeError(err));
        res.status(500).json({ error: safeError(err) });
    }
});

router.post('/api/valuations/batch-adjustment', verifyToken, async (req: Request, res: Response) => {
    const { tickets, targetAmount, motivo, ruc } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (!assertCasRuc(currentUser, ruc, res)) return;

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar una lista de tickets." });
    }

    try {
        const db = await getWritePool();
        const pool = await getWritePool();
        
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
        res.status(500).json({ error: safeError(err) });
    }
});

router.post('/api/valuations/batch-discount', verifyToken, async (req: Request, res: Response) => {
    const { tickets, motivo, descripcion, ruc } = req.body;
    const user = (req as AuthRequest).user!;
    const currentUser = user as JwtUserPayload;
    if (!assertCasRuc(currentUser, ruc, res)) return;

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar una lista de tickets." });
    }

    try {
        const db = await getWritePool();
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
                    .input('id', sql.VarChar(255), penaltyId)
                    .input('ticket', sql.VarChar(255), ticketId)
                    .input('fecha', sql.Date, fecha)
                    .input('motivo', sql.VarChar(255), motivo)
                    .input('desc', sql.VarChar(255), descripcion)
                    .input('importe', sql.Decimal(10, 2), ticketAmount)
                    .input('user', sql.VarChar(255), user.username)
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

router.post('/api/valuations/close', verifyToken, async (req: Request, res: Response) => {
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
        const db = await getWritePool();
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
        res.status(500).json({ error: safeError(err) }); 
    }
});

router.post('/api/valuations/finalize/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getWritePool();

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
        res.status(500).json({ error: safeError(err) });
    }
});

router.post('/api/valuations/reopen/:id', verifyToken, verifyPermission('val.reopen'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getWritePool();

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
        res.status(500).json({ error: safeError(err) });
    }
});

router.post('/api/valuations/send-email', verifyToken, async (req: Request, res: Response) => {
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
        console.error('Error enviando email:', axiosErr.response?.data || (safeError(err)));
        res.status(500).json({ error: safeError(err) });
    }
});

router.get('/api/valuations/details/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getReadPool();

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
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
