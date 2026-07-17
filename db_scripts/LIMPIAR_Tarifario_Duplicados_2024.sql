-- ============================================================
-- LIMPIEZA DE DUPLICADOS EXACTOS - GAC_APP_TB_TARIFARIO
-- Detectados: 17 pares (34 filas) con Empresa+Categoria+Servicio+
-- Fecha_inicio+Fecha_fin+Importe 100% identicos. Todas Estado='I'
-- (inactivas), periodo 2024-01-01/2024-05-31, Servicio='CA_7',
-- Creado_El/Creado_Por = NULL (carga previa al tracking de auditoria).
-- No afectan calculo de valorizaciones vigente (todas inactivas).
-- Ejecutar en pasos: PASO 1 para confirmar el universo exacto,
-- luego PASO 2 para aplicar el DELETE dentro de una transaccion.
-- ============================================================

-- ============================================================
-- PASO 1: Confirmar filas a eliminar (se conserva 1 por par: el
-- ID_Tarifario menor; se elimina el resto)
-- ============================================================
WITH Duplicados AS (
    SELECT
        ID_Tarifario, Empresa, Categoria, Servicio, Importe,
        Fecha_inicio, Fecha_fin, Estado, Creado_El, Creado_Por,
        ROW_NUMBER() OVER (
            PARTITION BY Empresa, TRIM(Categoria), TRIM(Servicio), Fecha_inicio, Fecha_fin, Importe
            ORDER BY ID_Tarifario ASC
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY Empresa, TRIM(Categoria), TRIM(Servicio), Fecha_inicio, Fecha_fin, Importe
        ) AS TotalEnGrupo
    FROM [dbo].[GAC_APP_TB_TARIFARIO]
    WHERE Estado = 'I'   -- guarda de seguridad: solo se tocan filas ya inactivas
)
SELECT *
FROM Duplicados
WHERE TotalEnGrupo > 1
ORDER BY Empresa, Categoria, Servicio, rn;

-- IMPORTANTE: Verifica que el resultado sean exactamente 34 filas
-- (17 pares), todas con rn IN (1,2) y TotalEnGrupo = 2.
-- Las filas con rn = 1 son las que se CONSERVAN.
-- Las filas con rn > 1 son las que se ELIMINARAN en el PASO 2.

-- ============================================================
-- PASO 2: Eliminar las filas duplicadas (rn > 1)
-- SOLO ejecutar después de revisar los resultados del PASO 1
-- ============================================================

BEGIN TRANSACTION;

WITH Duplicados AS (
    SELECT
        ID_Tarifario,
        ROW_NUMBER() OVER (
            PARTITION BY Empresa, TRIM(Categoria), TRIM(Servicio), Fecha_inicio, Fecha_fin, Importe
            ORDER BY ID_Tarifario ASC
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY Empresa, TRIM(Categoria), TRIM(Servicio), Fecha_inicio, Fecha_fin, Importe
        ) AS TotalEnGrupo
    FROM [dbo].[GAC_APP_TB_TARIFARIO]
    WHERE Estado = 'I'
)
DELETE t
FROM [dbo].[GAC_APP_TB_TARIFARIO] t
JOIN Duplicados d ON d.ID_Tarifario = t.ID_Tarifario
WHERE d.TotalEnGrupo > 1 AND d.rn > 1;

-- Verificacion: debe reportar 17 filas eliminadas
SELECT @@ROWCOUNT AS FilasEliminadas;

-- Si el numero de filas eliminadas es 17: COMMIT TRANSACTION;
-- Si algo no cuadra:                      ROLLBACK TRANSACTION;
-- COMMIT TRANSACTION;
