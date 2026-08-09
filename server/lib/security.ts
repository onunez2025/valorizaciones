// --- SECURITY HELPERS (ver CLAUDE.md) ---

/**
 * Mensaje de error apto para devolver al cliente.
 *
 * Antes esta funcion devolvia `${err.message}\n${err.stack}`, asi que CADA respuesta 500 exponia
 * rutas absolutas de archivos del servidor, nombres de tablas, estructura interna y versiones de
 * dependencias. Se usa en ~70 manejadores.
 *
 * LA CONDICION ESTA INVERTIDA A PROPOSITO respecto a las otras apps del ecosistema, que preguntan
 * `NODE_ENV === 'production' ? ocultar : mostrar`. Esa forma FALLA EN ABIERTO: si la variable falta
 * en el despliegue —cosa que ya paso en Technical QA y costo cuatro rondas de diagnostico— el
 * servidor filtra los detalles sin que nada avise.
 *
 * Preguntando por 'development' se falla en CERRADO: ante cualquier valor inesperado o ausente, se
 * oculta. El unico coste es tener que declarar NODE_ENV=development para ver detalles en local.
 */
export const safeError = (err: unknown): string =>
    process.env.NODE_ENV === 'development'
        ? (err instanceof Error ? err.message : String(err))
        : 'Error interno del servidor';

export const sanitizeLog = (val: unknown, maxLen = 200): string =>
    String(val ?? '').replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ').slice(0, maxLen); // eslint-disable-line no-control-regex
