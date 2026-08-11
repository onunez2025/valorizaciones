import sql from 'mssql';
import { safeError } from './lib/security.js';

export const dbConfig: sql.config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    server: process.env.DB_SERVER || '',
    port: 1433,
    pool: { max: 30, min: 0, idleTimeoutMillis: 30000 },
    options: { encrypt: true, trustServerCertificate: false, requestTimeout: 60000 }
};

export let pool: sql.ConnectionPool | null = null;

// Etapa 6 -- pool admin. getDb() dispara runMigrations() (ALTER TABLE/CREATE TABLE) en su
// primera conexion -- se sigue llamando explicitamente una vez al arrancar el server (ver
// app.listen mas abajo) para garantizar que las migraciones corran, independientemente de
// que los endpoints de negocio ahora usen getReadPool()/getWritePool() en su lugar. Ni
// siatc_reader ni siatc_writer pueden ejecutar DDL (privilegio minimo), por eso este pool
// admin queda reservado solo para esto.
export async function getDb() {
    if (!pool) {
        try {
            pool = await new sql.ConnectionPool(dbConfig).connect();
            console.log('✅ Conectado a Azure SQL: ' + dbConfig.database);
            runMigrations(pool);
        } catch (err: unknown) {
            console.error('❌ Error de conexión DB:', safeError(err));
            pool = null;
            throw err;
        }
    }
    return pool;
}

// Etapa 6 -- usuarios de BD de privilegio minimo (siatc_reader/siatc_writer). Si las env
// vars DB_USER_READ/DB_USER_WRITE todavia no estan configuradas en Dokploy, caen de vuelta
// al usuario admin original -- permite desplegar este codigo antes de agregar esas env vars,
// y revertir a admin-only con solo quitarlas, sin tocar codigo.
export const readDbConfig: sql.config = {
    ...dbConfig,
    user: process.env.DB_USER_READ || process.env.DB_USER,
    password: process.env.DB_PASS_READ || process.env.DB_PASSWORD,
};
export const writeDbConfig: sql.config = {
    ...dbConfig,
    user: process.env.DB_USER_WRITE || process.env.DB_USER,
    password: process.env.DB_PASS_WRITE || process.env.DB_PASSWORD,
};

export let readPool: sql.ConnectionPool | null = null;
export let writePool: sql.ConnectionPool | null = null;

/** Endpoints GET -- solo lectura, usa siatc_reader (privilegio minimo). */
export async function getReadPool() {
    if (!readPool) {
        try {
            readPool = await new sql.ConnectionPool(readDbConfig).connect();
        } catch (err: unknown) {
            console.error('❌ Error de conexión DB (read pool):', safeError(err));
            readPool = null;
            throw err;
        }
    }
    return readPool;
}

/** Endpoints POST/PUT/DELETE/PATCH -- usa siatc_writer (lectura + escritura en dbo/EBM). */
export async function getWritePool() {
    if (!writePool) {
        try {
            writePool = await new sql.ConnectionPool(writeDbConfig).connect();
        } catch (err: unknown) {
            console.error('❌ Error de conexión DB (write pool):', safeError(err));
            writePool = null;
            throw err;
        }
    }
    return writePool;
}

export let _migrationsRan = false;
export async function runMigrations(db: sql.ConnectionPool) {
    if (_migrationsRan) return;
    _migrationsRan = true;
    try {
        // Migración: Canal Institucional pasa de Usuario_Creador a Cupo_Area
        await db.request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL'
                AND COLUMN_NAME = 'Cupo_Area'
            )
            BEGIN
                ALTER TABLE [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL]
                    ADD Cupo_Area NVARCHAR(50) NULL;
                DELETE FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL];
                PRINT 'Migración Canal Institucional completada';
            END
        `);
        console.log('[Migration] Canal Institucional → Cupo_Area OK');

        // ── Portado de main (f9787a8, 9a7138b) ──────────────────────────────────────────
        // Casos Especiales gana Servicio Inicial (documental) y vigencia por fecha.
        await db.request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'GAC_APP_TB_TARIFARIO_EXCEPCIONES'
                AND COLUMN_NAME = 'ServicioInicial'
            )
            BEGIN
                ALTER TABLE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES]
                    ADD ServicioInicial NVARCHAR(100) NULL,
                        Fecha_Inicio DATE NULL,
                        Fecha_Fin DATE NULL;
                PRINT 'Migración Excepciones ServicioInicial/Fechas completada';
            END
        `);
        console.log('[Migration] Excepciones → ServicioInicial/Fecha_Inicio/Fecha_Fin OK');

        // El detalle de valorización guarda el Servicio Inicial documental.
        await db.request().query(`
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'GAC_APP_TB_VALORIZACIONES_DETALLE'
                AND COLUMN_NAME = 'Servicio_Inicial'
            )
            BEGIN
                ALTER TABLE [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE]
                    ADD Servicio_Inicial VARCHAR(100) NULL;
                PRINT 'Migración Detalle Servicio_Inicial completada';
            END
        `);
        console.log('[Migration] Detalle Valorización → Servicio_Inicial OK');
    } catch (err) {
        console.error('[Migration] Error:', err);
    }
}
