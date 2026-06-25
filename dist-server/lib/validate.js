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
export function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                error: 'Datos inválidos',
                details: result.error.flatten().fieldErrors,
            });
            return;
        }
        req.body = result.data;
        next();
    };
}
