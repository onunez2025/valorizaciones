import { Router } from 'express';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';

// Este router se monta en `/` conservando las rutas completas y en la posicion de su primer
// bloque. Comprobado con scripts/verificar-orden-rutas.py: ningun par de rutas de esta app
// puede casar la misma URL.

const router = Router();

router.get('/api/diagnose/redis', async (req: Request, res: Response) => {
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

export default router;
