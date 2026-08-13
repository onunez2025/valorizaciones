import './lib/env.js';   // PRIMERO: carga el .env y valida los secretos antes que nada
import { ES_DESPLIEGUE } from './lib/env.js';
import { APP_IDENTIFIER } from './lib/config.js';
import { safeError, sanitizeLog } from './lib/security.js';
import { getReadPool } from './db.js';
import { getRedisClient } from './lib/redis.js';
import { verifyToken } from './middleware/auth.js';
import ticketsRouter from './routes/tickets.js';
import materialsRouter from './routes/materials.js';
import dashboardRouter from './routes/dashboard.js';
import c4cRouter from './routes/c4c.js';
import penaltiesRouter from './routes/penalties.js';
import adicionalesRouter from './routes/adicionales.js';
import usersRouter from './routes/users.js';
import profileRouter from './routes/profile.js';
import rolesRouter from './routes/roles.js';
import tarifariosRouter from './routes/tarifarios.js';
import valuationsRouter from './routes/valuations.js';
import closuresRouter from './routes/closures.js';
import authRouter from './routes/auth.js';
import ssoAuthRouter from './routes/ssoAuth.js';
import casRouter from './routes/cas.js';
import configRouter from './routes/config.js';
import managementsRouter from './routes/managements.js';
import express from 'express';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './lib/env.js';
import { RedisStore } from 'rate-limit-redis';
import sql from 'mssql';
import { addInput } from './lib/db.js';
import path from 'path';
import fs from 'fs';


const app = express();
const port = process.env.PORT || 3000;





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

/**
 * Clave del limitador general.
 *
 * Contar por IP hacia que una oficina entera compartiera un solo cupo: con decenas de
 * personas saliendo por la misma IP, entre login, configuracion y primera pantalla se
 * agotaban las 1.000 peticiones y quedaban bloqueadas TODAS a la vez — incluido el propio
 * login, porque este limitador corre antes que esa ruta.
 *
 * Con sesion iniciada el contador es de esa persona. El token se VERIFICA, no solo se lee:
 * si bastara con leerlo, cualquiera podria inventarse un `id` distinto en cada peticion y
 * saltarse el limite. Sin sesion valida se cuenta por IP, que es la unica identidad que hay.
 */
const claveLimitador = (req: Request): string => {
    const cabecera = req.headers.authorization;
    if (cabecera?.startsWith('Bearer ')) {
        try {
            const datos = jwt.verify(cabecera.slice(7), JWT_SECRET) as { id?: string };
            if (datos?.id) return `u:${datos.id}`;
        } catch {
            // Token invalido o caducado: se cuenta por IP, como cualquier anonimo.
        }
    }
    return `ip:${ipKeyGenerator(req.ip ?? '')}`;
};

/** Deja constancia de quien choco con un limite. Antes no habia forma de saberlo. */
const avisoLimite = (cual: string) => (req: Request, res: Response) => {
    // `rateLimit` lo pone express-rate-limit en la peticion; su tipo no viene aumentado.
    const clave = (req as Request & { rateLimit?: { key?: string } }).rateLimit?.key;
    console.warn(`[RateLimit] ${cual} agotado — clave=${sanitizeLog(clave)} ruta=${sanitizeLog(req.originalUrl)}`);
    res.status(429).json({ error: 'Demasiadas peticiones. Espera unos minutos e intenta de nuevo.' });
};

const limiter = rateLimit({
    keyGenerator: claveLimitador,
    handler: avisoLimite('limite general'),
    windowMs: 15 * 60 * 1000,
    max: 1000,
    store: new RedisStore({ sendCommand: (...args: string[]) => (getRedisClient() as any).call(...args) as any, prefix: 'rl:val:' }), // eslint-disable-line @typescript-eslint/no-explicit-any
    passOnStoreError: true,   // si Redis cae, la app sigue sirviendo (sin limitar) en vez de dar 500
});
app.use(limiter);

