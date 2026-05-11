USE [msdb]
GO

-- Script para crear el Job de penalización automática por falta de rango horario
-- Ejecución diaria a las 12:00 PM

DECLARE @jobId BINARY(16)
EXEC  msdb.dbo.sp_add_job @job_name=N'GAC_Penalizacion_Automatica_Rango_Horario', 
		@enabled=1, 
		@notify_level_eventlog=0, 
		@notify_level_email=2, 
		@notify_level_netsend=2, 
		@notify_level_page=2, 
		@delete_level=0, 
		@description=N'Ejecuta la penalización de 11 soles a tickets sin rango horario al mediodía.', 
		@category_name=N'[Uncategorized (Local)]', 
		@owner_login_name=N'sa', @job_id = @jobId OUTPUT

EXEC msdb.dbo.sp_add_jobstep @job_id=@jobId, @step_name=N'Ejecutar SP Penalizacion', 
		@step_id=1, 
		@cmdexec_success_code=0, 
		@on_success_action=1, 
		@on_fail_action=2, 
		@retry_attempts=0, 
		@retry_interval=0, 
		@os_run_priority=0, @subsystem=N'TSQL', 
		@command=N'EXEC PR_GAC_PENALIZAR_FALTA_RANGO', 
		@database_name=N'APPGAC', -- Cambiar por el nombre real de la base de datos si es diferente
		@flags=0

EXEC msdb.dbo.sp_add_jobschedule @job_id=@jobId, @name=N'Daily_Midday', 
		@enabled=1, 
		@freq_type=4, 
		@freq_interval=1, 
		@freq_subday_type=1, 
		@freq_subday_interval=0, 
		@freq_relative_interval=0, 
		@freq_recurrence_factor=1, 
		@active_start_date=20260511, 
		@active_end_date=99991231, 
		@active_start_time=120000, 
		@active_end_time=235959

EXEC msdb.dbo.sp_add_jobserver @job_id = @jobId, @server_name = N'(local)'
GO
