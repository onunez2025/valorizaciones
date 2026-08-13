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
/**
 * Mensaje de error apto para devolver al cliente.
 *
 * El detalle NUNCA sale en la respuesta HTTP: se registra aqui, y solo aqui, para que quede
 * siempre en los logs de Dokploy, que es donde se consulta.
 *
 * Antes esto era `NODE_ENV === 'production' ? ocultar : mostrar`, y esa forma FALLA EN ABIERTO:
 * si la variable falta, filtra. El 2026-08-12 se confirmo que **ninguna app de QA tiene
 * NODE_ENV en Dokploy**, asi que llevaban tiempo devolviendo al cliente el error real —rutas de
 * archivos del servidor, nombres de tablas, estructura interna— en cada 500.
 *
 * Ya no depende de ninguna variable de entorno: no hay configuracion que se pueda olvidar.
 *
 * El log va DENTRO a proposito. De los 464 sitios que llaman a esta funcion en el ecosistema,
 * 242 no registraban el error por su cuenta; dejarla pura habria dejado ciegos esos casos. El
 * coste es alguna linea repetida donde el manejador ya registraba, que es un mal menor frente a
 * perder el error.
 */
export const safeError = (err: unknown): string => {
    console.error('[ERROR]', err instanceof Error ? (err.stack ?? err.message) : err);
    return 'Error interno del servidor';
};

export const sanitizeLog = (val: unknown, maxLen = 200): string =>
    String(val ?? '').replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ').slice(0, maxLen); // eslint-disable-line no-control-regex
