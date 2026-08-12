import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import sql from 'mssql';
import crypto from 'crypto';
import { getReadPool, getWritePool } from '../db.js';
import { logAudit } from '../lib/audit.js';
import { addInput } from '../lib/db.js';
import { safeError } from '../lib/security.js';
import { validateBody } from '../lib/validate.js';
import { verifyToken } from '../middleware/auth.js';
import type { AuthRequest, JwtUserPayload } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas de esta app
// puede casar la misma URL.

const crearPenalidadSchema = z.object({
    ticket: z.string().min(1).max(50),
    fecha: z.string().min(1),
    motivo: z.string().min(1).max(200),
    descripcion: z.string().max(500).optional(),
    importe: z.number().positive(),
    ruc: z.string().min(1).max(20),
});

const router = Router();

router.post('/api/penalties', verifyToken, validateBody(crearPenalidadSchema), async (req: Request, res: Response) => {
    const { ticket, fecha, motivo, descripcion, importe, ruc } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    const userId = currentUser.username;
    const penaltyId = crypto.randomBytes(4).toString('hex');
    try {
        const db = await getWritePool();

        if (currentUser.casId) {
            if (!currentUser.casRUC || String(ruc).trim() !== String(currentUser.casRUC).trim()) {
                return res.status(403).json({ error: 'No puede crear penalidades para otra empresa.' });
            }
        }
        const penReq = db.request();
        addInput(penReq, 'id', sql.VarChar(8), penaltyId);
        addInput(penReq, 'ticket', sql.VarChar(50), ticket);
        addInput(penReq, 'fecha', sql.Date, fecha);
        addInput(penReq, 'motivo', sql.NVarChar(200), motivo);
        addInput(penReq, 'desc', sql.NVarChar(500), descripcion ?? null);
        addInput(penReq, 'importe', sql.Decimal(10, 2), importe);
        addInput(penReq, 'user', sql.NVarChar(255), userId);
        await penReq.query(`
                INSERT INTO [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS]
                (ID_Descuentos_CAS, Ticket, Fecha, Motivo, Descripcion, Importe, Creado_por, Creado_el, Estado)
                VALUES (@id, @ticket, @fecha, @motivo, @desc, @importe, @user, GETDATE(), 'Pendiente')
            `);
        res.status(201).json({ id: penaltyId });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.put('/api/penalties/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { fecha, motivo, descripcion, importe } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getWritePool();

        if (currentUser.casId) {
            const ownerCheck = await db.request()
                .input('id', sql.VarChar(8), id)
                .input('casId', sql.VarChar(50), currentUser.casId)
                .query(`
                    SELECT 1
                    FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] D
                    INNER JOIN [dbo].[GAC_PAGOS_CACHE] PC ON PC.Ticket_Original = D.Ticket
                    WHERE D.ID_Descuentos_CAS = @id AND PC.ID_cas = @casId
                `);
            if (ownerCheck.recordset.length === 0) {
                return res.status(403).json({ error: 'La penalidad no pertenece a su empresa.' });
            }
        }

        // Validation: Check if already in a closure
        const check = await db.request().input('id', sql.VarChar(8), id).query(`
            SELECT 1 FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE]
            WHERE ID_Referencia = @id
        `);
        if (check.recordset.length > 0) {
            return res.status(403).json({ error: "No se puede editar una penalidad que ya ha sido cerrada en una valorización." });
        }

        const existing = await db.request().input('id', sql.VarChar(8), id).query("SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] WHERE ID_Descuentos_CAS = @id");

        const updPenReq = db.request();
        addInput(updPenReq, 'id', sql.VarChar(8), id);
        addInput(updPenReq, 'fecha', sql.Date, fecha);
        addInput(updPenReq, 'motivo', sql.NVarChar(200), motivo);
        addInput(updPenReq, 'desc', sql.NVarChar(500), descripcion ?? null);
        addInput(updPenReq, 'importe', sql.Decimal(10, 2), importe);
        await updPenReq.query(`
                UPDATE [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS]
                SET Fecha = @fecha, Motivo = @motivo, Descripcion = @desc, Importe = @importe
                WHERE ID_Descuentos_CAS = @id
            `);
            
        await logAudit(req, 'UPDATE', 'PENALTY', id as string, { 
            before: existing.recordset[0], 
            after: { fecha, motivo, descripcion, importe } 
        });
        
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/penalties/:id/status', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    // Nota: aqui se recibia tambien `isCas` del cuerpo de la peticion — es decir, el cliente
    // se autodeclaraba empresa CAS. No se usaba para nada (su unica lectura era una linea
    // muerta), y la comprobacion real se hace con `currentUser.casId`, que sale del token.
    // Se retira para que nadie lo confunda con una fuente de verdad.
    const { status, observation } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getWritePool();

        if (currentUser.casId) {
            const ownerCheck = await db.request()
                .input('id', sql.VarChar(8), id)
                .input('casId', sql.VarChar(50), currentUser.casId)
                .query(`
                    SELECT 1
                    FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] D
                    INNER JOIN [dbo].[GAC_PAGOS_CACHE] PC ON PC.Ticket_Original = D.Ticket
                    WHERE D.ID_Descuentos_CAS = @id AND PC.ID_cas = @casId
                `);
            if (ownerCheck.recordset.length === 0)
                return res.status(403).json({ error: 'La penalidad no pertenece a su empresa.' });
        }

        const statusReq = db.request();
        addInput(statusReq, 'id', sql.VarChar(8), id);
        addInput(statusReq, 'status', sql.NVarChar(50), status);
        addInput(statusReq, 'obs', sql.NVarChar(1000), observation ?? null);
        await statusReq.query(`UPDATE [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] SET Estado = @status, Adjunto_motivo = @obs WHERE ID_Descuentos_CAS = @id`);
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/penalties/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (currentUser.casId) {
        if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada' });
        if (currentUser.casRUC !== String(ruc).trim()) return res.status(403).json({ error: 'Acceso denegado' });
    }
    const { start, end } = req.query;
    try {
        const db = await getReadPool();
        const penListReq = db.request();
        addInput(penListReq, 'ruc', sql.VarChar(20), ruc);
        addInput(penListReq, 'start', sql.VarChar(30), `${start} 00:00:00`);
        addInput(penListReq, 'end', sql.VarChar(30), `${end} 23:59:59`);
        const result = await penListReq.query(`
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
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
