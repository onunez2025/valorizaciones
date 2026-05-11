-- Procedimiento para penalizar tickets sin rango horario al mediodía
-- Motivo: 56959fbd - NO REGISTRAR EL RANGO HORARIO DE ATENCIÓN
-- Importe: Configurado en GAC_APP_TB_VALORIZACIONES_CONFIG

CREATE PROCEDURE PR_GAC_PENALIZAR_FALTA_RANGO
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Importe DECIMAL(10,2);
    SELECT @Importe = CAST(Valor AS DECIMAL(10,2)) 
    FROM GAC_APP_TB_VALORIZACIONES_CONFIG 
    WHERE Clave = 'PENALIDAD_RANGO_HORARIO_IMPORTE';

    -- Importe por defecto si no existe configuración
    IF @Importe IS NULL SET @Importe = 11.00;

    INSERT INTO [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] (
        ID_Descuentos_CAS, Fecha, Ticket, Servicio, Producto, Importe, Estado, Creado_el, Creado_por, Motivo
    )
    SELECT 
        LEFT(LOWER(REPLACE(CAST(NEWID() AS VARCHAR(36)), '-', '')), 8) as ID_Descuentos_CAS,
        GETDATE() as Fecha,
        s.Ticket,
        s.IdServicio as Servicio,
        s.IdEquipo as Producto,
        @Importe as Importe,
        'Pendiente' as Estado,
        GETDATE() as Creado_el,
        'SISTEMA_AUTOMATICO' as Creado_por,
        '56959fbd' as Motivo
    FROM [APPGAC].[ServiciosViewSQL] s
    LEFT JOIN [dbo].[GAC_APP_TB_RANGO_HORARIO] r ON s.Ticket = r.ID_Ticket
    WHERE CAST(s.FechaVisita AS DATE) = CAST(GETDATE() AS DATE)
    AND (s.Estado = 'Ready to plan' OR s.Estado = 'Closed')
    AND CAST(s.FechaVisita AS DATE) <> CAST(s.Asunto AS DATE)
    AND r.ID_Ticket IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM [dbo].[GAC_APP_TB_TICKETS_DESCUENTOS] d 
        WHERE d.Ticket = s.Ticket AND d.Motivo = '56959fbd'
    );
END
GO
