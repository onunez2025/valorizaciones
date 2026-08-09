import './lib/env.js';   // PRIMERO: carga el .env antes de que ningun modulo lea process.env
import { APP_IDENTIFIER, C4C_BASE_URL, C4C_AUTH, MS_GRAPH_SENDER_EMAIL } from './lib/config.js';
import { dominioCookie } from './lib/dominioCookie.js';
import { safeError, sanitizeLog } from './lib/security.js';
import { getGraphToken } from './lib/graph.js';
import { getDb, getReadPool, getWritePool } from './db.js';
import { getRedisClient, blacklistToken, invalidateAllUserSessions } from './lib/redis.js';
import type { JwtUserPayload, AuthRequest } from './middleware/auth.js';
import { clearSharedCookie, verifyToken } from './middleware/auth.js';
import { logAudit } from './lib/audit.js';
import ticketsRouter from './routes/tickets.js';
import materialsRouter from './routes/materials.js';
import dashboardRouter from './routes/dashboard.js';
import c4cRouter from './routes/c4c.js';
import penaltiesRouter from './routes/penalties.js';
import adicionalesRouter from './routes/adicionales.js';
import usersRouter from './routes/users.js';
import profileRouter from './routes/profile.js';
import rolesRouter from './routes/roles.js';
import { verifyPermission } from './middleware/auth.js';
import express from 'express';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Redis } from 'ioredis';
import { RedisStore } from 'rate-limit-redis';
import sql from 'mssql';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { assertCasRuc, enforceCasRuc } from './lib/casFilter.js';
import { addInput } from './lib/db.js';
import { validateBody } from './lib/validate.js';
import { exchangeCodeForToken, getCasdoorUserInfo, getCasdoorAuthorizeUrl } from './lib/casdoorClient.js';
import { sendSsoPendingEmail, sendSsoFirstRetryEmail, sendSsoFinalRetryEmail } from './lib/mailer.js';
import bcrypt from 'bcrypt';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';


const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '';
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
    console.error('CRITICAL FATAL ERROR: JWT_SECRET environment variable is not set. Server cannot start securely.');
    process.exit(1);
}





app.set('trust proxy', 1);


app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
            baseUri: ["'self'"],
        }
    },
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Too many requests from this IP, please try again later.' },
    store: new RedisStore({ sendCommand: (...args: string[]) => (getRedisClient() as any).call(...args) as any, prefix: 'rl:val:' }), // eslint-disable-line @typescript-eslint/no-explicit-any
});
app.use(limiter);

// Auth rate limiter — starts with safe defaults, overwritten from EBM.AppSessionConfig at startup
// keyGenerator: IP + username — cada usuario tiene su propio contador (evita que IP compartida de oficina bloquee a todos)
const authKeyGenerator = (req: Request) => {
    const username = String(req.body?.username || '').toLowerCase().trim().substring(0, 50);
    return `${req.ip}:${username}`;
};
let authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    keyGenerator: authKeyGenerator,
    message: { error: 'Too many login attempts, please try again later.' },
    store: new RedisStore({ sendCommand: (...args: string[]) => (getRedisClient() as any).call(...args) as any, prefix: 'rl:val:auth:' }), // eslint-disable-line @typescript-eslint/no-explicit-any
});
app.use('/api/auth/login', (req: Request, res: Response, next: NextFunction) => authLimiter(req, res, next));

