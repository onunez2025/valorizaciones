import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import bcrypt from 'bcrypt';
import { getReadPool, getWritePool } from '../db.js';
import { cleanApps } from '../lib/apps.js';
import { logAudit } from '../lib/audit.js';
import { APP_IDENTIFIER } from '../lib/config.js';
import { addInput } from '../lib/db.js';
import { safeError } from '../lib/security.js';
import { verifyPermission, verifyToken } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

// USERS
router.get('/api/users', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query(`
            SELECT u.Id as id, u.FullName as full_name, u.Username as username, u.Email as email,
                   u.RoleId as role_id, r.Name as role_name, CAST(u.IsActive AS BIT) as is_active, 
                   u.Apps as apps, u.AvatarUrl as avatar_url
            FROM EBM.Users u
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id
        `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/users', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { full_name, username, email, password_hash, role_id, apps, avatar_url } = req.body;
        const db = await getWritePool();

        const userChkReq = db.request();
        addInput(userChkReq, 'u', sql.NVarChar(255), username);
        addInput(userChkReq, 'e', sql.NVarChar(255), email);
        const checkResult = await userChkReq.query("SELECT Id, Apps FROM EBM.Users WHERE Username = @u OR Email = @e");

        if (checkResult.recordset.length > 0) {
            // UPSERT/REACTIVATE
            const existing = checkResult.recordset[0];
            const mergedApps = cleanApps(existing.Apps + ', ' + APP_IDENTIFIER);
            const reactReq = db.request();
            addInput(reactReq, 'id', sql.UniqueIdentifier, existing.Id);
            addInput(reactReq, 'name', sql.NVarChar(255), full_name);
            addInput(reactReq, 'rid', sql.UniqueIdentifier, role_id);
            addInput(reactReq, 'apps', sql.NVarChar(500), mergedApps);
            addInput(reactReq, 'photo', sql.NVarChar(500), avatar_url ?? null);
            await reactReq.query(`UPDATE EBM.Users SET FullName = @name, RoleId = @rid, Apps = @apps, AvatarUrl = @photo, IsActive = 1 WHERE Id = @id`);
            await logAudit(req, 'REACTIVATE', 'USERS', username, { apps: mergedApps });
            return res.json({ id: existing.Id, username });
        }

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password_hash || 'temp1234', salt);
        const appsInsert = cleanApps(apps || APP_IDENTIFIER);

        const userInsReq = db.request();
        addInput(userInsReq, 'name', sql.NVarChar(255), full_name);
        addInput(userInsReq, 'u', sql.NVarChar(255), username);
        addInput(userInsReq, 'e', sql.NVarChar(255), email);
        addInput(userInsReq, 'pass', sql.NVarChar(255), hashed);
        addInput(userInsReq, 'rid', sql.UniqueIdentifier, role_id);
        addInput(userInsReq, 'apps', sql.NVarChar(500), appsInsert);
        addInput(userInsReq, 'photo', sql.NVarChar(500), avatar_url ?? null);
        const result = await userInsReq.query(`
                INSERT INTO EBM.Users (FullName, Username, Email, PasswordHash, RoleId, Apps, AvatarUrl, IsActive, RequiresPasswordChange)
                OUTPUT INSERTED.Id as id
                VALUES (@name, @u, @e, @pass, @rid, @apps, @photo, 1, 1)
            `);
        await logAudit(req, 'CREATE', 'USERS', username, { apps: appsInsert });
        res.status(201).json(result.recordset[0]);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.put('/api/users/:id', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { full_name, username, email, role_id, is_active, apps, avatar_url } = req.body;
        const db = await getWritePool();
        const appsSave = cleanApps(apps);

        const userUpdReq = db.request();
        addInput(userUpdReq, 'id', sql.UniqueIdentifier, id);
        addInput(userUpdReq, 'name', sql.NVarChar(255), full_name);
        addInput(userUpdReq, 'u', sql.NVarChar(255), username);
        addInput(userUpdReq, 'e', sql.NVarChar(255), email);
        addInput(userUpdReq, 'rid', sql.UniqueIdentifier, role_id);
        addInput(userUpdReq, 'active', sql.Bit, is_active ? 1 : 0);
        addInput(userUpdReq, 'apps', sql.NVarChar(500), appsSave);
        addInput(userUpdReq, 'photo', sql.NVarChar(500), avatar_url ?? null);
        await userUpdReq.query(`UPDATE EBM.Users SET FullName = @name, Username = @u, Email = @e, RoleId = @rid, IsActive = @active, Apps = @apps, AvatarUrl = @photo WHERE Id = @id`);
        
        await logAudit(req, 'UPDATE', 'USERS', id as string, { apps: appsSave });
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.delete('/api/users/:id', verifyToken, verifyPermission('val.config.users'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getWritePool();
        const userDelReq = db.request();
        addInput(userDelReq, 'id', sql.UniqueIdentifier, id);
        await userDelReq.query("UPDATE EBM.Users SET IsActive = 0 WHERE Id = @id");
        await logAudit(req, 'DEACTIVATE', 'USERS', id as string, {});
        res.status(204).send();
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
