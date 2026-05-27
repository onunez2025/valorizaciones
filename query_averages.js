import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    server: process.env.DB_SERVER || '',
    port: 1433,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 60000
    }
};

async function run() {
    if (!dbConfig.user || !dbConfig.password || !dbConfig.server || !dbConfig.database) {
        console.error('❌ Error: Faltan variables de entorno para la conexión a la base de datos (DB_USER, DB_PASSWORD, DB_SERVER, DB_DATABASE).');
        console.log('Por favor, asegúrate de tener un archivo .env en la raíz o definir las variables en tu terminal antes de ejecutar.');
        process.exit(1);
    }

    console.log(`🔌 Conectando a Azure SQL Server: ${dbConfig.server}...`);
    try {
        const pool = await sql.connect(dbConfig);
        console.log('✅ Conexión establecida exitosamente.');
        
        console.log('\n📊 Ejecutando consulta de promedio de pagos por ticket (Valorizaciones Cerradas)...');
        
        const query1 = `
            SELECT 
                UPPER(TRIM(d.Nombre_Equipo)) AS Subcategoria,
                MONTH(d.Fecha_Cierre) AS MesNumero,
                CASE MONTH(d.Fecha_Cierre)
                    WHEN 1 THEN 'Enero'
                    WHEN 2 THEN 'Febrero'
                    WHEN 3 THEN 'Marzo'
                    WHEN 4 THEN 'Abril'
                    ELSE 'Otro'
                END AS MesNombre,
                AVG(d.Monto) AS PromedioPago,
                COUNT(*) AS TotalTickets,
                SUM(d.Monto) AS TotalMonto
            FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] d
            WHERE d.Tipo = 'SERVICIO'
              AND d.Categoria = 'AGUA CALIENTE'
              AND d.Fecha_Cierre BETWEEN '2026-01-01' AND '2026-04-30 23:59:59'
              AND UPPER(TRIM(d.Nombre_Equipo)) IN (
                  'RAPIDUCHAS', 
                  'TERMAS ELECTRICAS', 
                  'TERMAS A GAS PASO CONTINUO', 
                  'DUCHAS ELÉCTRICAS', 
                  'TERMA A GAS ACUMULACION', 
                  'TERMA SOLAR'
              )
            GROUP BY UPPER(TRIM(d.Nombre_Equipo)), MONTH(d.Fecha_Cierre)
            ORDER BY UPPER(TRIM(d.Nombre_Equipo)), MONTH(d.Fecha_Cierre);
        `;

        const result = await pool.request().query(query1);
        
        if (result.recordset.length === 0) {
            console.log('⚠️ No se encontraron registros de valorizaciones cerradas para los filtros especificados.');
        } else {
            console.log('\n📋 RESULTADOS (TABLA DE PROMEDIO DE PAGO POR TICKET - HISTÓRICO DE CIERRES):');
            console.table(result.recordset.map(row => ({
                'Subcategoría': row.Subcategoria,
                'Mes': row.MesNombre,
                'Promedio Pago (S/.)': row.PromedioPago.toFixed(2),
                'Total Tickets': row.TotalTickets,
                'Total Monto (S/.)': row.TotalMonto.toFixed(2)
            })));
            
            // También imprimir en formato Markdown Table para copiar fácilmente
            console.log('\nRepresentación en formato Tabla Markdown para tu informe:\n');
            console.log('| Subcategoría | Mes | Promedio Pago (S/.) | Total Tickets | Total Monto (S/.) |');
            console.log('|---|---|---|---|---|');
            result.recordset.forEach(row => {
                console.log(`| ${row.Subcategoria} | ${row.MesNombre} | S/. ${row.PromedioPago.toFixed(2)} | ${row.TotalTickets} | S/. ${row.TotalMonto.toFixed(2)} |`);
            });
        }

        await pool.close();
    } catch (err) {
        console.error('❌ Error de conexión o ejecución:', err.message);
    }
}

run();
