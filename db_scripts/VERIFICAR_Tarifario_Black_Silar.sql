-- ============================================================
-- VERIFICACION Y ACTUALIZACION TARIFARIO - CAS BLACK y SILAR
-- Fuente: Costo_Black_Silar.pdf
-- Ejecutar en pasos: primero PASO 1 para confirmar CAS IDs,
-- luego PASO 2 para verificar, luego PASO 3 para aplicar cambios.
-- ============================================================

-- ============================================================
-- PASO 1: Identificar los CAS Black y Silar en la base de datos
-- ============================================================
SELECT ID_CAS, Nombre_CAS, RUC, Zona_atencion, Estado
FROM [dbo].[GAC_APP_TB_CAS]
WHERE Nombre_CAS LIKE '%Black%'
   OR Nombre_CAS LIKE '%BLACK%'
   OR Nombre_CAS LIKE '%Silar%'
   OR Nombre_CAS LIKE '%SILAR%';

-- IMPORTANTE: Anota los ID_CAS que devuelve esta consulta.
-- Reemplaza 'ID_BLACK' e 'ID_SILAR' en los pasos siguientes
-- con los valores reales de ID_CAS.

-- ============================================================
-- PASO 2: Verificar qué filas del PDF ya existen en el tarifario
-- ============================================================

-- Tabla temporal con todos los datos del PDF
IF OBJECT_ID('tempdb..#NuevoTarifario') IS NOT NULL DROP TABLE #NuevoTarifario;
CREATE TABLE #NuevoTarifario (
    Categoria       VARCHAR(100),
    Servicio        VARCHAR(100),
    Fecha_inicio    DATE,
    Fecha_fin       DATE,
    Importe_Viejo   DECIMAL(18,2),  -- NULL = fila nueva sin precio anterior
    Importe_Nuevo   DECIMAL(18,2)
);