// Auth rate limiter — starts with safe defaults, overwritten from EBM.AppSessionConfig at startup
// keyGenerator: IP + username — cada usuario tiene su propio contador (evita que IP compartida de oficina bloquee a todos)
const authKeyGenerator = (req: Request) => {
    const username = String(req.body?.username || '').toLowerCase().trim().substring(0, 50);
    // La IP pasa por `ipKeyGenerator`, que normaliza IPv6 a su subred /56. Con la IP en
    // crudo, un usuario con IPv6 estrena contador con solo cambiar de direccion dentro de su
    // propio bloque —y los bloques domesticos tienen billones—, asi que el limite de intentos
    // de login no le afectaba. Con IPv4 no se nota porque la direccion es una sola.
    return `${ipKeyGenerator(req.ip ?? '')}:${username}`;
};
let authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    keyGenerator: authKeyGenerator,
    handler: avisoLimite('limite de login'),
    store: new RedisStore({ sendCommand: (...args: string[]) => (getRedisClient() as any).call(...args) as any, prefix: 'rl:val:auth:' }), // eslint-disable-line @typescript-eslint/no-explicit-any
    passOnStoreError: true,   // si Redis cae, la app sigue sirviendo (sin limitar) en vez de dar 500
});

app.use(cors({
    origin: (origin, callback) => {
        if (!ES_DESPLIEGUE) return callback(null, true);  // sin ALLOWED_ORIGINS = entorno local
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
app.use('/api/auth/login', (req: Request, res: Response, next: NextFunction) => authLimiter(req, res, next));
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


app.use(authRouter);

app.use(ssoAuthRouter);

// --- CAS ---
app.use(casRouter);

// --- CONFIGURATION ---
app.use(configRouter);

// --- CONFIG ADICIONAL POR DISTRITO ---


// --- CONFIG CANAL INSTITUCIONAL ---


// --- VALORIZACIONES ---
// --- VALORIZACIONES HELPERS ---

// Mapeo de códigos de área C4C → nombre legible
// Agregar nuevos códigos según se identifiquen en el sistema C4C


// --- VALORIZACIONES ---
app.use(valuationsRouter);


app.use(penaltiesRouter);

app.use(adicionalesRouter);







app.use(ticketsRouter);





app.use(closuresRouter);



app.use(tarifariosRouter);

app.use(materialsRouter);


// --- TARIFARIO EXCEPCIONES ---

// --- TARIFARIO IMPORT ---

// Construye una sola vez el mapa Descripcion(mayus/trim) -> Id de FSM_TipoServicio,
// para resolver códigos de servicio en memoria en vez de 1 query SQL por fila.


app.use(dashboardRouter);

app.use(c4cRouter);

// --- CONFIG & MANAGEMENT (Standardized) ---

// MANAGEMENTS
app.use(managementsRouter);

// PREFERENCES

app.use(usersRouter);

app.use(profileRouter);


app.use(rolesRouter);


// AUDIT LOGS: solo servia a la pagina local AuditLogPage.tsx (eliminada) -- la escritura de
// auditoria sigue viva via logAudit(), sin relacion con este endpoint de lectura.


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
app.use((_req: Request, res: Response) => {
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


if (process.env.NODE_ENV === 'production' && !(process.env.ALLOWED_ORIGINS || '').trim()) {
    console.warn('⚠️  WARNING: ALLOWED_ORIGINS is not set. CORS will block all cross-origin requests in production.');
}

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[ERROR] ${sanitizeLog(req.method)} ${sanitizeLog(req.path)}:`, err);
    res.status(500).json({ error: safeError(err) });
});

app.listen(port, () => {
    console.log(`Server Valorizaciones running on http://localhost:${port}`);
    fetchAppMeta();
    fetchSessionConfig().then(cfg => {
        authLimiter = rateLimit({
            windowMs: cfg.rateLimitWindowMinutes * 60 * 1000,
            max: cfg.rateLimitMaxAttempts,
            skipSuccessfulRequests: true,
            keyGenerator: authKeyGenerator,
            message: { error: `Too many login attempts, please try again after ${cfg.rateLimitWindowMinutes} minutes.` },
            store: new RedisStore({ sendCommand: (...args: string[]) => (getRedisClient() as any).call(...args) as any, prefix: 'rl:val:auth:' }), // eslint-disable-line @typescript-eslint/no-explicit-any
            passOnStoreError: true,   // si Redis cae, la app sigue sirviendo (sin limitar) en vez de dar 500
        });
        console.log(`[SessionConfig] Auth limiter: ${cfg.rateLimitMaxAttempts} intentos / ${cfg.rateLimitWindowMinutes} min`);
    }).catch(err => console.error('[SessionConfig] Failed to load rate limit config:', err));
});
