import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { dominioCookie } from '../lib/dominioCookie.js';
import { isTokenBlacklisted, isSessionInvalidated } from '../lib/redis.js';
// El import de logAudit crea un ciclo aparente con lib/audit.ts, pero audit.ts solo importa
// AuthRequest como TIPO (`import type`), que se borra al compilar: en ejecucion no hay ciclo.
import { logAudit } from '../lib/audit.js';
import { JWT_SECRET } from '../lib/env.js';

// Leer process.env a nivel de modulo es seguro AQUI porque index.ts importa './lib/env.js' como su
// primera linea, asi que dotenv.config() ya corrio cuando este modulo se evalua. No mover ese
// import ni ponerlo despues de este.

export interface JwtUserPayload {
    id: string;
    username: string;
    full_name?: string;
    role: string;
    role_name?: string;
    perms: string[];
    permissions?: string[];
    casId: string | null;
    casRUC: string | null;
    ssoPilot?: boolean;
    iat?: number;
    exp?: number;
}

export interface AuthRequest extends Request {
    user?: JwtUserPayload;
}


// Borra la cookie compartida del lado del servidor (Set-Cookie en la respuesta) cuando se
// detecta un token invalidado/blacklisteado. No depende de que el JS del cliente logre borrarla
// antes de la siguiente navegación -- evita el bucle de recarga infinita que eso puede causar
// (ver bitácora Fase 20: la limpieza vía document.cookie + window.location.href en el mismo
// tick no siempre alcanza a comprometerse antes de que la página navegue).
export function clearSharedCookie(res: Response, req?: Request): void {
    // La cookie compartida se escribe segun el DOMINIO de la peticion, no segun NODE_ENV: esa
    // variable puede faltar en el despliegue sin que nada avise, y entonces la cookie no se
    // escribe nunca -- se entra a la app pero el salto a cualquier otra pide login.
    const dominioCompartido = req ? dominioCookie(req) : process.env.COOKIE_DOMAIN?.trim();
    if (dominioCompartido) {
        res.cookie('token', '', { domain: dominioCompartido, maxAge: 0, httpOnly: false, secure: true, sameSite: 'lax', path: '/' });
    }
}

export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token no encontrado' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
        if (await isTokenBlacklisted(token)) {
            clearSharedCookie(res, req);
            return res.status(401).json({ error: 'Sesión cerrada. Inicia sesión nuevamente.' });
        }
        if (await isSessionInvalidated(decoded.id, decoded.iat)) {
            clearSharedCookie(res, req);
            return res.status(401).json({ error: 'Sesión cerrada. Inicia sesión nuevamente.' });
        }
        (req as AuthRequest).user = decoded;
        next();
    } catch (_err) { res.status(401).json({ error: 'Token inválido o expirado' }); }
};

export const verifyPermission = (permission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = (req as AuthRequest).user;
        if (!user) return res.status(401).json({ error: 'No autenticado' });

        // Handles both local and SSO token payloads
        const roleName = (user.role || user.role_name || '').trim().toLowerCase();
        if (roleName === 'administrador') return next();

        const perms = user.perms || user.permissions || [];
        if (perms.includes(permission)) return next();

        await logAudit(req, 'ACCESO_DENEGADO', `Endpoint: ${req.method} ${req.path}`, permission, {
            ip: req.ip,
            userAgent: req.get('user-agent'),
            params: req.params,
            query: req.query
        });

        res.status(403).json({ error: `Permiso denegado: ${permission}` });
    };
};
