import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getReadPool, getWritePool } from '../db.js';
import { APP_IDENTIFIER } from '../lib/config.js';
import { addInput } from '../lib/db.js';
import { dominioCookie } from '../lib/dominioCookie.js';
import { blacklistToken, invalidateAllUserSessions } from '../lib/redis.js';
import { safeError } from '../lib/security.js';
import { clearSharedCookie, verifyToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { JWT_SECRET } from '../lib/env.js';

// JWT_SECRET: se lee a nivel de modulo, seguro porque index.ts importa './lib/env.js' primero.

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py: ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

// --- AUTH ---
const loginSchema = z.object({
    username: z.string().min(1, 'Usuario requerido').max(255),
    password: z.string().min(1, 'Contraseña requerida').max(255),
});

router.post('/api/auth/login', async (req: Request, res: Response) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: 'Datos de login inválidos', details: parseResult.error.issues });
    }
    const { username, password } = parseResult.data;
    try {
        const db = await getWritePool();
        const result = await db.request().input('u', sql.NVarChar(sql.MAX), username).input('app', sql.NVarChar(sql.MAX), APP_IDENTIFIER).query(`
            SELECT u.*, r.Name as RoleName, m.Name as ManagementName,
                uc.CASId as cas_id, TRIM(c.RUC) as cas_ruc,
                r.InactivityTimeoutMinutes as role_timeout, r.WarningBeforeMinutes as role_warning
            FROM EBM.Users u
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id
            LEFT JOIN EBM.Managements m ON u.ManagementId = m.Id
            LEFT JOIN EBM.UserCAS uc ON u.Id = uc.UserId
            LEFT JOIN dbo.GAC_APP_TB_CAS c ON uc.CASId = c.ID_CAS
            WHERE (u.Username = @u OR u.Email = @u) AND u.IsActive = 1 AND (u.Apps LIKE '%' + @app + '%' OR u.Apps LIKE '%ADMIN%')
        `);
        const user = result.recordset[0];
        if (!user || !(await bcrypt.compare(password, user.PasswordHash))) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        // Check access to Valuations (VAL) or Admin
        const isAdmin = user.RoleName?.toLowerCase() === 'administrador';
        const apps = (user.Apps || '').toUpperCase();
        if (!isAdmin && !apps.includes('VAL')) {
            return res.status(403).json({ error: 'Sin acceso a la aplicación de Valorizaciones' });
        }

        const permsReqLogin = db.request();
        addInput(permsReqLogin, 'rid', sql.UniqueIdentifier, user.RoleId);
        addInput(permsReqLogin, 'app', sql.NVarChar(20), APP_IDENTIFIER);
        const perms = (await permsReqLogin.query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map(p => p.Permission);

        const appCfgReq = db.request();
        addInput(appCfgReq, 'appCode', sql.VarChar(20), APP_IDENTIFIER);
        const appCfgResult = await appCfgReq.query('SELECT DefaultInactivityTimeoutMinutes, DefaultWarningBeforeMinutes FROM EBM.AppSessionConfig WHERE UPPER(AppCode) = UPPER(@appCode)');
        const appCfg = appCfgResult.recordset[0];
        const timeoutMinutes: number = user.role_timeout ?? appCfg?.DefaultInactivityTimeoutMinutes ?? 30;
        const warningMinutes: number = user.role_warning ?? appCfg?.DefaultWarningBeforeMinutes ?? 2;

        const token = jwt.sign({ id: user.Id, username: user.Username, role: user.RoleName, perms, casId: user.cas_id || null, casRUC: user.cas_ruc || null }, JWT_SECRET, { expiresIn: '12h' });

        const ssoToken = jwt.sign(
            { id: user.Id, role: user.RoleName, role_name: user.RoleName, username: user.Username, apps: user.Apps || '', casId: user.cas_id || null },
            JWT_SECRET, { expiresIn: '12h' }
        );
        // La cookie compartida se escribe segun el DOMINIO de la peticion, no segun NODE_ENV: esa
        // variable puede faltar en el despliegue sin que nada avise, y entonces la cookie no se
        // escribe nunca -- se entra a la app pero el salto a cualquier otra pide login.
        const dominioCompartido = dominioCookie(req);
        if (dominioCompartido) {
            res.cookie('token', ssoToken, { domain: dominioCompartido, maxAge: 12 * 60 * 60 * 1000, httpOnly: false, secure: true, sameSite: 'lax', path: '/' });
        }

        res.json({ token, user: { id: user.Id, username: user.Username, full_name: user.FullName, email: user.Email, role_name: user.RoleName, management_id: user.ManagementId, management_name: user.ManagementName, avatar_url: user.AvatarUrl, permissions: perms, apps: user.Apps, requires_password_change: user.RequiresPasswordChange === 1 }, sessionConfig: { timeoutMinutes, warningMinutes } });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/auth/logout', verifyToken, async (req: any, res: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const token = req.headers['authorization']!.split(' ')[1];
    await blacklistToken(token, (req.user as any).exp ?? 0); // eslint-disable-line @typescript-eslint/no-explicit-any
    // Invalida también cualquier otro token del mismo usuario (ej. re-firmado por otra app del
    // ecosistema vía su propio /auth/me) -- un logout debe cerrar la sesión en todas las apps QA,
    // no solo revocar el token puntual que se usó para llamar a este endpoint.
    await invalidateAllUserSessions((req.user as any).id); // eslint-disable-line @typescript-eslint/no-explicit-any
    // Borrar la cookie compartida aquí mismo (Set-Cookie de la respuesta) en vez de depender
    // solo del document.cookie del cliente, que puede no alcanzar a comprometerse antes de que
    // la página navegue tras el logout.
    clearSharedCookie(res, req);
    res.json({ message: 'Sesión cerrada correctamente.' });
});

