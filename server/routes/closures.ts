import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import { getReadPool } from '../db.js';
import { enforceCasRuc } from '../lib/casFilter.js';
import { safeError } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';
import type { AuthRequest, JwtUserPayload } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

router.get('/api/closures', verifyToken, async (req: Request, res: Response) => {
    const { start, end } = req.query;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    const efectiveRuc = enforceCasRuc(currentUser, req.query.ruc as string | undefined);
    try {
        const db = await getReadPool();
        const request = db.request();
        let query = `SELECT * FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES]`;

        const conditions: string[] = [];
        if (efectiveRuc !== null) {
            conditions.push(`TRIM(RUC) = TRIM(@ruc)`);
            request.input('ruc', sql.VarChar(255), efectiveRuc);
        }
        if (start) {
            conditions.push(`Fecha_Inicio = @start`);
            request.input('start', sql.VarChar(255), start as string);
        }
        if (end) {
            conditions.push(`Fecha_Fin = @end`);
            request.input('end', sql.VarChar(255), end as string);
        }
        
        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }
        
        query += ` ORDER BY Cerrado_El DESC`;
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
