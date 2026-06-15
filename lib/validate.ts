import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Middleware que valida req.body contra un schema Zod antes de ejecutar el handler.
 * Si la validación falla responde 400 con los errores por campo.
 * Si pasa, req.body queda reemplazado con el dato ya parseado y tipado.
 *
 * Uso:
 *   const crearPenalidadSchema = z.object({
 *     ticket: z.string().max(50),
 *     importe: z.number().positive(),
 *   });
 *
 *   app.post('/api/penalties', verifyToken, validateBody(crearPenalidadSchema), async (req, res) => {
 *     const { ticket, importe } = req.body; // tipado y validado
 *   });
 */
export function validateBody<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                error: 'Datos inválidos',
                details: result.error.flatten().fieldErrors,
            });
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).body = result.data;
        next();
    };
}
