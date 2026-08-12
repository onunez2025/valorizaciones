/**
 * Migraciones de esquema (DDL) de Valorizaciones — SCRIPT MANUAL, no lo importa el servidor.
 *
 * Estas migraciones vivian dentro de `db.ts` y las disparaba `getDb()` en cada arranque. Para
 * poder ejecutar `ALTER TABLE` hacia falta el usuario administrador antiguo, asi que la
 * aplicacion abria una conexion de administrador contra la base **cada vez que arrancaba**.
 *
 * Se comprobo contra la base el 2026-08-11 que las tres columnas ya existen, asi que esas
 * migraciones llevaban meses preguntando y no haciendo nada. El coste era mantener viva una
 * sesion de administrador que ningun endpoint necesitaba.
 *
 * Ahora el servidor solo conoce a `siatc_reader` y `siatc_writer`, que por diseño no pueden
 * modificar el esquema. Si en el futuro hace falta una migracion, se anade aqui y se ejecuta a
 * mano UNA vez:
 *
 *     npx tsx server/migraciones-ddl.ts
 *
 * Requiere DB_USER y DB_PASSWORD (el usuario con permiso de DDL) en el entorno. El servidor web
 * ya no las necesita.
 */
// Solo se carga el .env. No se usa lib/env.js a proposito: ese modulo valida JWT_SECRET y las
// credenciales de los pools de la aplicacion, y un script de esquema no necesita ninguna de las
// dos — pedirlas solo impediria ejecutarlo.
import dotenv from 'dotenv';
dotenv.config();
import sql from 'mssql';

const PASOS: Array<{ nombre: string; sql: string }> = [
    {
        nombre: 'Canal Institucional: Usuario_Creador -> Cupo_Area',
        sql: `
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL'
                AND COLUMN_NAME = 'Cupo_Area'
            )
            BEGIN
                ALTER TABLE [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL]
                    ADD Cupo_Area NVARCHAR(50) NULL;
                DELETE FROM [dbo].[GAC_APP_TB_CONFIG_CANAL_INSTITUCIONAL];
            END`,
    },
    {
        // Portado de main (f9787a8, 9a7138b): los Casos Especiales ganan Servicio Inicial
        // (documental) y vigencia por fecha.
        nombre: 'Excepciones: ServicioInicial / Fecha_Inicio / Fecha_Fin',
        sql: `
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
            END`,
    },
    {
        nombre: 'Detalle de valorizacion: Servicio_Inicial',
        sql: `
            IF NOT EXISTS (
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'GAC_APP_TB_VALORIZACIONES_DETALLE'
                AND COLUMN_NAME = 'Servicio_Inicial'
            )
            BEGIN
                ALTER TABLE [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE]
                    ADD Servicio_Inicial VARCHAR(100) NULL;
            END`,
    },
];

async function migrar(): Promise<void> {
    if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
        throw new Error(
            'Faltan DB_USER / DB_PASSWORD. Este script necesita el usuario con permiso de DDL; ' +
            'siatc_reader y siatc_writer no pueden modificar el esquema.'
        );
    }
    const pool = await new sql.ConnectionPool({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        server: process.env.DB_SERVER || '',
        port: 1433,
        options: { encrypt: true, trustServerCertificate: false },
    }).connect();

    for (const paso of PASOS) {
        await pool.request().query(paso.sql);
        console.log(`[Migracion] ${paso.nombre} — OK`);
    }
    await pool.close();
    console.log(`[Migracion] ${PASOS.length} pasos completados.`);
}

migrar().catch(err => {
    console.error('[Migracion] Error:', err instanceof Error ? err.message : err);
    process.exit(1);
});
