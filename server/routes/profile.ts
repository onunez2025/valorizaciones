import { Router } from 'express';
import type { Response } from 'express';
import sql from 'mssql';
import bcrypt from 'bcrypt';
import { getWritePool } from '../db.js';
import { addInput } from '../lib/db.js';
import { safeError } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

// ─── Perfil propio (autoservicio) ────────────────────────────────────────────
// Solo verifyToken -- cualquier usuario autenticado puede guardar SU PROPIO
// avatar y/o contraseña. A diferencia de PUT /api/users/:id (abajo, gateado
// por val.config.users), nunca acepta un id por parametro: siempre opera sobre
// (req as any).user.id, y solo toca AvatarUrl/PasswordHash -- nunca
// full_name/username/email/role_id/management_id/apps de nadie.
router.put('/api/profile', verifyToken, async (req: any, res: Response) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
        const userId = req.user.id;
        const { avatar_url, password_hash } = req.body;

        const db = await getWritePool();
        const request = db.request();
        addInput(request, 'id', sql.UniqueIdentifier, userId);

        const sets: string[] = [];
        if (avatar_url !== undefined) {
            addInput(request, 'avatarUrl', sql.NVarChar(sql.MAX), avatar_url || null);
            sets.push('AvatarUrl = @avatarUrl');
        }
        if (password_hash && String(password_hash).trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashedPwd = await bcrypt.hash(password_hash, salt);
            addInput(request, 'password', sql.NVarChar(255), hashedPwd);
            sets.push('PasswordHash = @password', 'RequiresPasswordChange = 0');
        }

        if (sets.length > 0) {
            await request.query(`UPDATE EBM.Users SET ${sets.join(', ')} WHERE Id = @id`);
        }

        const selectRequest = db.request();
        addInput(selectRequest, 'id', sql.UniqueIdentifier, userId);
        const result = await selectRequest.query('SELECT FullName as full_name, AvatarUrl as avatar_url, CAST(RequiresPasswordChange AS BIT) as requires_password_change FROM EBM.Users WHERE Id = @id');
        if (result.recordset.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(result.recordset[0]);
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});

export default router;
