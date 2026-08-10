import { Router } from 'express';
import type { Request, Response } from 'express';
import sql from 'mssql';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getReadPool } from '../db.js';
import { exchangeCodeForToken, getCasdoorAuthorizeUrl, getCasdoorUserInfo } from '../lib/casdoorClient.js';
import { APP_IDENTIFIER } from '../lib/config.js';
import { addInput } from '../lib/db.js';
import { dominioCookie } from '../lib/dominioCookie.js';
import { sendSsoFinalRetryEmail, sendSsoFirstRetryEmail, sendSsoPendingEmail } from '../lib/mailer.js';
import { safeError, sanitizeLog } from '../lib/security.js';
import { JWT_SECRET } from '../lib/env.js';

// JWT_SECRET: se lee a nivel de modulo, seguro porque index.ts importa './lib/env.js' primero.

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py: ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

// --- SSO (piloto Casdoor: login social Google/Microsoft) ---
// La aprobación/rechazo de solicitudes SSO está centralizada en SIATC Console — esta app
// solo implementa el lado de login (autorizar/callback) y las notificaciones de solicitud.
const SSO_APP_CODE = process.env.APP_CODE || APP_IDENTIFIER;
const SSO_APP_LABEL = 'Valorizaciones';
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const MAX_RESUBMIT_RETRIES = 2;

function redirectToSsoStatus(res: Response, status: 'pending' | 'rejected' | 'error', reason?: string, retriesLeft?: number): void {
    const params = new URLSearchParams({ status });
    if (reason) params.set('reason', reason);
    if (typeof retriesLeft === 'number') params.set('retriesLeft', String(retriesLeft));
    res.redirect(`${FRONTEND_URL}/sso-status?${params.toString()}`);
}

// GET redirige al login social de Casdoor — mantiene client_id/redirect_uri solo del lado del servidor.
// ?provider=google|microsoft salta la pantalla de selección de Casdoor y va directo a ese proveedor.
// ?resubmit=true marca el intento como una re-solicitud explícita desde la pantalla de rechazo — el
// marcador viaja en el "state" (sobrevive el viaje de ida y vuelta por Casdoor) y se valida en /callback.
router.get('/api/auth/sso/authorize', (req: Request, res: Response) => {
    const isResubmit = req.query.resubmit === 'true';
    const state = isResubmit ? `resubmit-${crypto.randomBytes(8).toString('hex')}` : crypto.randomBytes(16).toString('hex');
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    res.redirect(getCasdoorAuthorizeUrl(state, provider));
});

