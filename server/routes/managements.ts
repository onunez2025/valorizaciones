import { Router } from 'express';
import type { Request, Response } from 'express';
import { getReadPool } from '../db.js';
import { safeError } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py: ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

router.get('/api/managements', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query('SELECT Id as id, Name as name, Code as code FROM EBM.Managements');
        res.json(result.recordset);
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});

export default router;
