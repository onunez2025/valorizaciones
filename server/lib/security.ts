// --- SECURITY HELPERS (ver CLAUDE.md) ---
export const safeError = (err: unknown): string =>
    err instanceof Error ? `${err.message}\n${err.stack}` : String(err);

export const sanitizeLog = (val: unknown, maxLen = 200): string =>
    String(val ?? '').replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ').slice(0, maxLen); // eslint-disable-line no-control-regex
