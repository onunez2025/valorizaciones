import { Router } from 'express';
import type { Request, Response } from 'express';
import {
    ErrorC4C,
    adjuntosDeTicket,
    descargarAdjuntoPorId,
    estaConfigurado,
    mensajePublico,
    soloPdf,
} from '@siatc/c4c-client';
import { safeError, sanitizeLog } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la misma posicion en que se
// definian en index.ts. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas
// de esta app puede casar la misma URL, asi que el orden no es critico, pero se conserva.

const router = Router();

// --- INFORME TÉCNICO (C4C OData) ---
// Usa el cliente compartido `@siatc/c4c-client`: antes este endpoint tenía su propia copia de la
// autenticación, la búsqueda del ticket, la carpeta de adjuntos y la descarga del binario.
router.get('/api/c4c/report/:ticketId', verifyToken, async (req: Request, res: Response) => {
    const ticketId = String(req.params.ticketId ?? '');
    try {
        if (!estaConfigurado()) {
            return res.status(503).json({ error: 'Integración C4C no configurada en el servidor.' });
        }

        const { adjuntos } = await adjuntosDeTicket(ticketId);
        const pdfs = soloPdf(adjuntos);
        if (pdfs.length === 0) {
            return res.status(404).json({
                error: `No se encontró un informe en PDF para el ticket ${ticketId}`,
                details: 'El ticket existe pero no tiene archivos PDF en la pestaña de Adjuntos de C4C.',
            });
        }

        // Preferencia: el PDF que se llama «informe» o «report». Si ninguno lo lleva, vale el más
        // reciente, que es el primero porque `adjuntosDeTicket` los devuelve ordenados.
        const informe = pdfs.find((a) => /informe|report/i.test(a.nombre)) ?? pdfs[0];

        // Descarga directa por la colección de adjuntos, que es la ruta que este endpoint ya usaba.
        const pdf = await descargarAdjuntoPorId(informe.objectId);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${informe.nombre.replace(/["\r\n]/g, '')}"`);
        res.send(pdf);

    } catch (err: unknown) {
        // El status de C4C NO se reenvía al navegador: un 401 suyo llegaría como sesión caducada
        // nuestra y echaría al usuario de la aplicación sin motivo.
        const status = err instanceof ErrorC4C && err.clase === 'NO_ENCONTRADO' ? 404 : 502;
        console.error(`[C4C Informe] Error ticket ${sanitizeLog(ticketId)}:`, safeError(err));
        res.status(status).json({ error: mensajePublico(err) });
    }
});

export default router;
