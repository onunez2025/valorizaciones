// Fase 20: dominio de la cookie SSO compartida configurable por entorno. Sin definir, el
// comportamiento es idéntico al de siempre (.siatc.cloud) -- producción real no cambia.
// En QA se configura como .qa.siatc.cloud para aislar la sesión compartida de producción.
/**
 * Dominio con el que se escribe la cookie de sesion SSO, derivado del HOST DE LA PETICION.
 *
 * Va aqui y no en un modulo compartido porque en esta app el servidor es un unico archivo; las
 * apps con `server/routes/` usan `server/lib/dominioCookie.ts`, con esta misma logica.
 *
 * `process.env.COOKIE_DOMAIN` sigue mandando si esta definida: se conserva como anulacion manual.
 * Pero depender SOLO de ella significa que basta olvidarla en un despliegue para que QA vuelva a
 * escribir la cookie en el dominio de produccion, en silencio y sin error. Eso es lo que pasaba.
 *
 * EL ORDEN IMPORTA: "flow.qa.siatc.cloud" tambien termina en ".siatc.cloud", asi que preguntar
 * primero por produccion da verdadero en QA y no separa nada. QA se comprueba PRIMERO.
 */
export function dominioCookie(req: { headers: Record<string, unknown> }): string | undefined {
    if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
    const reenviado = req.headers['x-forwarded-host'];
    const original = req.headers.host;
    const host = String((typeof reenviado === 'string' ? reenviado : original) ?? '');
    const nombre = host.split(':')[0].toLowerCase();
    if (nombre.endsWith('.qa.siatc.cloud')) return '.qa.siatc.cloud';
    if (nombre.endsWith('.siatc.cloud')) return '.siatc.cloud';
    return undefined;
}
