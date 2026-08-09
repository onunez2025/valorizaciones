import sql from 'mssql';
import type { ISqlType } from 'mssql';

/**
 * Wrapper de sql.Request.input() que REQUIERE el tipo SQL explícito.
 *
 * Problema que resuelve: sql.Request.input() acepta 2 o 3 argumentos.
 * Con 2 argumentos (sin tipo) el driver infiere el tipo, lo que puede
 * causar type confusion y dificulta auditorías de seguridad.
 *
 * Esta función solo acepta la firma con tipo, haciendo obligatorio declararlo.
 *
 * En lugar de:  req.input('monto', valor)                    ← sin tipo
 * Usar:         addInput(req, 'monto', sql.Decimal(10,2), valor)
 *
 * Referencia CLAUDE.md regla 3: todos los .input() deben declarar tipo SQL.
 */
export function addInput(
    req: sql.Request,
    name: string,
    type: (() => ISqlType) | ISqlType,
    value: unknown,
): sql.Request {
    return req.input(name, type, value as never);
}