// GET callback de Casdoor tras un login social (Google/Microsoft) — ruta pública, sin verifyToken.
router.get('/api/auth/sso/callback', async (req: Request, res: Response) => {
    const code = String(req.query.code || '');
    if (!code) return redirectToSsoStatus(res, 'error', 'Falta el código de autorización.');

    try {
        const accessToken = await exchangeCodeForToken(code);
        const profile = await getCasdoorUserInfo(accessToken);

        const email = (profile.email || '').trim().toLowerCase();
        if (!email) return redirectToSsoStatus(res, 'error', 'Casdoor no devolvió un correo verificado.');

        const db = await getReadPool();

        // 1. ¿Ya existe un usuario real con este correo y con acceso a Valorizaciones?
        const userResult = await db.request()
            .input('email', sql.NVarChar(sql.MAX), email)
            .input('app', sql.NVarChar(sql.MAX), SSO_APP_CODE)
            .query(`
                SELECT u.Id as id, u.Username as username, u.RoleId as role_id, r.Name as role_name,
                       u.Apps as apps, CAST(u.IsActive AS BIT) as is_active,
                       uc.CASId as cas_id, TRIM(c.RUC) as cas_ruc
                FROM EBM.Users u
                LEFT JOIN EBM.Roles r ON u.RoleId = r.Id
                LEFT JOIN EBM.UserCAS uc ON u.Id = uc.UserId
                LEFT JOIN dbo.GAC_APP_TB_CAS c ON uc.CASId = c.ID_CAS
                WHERE u.Email = @email AND (u.Apps LIKE '%' + @app + '%' OR u.Apps LIKE '%ADMIN%')
            `);
        const user = userResult.recordset[0];

        if (user && user.is_active) {
            const permsReq = db.request();
            addInput(permsReq, 'rid', sql.UniqueIdentifier, user.role_id);
            addInput(permsReq, 'app', sql.NVarChar(20), SSO_APP_CODE);
            const perms = (await permsReq.query("SELECT Permission FROM EBM.RolePermissions WHERE RoleId = @rid AND (Permission LIKE @app + '.%' OR Permission LIKE 'ebm.%')")).recordset.map((p: { Permission: string }) => p.Permission);

            const token = jwt.sign(
                {
                    id: user.id, username: user.username, role: user.role_name, perms,
                    casId: user.cas_id || null, casRUC: user.cas_ruc || null,
                    // El flag `ssoPilot` marca que la sesion sale del piloto de Casdoor y NO debe
                    // compartirse. Se omite en QA, donde el dominio de cookie esta aislado y el SSO
                    // cruzado entre las apps de QA es justamente lo que se quiere probar.
                    // El chequeo era `process.env.COOKIE_DOMAIN`: bastaba olvidar esa variable en un
                    // despliegue para que QA se comportara como produccion, en silencio.
                    ...(dominioCookie(req) === '.qa.siatc.cloud' ? {} : { ssoPilot: true }),
                },
                JWT_SECRET,
                { expiresIn: '12h' }
            );
            const params = new URLSearchParams({ ssoToken: token });
            return res.redirect(`${FRONTEND_URL}/sso-login?${params.toString()}`);
        }

        if (user && !user.is_active) {
            return redirectToSsoStatus(res, 'rejected', 'Tu cuenta está desactivada. Contacta a un administrador.');
        }

        // 2. No existe (o no tiene acceso a VAL aún): revisar si ya hay una solicitud previa
        const pendingResult = await db.request()
            .input('email', sql.NVarChar(sql.MAX), email)
            .query(`SELECT TOP 1 Status, RejectionReason, RetryCount FROM EBM.PendingSSORequests WHERE Email = @email ORDER BY RequestedAt DESC`);
        const existing = pendingResult.recordset[0];

        if (existing?.Status === 'pending') {
            return redirectToSsoStatus(res, 'pending');
        }
        if (existing?.Status === 'rejected') {
            const retryCount: number = existing.RetryCount ?? 0;
            const isResubmit = String(req.query.state || '').startsWith('resubmit-');

            if (isResubmit && retryCount < MAX_RESUBMIT_RETRIES) {
                const newRetryCount = retryCount + 1;
                await db.request()
                    .input('email', sql.NVarChar(sql.MAX), email)
                    .input('retryCount', sql.Int, newRetryCount)
                    .query(`
                        UPDATE EBM.PendingSSORequests
                        SET Status = 'pending', RetryCount = @retryCount, ReviewedBy = NULL,
                            ReviewedAt = NULL, RejectionReason = NULL, AssignedRoleId = NULL,
                            RequestedAt = SYSUTCDATETIME()
                        WHERE Email = @email
                    `);
                if (newRetryCount >= MAX_RESUBMIT_RETRIES) {
                    await sendSsoFinalRetryEmail(email, SSO_APP_LABEL);
                } else {
                    await sendSsoFirstRetryEmail(email, SSO_APP_LABEL);
                }
                return redirectToSsoStatus(res, 'pending');
            }

            const retriesLeft = Math.max(MAX_RESUBMIT_RETRIES - retryCount, 0);
            return redirectToSsoStatus(res, 'rejected', existing.RejectionReason, retriesLeft);
        }

        // 3. Crear la solicitud nueva
        try {
            await db.request()
                .input('email', sql.VarChar(255), email)
                .input('fullName', sql.VarChar(200), profile.name || profile.preferred_username || null)
                .input('provider', sql.VarChar(50), 'sso')
                .input('casdoorUserId', sql.VarChar(100), profile.sub || '')
                .input('appCode', sql.VarChar(20), SSO_APP_CODE)
                .query(`
                    INSERT INTO EBM.PendingSSORequests (Email, FullName, Provider, CasdoorUserId, AppCode)
                    VALUES (@email, @fullName, @provider, @casdoorUserId, @appCode)
                `);
            await sendSsoPendingEmail(email, SSO_APP_LABEL);
        } catch (insertErr: unknown) {
            // Condición de carrera: dos requests casi simultáneas (doble click, doble pestaña)
            // pueden pasar el chequeo de "no existe" de arriba antes de que cualquiera inserte.
            // El índice único filtrado UX_PendingSSORequests_Email_Pending (Email, WHERE
            // Status='pending') rechaza la segunda con "duplicate key" -- se trata como éxito
            // (alguien más ya ganó la carrera y creó la fila), no como error real.
            const msg = (insertErr as Error)?.message || '';
            if (!msg.includes('duplicate key')) throw insertErr;
        }

        return redirectToSsoStatus(res, 'pending');
    } catch (error: unknown) {
        console.error('[SSO Callback] Error:', safeError(error), sanitizeLog(String(req.query.state || '')));
        return redirectToSsoStatus(res, 'error', 'Ocurrió un error validando tu sesión. Intenta de nuevo.');
    }
});

export default router;
