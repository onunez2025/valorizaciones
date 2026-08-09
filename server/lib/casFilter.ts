import sql from 'mssql';
import type { Response } from 'express';
import type { ISqlType } from 'mssql';

export interface CasUser {
    casId: string | null;
    casRUC: string | null;
}

/**
 * Verifica que el RUC solicitado pertenezca al usuario CAS.
 * Retorna true si el acceso es válido; retorna false y envía 403 si no lo es.
 * Usuarios Sole (casId === null) siempre retornan true (ven todo).
 *
 * Uso: if (!assertCasRuc(currentUser, ruc, res)) return;
 */
export function assertCasRuc(user: CasUser, ruc: string, res: Response): boolean {
    if (!user.casId) return true;
    if (!user.casRUC) {
        res.status(403).json({ error: 'Usuario CAS sin empresa asignada' });
        return false;
    }
    if (String(ruc).trim() !== String(user.casRUC).trim()) {
        res.status(403).json({ error: 'Acceso denegado' });
        return false;
    }
    return true;
}

/**
 * Agrega filtro AND ID_cas = @casId al request SQL para usuarios CAS.
 * Retorna el sufijo WHERE listo para concatenar, o '' si el usuario es Sole.
 *
 * Uso: const casSuffix = applyCasIdFilter(sqlReq, currentUser);
 *      query = `SELECT ... WHERE 1=1 ${casSuffix}`;
 */
export function applyCasIdFilter(
    req: sql.Request,
    user: CasUser,
    _type?: (() => ISqlType) | ISqlType,
): string {
    if (!user.casId) return '';
    req.input('casId', sql.VarChar(50), user.casId);
    return ' AND ID_cas = @casId';
}

/**
 * Para endpoints de dashboard con ?ruc= libre: fuerza el RUC del token
 * si el usuario es CAS, ignorando el parámetro del cliente.
 * Retorna null si Sole no pasa RUC (significa "todos").
 *
 * Uso: const rucEfectivo = enforceCasRuc(currentUser, req.query.ruc as string);
 */
export function enforceCasRuc(user: CasUser, requestedRuc?: string): string | null {
    if (user.casId) return user.casRUC ?? null;
    return requestedRuc ?? null;
}
