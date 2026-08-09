// Constantes de configuracion compartidas entre index.ts y los routers.
export const APP_IDENTIFIER = 'VAL';
export const C4C_BASE_URL = process.env.C4C_BASE_URL;
export const C4C_AUTH = Buffer.from(`${process.env.C4C_USER}:${process.env.C4C_PASSWORD}`).toString('base64');

// MS Graph API Config
export const MS_GRAPH_TENANT_ID = process.env.MS_GRAPH_TENANT_ID;
export const MS_GRAPH_CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
export const MS_GRAPH_CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
export const MS_GRAPH_SENDER_EMAIL = process.env.MS_GRAPH_SENDER_EMAIL;
