// Constantes de configuracion compartidas entre index.ts y los routers.
export const APP_IDENTIFIER = 'VAL';

// `C4C_BASE_URL` y `C4C_AUTH` vivían aquí como constantes de módulo, que se evalúan al importar —o sea,
// ANTES de que index.ts llame a dotenv—. Es el patrón que rompió el SSO de Technical con `tsc` en verde.
// Las credenciales las lee ahora `@siatc/c4c-client` dentro de la función, con el entorno ya cargado.
// No volver a poner aquí nada que dependa de process.env de forma inmediata.

// MS Graph API Config
export const MS_GRAPH_TENANT_ID = process.env.MS_GRAPH_TENANT_ID;
export const MS_GRAPH_CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
export const MS_GRAPH_CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
export const MS_GRAPH_SENDER_EMAIL = process.env.MS_GRAPH_SENDER_EMAIL;