INSERT INTO #NuevoTarifario VALUES
-- AIRE ACONDICIONADO PORTATIL
('AIRE ACONDICIONADO PORTATIL',    'Mantenimiento Basico C/materiales',  '2026-01-01', '2026-12-31', NULL,  129.00),
-- AIRE ACONDICIONADO SPLIT
('AIRE ACONDICIONADO SPLIT',       'Mantenimiento Basico C/materiales',  '2026-01-01', '2026-12-31', NULL,  195.00),
-- CALENTADORES A GAS
('CALENTADORES A GAS',             'Instalación',                        '2025-01-01', '2026-12-31', 45.00,  42.00),
('CALENTADORES A GAS',             'Instalación C/costo',                '2025-01-01', '2026-12-31', 45.00,  42.00),
('CALENTADORES A GAS',             'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('CALENTADORES A GAS',             'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   47.00),
-- CAMPANAS CONVENCIONALES
('CAMPANAS CONVENCIONALES',        'Reinstalación',                      '2025-01-01', '2026-12-31', 35.00,  30.00),
('CAMPANAS CONVENCIONALES',        'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 35.00,  30.00),
('CAMPANAS CONVENCIONALES',        'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('CAMPANAS CONVENCIONALES',        'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   43.00),
-- CAMPANAS DECORATIVAS
('CAMPANAS DECORATIVAS',           'Instalación',                        '2025-01-01', '2026-12-31', 50.00,  55.00),
('CAMPANAS DECORATIVAS',           'Instalación C/costo',                '2025-01-01', '2026-12-31', 50.00,  55.00),
('CAMPANAS DECORATIVAS',           'Reinstalación',                      '2025-01-01', '2026-12-31', 50.00,  45.00),
('CAMPANAS DECORATIVAS',           'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 50.00,  45.00),
('CAMPANAS DECORATIVAS',           'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('CAMPANAS DECORATIVAS',           'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   45.00),
-- CAMPANAS DECORATIVAS ISLA
('CAMPANAS DECORATIVAS ISLA',      'Reinstalación',                      '2025-01-01', '2026-12-31', 70.00,  65.00),
('CAMPANAS DECORATIVAS ISLA',      'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 70.00,  65.00),
('CAMPANAS DECORATIVAS ISLA',      'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('CAMPANAS DECORATIVAS ISLA',      'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   45.00),
('CAMPANAS DECORATIVAS ISLA',      'Revisión',                           '2025-01-01', '2026-12-31', 30.00,  35.00),
('CAMPANAS DECORATIVAS ISLA',      'Revisión C/costo',                   '2025-01-01', '2026-12-31', 30.00,  35.00),
-- COCINAS DE PIE
('COCINAS DE PIE',                 'Instalación',                        '2025-01-01', '2026-12-31', 42.00,  40.00),
('COCINAS DE PIE',                 'Instalación C/costo',                '2025-01-01', '2026-12-31', 42.00,  40.00),
('COCINAS DE PIE',                 'Reinstalación',                      '2025-01-01', '2026-12-31', 42.00,  35.00),
('COCINAS DE PIE',                 'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 42.00,  35.00),
('COCINAS DE PIE',                 'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('COCINAS DE PIE',                 'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   50.00),
-- COCINAS EMPOTRABLES A GAS
('COCINAS EMPOTRABLES A GAS',      'Instalación',                        '2025-01-01', '2026-12-31', 42.00,  40.00),
('COCINAS EMPOTRABLES A GAS',      'Instalación C/costo',                '2025-01-01', '2026-12-31', 42.00,  40.00),
('COCINAS EMPOTRABLES A GAS',      'Reinstalación',                      '2025-01-01', '2026-12-31', 42.00,  35.00),
('COCINAS EMPOTRABLES A GAS',      'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 42.00,  35.00),
('COCINAS EMPOTRABLES A GAS',      'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('COCINAS EMPOTRABLES A GAS',      'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   50.00),
-- COCINAS EMPOTRABLES ELECTRICAS
('COCINAS EMPOTRABLES ELECTRICAS', 'Instalación',                        '2025-01-01', '2026-12-31', 42.00,  40.00),
('COCINAS EMPOTRABLES ELECTRICAS', 'Instalación C/costo',                '2025-01-01', '2026-12-31', 42.00,  40.00),
('COCINAS EMPOTRABLES ELECTRICAS', 'Reinstalación',                      '2025-01-01', '2026-12-31', 42.00,  35.00),
('COCINAS EMPOTRABLES ELECTRICAS', 'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 42.00,  35.00),
('COCINAS EMPOTRABLES ELECTRICAS', 'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('COCINAS EMPOTRABLES ELECTRICAS', 'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   40.00),
-- HORNO A GAS
('HORNO A GAS',                    'Instalación',                        '2025-01-01', '2026-12-31', 42.00,  40.00),
('HORNO A GAS',                    'Instalación C/costo',                '2025-01-01', '2026-12-31', 42.00,  40.00),
('HORNO A GAS',                    'Reinstalación',                      '2025-01-01', '2026-12-31', 42.00,  35.00),
('HORNO A GAS',                    'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 42.00,  35.00),
('HORNO A GAS',                    'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('HORNO A GAS',                    'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   50.00),
-- HORNO ELECTRICO
('HORNO ELECTRICO',                'Instalación',                        '2025-01-01', '2026-12-31', 42.00,  40.00),
('HORNO ELECTRICO',                'Instalación C/costo',                '2025-01-01', '2026-12-31', 42.00,  40.00),
('HORNO ELECTRICO',                'Reinstalación',                      '2025-01-01', '2026-12-31', 42.00,  35.00),
('HORNO ELECTRICO',                'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 42.00,  35.00),
('HORNO ELECTRICO',                'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('HORNO ELECTRICO',                'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   50.00),
-- LAVAVAJILLA
('LAVAVAJILLA',                    'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('LAVAVAJILLA',                    'Revisión',                           '2025-01-01', '2026-12-31', 45.00,  60.00),
('LAVAVAJILLA',                    'Revisión C/costo',                   '2025-01-01', '2026-12-31', 45.00,  60.00),
-- M-FILTROS - SOLE
('M-FILTROS - SOLE',               'Reinstalación',                      '2025-01-01', '2026-12-31', 30.00,  25.00),
('M-FILTROS - SOLE',               'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 30.00,  25.00),
-- PURIFICADOR
('PURIFICADOR',                    'Reinstalación',                      '2025-01-01', '2026-12-31', 30.00,  25.00),
('PURIFICADOR',                    'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 30.00,  25.00),
-- RAPIDUCHA
('RAPIDUCHA',                      'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('RAPIDUCHA',                      'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   33.00),
-- REFRIGERADORAS CON ICE MAKER
('REFRIGERADORAS CON ICE MAKER',   'Reinstalación',                      '2025-01-01', '2026-12-31', 50.00,  45.00),
('REFRIGERADORAS CON ICE MAKER',   'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 50.00,  45.00),
('REFRIGERADORAS CON ICE MAKER',   'Reparación Alta C/materiales',       '2025-11-01', '2026-12-31', NULL,  200.00),
('REFRIGERADORAS CON ICE MAKER',   'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   60.00),
-- REFRIGERADORAS Y CONGELADORAS
('REFRIGERADORAS Y CONGELADORAS',  'Reinstalación',                      '2025-01-01', '2026-12-31', 30.00,  25.00),
('REFRIGERADORAS Y CONGELADORAS',  'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 30.00,  25.00),
('REFRIGERADORAS Y CONGELADORAS',  'Reparación Alta C/materiales',       '2025-11-01', '2026-12-31', NULL,  200.00),
('REFRIGERADORAS Y CONGELADORAS',  'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   40.00),
-- SECADORA
('SECADORA',                       'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('SECADORA',                       'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   55.00),
-- TERMAS ELECTRICAS -50LT
('TERMAS ELECTRICAS -50LT',        'Instalación',                        '2025-01-01', '2026-12-31', 32.00,  35.00),
('TERMAS ELECTRICAS -50LT',        'Instalación C/costo',                '2025-01-01', '2026-12-31', 32.00,  35.00),
('TERMAS ELECTRICAS -50LT',        'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('TERMAS ELECTRICAS -50LT',        'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   42.00),
('TERMAS ELECTRICAS -50LT',        'Revisión',                           '2025-01-01', '2026-12-31', 30.00,  35.00),
('TERMAS ELECTRICAS -50LT',        'Revisión C/costo',                   '2025-01-01', '2026-12-31', 30.00,  35.00),
-- TERMAS ELECTRICAS 80LT+
('TERMAS ELECTRICAS 80LT+',        'Reinstalación',                      '2025-01-01', '2026-12-31', 50.00,  45.00),
('TERMAS ELECTRICAS 80LT+',        'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 50.00,  45.00),
('TERMAS ELECTRICAS 80LT+',        'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('TERMAS ELECTRICAS 80LT+',        'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   60.00),
-- TERMOTANQUES
('TERMOTANQUES',                   'Reinstalación',                      '2025-01-01', '2026-12-31', 50.00,  45.00),
('TERMOTANQUES',                   'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 50.00,  45.00),
('TERMOTANQUES',                   'Reinstalación C/transporte',         '2026-01-01', '2026-12-31', NULL,   59.32),
('TERMOTANQUES',                   'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   60.00),
('TERMOTANQUES',                   'Revisión',                           '2025-01-01', '2026-12-31', 30.00,  40.00),
('TERMOTANQUES',                   'Revisión C/costo',                   '2025-01-01', '2026-12-31', 30.00,  40.00),
-- VINERAS
('VINERAS',                        'Reinstalación',                      '2025-01-01', '2026-12-31', 30.00,  25.00),
('VINERAS',                        'Reinstalación C/costo',              '2025-01-01', '2026-12-31', 30.00,  25.00),
('VINERAS',                        'Reparación Alta C/materiales',       '2025-11-01', '2026-12-31', NULL,  200.00),
('VINERAS',                        'Reparación C/materiales',            '2025-11-01', '2026-12-31', NULL,   40.00),
('VINERAS',                        'Revisión',                           '2025-01-01', '2026-12-31', 40.00,  30.00),
('VINERAS',                        'Revisión C/costo',                   '2025-01-01', '2026-12-31', 40.00,  30.00);

-- ---------------------------------------------------------------
-- VERIFICACION por CAS: compara el PDF contra el tarifario actual
-- Reemplaza 'ID_BLACK' e 'ID_SILAR' con los ID reales del PASO 1
-- ---------------------------------------------------------------
SELECT
    cas.Nombre_CAS,
    n.Categoria,
    n.Servicio,
    CONVERT(VARCHAR,n.Fecha_inicio,103) AS Fecha_inicio,
    CONVERT(VARCHAR,n.Fecha_fin,103)    AS Fecha_fin,
    n.Importe_Viejo                     AS Importe_PDF_Anterior,
    n.Importe_Nuevo                     AS Importe_PDF_Nuevo,
    t.Importe                           AS Importe_BD_Actual,
    CASE
        WHEN t.ID_Tarifario IS NULL THEN 'FALTA - INSERTAR'
        WHEN t.Importe = n.Importe_Nuevo THEN 'OK - Ya tiene valor nuevo'
        ELSE 'DIFERENTE - ACTUALIZAR'
    END AS Estado_BD
FROM #NuevoTarifario n
CROSS JOIN [dbo].[GAC_APP_TB_CAS] cas
LEFT JOIN [dbo].[GAC_APP_TB_TARIFARIO] t
    ON  t.Empresa      = cas.ID_CAS
    AND TRIM(t.Categoria) = TRIM(n.Categoria)
    AND TRIM(t.Servicio)  = TRIM(n.Servicio)
    AND t.Fecha_inicio = n.Fecha_inicio
WHERE (cas.Nombre_CAS LIKE '%Black%' OR cas.Nombre_CAS LIKE '%BLACK%'
    OR cas.Nombre_CAS LIKE '%Silar%' OR cas.Nombre_CAS LIKE '%SILAR%')
ORDER BY cas.Nombre_CAS, n.Categoria, n.Servicio;

-- ============================================================
-- PASO 3: Aplicar cambios (UPDATE e INSERT)
-- SOLO ejecutar después de revisar los resultados del PASO 2
-- ============================================================

BEGIN TRANSACTION;

-- UPDATE: filas que ya existen pero con importe distinto
UPDATE t
SET t.Importe   = n.Importe_Nuevo,
    t.Fecha_fin = n.Fecha_fin,
    t.Estado    = 'A'
FROM [dbo].[GAC_APP_TB_TARIFARIO] t
JOIN [dbo].[GAC_APP_TB_CAS] cas ON t.Empresa = cas.ID_CAS
JOIN #NuevoTarifario n
    ON  TRIM(t.Categoria) = TRIM(n.Categoria)
    AND TRIM(t.Servicio)  = TRIM(n.Servicio)
    AND t.Fecha_inicio    = n.Fecha_inicio
WHERE (cas.Nombre_CAS LIKE '%Black%' OR cas.Nombre_CAS LIKE '%BLACK%'
    OR cas.Nombre_CAS LIKE '%Silar%' OR cas.Nombre_CAS LIKE '%SILAR%')
  AND t.Importe <> n.Importe_Nuevo;

-- INSERT: filas que no existen todavía
INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO]
    (ID_Tarifario, Empresa, Categoria, Servicio, Importe, Fecha_inicio, Fecha_fin, Estado)
SELECT
    LOWER(CONVERT(VARCHAR(8), NEWID(), 2)),  -- ID aleatorio hex 8 chars
    cas.ID_CAS,
    n.Categoria,
    n.Servicio,
    n.Importe_Nuevo,
    n.Fecha_inicio,
    n.Fecha_fin,
    'A'
FROM #NuevoTarifario n
CROSS JOIN [dbo].[GAC_APP_TB_CAS] cas
WHERE (cas.Nombre_CAS LIKE '%Black%' OR cas.Nombre_CAS LIKE '%BLACK%'
    OR cas.Nombre_CAS LIKE '%Silar%' OR cas.Nombre_CAS LIKE '%SILAR%')
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO] t
      WHERE t.Empresa      = cas.ID_CAS
        AND TRIM(t.Categoria) = TRIM(n.Categoria)
        AND TRIM(t.Servicio)  = TRIM(n.Servicio)
        AND t.Fecha_inicio    = n.Fecha_inicio
  );

-- Ver resumen de lo que se aplicó
SELECT
    'ACTUALIZADOS' AS Tipo,
    COUNT(*) AS Total
FROM [dbo].[GAC_APP_TB_TARIFARIO] t
JOIN [dbo].[GAC_APP_TB_CAS] cas ON t.Empresa = cas.ID_CAS
JOIN #NuevoTarifario n
    ON TRIM(t.Categoria) = TRIM(n.Categoria)
    AND TRIM(t.Servicio) = TRIM(n.Servicio)
    AND t.Fecha_inicio   = n.Fecha_inicio
    AND t.Importe        = n.Importe_Nuevo
WHERE (cas.Nombre_CAS LIKE '%Black%' OR cas.Nombre_CAS LIKE '%BLACK%'
    OR cas.Nombre_CAS LIKE '%Silar%' OR cas.Nombre_CAS LIKE '%SILAR%');

-- Si todo se ve bien: COMMIT TRANSACTION;
-- Si algo falla:     ROLLBACK TRANSACTION;
-- COMMIT TRANSACTION;

DROP TABLE IF EXISTS #NuevoTarifario;
