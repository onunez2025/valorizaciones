/**
 * Colores de las series de los graficos.
 *
 * ── Por que son hex y no tokens ──────────────────────────────────────────────────────────────
 * Este fichero DEFINE color, no lo consume. Recharts recibe el color como valor, no como clase de
 * Tailwind, asi que un token de utilidad no sirve aqui.
 *
 * ⚠️ El rojo de las sanciones es `#ef4444`, que NO es el rojo de la casa (`--error`, `#DF2935`).
 * Se conserva el tono que ya tenia para no cambiar el aspecto del grafico al mover el color de
 * sitio. Unificarlo con `var(--error)` seria mas coherente —la otra serie del mismo grafico ya usa
 * `var(--primary)`— pero es una decision de diseño, no una limpieza: dejarla para cuando se
 * revisen los graficos.
 */
export const PALETA_GRAFICOS = {
    /** Serie de sanciones y penalidades: lo que resta. */
    SANCIONES: '#ef4444',
} as const;
