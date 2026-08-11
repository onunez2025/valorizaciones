import { Redis } from 'ioredis';
import { createHash } from 'crypto';

// --- REDIS CLIENT (declarado antes de rateLimit para evitar TDZ) ---
export let _redis: Redis | null = null;
export function getRedisClient(): Redis {
    if (!_redis) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const redisOptions: any = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            lazyConnect: true,
            // Si Redis no responde, fallar RAPIDO en vez de encolar. Medido: con la cola activada
            // una sola orden tarda 21 s en rendirse, y como el limitador corre al principio de la
            // cadena, CADA peticion se quedaba colgada ese tiempo. Va junto con
            // `passOnStoreError: true` en los limitadores: sin eso, fallar rapido convertiria la
            // lentitud en un 500 en todas las peticiones.
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            connectTimeout: 2000,
            retryStrategy: (times: number) => Math.min(times * 100, 3000),
        };
        if (process.env.REDIS_USERNAME) {
            redisOptions.username = process.env.REDIS_USERNAME;
        }
        _redis = new Redis(redisOptions);
        // Deja dicho A DONDE intenta conectarse, sin la contrasena. Cuando falla, el error de
        // ioredis no dice el destino, asi que no se puede distinguir "el servicio no existe" de
        // "la contrasena no coincide" ni saber si el contenedor recogio las variables nuevas.
        console.log(`[Redis] Destino: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'} db=${process.env.REDIS_DB || '0'} contrasena=${process.env.REDIS_PASSWORD ? 'definida' : 'SIN DEFINIR'}`);
        _redis.on('error', (err: Error) => console.error('[Redis] Error:', err.message));
    }
    return _redis;
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
    try {
        const hash = createHash('sha256').update(token).digest('hex');
        return (await getRedisClient().exists(`bl:${hash}`)) === 1;
    } catch { return false; }
}
export async function blacklistToken(token: string, exp: number): Promise<void> {
    try {
        const hash = createHash('sha256').update(token).digest('hex');
        const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 0);
        if (ttl > 0) await getRedisClient().set(`bl:${hash}`, '1', 'EX', ttl);
    } catch (err) { console.error('[Redis] Error al blacklistear token:', err); }
}

// Invalida TODOS los tokens de un usuario emitidos hasta ahora, sin importar cuántas apps del
// ecosistema los hayan re-firmado (cada /auth/me emite un JWT nuevo con hash distinto, así que
// blacklistToken() por sí solo no alcanza para un logout real entre apps -- ver bitácora Fase 20).
// verifyToken rechaza cualquier token con iat <= este timestamp, sin importar su hash.
export async function invalidateAllUserSessions(userId: string): Promise<void> {
    try {
        const now = Math.floor(Date.now() / 1000);
        await getRedisClient().set(`logout-after:${userId}`, String(now), 'EX', 30 * 24 * 60 * 60);
    } catch (err) { console.error('[Redis] Error al invalidar sesiones del usuario:', err); }
}
export async function isSessionInvalidated(userId: string, iat: number | undefined): Promise<boolean> {
    if (!iat) return false;
    try {
        const logoutAfter = await getRedisClient().get(`logout-after:${userId}`);
        return logoutAfter !== null && iat <= parseInt(logoutAfter, 10);
    } catch { return false; }
}