app.use(cors({
    origin: (origin, callback) => {
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`Blocked CORS attempt from: ${sanitizeLog(origin)}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));






app.get('/api/applications', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const activeOnly = req.query.activeOnly === 'true';
        let query = `
            SELECT
                a.Id as id, a.Code as code, a.Label as label, a.Url as url, a.LogoUrl as logo_url,
                CAST(a.IsActive AS BIT) as is_active, a.DisplayOrder as display_order,
                b.FontTitle as font_title,
                b.FontSubtitle as font_subtitle,
                b.FontHeader as font_header,
                b.FontSidebar as font_sidebar,
                b.FontTableData as font_table_data,
                b.BaseFontSize as base_font_size,
                b.SidebarWidth as sidebar_width,
                b.HeaderHeight as header_height,
                b.TableRowHeight as table_row_height,
                b.TransitionDuration as transition_duration,
                b.RadiusChip as radius_chip,
                b.RadiusButton as radius_button,
                b.RadiusInput as radius_input,
                b.RadiusCard as radius_card,
                b.RadiusModal as radius_modal,
                b.LightPrimary as light_primary,
                b.LightPrimaryForeground as light_primary_foreground,
                b.LightBg as light_bg,
                b.LightCard as light_card,
                b.LightBorder as light_border,
                b.LightTextPrimary as light_text_primary,
                b.LightTextSecondary as light_text_secondary,
                b.DarkPrimary as dark_primary,
                b.DarkPrimaryForeground as dark_primary_foreground,
                b.DarkBg as dark_bg,
                b.DarkCard as dark_card,
                b.DarkBorder as dark_border,
                b.DarkTextPrimary as dark_text_primary,
                b.DarkTextSecondary as dark_text_secondary,
                b.ShadowLevel1 as shadow_level_1,
                b.ShadowLevel2 as shadow_level_2,
                b.ShadowLevel3 as shadow_level_3,
                b.MobileFontScale as mobile_font_scale,
                b.MobileRadiusCard as mobile_radius_card,
                b.MobileRadiusButton as mobile_radius_button,
                b.MobilePaddingScale as mobile_padding_scale,
                b.SidebarCollapsedWidth as sidebar_collapsed_width,
                b.SidebarDefaultState as sidebar_default_state,
                CAST(ISNULL(b.SidebarHoverExpand, 1) AS BIT) as sidebar_hover_expand,
                CAST(ISNULL(b.SidebarAllowCollapse, 1) AS BIT) as sidebar_allow_collapse
            FROM [dbo].[GAC_APP_TB_CONSOLE_APPLICATIONS] a
            LEFT JOIN [dbo].[GAC_APP_TB_CONSOLE_APP_BRANDING] b ON a.Id = b.ApplicationId
        `;
        if (activeOnly) {
            query += ' WHERE a.IsActive = 1';
        }
        query += ' ORDER BY a.DisplayOrder ASC';
        const result = await db.request().query(query);
        const apps = result.recordset.map((row) => ({
            id: row.id,
            code: row.code,
            label: row.label,
            url: row.url,
            logo_url: row.logo_url,
            is_active: row.is_active,
            display_order: row.display_order,
            sidebar_width: row.sidebar_width,
            sidebar_collapsed_width: row.sidebar_collapsed_width,
            sidebar_default_state: row.sidebar_default_state,
            sidebar_hover_expand: row.sidebar_hover_expand,
            sidebar_allow_collapse: row.sidebar_allow_collapse,
            theme_config: row.font_title ? {
                typography: {
                    fontTitle: row.font_title,
                    fontSubtitle: row.font_subtitle,
                    fontHeader: row.font_header,
                    fontSidebar: row.font_sidebar,
                    fontTableData: row.font_table_data,
                    baseFontSize: row.base_font_size,
                },
                border: {
                    radiusChip: row.radius_chip,
                    radiusButton: row.radius_button,
                    radiusCard: row.radius_card,
                    radiusModal: row.radius_modal,
                    radiusInput: row.radius_input,
                },
                light: {
                    primary: row.light_primary,
                    primaryForeground: row.light_primary_foreground,
                    background: row.light_bg,
                    card: row.light_card,
                    border: row.light_border,
                    textPrimary: row.light_text_primary,
                    textSecondary: row.light_text_secondary,
                },
                dark: {
                    primary: row.dark_primary,
                    primaryForeground: row.dark_primary_foreground,
                    background: row.dark_bg,
                    card: row.dark_card,
                    border: row.dark_border,
                    textPrimary: row.dark_text_primary,
                    textSecondary: row.dark_text_secondary,
                },
                layout: {
                    sidebarWidth: row.sidebar_width,
                    headerHeight: row.header_height,
                    tableRowHeight: row.table_row_height,
                    transitionDuration: row.transition_duration,
                },
                shadows: {
                    level1: row.shadow_level_1,
                    level2: row.shadow_level_2,
                    level3: row.shadow_level_3,
                },
                responsive: {
                    mobileFontScale: row.mobile_font_scale,
                    mobileRadiusCard: row.mobile_radius_card,
                    mobileRadiusButton: row.mobile_radius_button,
                    mobilePaddingScale: row.mobile_padding_scale,
                }
            } : null
        }));
        res.json(apps);
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});


// --- AUTH ---
const loginSchema = z.object({
    username: z.string().min(1, 'Usuario requerido').max(255),
    password: z.string().min(1, 'Contraseña requerida').max(255),
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
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

app.post('/api/auth/logout', verifyToken, async (req: any, res: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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

app.get('/api/auth/me', verifyToken, async (req: Request, res: Response) => {
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
app.get('/api/auth/sso/authorize', (req: Request, res: Response) => {
    const isResubmit = req.query.resubmit === 'true';
    const state = isResubmit ? `resubmit-${crypto.randomBytes(8).toString('hex')}` : crypto.randomBytes(16).toString('hex');
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    res.redirect(getCasdoorAuthorizeUrl(state, provider));
});

// GET callback de Casdoor tras un login social (Google/Microsoft) — ruta pública, sin verifyToken.
app.get('/api/auth/sso/callback', async (req: Request, res: Response) => {
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

// --- CAS ---
app.get('/api/cas', verifyToken, async (req: Request, res: Response) => {
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

// --- CONFIGURATION ---
app.get('/api/config', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG]");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

const crearConfigSchema = z.object({
    clave: z.string().min(1).max(100),
    valor: z.string().max(500),
    descripcion: z.string().max(200).optional(),
});
app.post('/api/config', verifyToken, verifyPermission('val.config.admin'), validateBody(crearConfigSchema), async (req: Request, res: Response) => {
    try {
        const { clave, valor, descripcion } = req.body;
        const db = await getWritePool();
        const configReq = db.request();
        addInput(configReq, 'clave', sql.NVarChar(100), clave);
        addInput(configReq, 'valor', sql.NVarChar(500), valor);
        addInput(configReq, 'descripcion', sql.NVarChar(200), descripcion ?? null);
        await configReq.query(`
                IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] WHERE Clave = @clave)
                BEGIN
                    UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] SET Valor = @valor, Descripcion = @descripcion WHERE Clave = @clave
                END
                ELSE
                BEGIN
                    INSERT INTO [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] (Clave, Valor, Descripcion) VALUES (@clave, @valor, @descripcion)
                END
            `);
        res.json({ message: 'Config updated' });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

// --- CONFIG ADICIONAL POR DISTRITO ---
app.get('/api/config-distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] ORDER BY Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.post('/api/config-distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id, cas_ids, distritos, importe, fecha_inicio, fecha_fin, activo } = req.body;
        const user = (req as AuthRequest).user!.username;
        const db = await getWritePool();
        const request = db.request();
        addInput(request, 'cas', sql.NVarChar(sql.MAX), JSON.stringify(cas_ids));
        addInput(request, 'dist', sql.NVarChar(sql.MAX), JSON.stringify(distritos));
        addInput(request, 'imp', sql.Decimal(18, 2), importe);
        addInput(request, 'fi', sql.DateTime, fecha_inicio);
        addInput(request, 'ff', sql.DateTime, fecha_fin ?? null);
        addInput(request, 'act', sql.Bit, activo ? 1 : 0);
        addInput(request, 'usr', sql.NVarChar(255), user);

        if (id) {
            addInput(request, 'id', sql.Int, Number(id));
            await request.query(`
                UPDATE [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO]
                SET CAS_Ids = @cas, Distritos = @dist, Importe = @imp, Fecha_Inicio = @fi, Fecha_Fin = @ff, Activo = @act
                WHERE Id = @id
            `);
        } else {
            await request.query(`
                INSERT INTO [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] (CAS_Ids, Distritos, Importe, Fecha_Inicio, Fecha_Fin, Activo, Creado_Por)
                VALUES (@cas, @dist, @imp, @fi, @ff, @act, @usr)
            `);
        }
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.delete('/api/config-distritos/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const idNum = parseInt(req.params.id as string, 10);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ error: 'ID inválido' });
        const user = (req as AuthRequest).user!;
        const db = await getWritePool();
        const existing = await db.request()
            .input('id', sql.Int, idNum)
            .query("SELECT Creado_Por FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] WHERE Id = @id");
        if (!existing.recordset[0]) return res.status(404).json({ error: 'Registro no encontrado' });
        const isAdmin = (user.role || '').toLowerCase() === 'administrador';
        if (!isAdmin && existing.recordset[0].Creado_Por !== user.username) {
            return res.status(403).json({ error: 'Sin permiso para eliminar este registro' });
        }
        await db.request()
            .input('id', sql.Int, idNum)
            .query("DELETE FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] WHERE Id = @id");
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.get('/api/distritos', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query('SELECT DISTINCT Ciudad, Distrito FROM APPGAC.ServiciosViewSQL WHERE Ciudad IS NOT NULL AND Distrito IS NOT NULL ORDER BY Ciudad, Distrito');
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

// --- CONFIG CANAL INSTITUCIONAL ---
app.get('/api/config-canal-institucional', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] ORDER BY Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.post('/api/config-canal-institucional', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id, cupo_area, fecha_inicio, fecha_fin, importe, activo } = req.body;
        const user = (req as AuthRequest).user!.username;
        const db = await getWritePool();
        const request = db.request();
        addInput(request, 'ca', sql.NVarChar(50), cupo_area);
        addInput(request, 'fi', sql.DateTime, fecha_inicio);
        addInput(request, 'ff', sql.DateTime, fecha_fin ?? null);
        addInput(request, 'imp', sql.Decimal(18, 2), importe);
        addInput(request, 'act', sql.Bit, activo ? 1 : 0);
        addInput(request, 'usr', sql.NVarChar(255), user);

        console.log(`[CONFIG] Saving rule for ${sanitizeLog(user)}, ID: ${id || 'NEW'}`);

        if (id) {
            await request.input('id', sql.Int, Number(id)).query(`
                UPDATE [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL]
                SET Cupo_Area = @ca, Fecha_Inicio = @fi, Fecha_Fin = @ff, Importe = @imp, Activo = @act
                WHERE Id = @id
            `);
        } else {
            await request.query(`
                INSERT INTO [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL]
                (Cupo_Area, Usuario_Creador, Keywords, Validacion_Tipo, Fecha_Inicio, Fecha_Fin, Importe, Activo, Creado_Por)
                VALUES (@ca, '', '', 'CONTIENE', @fi, @ff, @imp, @act, @usr)
            `);
        }
        res.json({ success: true });
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});

app.delete('/api/config-canal-institucional/:id', verifyToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = await getWritePool();
        const idNum = parseInt(String(id), 10);
        if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ error: 'ID inválido' });
        console.log(`[CONFIG] Deleting rule ID: ${idNum}`);
        await db.request().input('id', sql.Int, idNum).query("DELETE FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] WHERE Id = @id");
        res.json({ success: true });
    } catch (err: unknown) { 
        console.error('[CONFIG] Error deleting rule:', err);
        res.status(500).json({ error: safeError(err) }); 
    }
});


// --- VALORIZACIONES ---
// --- VALORIZACIONES HELPERS ---

// Mapeo de códigos de área C4C → nombre legible
// Agregar nuevos códigos según se identifiquen en el sistema C4C
const C4C_AREA_NAMES: Record<number, string> = {
    8:  'TALLER',
    11: 'OBRAS',
    // Cualquier otro código no listado aquí se muestra como 'GENERAL'
};

async function getC4CDetails(ticketIds: string[]) {
    if (ticketIds.length === 0) return {};
    const results: Record<string, { creator: string; subject: string; cupoArea: string }> = {};
    const chunkSize = 50;
    const promises = [];

    for (let i = 0; i < ticketIds.length; i += chunkSize) {
        const chunk = ticketIds.slice(i, i + chunkSize);
        const filter = chunk.map(id => `ID eq '${id}'`).join(' or ');
        const url = `${C4C_BASE_URL}/ServiceRequestCollection?$filter=${encodeURIComponent(filter)}&$select=ID,CreatedBy,Name,CupoTomado_SDK,zTicketArea_SDK&$format=json`;

        if (i === 0) console.log('[C4C] URL base:', url.split('?')[0]);

        promises.push(
            axios.get(url, {
                headers: { 'Authorization': `Basic ${C4C_AUTH}`, 'Accept': 'application/json' },
                timeout: 20000
            })
            .then(resp => {
                const items: Record<string, string>[] = resp.data?.d?.results ?? resp.data?.value ?? [];
                if (i === 0 && items.length > 0) {
                    console.log('[C4C DEBUG] Campos disponibles:', Object.keys(items[0]).join(', '));
                }
                items.forEach(item => {
                    results[item.ID] = {
                        creator: item.CreatedBy || '',
                        subject: item.Name || '',
                        cupoArea: (() => {
                            const code = parseInt(item.zTicketArea_SDK, 10);
                            if (!code) return 'GENERAL';
                            return C4C_AREA_NAMES[code] ?? 'GENERAL';
                        })()
                    };
                });
            })
            .catch(err => {
                const status = err.response?.status;
                const body = JSON.stringify(err.response?.data)?.slice(0, 300);
                console.error(`[C4C] Error chunk ${i}-${i + chunkSize}: HTTP ${status ?? 'N/A'} — ${body ?? err.message}`);
            })
        );
    }

    await Promise.all(promises);
    return results;
}
app.get('/api/c4c-creators', verifyToken, async (req: Request, res: Response) => {
    try {
        const url = `${C4C_BASE_URL}/ServiceRequestCollection?$select=CreatedBy&$top=2000&$orderby=CreationDateTime desc`;
        const resp = await axios.get(url, { headers: { 'Authorization': `Basic ${C4C_AUTH}` } });
        const items = resp.data.d.results;
        const creators = Array.from(new Set(items.map((item: { CreatedBy: string }) => item.CreatedBy))).sort();
        res.json(creators);
    } catch (err: unknown) {
        console.error('C4C Creators Error:', safeError(err));
        res.status(500).json({ error: "No se pudieron obtener los creadores de C4C." });
    }
});

// --- VALORIZACIONES ---
app.get('/api/valuations/:ruc', verifyToken, async (req: Request, res: Response) => {
    const { ruc } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (currentUser.casId) {
        if (!currentUser.casRUC) return res.status(403).json({ error: 'Usuario CAS sin empresa asignada' });
        if (currentUser.casRUC !== String(ruc).trim()) return res.status(403).json({ error: 'Acceso denegado' });
    }
    const { start, end } = req.query;

    console.log(`[VALUATION] Starting request - RUC: ${sanitizeLog(ruc)}, Range: ${sanitizeLog(start)} to ${sanitizeLog(end)}`);

    try {
        const db = await getReadPool();
        const request = db.request();
        addInput(request, 'ruc', sql.VarChar(20), ruc);
        addInput(request, 'start', sql.VarChar(30), `${start} 00:00:00`);
        addInput(request, 'end', sql.VarChar(30), `${end} 23:59:59`);

        const sqlResult = await request.query(`
            DECLARE @diasMax INT;
            SELECT @diasMax = CAST(Valor AS INT) FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CONFIG] WHERE Clave = 'DIAS_MAX_CIERRE';
            IF @diasMax IS NULL SET @diasMax = 1;

            SELECT 
                s.Ticket, s.CheckOut as Fecha, s.Servicio as ServicioNombre, 
                s.IdServicio as Servicio,
                s.CodigoExternoEquipo as CodigoEquipo,
                s.NombreEquipo as NombreEquipo,
                s.FechaVisita, s.CheckOut as FechaCierre,
                s.CodigoTecnico,
                s.IdCAS,
                s.Distrito,
                s.Ciudad as Departamento,
                s.NombreTecnico,
                s.ApellidoTecnico,
                s.ComentarioTecnico,
                DATEDIFF(day, s.FechaVisita, s.CheckOut) as DiasDiferencia,
                ISNULL(m.Categoria, 'N/A') as Categoria,
                CASE 
                    WHEN UPPER(TRIM(s.Servicio)) = 'VISITA' THEN 0
                    WHEN DATEDIFF(day, s.FechaVisita, s.CheckOut) > @diasMax THEN 0 
                    WHEN LEFT(s.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                    ELSE ISNULL(rate.Importe, 0) 
                END as TarifaBaseCalculada,
                CASE 
                    WHEN LEFT(s.CodigoExternoEquipo, 4) NOT IN ('3120', '3121', '5120', '5121') THEN 0
                    ELSE (
                        ISNULL((SELECT SUM(CAST(Importe AS FLOAT)) FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE Ticket = s.Ticket), 0) +
                        ISNULL((
                            SELECT SUM(Importe) 
                            FROM [dbo].[GAC_APP_TB_CONFIG_VALORIZACION_DISTRITO] cfg
                            WHERE cfg.Activo = 1
                              AND EXISTS (SELECT 1 FROM OPENJSON(cfg.CAS_Ids) WHERE value = s.IdCAS)
                              AND EXISTS (SELECT 1 FROM OPENJSON(cfg.Distritos) WHERE value = s.Distrito)
                              AND s.CheckOut >= cfg.Fecha_Inicio 
                              AND (cfg.Fecha_Fin IS NULL OR s.CheckOut <= cfg.Fecha_Fin)
                        ), 0)
                    )
                END as Adicionales
            FROM [APPGAC].[ServiciosViewSQL] s
            JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
            OUTER APPLY (
                SELECT TOP 1 Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = s.CodigoExternoEquipo
            ) m
            OUTER APPLY (
                SELECT TOP 1 CAST(Importe AS FLOAT) as Importe 
                FROM (
                    -- 1. Buscar en Excepciones
                    SELECT ex.Importe, ex.Prioridad, ex.Creado_El, 1 as Source
                    FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                    WHERE ex.Empresa = s.IdCAS
                      AND ex.Estado = 'A'
                      AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = ISNULL(m.Categoria, 'N/A')))
                      AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = s.IdServicio OR value = s.Servicio))
                      AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                      AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                    
                    UNION ALL
                    
                    -- 2. Tarifario Base
                    SELECT t.Importe, 0 as Prioridad, t.Fecha_inicio as Creado_El, 0 as Source
                    FROM [dbo].[GAC_APP_TB_TARIFARIO] t 
                    WHERE t.Empresa = s.IdCAS 
                      AND (t.Servicio = s.IdServicio OR t.Servicio = s.Servicio)
                      AND TRIM(t.Categoria) = TRIM(ISNULL(m.Categoria, 'N/A'))
                      AND s.CheckOut >= t.Fecha_inicio 
                      AND (t.Fecha_fin IS NULL OR s.CheckOut <= t.Fecha_fin)
                      AND t.Estado = 'A'
                ) all_rates
                ORDER BY Source DESC, Prioridad DESC, Creado_El DESC
            ) rate
            WHERE TRIM(cas.RUC) = TRIM(@ruc) 
              AND s.CheckOut BETWEEN @start AND @end
              AND s.Estado = 'Closed'
              AND s.VisitaRealizada = 'true'
              AND s.TrabajoRealizado = 'true'
              AND s.Ticket NOT IN (SELECT Ticket FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE Tipo = 'SERVICIO')
        `);

        interface SqlTicket { Ticket: string; TarifaBaseCalculada: number; FechaCierre: string; [key: string]: unknown; }
        let tickets: SqlTicket[] = sqlResult.recordset;
        console.log(`[VALUATION] SQL query returned ${tickets.length} tickets`);

        // Fetch Institutional Rules
        const rules = (await db.request().query("SELECT * FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL] WHERE Activo = 1")).recordset;

        if (tickets.length > 0) {
            // Siempre consultar C4C para obtener CupoArea y UsuarioCreador,
            // independientemente de si hay reglas institucionales activas.
            console.log(`[VALUATION] Fetching OData for ${tickets.length} tickets (Rules active: ${rules.length})`);
            const ticketIds = tickets.map(t => t.Ticket);
            const c4cDetails = await getC4CDetails(ticketIds);
            const detailCount = Object.keys(c4cDetails).length;
            console.log(`[VALUATION] OData results: ${detailCount}/${tickets.length} found`);

            tickets = tickets.map(t => {
                const details = c4cDetails[t.Ticket];
                let finalTarifaBase = t.TarifaBaseCalculada;
                let esInstitucional = false;

                if (rules.length > 0) {
                    const cupoArea = (details?.cupoArea || 'GENERAL').trim().toUpperCase();
                    const matchingRule = rules.find(r => {
                        const tDate = new Date(t.FechaCierre);
                        const rStart = new Date(r.Fecha_Inicio);
                        const rEnd = new Date(r.Fecha_Fin);
                        tDate.setHours(0, 0, 0, 0);
                        rStart.setHours(0, 0, 0, 0);
                        rEnd.setHours(23, 59, 59, 999);
                        const dateMatch = tDate >= rStart && tDate <= rEnd;
                        const areaMatch = r.Cupo_Area?.trim().toUpperCase() === cupoArea;
                        return dateMatch && areaMatch;
                    });

                    if (matchingRule) {
                        finalTarifaBase = matchingRule.Importe;
                        esInstitucional = true;
                    }
                }

                return {
                    ...t,
                    TarifaBase: finalTarifaBase,
                    UsuarioCreador: details?.creator || '',
                    C4CSubject: details?.subject || '',
                    EsInstitucional: esInstitucional,
                    CupoArea: details?.cupoArea || ''
                };
            });
        }

        res.json(tickets);
    } catch (err: unknown) {
        console.error('[VALUATION] Server Error:', safeError(err));
        res.status(500).json({ error: safeError(err) });
    }
});

app.get('/api/penalty-motives', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query('SELECT IdMotivo, Motivo FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] ORDER BY Motivo');
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.use(penaltiesRouter);

app.use(adicionalesRouter);

app.post('/api/valuations/batch-adjustment', verifyToken, async (req: Request, res: Response) => {
    const { tickets, targetAmount, motivo, ruc } = req.body;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (!assertCasRuc(currentUser, ruc, res)) return;

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar una lista de tickets." });
    }

    try {
        const db = await getWritePool();
        const pool = await getWritePool();
        
        // 1. Fetch TarifaBase for these tickets to calculate Delta
        // Replicating logic from /api/valuations/:ruc
        const request = pool.request();
        addInput(request, 'ruc', sql.VarChar(20), ruc);

        // Create parameter list for the IN clause
        const paramNames = tickets.map((_: string, i: number) => `@t${i}`);
        tickets.forEach((t: string, i: number) => addInput(request, `t${i}`, sql.VarChar(50), t));

        const query = `
            SELECT 
                s.Ticket,
                ISNULL(rate.Importe, 0) as TarifaBaseCalculada
            FROM [APPGAC].[ServiciosViewSQL] s
            JOIN [dbo].[GAC_APP_TB_CAS] cas ON s.IdCAS = cas.ID_CAS
            OUTER APPLY (
                SELECT TOP 1 Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = s.CodigoExternoEquipo
            ) m
            OUTER APPLY (
                SELECT TOP 1 CAST(Importe AS FLOAT) as Importe 
                FROM [dbo].[GAC_APP_TB_TARIFARIO] t 
                WHERE t.Empresa = cas.ID_CAS 
                  AND (t.Servicio = s.IdServicio OR t.Servicio = s.Servicio)
                  AND TRIM(t.Categoria) = TRIM(m.Categoria)
                  AND s.CheckOut >= t.Fecha_inicio 
                  AND (t.Fecha_fin IS NULL OR s.CheckOut <= t.Fecha_fin)
                ORDER BY t.Estado DESC, t.Fecha_inicio DESC
            ) rate
            WHERE TRIM(cas.RUC) = @ruc 
              AND s.Ticket IN (${paramNames.join(',')})
        `;

        const ratesResult = await request.query(query);
        const foundTickets = ratesResult.recordset;

        // Start transaction for updates
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            for (const item of foundTickets) {
                const ticket = item.Ticket;
                const base = item.TarifaBaseCalculada;
                const delta = targetAmount - base;
                const adjustmentId = crypto.randomBytes(4).toString('hex');

                // Delete existing adicionales for this ticket
                const delReq = transaction.request();
                addInput(delReq, 'ticket', sql.VarChar(50), ticket);
                await delReq.query("DELETE FROM [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL] WHERE Ticket = @ticket");

                // Insert new delta
                if (delta !== 0) {
                    const insReq = transaction.request();
                    addInput(insReq, 'id', sql.VarChar(8), adjustmentId);
                    addInput(insReq, 'ticket', sql.VarChar(50), ticket);
                    addInput(insReq, 'motivo', sql.NVarChar(200), motivo);
                    addInput(insReq, 'importe', sql.Decimal(10, 2), delta);
                    await insReq.query(`
                            INSERT INTO [dbo].[GAC_APP_TB_TICKETS_VALORIZACION_ADICIONAL]
                            (ID_valorizacion_adicional, Ticket, Motivo, Importe)
                            VALUES (@id, @ticket, @motivo, @importe)
                        `);
                }
            }

            await transaction.commit();
            await logAudit(req, 'BATCH_ADJUST', 'VALUATION', ruc, { 
                tickets_total: tickets.length, 
                processed: foundTickets.length,
                targetAmount, 
                motivo 
            });
            
            res.json({ 
                success: true, 
                processed: foundTickets.length, 
                ignored: tickets.length - foundTickets.length 
            });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err: unknown) {
        console.error("Batch Adjustment Error:", err);
        res.status(500).json({ error: safeError(err) });
    }
});

app.get('/api/discount-motivos', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query('SELECT * FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS_MOTIVOS] ORDER BY Motivo ASC');
        res.json(result.recordset);
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});

app.post('/api/valuations/batch-discount', verifyToken, async (req: Request, res: Response) => {
    const { tickets, motivo, descripcion, ruc } = req.body;
    const user = (req as AuthRequest).user!;
    const currentUser = user as JwtUserPayload;
    if (!assertCasRuc(currentUser, ruc, res)) return;

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
        return res.status(400).json({ error: "Debe proporcionar una lista de tickets." });
    }

    try {
        const db = await getWritePool();
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            for (const item of tickets) {
                const ticketId = item.id;
                const ticketAmount = item.amount;

                if (!ticketId || isNaN(ticketAmount)) continue;

                const penaltyId = crypto.randomBytes(4).toString('hex');
                const fecha = new Date().toISOString().split('T')[0];

                await transaction.request()
                    .input('id', sql.VarChar(255), penaltyId)
                    .input('ticket', sql.VarChar(255), ticketId)
                    .input('fecha', sql.Date, fecha)
                    .input('motivo', sql.VarChar(255), motivo)
                    .input('desc', sql.VarChar(255), descripcion)
                    .input('importe', sql.Decimal(10, 2), ticketAmount)
                    .input('user', sql.VarChar(255), user.username)
                    .query(`
                        INSERT INTO [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] 
                        (ID_Descuentos_CAS, Ticket, Fecha, Motivo, Descripcion, Importe, Creado_por, Creado_el, Estado)
                        VALUES (@id, @ticket, @fecha, @motivo, @desc, @importe, @user, GETDATE(), 'Pendiente')
                    `);
            }

            await transaction.commit();
            await logAudit(req, 'BATCH_DISCOUNT', 'VALUATION', ruc, { 
                tickets_total: tickets.length, 
                motivo 
            });
            
            res.json({ success: true, processed: tickets.length });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error("Error applying batch discount:", error);
        res.status(500).json({ message: "Error al aplicar el descuento masivo" });
    }
});




app.use(ticketsRouter);

app.post('/api/valuations/close', verifyToken, async (req: Request, res: Response) => {
    const {
        idCierre, // Si viene idCierre, es una actualización de un borrador
        ruc, nombreCas, start, end,
        totalServicios, totalPenalidades,
        subtotalServicios, subtotalPenalidades,
        totalFinal, cerradoPor,
        estado, // 'BORRADOR' o 'CERRADO'
        details
    } = req.body;

    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    if (!assertCasRuc(currentUser, ruc, res)) return;

    const finalEstado = estado || 'CERRADO';

    try {
        const db = await getWritePool();
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            let actualIdCierre = idCierre;
            let businessCode = '';

            if (!actualIdCierre) {
                // Fail-safe: Check if a draft already exists for this RUC and period to avoid duplicates
                const draftReq = new sql.Request(transaction);
                addInput(draftReq, 'ruc', sql.VarChar(20), ruc);
                addInput(draftReq, 'start', sql.VarChar(30), start);
                addInput(draftReq, 'end', sql.VarChar(30), end);
                const checkDraft = await draftReq.query("SELECT IdCierre, Codigo_Valorizacion FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE RUC = @ruc AND Fecha_Inicio = @start AND Fecha_Fin = @end AND Estado = 'BORRADOR'");
                
                if (checkDraft.recordset.length > 0) {
                    actualIdCierre = checkDraft.recordset[0].IdCierre;
                    businessCode = checkDraft.recordset[0].Codigo_Valorizacion;
                }
            }

            if (actualIdCierre) {
                // 1. Actualizar Cabecera
                const updHdrReq = new sql.Request(transaction);
                addInput(updHdrReq, 'id', sql.Int, actualIdCierre);
                addInput(updHdrReq, 'totalServicios', sql.Decimal(18, 2), totalServicios);
                addInput(updHdrReq, 'totalPenalidades', sql.Decimal(18, 2), totalPenalidades);
                addInput(updHdrReq, 'subtotalServicios', sql.Decimal(18, 2), subtotalServicios);
                addInput(updHdrReq, 'subtotalPenalidades', sql.Decimal(18, 2), subtotalPenalidades);
                addInput(updHdrReq, 'totalFinal', sql.Decimal(18, 2), totalFinal);
                addInput(updHdrReq, 'estado', sql.VarChar(20), finalEstado);
                addInput(updHdrReq, 'user', sql.NVarChar(255), cerradoPor);
                await updHdrReq.query(`
                        UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES]
                        SET Total_Servicios = @totalServicios,
                            Total_Penalidades = @totalPenalidades,
                            Subtotal_Servicios = @subtotalServicios,
                            Subtotal_Penalidades = @subtotalPenalidades,
                            Total_Final = @totalFinal,
                            Estado = @estado,
                            Cerrado_Por = @user,
                            Cerrado_El = GETDATE()
                        WHERE IdCierre = @id
                    `);

                if (!businessCode) {
                    const codeReq = new sql.Request(transaction);
                    addInput(codeReq, 'id', sql.Int, actualIdCierre);
                    const codeResult = await codeReq.query("SELECT Codigo_Valorizacion FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
                    businessCode = codeResult.recordset[0]?.Codigo_Valorizacion;
                }

                // 2. Limpiar detalles antiguos
                const delDetReq = new sql.Request(transaction);
                addInput(delDetReq, 'id', sql.Int, actualIdCierre);
                await delDetReq.query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE IdCierre = @id");

            } else {
                // 1. Insertar Cabecera Nueva
                const insHdrReq = new sql.Request(transaction);
                addInput(insHdrReq, 'ruc', sql.VarChar(20), ruc);
                addInput(insHdrReq, 'nombreCas', sql.NVarChar(255), nombreCas);
                addInput(insHdrReq, 'start', sql.VarChar(30), start);
                addInput(insHdrReq, 'end', sql.VarChar(30), end);
                addInput(insHdrReq, 'totalServicios', sql.Decimal(18, 2), totalServicios);
                addInput(insHdrReq, 'totalPenalidades', sql.Decimal(18, 2), totalPenalidades);
                addInput(insHdrReq, 'subtotalServicios', sql.Decimal(18, 2), subtotalServicios);
                addInput(insHdrReq, 'subtotalPenalidades', sql.Decimal(18, 2), subtotalPenalidades);
                addInput(insHdrReq, 'totalFinal', sql.Decimal(18, 2), totalFinal);
                addInput(insHdrReq, 'cerradoPor', sql.NVarChar(255), cerradoPor);
                addInput(insHdrReq, 'estado', sql.VarChar(20), finalEstado);
                const result = await insHdrReq.query(`
                        INSERT INTO [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES]
                        (RUC, Nombre_CAS, Fecha_Inicio, Fecha_Fin, Total_Servicios, Total_Penalidades, Subtotal_Servicios, Subtotal_Penalidades, Total_Final, Cerrado_Por, Cerrado_El, Estado)
                        VALUES (@ruc, @nombreCas, @start, @end, @totalServicios, @totalPenalidades, @subtotalServicios, @subtotalPenalidades, @totalFinal, @cerradoPor, GETDATE(), @estado)
                        SELECT SCOPE_IDENTITY() as IdCierre
                    `);

                actualIdCierre = result.recordset[0].IdCierre;
                const year = new Date().getFullYear();
                businessCode = `VAL-${year}-${actualIdCierre.toString().padStart(5, '0')}`;

                // 1.1 Actualizar con el código de negocio
                const codeUpdReq = new sql.Request(transaction);
                addInput(codeUpdReq, 'id', sql.Int, actualIdCierre);
                addInput(codeUpdReq, 'code', sql.VarChar(50), businessCode);
                await codeUpdReq.query("UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] SET Codigo_Valorizacion = @code WHERE IdCierre = @id");
            }

            // 2. Insertar Detalles (Nuevos o Actualizados)
            if (details && Array.isArray(details) && details.length > 0) {
                const table = new sql.Table('[dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE]');
                table.create = false;
                table.columns.add('IdCierre', sql.Int, { nullable: false });
                table.columns.add('Ticket', sql.VarChar(50), { nullable: true });
                table.columns.add('Monto', sql.Decimal(18, 2), { nullable: true });
                table.columns.add('Fecha_Ticket', sql.DateTime, { nullable: true });
                table.columns.add('Tipo', sql.VarChar(20), { nullable: true });
                table.columns.add('Servicio_Nombre', sql.VarChar(255), { nullable: true });
                table.columns.add('Categoria', sql.VarChar(100), { nullable: true });
                table.columns.add('Fecha_Visita', sql.DateTime, { nullable: true });
                table.columns.add('Fecha_Cierre', sql.DateTime, { nullable: true });
                table.columns.add('Dias_Diferencia', sql.Int, { nullable: true });
                table.columns.add('Codigo_Externo', sql.VarChar(100), { nullable: true });
                table.columns.add('Tarifa_Base', sql.Decimal(18, 2), { nullable: true });
                table.columns.add('Adicionales', sql.Decimal(18, 2), { nullable: true });
                table.columns.add('ID_Referencia', sql.VarChar(50), { nullable: true });
                table.columns.add('Distrito', sql.VarChar(100), { nullable: true });
                table.columns.add('Departamento', sql.VarChar(100), { nullable: true });
                table.columns.add('Nombre_Equipo', sql.NVarChar(255), { nullable: true });

                for (const item of details) {
                    table.rows.add(
                        actualIdCierre,
                        item.ticket,
                        item.monto,
                        item.fecha ? new Date(item.fecha) : null,
                        item.tipo,
                        item.servicio,
                        item.categoria,
                        item.fechaVisita ? new Date(item.fechaVisita) : null,
                        item.fechaCierre ? new Date(item.fechaCierre) : null,
                        item.diasDiferencia,
                        item.codigoExterno,
                        item.tarifaBase,
                        item.adicionales,
                        item.idReferencia ? item.idReferencia.toString() : null,
                        item.distrito,
                        item.departamento,
                        item.nombreEquipo
                    );
                }

                const request = new sql.Request(transaction);
                await request.bulk(table);
            }

            await transaction.commit();

            res.json({ 
                success: true, 
                message: finalEstado === 'BORRADOR' ? "Borrador guardado correctamente." : "Quincena cerrada correctamente.", 
                idCierre: actualIdCierre, 
                codigo: businessCode 
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: unknown) { 
        console.error("Error en operación de valorización:", err);
        res.status(500).json({ error: safeError(err) }); 
    }
});

app.post('/api/valuations/finalize/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getWritePool();

        // Verificar ownership para usuarios CAS
        if (currentUser.casId) {
            const closureResult = await db.request()
                .input('id', sql.Int, Number(id))
                .query("SELECT RUC FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            const closure = closureResult.recordset[0];
            if (!closure) return res.status(404).json({ error: 'Cierre no encontrado' });
            if (String(closure.RUC || '').trim() !== String(currentUser.casRUC || '').trim()) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
        }

        await db.request()
            .input('id', sql.Int, Number(id))
            .query("UPDATE [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] SET Estado = 'CERRADO', Cerrado_El = GETDATE() WHERE IdCierre = @id");

        await logAudit(req, 'FINALIZE_DRAFT', 'VALUATION', id as string, { status: 'CERRADO' });
        res.json({ success: true, message: "Valorización cerrada correctamente." });
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});


app.post('/api/valuations/reopen/:id', verifyToken, verifyPermission('val.reopen'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getWritePool();

        // Verificar ownership para usuarios CAS antes de abrir la transacción
        if (currentUser.casId) {
            const ownerCheck = await db.request()
                .input('id', sql.Int, Number(id))
                .query("SELECT RUC FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            const closure = ownerCheck.recordset[0];
            if (!closure) return res.status(404).json({ error: 'Cierre no encontrado' });
            if (String(closure.RUC || '').trim() !== String(currentUser.casRUC || '').trim()) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
        }

        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            const infoReq = new sql.Request(transaction);
            addInput(infoReq, 'id', sql.Int, Number(id));

            // Get closure info for audit
            const closureInfo = await infoReq.query("SELECT Codigo_Valorizacion, RUC, Total_Final FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            if (closureInfo.recordset.length === 0) {
                return res.status(404).json({ error: 'Cierre no encontrado' });
            }

            // 1. Delete details
            const delDetReq2 = new sql.Request(transaction);
            addInput(delDetReq2, 'id', sql.Int, Number(id));
            await delDetReq2.query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] WHERE IdCierre = @id");

            // 2. Delete header
            const delHdrReq = new sql.Request(transaction);
            addInput(delHdrReq, 'id', sql.Int, Number(id));
            await delHdrReq.query("DELETE FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");

            await transaction.commit();
            
            const info = closureInfo.recordset[0];
            await logAudit(req, 'REOPEN_FORTNIGHT', 'VALUATION', info.Codigo_Valorizacion, { id, ruc: info.RUC, total: info.Total_Final });

            res.json({ success: true, message: "Quincena reaperturada correctamente. Los tickets vuelven a estar disponibles." });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: unknown) {
        console.error("Error reopening valuation:", err);
        res.status(500).json({ error: safeError(err) });
    }
});

app.post('/api/valuations/send-email', verifyToken, async (req: Request, res: Response) => {
    const { to, subject, body, attachmentName, attachmentBase64 } = req.body;
    try {
        const token = await getGraphToken();
        const url = `https://graph.microsoft.com/v1.0/users/${MS_GRAPH_SENDER_EMAIL}/sendMail`;
        
        const recipients = to.split(/[,;]/).filter((email: string) => email.trim() !== "").map((email: string) => ({
            emailAddress: { address: email.trim() }
        }));

        const emailData = {
            message: {
                subject: subject,
                body: {
                    contentType: 'HTML',
                    content: body
                },
                toRecipients: recipients,
                attachments: attachmentBase64 ? [
                    {
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        name: attachmentName || "Valorizacion.xlsx",
                        contentBytes: attachmentBase64
                    }
                ] : []
            }
        };

        await axios.post(url, emailData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        await logAudit(req, 'EMAIL_SENT', 'VALUATION', attachmentName, { recipients: to });
        res.json({ success: true, message: 'Email enviado correctamente' });
    } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
        console.error('Error enviando email:', axiosErr.response?.data || (safeError(err)));
        res.status(500).json({ error: safeError(err) });
    }
});


