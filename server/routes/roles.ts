import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import crypto from 'crypto';
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

// ROLES
router.get('/api/roles', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const roles = (await db.request().query("SELECT Id as id, Name as name, Apps as apps FROM EBM.Roles")).recordset;
        const allPerms = (await db.request().query("SELECT RoleId, Permission FROM EBM.RolePermissions")).recordset;
        const result = roles.map((r: { id: string; name: string; apps: string }) => ({
            ...r,
            permissions: allPerms.filter((p: { RoleId: string; Permission: string }) => p.RoleId === r.id).map((p: { RoleId: string; Permission: string }) => p.Permission)
        }));
        res.json(result);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/roles', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { name, permissions, apps } = req.body;
        const db = await getWritePool();
        const appsSave = cleanApps(apps || APP_IDENTIFIER);
        const roleId = crypto.randomUUID().toUpperCase();

        const roleInsReq = db.request();
        addInput(roleInsReq, 'id', sql.UniqueIdentifier, roleId);
        addInput(roleInsReq, 'name', sql.NVarChar(100), name);
        addInput(roleInsReq, 'apps', sql.NVarChar(500), appsSave);
        await roleInsReq.query("INSERT INTO EBM.Roles (Id, Name, Apps) VALUES (@id, @name, @apps)");

        if (permissions && permissions.length > 0) {
            for (const p of permissions) {
                const permInsReq = db.request();
                addInput(permInsReq, 'rid', sql.UniqueIdentifier, roleId);
                addInput(permInsReq, 'p', sql.NVarChar(100), p);
                await permInsReq.query("INSERT INTO EBM.RolePermissions (RoleId, Permission) VALUES (@rid, @p)");
            }
        }
        await logAudit(req, 'CREATE', 'ROLES', name, { apps: appsSave });
        res.status(201).json({ id: roleId, name, permissions });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.put('/api/roles/:id', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, permissions, apps } = req.body;
        const db = await getWritePool();
        const appsSave = cleanApps(apps || APP_IDENTIFIER);

        const roleUpdReq = db.request();
        addInput(roleUpdReq, 'id', sql.UniqueIdentifier, id);
        addInput(roleUpdReq, 'name', sql.NVarChar(100), name);
        addInput(roleUpdReq, 'apps', sql.NVarChar(500), appsSave);
        await roleUpdReq.query("UPDATE EBM.Roles SET Name = @name, Apps = @apps WHERE Id = @id");

        const delPermReq = db.request();
        addInput(delPermReq, 'rid', sql.UniqueIdentifier, id);
        await delPermReq.query("DELETE FROM EBM.RolePermissions WHERE RoleId = @rid");
        if (permissions && permissions.length > 0) {
            for (const p of permissions) {
                const permUpdReq = db.request();
                addInput(permUpdReq, 'rid', sql.UniqueIdentifier, id);
                addInput(permUpdReq, 'p', sql.NVarChar(100), p);
                await permUpdReq.query("INSERT INTO EBM.RolePermissions (RoleId, Permission) VALUES (@rid, @p)");
            }
        }
        await logAudit(req, 'UPDATE', 'ROLES', name, { apps: appsSave });
        res.json({ id, name, permissions });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.delete('/api/roles/:id', verifyToken, verifyPermission('val.config.roles'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getWritePool();
        
        // Check if users are assigned to this role
        const usersChkReq = db.request();
        addInput(usersChkReq, 'rid', sql.UniqueIdentifier, id);
        const usersInRole = await usersChkReq.query("SELECT COUNT(*) as count FROM EBM.Users WHERE RoleId = @rid AND IsActive = 1");
        if (usersInRole.recordset[0].count > 0) {
            return res.status(400).json({ error: "No se puede eliminar el perfil porque tiene usuarios asignados." });
        }

        const delRolePermReq = db.request();
        addInput(delRolePermReq, 'rid', sql.UniqueIdentifier, id);
        await delRolePermReq.query("DELETE FROM EBM.RolePermissions WHERE RoleId = @rid");

        const delRoleReq = db.request();
        addInput(delRoleReq, 'id', sql.UniqueIdentifier, id);
        await delRoleReq.query("DELETE FROM EBM.Roles WHERE Id = @id");
        
        await logAudit(req, 'DELETE', 'ROLES', id as string, {});
        res.status(204).send();
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
