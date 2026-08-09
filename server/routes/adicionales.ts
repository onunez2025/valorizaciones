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

const crearAdicionalSchema = z.object({
    ticket: z.string().min(1).max(50),
    motivo: z.string().min(1).max(200),
    importe: z.number().positive(),
});

const router = Router();

router.post('/api/adicionales', verifyToken, validateBody(crearAdicionalSchema), async (req: Request, res: Response) => {
    const { ticket, motivo, importe } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    const id = crypto.randomBytes(4).toString('hex');
    try {
        const db = await getWritePool();

        if (currentUser.casId) {
            if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada.' });
            const ticketCheck = await db.request()
                .input('ticket', sql.NVarChar(50), ticket)
                .input('casRUC', sql.VarChar(20), currentUser.casRUC)
                .query(`
                    SELECT 1
                    FROM [APPGAC].[ServiciosViewSQL] s
                    JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                    WHERE TRIM(s.Ticket) = @ticket AND TRIM(cas.RUC) = TRIM(@casRUC)
                `);
            if (ticketCheck.recordset.length === 0)
                return res.status(403).json({ error: 'El ticket no pertenece a su empresa.' });
        }

        const addReq = db.request();
        addInput(addReq, 'id', sql.VarChar(8), id);
        addInput(addReq, 'ticket', sql.VarChar(50), ticket);
        addInput(addReq, 'motivo', sql.NVarChar(200), motivo);
        addInput(addReq, 'importe', sql.Decimal(10, 2), importe);
        await addReq.query(`
                INSERT INTO [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                (ID_valorizacion_adicional, Ticket, Motivo, Importe)
                VALUES (@id, @ticket, @motivo, @importe)
            `);
        await logAudit(req, 'CREATE', 'ADICIONAL', ticket, { id, motivo, importe });
        res.status(201).json({ id });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.put('/api/adicionales/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo, importe } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getWritePool();

        if (currentUser.casId) {
            if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada.' });
            const ownerCheck = await db.request()
                .input('id', sql.VarChar(8), id)
                .input('casRUC', sql.VarChar(20), currentUser.casRUC)
                .query(`
                    SELECT 1
                    FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] a
                    JOIN [APPGAC].[ServiciosViewSQL] s ON TRIM(s.Ticket) = TRIM(a.Ticket)
                    JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                    WHERE a.ID_valorizacion_adicional = @id AND TRIM(cas.RUC) = TRIM(@casRUC)
                `);
            if (ownerCheck.recordset.length === 0)
                return res.status(403).json({ error: 'El adicional no pertenece a su empresa.' });
        }

        const existing = await db.request()
            .input('id', sql.VarChar(8), id)
            .query("SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");

        const updAddReq = db.request();
        addInput(updAddReq, 'id', sql.VarChar(8), id);
        addInput(updAddReq, 'motivo', sql.NVarChar(200), motivo);
        addInput(updAddReq, 'importe', sql.Decimal(10, 2), importe);
        await updAddReq.query(`
                UPDATE [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                SET Motivo = @motivo, Importe = @importe
                WHERE ID_valorizacion_adicional = @id
            `);
            
        await logAudit(req, 'UPDATE', 'ADICIONAL', id as string, { 
            before: existing.recordset[0], 
            after: { motivo, importe } 
        });
        
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/adicionales/:ticket', verifyToken, async (req: Request, res: Response) => {
    const { ticket } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getReadPool();

        // Verificar que el ticket pertenece al CAS del usuario
        if (currentUser.casId) {
            const ticketCheck = await db.request()
                .input('ticket', sql.NVarChar(50), ticket)
                .input('casRUC', sql.VarChar(20), currentUser.casRUC || '')
                .query(`
                    SELECT 1
                    FROM [APPGAC].[ServiciosViewSQL] s
                    JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                    WHERE TRIM(s.Ticket) = @ticket AND TRIM(cas.RUC) = TRIM(@casRUC)
                `);
            if (ticketCheck.recordset.length === 0) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
        }

        const result = await db.request()
            .input('ticket', sql.NVarChar(50), ticket)
            .query(`
                SELECT ID_valorizacion_adicional as Id, Ticket, Motivo, CAST(Importe AS FLOAT) as Importe
                FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                WHERE Ticket = @ticket
                ORDER BY ID_valorizacion_adicional
            `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.delete('/api/adicionales/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getWritePool();

        if (currentUser.casId) {
            if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada.' });
            const ownerCheck = await db.request()
                .input('id', sql.VarChar(8), id)
                .input('casRUC', sql.VarChar(20), currentUser.casRUC)
                .query(`
                    SELECT 1
                    FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] a
                    JOIN [APPGAC].[ServiciosViewSQL] s ON TRIM(s.Ticket) = TRIM(a.Ticket)
                    JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
                    WHERE a.ID_valorizacion_adicional = @id AND TRIM(cas.RUC) = TRIM(@casRUC)
                `);
            if (ownerCheck.recordset.length === 0)
                return res.status(403).json({ error: 'El adicional no pertenece a su empresa.' });
        }

        const existing = await db.request()
            .input('id', sql.VarChar(8), id)
            .query("SELECT Ticket, Motivo, Importe FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");
        await db.request()
            .input('id', sql.VarChar(8), id)
            .query("DELETE FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE ID_valorizacion_adicional = @id");
        await logAudit(req, 'DELETE', 'ADICIONAL', id as string, existing.recordset[0] || {});
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