app.get('/api/closures', verifyToken, async (req: Request, res: Response) => {
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

app.get('/api/valuations/details/:id', verifyToken, async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as AuthRequest).user as JwtUserPayload;
    try {
        const db = await getReadPool();

        // Verificar ownership del cierre para usuarios CAS
        if (currentUser.casId) {
            const closureCheck = await db.request()
                .input('id', sql.Int, Number(id))
                .query("SELECT RUC FROM [dbo].[GAC_APP_TB_VALORIZACIONES_CIERRES] WHERE IdCierre = @id");
            const closure = closureCheck.recordset[0];
            if (!closure) return res.status(404).json({ error: 'No encontrado' });
            if (String(closure.RUC || '').trim() !== String(currentUser.casRUC || '').trim()) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
        }

        const result = await db.request()
            .input('id', sql.Int, Number(id))
            .query(`
                SELECT
                    d.IdDetalle,
                    d.Ticket,
                    d.Tipo,
                    d.Servicio_Nombre,
                    d.Categoria,
                    d.Monto,
                    d.Fecha_Ticket,
                    d.Fecha_Visita,
                    d.Fecha_Cierre,
                    d.Dias_Diferencia,
                    d.Codigo_Externo,
                    d.Tarifa_Base,
                    d.Adicionales,
                    d.ID_Referencia,
                    d.Distrito,
                    d.Departamento,
                    d.Nombre_Equipo
                FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] d
                WHERE d.IdCierre = @id
            `);
        res.json({ tickets: result.recordset });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});


app.get('/api/tarifarios/:casId', verifyToken, async (req: Request, res: Response) => {
    const { casId } = req.params;
    const currentUser = (req as AuthRequest).user!;
    if (currentUser.casId !== null && currentUser.casId !== casId) {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }
    try {
        const db = await getReadPool();
        const tarListReq = db.request();
        addInput(tarListReq, 'casId', sql.VarChar(50), casId);
        const result = await tarListReq.query(`
                SELECT
                    t.ID_Tarifario as Id,
                    t.Categoria,
                    COALESCE(s.Id, t.Servicio) as ServicioCode,
                    COALESCE(s.Descripcion, t.Servicio) as ServicioNombre,
                    t.Fecha_inicio,
                    t.Fecha_fin,
                    t.Importe,
                    t.Estado
                FROM [dbo].[GAC_APP_TB_TARIFARIO] t
                LEFT JOIN [SIATC].[FSM_TipoServicio] s ON (t.Servicio = s.Id OR t.Servicio = s.Descripcion)
                WHERE t.Empresa = @casId
                ORDER BY t.Categoria, t.Servicio, t.Fecha_inicio DESC
            `);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.post('/api/tarifarios/create', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { empresa, categoria, servicio, importe, fecha_inicio, fecha_fin, estado } = req.body;
    const currentUser = (req as AuthRequest).user!;
    try {
        const db = await getWritePool();
        const newId = crypto.randomBytes(4).toString('hex');
        const tarCrearReq = db.request();
        addInput(tarCrearReq, 'id', sql.VarChar(8), newId);
        addInput(tarCrearReq, 'empresa', sql.VarChar(50), empresa);
        addInput(tarCrearReq, 'categoria', sql.NVarChar(100), categoria);
        addInput(tarCrearReq, 'servicio', sql.NVarChar(100), servicio);
        addInput(tarCrearReq, 'importe', sql.Decimal(18, 2), importe);
        addInput(tarCrearReq, 'fecha_inicio', sql.DateTime, fecha_inicio);
        addInput(tarCrearReq, 'fecha_fin', sql.DateTime, fecha_fin || null);
        addInput(tarCrearReq, 'estado', sql.VarChar(1), estado || 'A');
        addInput(tarCrearReq, 'creadoPor', sql.VarChar(100), currentUser.username);
        await tarCrearReq.query(`
                INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (
                    ID_Tarifario, Empresa, Categoria, Servicio,
                    Fecha_inicio, Fecha_fin, Importe, Estado,
                    Creado_El, Creado_Por
                ) VALUES (
                    @id, @empresa, @categoria, @servicio,
                    @fecha_inicio, @fecha_fin, @importe, @estado,
                    GETDATE(), @creadoPor
                )
            `);
        res.json({ success: true, id: newId });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.use(materialsRouter);

app.post('/api/tarifarios/update', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { id, importe, estado } = req.body;
    const currentUser = (req as AuthRequest).user!;
    try {
        const db = await getWritePool();
        const tarUpdReq = db.request();
        addInput(tarUpdReq, 'id', sql.VarChar(8), id);
        addInput(tarUpdReq, 'importe', sql.Decimal(18, 2), importe);
        addInput(tarUpdReq, 'estado', sql.VarChar(1), estado);
        addInput(tarUpdReq, 'modificadoPor', sql.VarChar(100), currentUser.username);
        await tarUpdReq.query(`
                UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                SET Importe = @importe, Estado = @estado, Modificado_El = GETDATE(), Modificado_Por = @modificadoPor
                WHERE ID_Tarifario = @id
            `);
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.post('/api/tarifarios/batch', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { casId, rates } = req.body;
    const currentUser = (req as AuthRequest).user!;
    try {
        const db = await getWritePool();
        const transaction = new sql.Transaction(db);
        await transaction.begin();

        try {
            for (const rate of rates) {
                const batchReq = transaction.request();
                const id = rate.ID_TARIFARIO || crypto.randomBytes(4).toString('hex');
                addInput(batchReq, 'id', sql.VarChar(8), id);
                addInput(batchReq, 'casId', sql.VarChar(50), casId);
                addInput(batchReq, 'cat', sql.NVarChar(100), rate.Categoria);
                addInput(batchReq, 'serv', sql.NVarChar(100), rate.Servicio);
                addInput(batchReq, 'imp', sql.Decimal(18, 2), rate.Importe);
                addInput(batchReq, 'f_ini', sql.DateTime, rate.Fecha_inicio ? new Date(rate.Fecha_inicio) : new Date());
                addInput(batchReq, 'f_fin', sql.DateTime, rate.Fecha_fin ? new Date(rate.Fecha_fin) : null);
                addInput(batchReq, 'est', sql.VarChar(1), rate.Estado || 'A');
                addInput(batchReq, 'user', sql.VarChar(100), currentUser.username);
                await batchReq.query(`
                        IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO] WHERE ID_Tarifario = @id)
                        BEGIN
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Importe = @imp, Categoria = @cat, Servicio = @serv,
                                Fecha_inicio = @f_ini, Fecha_fin = @f_fin, Estado = @est,
                                Modificado_El = GETDATE(), Modificado_Por = @user
                            WHERE ID_Tarifario = @id
                        END
                        ELSE
                        BEGIN
                            INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO] (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Fecha_fin, Estado, Creado_El, Creado_Por)
                            VALUES (@id, @casId, @cat, @serv, @imp, @f_ini, @f_fin, @est, GETDATE(), @user)
                        END
                    `);
            }
            
            await transaction.commit();
            res.json({ success: true });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

// --- TARIFARIO EXCEPCIONES ---
app.get('/api/tarifarios/exceptions/:casId', verifyToken, async (req: Request, res: Response) => {
    const { casId } = req.params;
    try {
        const db = await getReadPool();
        const excReq = db.request();
        addInput(excReq, 'casId', sql.VarChar(50), casId);
        const result = await excReq.query("SELECT * FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE Empresa = @casId AND Estado = 'A' ORDER BY Prioridad DESC, Creado_El DESC");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.post('/api/tarifarios/exceptions/save', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { id, empresa, nombre, zonasIncluidas, zonasExcluidas, categorias, servicios, importe, prioridad, estado } = req.body;
    try {
        const db = await getWritePool();
        const finalId = id || crypto.randomBytes(4).toString('hex');

        const excSaveReq = db.request();
        addInput(excSaveReq, 'id', sql.VarChar(8), finalId);
        addInput(excSaveReq, 'empresa', sql.VarChar(50), empresa);
        addInput(excSaveReq, 'nombre', sql.NVarChar(255), nombre);
        addInput(excSaveReq, 'zi', sql.NVarChar(sql.MAX), JSON.stringify(zonasIncluidas || null));
        addInput(excSaveReq, 'ze', sql.NVarChar(sql.MAX), JSON.stringify(zonasExcluidas || null));
        addInput(excSaveReq, 'cat', sql.NVarChar(sql.MAX), JSON.stringify(categorias || null));
        addInput(excSaveReq, 'serv', sql.NVarChar(sql.MAX), JSON.stringify(servicios || null));
        addInput(excSaveReq, 'imp', sql.Decimal(18, 2), importe);
        addInput(excSaveReq, 'prio', sql.Int, prioridad || 0);
        addInput(excSaveReq, 'est', sql.VarChar(1), estado || 'A');
        await excSaveReq.query(`
                IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE IdExcepcion = @id)
                BEGIN
                    UPDATE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES]
                    SET Nombre = @nombre, Zonas_Incluidas = @zi, Zonas_Excluidas = @ze, 
                        Categorias = @cat, Servicios = @serv, Importe = @imp, 
                        Prioridad = @prio, Estado = @est
                    WHERE IdExcepcion = @id
                END
                ELSE
                BEGIN
                    INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] 
                    (IdExcepcion, Empresa, Nombre, Zonas_Incluidas, Zonas_Excluidas, Categorias, Servicios, Importe, Prioridad, Estado)
                    VALUES (@id, @empresa, @nombre, @zi, @ze, @cat, @serv, @imp, @prio, @est)
                END
            `);
        res.json({ success: true, id: finalId });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.delete('/api/tarifarios/exceptions/:id', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const db = await getWritePool();
        const excDelReq = db.request();
        addInput(excDelReq, 'id', sql.VarChar(8), id);
        await excDelReq.query("UPDATE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] SET Estado = 'I' WHERE IdExcepcion = @id");
        res.json({ success: true });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

// --- TARIFARIO IMPORT ---
interface TarifarioImportRow {
    CAS_Nombre: string;
    Categoria: string;
    Servicio: string;
    Fecha_inicio: string;
    Fecha_fin: string;
    Importe: string;
    Estado?: string;
    CAS_ID?: number;
    Status?: string;
    Message?: string;
    Importe_Actual?: number | null;
    ID_Tarifario?: string;
}

// Construye una sola vez el mapa Descripcion(mayus/trim) -> Id de FSM_TipoServicio,
// para resolver códigos de servicio en memoria en vez de 1 query SQL por fila.
async function buildServicioCodigoResolver(db: sql.ConnectionPool): Promise<(servicio: string) => string> {
    const result = await db.request().query("SELECT Id, Descripcion FROM [SIATC].[FSM_TipoServicio]");
    const map = new Map<string, string>();
    result.recordset.forEach((r: { Id: string; Descripcion: string }) => map.set((r.Descripcion || '').trim().toUpperCase(), r.Id));
    return (servicio: string) => {
        const trimmed = (servicio || '').trim();
        if (/^CA_\d+$/i.test(trimmed)) return trimmed;
        return map.get(trimmed.toUpperCase()) || trimmed;
    };
}

app.post('/api/tarifarios/import/preview', verifyToken, async (req: Request, res: Response) => {
    const { rows } = req.body as { rows: TarifarioImportRow[] };
    try {
        const db = await getWritePool();
        const casResult = await db.request().query("SELECT ID_CAS, Nombre_CAS FROM [dbo].[GAC_APP_TB_CAS]");
        const casMap = new Map<string, number>();
        casResult.recordset.forEach((c: { Nombre_CAS: string; ID_CAS: number }) => casMap.set(c.Nombre_CAS.toUpperCase().trim(), c.ID_CAS));

        const resolveServicio = await buildServicioCodigoResolver(db);

        // Todas las tarifas activas en una sola consulta, para lookup en memoria
        // en vez de 1 query SQL por fila (evita N+1 con archivos grandes).
        const existingResult = await db.request().query(`
            SELECT ID_Tarifario, Empresa, Categoria, Servicio, CAST(Importe AS FLOAT) as Importe
            FROM [dbo].[GAC_APP_TB_TARIFARIO]
            WHERE Estado = 'A'
        `);
        const existingMap = new Map<string, { ID_Tarifario: string; Importe: number }>();
        existingResult.recordset.forEach((r: { ID_Tarifario: string; Empresa: number; Categoria: string; Servicio: string; Importe: number }) => {
            const key = `${r.Empresa}|${(r.Categoria || '').trim()}|${(r.Servicio || '').trim()}`;
            existingMap.set(key, { ID_Tarifario: r.ID_Tarifario, Importe: r.Importe });
        });

        const preview: TarifarioImportRow[] = [];
        for (const row of rows) {
            const casName = (row.CAS_Nombre || '').trim().toUpperCase();
            const casId = casMap.get(casName);
            if (!casId) {
                preview.push({ ...row, Status: 'ERROR', Message: `CAS "${row.CAS_Nombre}" no encontrado en la BD` });
                continue;
            }
            const fi = new Date(row.Fecha_inicio);
            if (isNaN(fi.getTime())) {
                preview.push({ ...row, CAS_ID: casId, Status: 'ERROR', Message: `Fecha_inicio inválida: "${row.Fecha_inicio}"` });
                continue;
            }
            const importe = parseFloat(row.Importe);
            if (isNaN(importe)) {
                preview.push({ ...row, CAS_ID: casId, Status: 'ERROR', Message: `Importe inválido: "${row.Importe}"` });
                continue;
            }
            const servicioCodigo = resolveServicio(row.Servicio);
            const key = `${casId}|${(row.Categoria || '').trim()}|${servicioCodigo.trim()}`;
            const cur = existingMap.get(key);
            if (!cur) {
                preview.push({ ...row, CAS_ID: casId, Status: 'INSERT', Message: 'Nueva tarifa', Importe_Actual: null });
            } else if (Math.abs(cur.Importe - importe) < 0.001) {
                preview.push({ ...row, CAS_ID: casId, Status: 'OK', Message: 'Sin cambios', Importe_Actual: cur.Importe, ID_Tarifario: cur.ID_Tarifario });
            } else {
                preview.push({ ...row, CAS_ID: casId, Status: 'UPDATE', Message: `${cur.Importe} → ${importe}`, Importe_Actual: cur.Importe, ID_Tarifario: cur.ID_Tarifario });
            }
        }
        res.json({ preview });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.post('/api/tarifarios/import/confirm', verifyToken, async (req: Request, res: Response) => {
    const { rows } = req.body as { rows: TarifarioImportRow[] };
    const currentUser = (req as AuthRequest).user!;
    try {
        const db = await getWritePool();
        const resolveServicio = await buildServicioCodigoResolver(db);
        const transaction = new sql.Transaction(db);
        await transaction.begin();
        let inserted = 0, updated = 0;
        try {
            for (const row of rows) {
                const cat = row.Categoria.trim();
                const serv = resolveServicio(row.Servicio);
                const casId = row.CAS_ID;

                if (row.Status === 'INSERT') {
                    // Inactivar registros anteriores con la misma combinación (Empresa + Categoria + Servicio)
                    if (casId != null) {
                        const deacReq = new sql.Request(transaction);
                        addInput(deacReq, 'casId', sql.VarChar(50), String(casId));
                        addInput(deacReq, 'cat', sql.VarChar(100), cat);
                        addInput(deacReq, 'serv', sql.VarChar(100), serv);
                        await deacReq.query(`
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Estado = 'I'
                            WHERE Empresa = @casId
                              AND TRIM(Categoria) = TRIM(@cat)
                              AND TRIM(Servicio) = TRIM(@serv)
                              AND Estado = 'A'
                        `);
                    }
                    const newId = crypto.randomBytes(4).toString('hex');
                    await new sql.Request(transaction)
                        .input('id', sql.VarChar(8), newId)
                        .input('casId', sql.VarChar(50), row.CAS_ID)
                        .input('cat', sql.VarChar(100), cat)
                        .input('serv', sql.VarChar(100), serv)
                        .input('imp', sql.Decimal(18, 2), parseFloat(row.Importe))
                        .input('fi', sql.Date, new Date(row.Fecha_inicio))
                        .input('ff', sql.Date, row.Fecha_fin ? new Date(row.Fecha_fin) : null)
                        .input('est', sql.VarChar(10), row.Estado || 'A')
                        .input('user', sql.VarChar(100), currentUser.username)
                        .query(`
                            INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO]
                            (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Fecha_fin, Estado, Creado_El, Creado_Por)
                            VALUES (@id, @casId, @cat, @serv, @imp, @fi, @ff, @est, GETDATE(), @user)
                        `);
                    inserted++;
                } else if (row.Status === 'UPDATE') {
                    // Inactivar otros registros activos con la misma combinación (no el que se va a actualizar)
                    if (casId != null && row.ID_Tarifario) {
                        const deacReq = new sql.Request(transaction);
                        addInput(deacReq, 'casId', sql.VarChar(50), String(casId));
                        addInput(deacReq, 'cat', sql.VarChar(100), cat);
                        addInput(deacReq, 'serv', sql.VarChar(100), serv);
                        addInput(deacReq, 'id', sql.VarChar(8), row.ID_Tarifario);
                        await deacReq.query(`
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Estado = 'I'
                            WHERE Empresa = @casId
                              AND TRIM(Categoria) = TRIM(@cat)
                              AND TRIM(Servicio) = TRIM(@serv)
                              AND Estado = 'A'
                              AND ID_Tarifario != @id
                        `);
                    }
                    await new sql.Request(transaction)
                        .input('id', sql.VarChar(8), row.ID_Tarifario)
                        .input('imp', sql.Decimal(18, 2), parseFloat(row.Importe))
                        .input('ff', sql.Date, row.Fecha_fin ? new Date(row.Fecha_fin) : null)
                        .input('est', sql.VarChar(10), row.Estado || 'A')
                        .input('user', sql.VarChar(100), currentUser.username)
                        .query(`
                            UPDATE [dbo].[GAC_APP_TB_TARIFARIO]
                            SET Importe = @imp, Fecha_fin = @ff, Estado = @est,
                                Modificado_El = GETDATE(), Modificado_Por = @user
                            WHERE ID_Tarifario = @id
                        `);
                    updated++;
                }
            }
            await transaction.commit();
            res.json({ success: true, inserted, updated });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

app.use(dashboardRouter);

app.use(c4cRouter);

// --- CONFIG & MANAGEMENT (Standardized) ---

// MANAGEMENTS
app.get('/api/managements', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query('SELECT Id as id, Name as name, Code as code FROM EBM.Managements');
        res.json(result.recordset);
    } catch (err: unknown) {
        res.status(500).json({ error: safeError(err) });
    }
});

// PREFERENCES
app.get('/api/config/preferences', verifyToken, (req: Request, res: Response) => {
    res.json({});
});

app.post('/api/config/preferences', verifyToken, (req: Request, res: Response) => {
    res.json({ success: true });
});

app.use(usersRouter);

app.use(profileRouter);


app.use(rolesRouter);


// AUDIT LOGS: solo servia a la pagina local AuditLogPage.tsx (eliminada) -- la escritura de
// auditoria sigue viva via logAudit(), sin relacion con este endpoint de lectura.

app.get('/api/diagnose/redis', async (req: Request, res: Response) => {
    try {
        const secret = req.query.secret;
        if (secret !== 'redis_debug_2026') {
            return res.status(403).json({ error: 'Access denied' });
        }
        const host = process.env.REDIS_HOST || 'localhost';
        const port = process.env.REDIS_PORT || '6379';
        const username = process.env.REDIS_USERNAME || 'not set';
        const password = process.env.REDIS_PASSWORD || '';
        
        const mask = (str: string) => {
            if (!str) return 'empty/not set';
            if (str.length <= 4) return '*'.repeat(str.length);
            return str.substring(0, 2) + '*'.repeat(str.length - 4) + str.substring(str.length - 2);
        };

        const logs: string[] = [];
        logs.push(`Host: ${host}`);
        logs.push(`Port: ${port}`);
        logs.push(`Username: ${username}`);
        logs.push(`Password (Masked): ${mask(password)} (Length: ${password.length})`);
        
        logs.push('Attempting test connection to Redis...');
        const testClient = new Redis({
            host: host,
            port: parseInt(port),
            username: process.env.REDIS_USERNAME,
            password: process.env.REDIS_PASSWORD,
            lazyConnect: true,
            connectTimeout: 5000,
        });

        try {
            await testClient.connect();
            logs.push('Test connection status: CONNECTED');
            const pingRes = await testClient.ping();
            logs.push(`Ping response: ${pingRes}`);
            await testClient.disconnect();
        } catch (connErr: unknown) {
            const msg = connErr instanceof Error ? connErr.message : String(connErr);
            const stack = connErr instanceof Error ? connErr.stack : '';
            logs.push(`Connection failed: ${msg}`);
            if (stack) {
                logs.push(`Stack: ${stack}`);
            }
        }

        res.json({ success: true, logs });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : '';
        res.status(500).json({ error: msg, stack: stack });
    }
});

// --- SERVE STATIC FILES (PROD) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '..', 'dist')));

interface AppMeta { label: string; logoUrl: string; url: string; }
let appMeta: AppMeta | null = null;

async function fetchAppMeta(): Promise<void> {
    try {
        const db = await getReadPool();
        const code = process.env.APP_CODE || APP_IDENTIFIER;
        const metaReq = db.request();
        addInput(metaReq, 'code', sql.NVarChar(20), code);
        const result = await metaReq.query(`SELECT Label, LogoUrl, Url FROM [dbo].[GAC_APP_TB_CONSOLE_APPLICATIONS] WHERE UPPER(Code) = UPPER(@code)`);
        if (result.recordset.length > 0) {
            const row = result.recordset[0];
            appMeta = { label: row.Label, logoUrl: row.LogoUrl, url: row.Url };
            console.log(`[AppConfig] Loaded meta for ${code}: ${appMeta.label}`);
        }
    } catch (err: unknown) {
        console.warn('[AppConfig] Could not fetch app meta from DB:', safeError(err));
    }
}

interface SessionConfig { rateLimitMaxAttempts: number; rateLimitWindowMinutes: number; }

async function fetchSessionConfig(): Promise<SessionConfig> {
    try {
        const db = await getReadPool();
        const r = db.request();
        addInput(r, 'code', sql.VarChar(20), APP_IDENTIFIER);
        const result = await r.query('SELECT RateLimitMaxAttempts, RateLimitWindowMinutes FROM EBM.AppSessionConfig WHERE UPPER(AppCode) = UPPER(@code)');
        if (result.recordset.length > 0) {
            const row = result.recordset[0];
            return { rateLimitMaxAttempts: row.RateLimitMaxAttempts, rateLimitWindowMinutes: row.RateLimitWindowMinutes };
        }
    } catch (err: unknown) {
        console.warn('[SessionConfig] Could not fetch from DB, using defaults:', safeError(err));
    }
    return { rateLimitMaxAttempts: 10, rateLimitWindowMinutes: 15 };
}

// SPA Fallback: Serve index.html for any remaining routes
app.use((req: Request, res: Response) => {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    try {
        let html = fs.readFileSync(indexPath, 'utf-8');
        if (appMeta) {
            const ogTags = [
                `<meta property="og:type" content="website" />`,
                `<meta property="og:title" content="${appMeta.label} - SIATC" />`,
                `<meta property="og:description" content="${appMeta.label} - Plataforma de gestión SIATC." />`,
                `<meta property="og:image" content="${appMeta.logoUrl}" />`,
                `<meta property="og:url" content="${appMeta.url}" />`,
                `<meta name="twitter:card" content="summary_large_image" />`,
                `<meta name="twitter:title" content="${appMeta.label} - SIATC" />`,
                `<meta name="twitter:image" content="${appMeta.logoUrl}" />`,
                `<link rel="icon" type="image/png" href="${appMeta.logoUrl}" />`,
            ].join('\n    ');
            html = html.replace(/<meta property="og:[^"]+"[^>]*\/>/g, '');
            html = html.replace(/<link rel="icon"[^>]*\/>/g, '');
            html = html.replace('<title>', `${ogTags}\n  <title>`);
        }
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch {
        res.sendFile(indexPath);
    }
});

if (!process.env.JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET environment variable is missing. Server will not start.');
    process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !(process.env.ALLOWED_ORIGINS || '').trim()) {
    console.warn('⚠️  WARNING: ALLOWED_ORIGINS is not set. CORS will block all cross-origin requests in production.');
}

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[ERROR] ${sanitizeLog(req.method)} ${sanitizeLog(req.path)}:`, err);
    res.status(500).json({ error: safeError(err) });
});

app.listen(port, () => {
    console.log(`Server Valorizaciones running on http://localhost:${port}`);
    // Etapa 6 -- dispara runMigrations() via el pool admin al arrancar, independientemente
    // de que los endpoints de negocio ahora usen getReadPool()/getWritePool().
    getDb().catch(err => console.error('❌ Error ejecutando migraciones al arrancar:', safeError(err)));
    fetchAppMeta();
    fetchSessionConfig().then(cfg => {
        authLimiter = rateLimit({
            windowMs: cfg.rateLimitWindowMinutes * 60 * 1000,
            max: cfg.rateLimitMaxAttempts,
            skipSuccessfulRequests: true,
            keyGenerator: authKeyGenerator,
            message: { error: `Too many login attempts, please try again after ${cfg.rateLimitWindowMinutes} minutes.` },
            store: new RedisStore({ sendCommand: (...args: string[]) => (getRedisClient() as any).call(...args) as any, prefix: 'rl:val:auth:' }), // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        console.log(`[SessionConfig] Auth limiter: ${cfg.rateLimitMaxAttempts} intentos / ${cfg.rateLimitWindowMinutes} min`);
    }).catch(err => console.error('[SessionConfig] Failed to load rate limit config:', err));
});