router.get('/api/auth/me', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = (req as AuthRequest).user!;
        const db = await getReadPool();
        const result = await db.request()
            .input('id', sql.UniqueIdentifier, id)
            .input('app', sql.NVarChar(20), APP_IDENTIFIER)
            .query(`
            SELECT u.*, r.Name as RoleName, m.Name as ManagementName,
                uc.CASId as cas_id, TRIM(c.RUC) as cas_ruc
            FROM EBM.Users u
            LEFT JOIN EBM.Roles r ON u.RoleId = r.Id
            LEFT JOIN EBM.Managements m ON u.ManagementId = m.Id
            LEFT JOIN EBM.UserCAS uc ON u.Id = uc.UserId
            LEFT JOIN dbo.GAC_APP_TB_CAS c ON uc.CASId = c.ID_CAS
            WHERE u.Id = @id AND (u.Apps LIKE '%' + @app + '%' OR u.Apps LIKE '%ADMIN%')
        `);
        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        
        const permsReqMe = db.request();
        addInput(permsReqMe, 'rid', sql.UniqueIdentifier, user.RoleId);
        addInput(permsReqMe, 'app', sql.NVarChar(20), APP_IDENTIFIER);
        const perms = (await permsReqMe.query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map(p => p.Permission);
        // Los tokens marcados ssoPilot=true no deben reescribir la cookie compartida aquí ni
        // propagarse sin el claim al freshToken — hoy eso pasa solo cuando COOKIE_DOMAIN no está
        // configurada (producción real, sin dominio QA propio). Cuando COOKIE_DOMAIN sí está
        // configurada (Fase 20, entorno QA), el callback de Casdoor deja de firmar ssoPilot=true,
        // así que esta cookie sí se escribe y el SSO cruzado real funciona.
        const ssoPilot = (req as AuthRequest).user?.ssoPilot;
        // Emitir token fresco con casRUC para soporte SSO cross-app
        const freshToken = jwt.sign(
            { id: user.Id, username: user.Username, role: user.RoleName, perms, casId: user.cas_id || null, casRUC: user.cas_ruc || null, ...(ssoPilot ? { ssoPilot: true } : {}) },
            JWT_SECRET,
            { expiresIn: '12h' }
        );
        const ssoTokenMe = jwt.sign(
            { id: user.Id, role: user.RoleName, role_name: user.RoleName, username: user.Username, apps: user.Apps || '', casId: user.cas_id || null },
            JWT_SECRET, { expiresIn: '12h' }
        );
        // La cookie compartida se escribe segun el DOMINIO de la peticion, no segun NODE_ENV: esa
        // variable puede faltar en el despliegue sin que nada avise, y entonces la cookie no se
        // escribe nunca -- se entra a la app pero el salto a cualquier otra pide login.
        const dominioCompartido = dominioCookie(req);
        if (dominioCompartido && !ssoPilot) {
            res.cookie('token', ssoTokenMe, { domain: dominioCompartido, maxAge: 12 * 60 * 60 * 1000, httpOnly: false, secure: true, sameSite: 'lax', path: '/' });
        }
        res.json({ token: freshToken, user: { id: user.Id, username: user.Username, full_name: user.FullName, email: user.Email, role_name: user.RoleName, management_id: user.ManagementId, management_name: user.ManagementName, avatar_url: user.AvatarUrl, permissions: perms, apps: user.Apps, casId: user.cas_id || null, casRUC: user.cas_ruc || null } });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
