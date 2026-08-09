import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import { getReadPool } from '../db.js';
import { addInput } from '../lib/db.js';
import { safeError } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';
import type { AuthRequest, JwtUserPayload } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py: ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

router.get('/api/cas', verifyToken, async (req: Request, res: Response) => {
    try {
        const currentUser = (req as AuthRequest).user as JwtUserPayload;
        const db = await getReadPool();

        if (currentUser.casId) {
            const casReq = db.request();
            addInput(casReq, 'casId', sql.VarChar(50), currentUser.casId);
            const result = await casReq.query("SELECT * FROM [dbo].[GAC_APP_TB_CAS] WHERE ID_CAS = @casId");
            return res.json(result.recordset);
        }

        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CAS] ORDER BY Nombre_CAS");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
