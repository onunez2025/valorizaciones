# Valorización especial por reclasificación de servicio

## Contexto y motivación

Se detectó (vía OData de SAP C4C, campo `zaTipoServicioActualizadoFSM_KUT`) que el técnico de campo (app FSM) puede confirmar/cambiar el tipo de servicio de un ticket al cerrarlo — por ejemplo, un ticket originalmente solicitado como "Instalación" termina cerrado como "Verificación de área". Ni C4C ni la base de datos SIATC replicada conservan el valor original una vez que esto ocurre (investigado y confirmado: `ServiceRequestHistoricalVersionCollection` de C4C no tiene versiones para este campo en este tenant; `ServiceIssueCategoryID` se sobreescribe con el valor final).

El negocio quiere poder aplicar un **precio especial** a este tipo de casos (CAS + combinación de servicio), y dejar registrado en la configuración cuál era el "servicio inicial" esperado, aunque el sistema no pueda verificarlo automáticamente ticket por ticket.

## Decisión de diseño clave: sin detección automática de origen

**El sistema NO intenta detectar si un ticket específico "nació" como un servicio y terminó como otro.** Eso requeriría una fuente de verdad que no existe (confirmado en la investigación previa a este spec). En su lugar:

- El admin registra manualmente una regla: "para el CAS X, cuando el servicio final de un ticket sea Y, aplica el importe especial Z, vigente entre estas fechas".
- El campo **"Servicio Inicial" es puramente documental/informativo** — queda guardado como anotación de por qué existe la regla, pero el sistema nunca lo compara contra nada.
- El **matching real es idéntico al de "Casos Especiales" ya existente**: CAS + Servicio(s) Final(es) + rango de fechas + prioridad.

Esto es una extensión de la funcionalidad de Excepciones/Casos Especiales que ya existe en producción (`GAC_APP_TB_TARIFARIO_EXCEPCIONES`), no un sistema nuevo.

## Fuera de alcance

- Detección automática de reclasificación vía C4C OData (lo que se hizo hoy fue un reporte manual puntual, no se integra al flujo de cálculo).
- Verificación de que el "Servicio Inicial" declarado corresponda a la realidad del ticket.
- Cambios a la tabla `GAC_APP_TB_TARIFARIO` (tarifario base) — todo esto vive en la tabla de excepciones.

## 1. Modelo de datos

Extender `GAC_APP_TB_TARIFARIO_EXCEPCIONES` (no se crea tabla nueva):

```sql
ALTER TABLE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ADD
    ServicioInicial NVARCHAR(100) NULL,
    Fecha_Inicio DATE NULL,
    Fecha_Fin DATE NULL;
```

- `ServicioInicial`: texto libre o código de servicio (ej. "Instalación" / "CA_1"), documental, nunca se usa en `WHERE`.
- `Fecha_Inicio` / `Fecha_Fin`: `NULL` = sin límite (igual semántica que `GAC_APP_TB_TARIFARIO.Fecha_fin`). Reglas existentes (creadas antes de este cambio) tendrán ambas en `NULL` y seguirán aplicando siempre, sin cambio de comportamiento.
- El campo `Servicios` (`NVARCHAR(MAX)`, JSON array) ya existe en la tabla y ya se usa en el matching (`EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = tc.IdServicio)`). Se reutiliza tal cual como "Servicio(s) Final(es)" — no requiere cambio de esquema, solo exponerlo en la UI (hoy no tiene control de edición, ver sección 3).

## 2. Backend (`server.ts`)

### 2.1 Filtro de vigencia por fecha en las 3 consultas de resolución de precio

Las mismas 3 consultas que ya tienen el `COALESCE(Excepciones, Tarifario Base)` — `/api/valuations/:ruc` (línea ~730), `/api/dashboard/stats` (línea ~2298), `/api/dashboard/trends` (línea ~2387) — agregan a la sub-consulta de Excepciones el mismo patrón de filtro de fecha que ya se usa para el tarifario base (agregado en el commit `8f3e921`):

```sql
AND (ex.Fecha_Inicio IS NULL OR <fecha_ticket> >= ex.Fecha_Inicio)
AND (ex.Fecha_Fin IS NULL OR <fecha_ticket> <= ex.Fecha_Fin)
```

donde `<fecha_ticket>` es `s.CheckOut` (línea ~730) o `tc.CheckOut` (dashboard stats/trends), consistente con el campo ya usado para el filtro de fecha del tarifario base en esas mismas consultas.

### 2.2 Exponer qué regla aplicó

La consulta de `/api/valuations/:ruc` (la que arma el array `tickets` que consume el frontend) debe traer, junto al `Importe` ganador de Excepciones, también `ex.ServicioInicial` y `ex.Nombre` (nombre de la regla). Esto requiere ajustar el `OUTER APPLY` (líneas ~727-753) para seleccionar estas dos columnas adicionales cuando `Source = 1` (viene de Excepciones), y devolver `NULL`/vacío cuando el precio vino del tarifario base (`Source = 0`).

Nuevos campos en la respuesta de `/api/valuations/:ruc` por ticket:
- `ServicioInicial: string | null`
- `ReglaAplicada: string | null` (el `Nombre` de la excepción, para mostrar contexto)

### 2.3 CRUD de excepciones

`POST /api/tarifarios/exceptions/save` (línea ~1988 aprox.) acepta y persiste 3 campos nuevos en el body: `servicioInicial`, `fechaInicio`, `fechaFin`. `GET /api/tarifarios/exceptions/:casId` no cambia su filtro (debe seguir devolviendo TODAS las reglas del CAS, pasadas/futuras/vigentes, para que el admin las pueda gestionar) — el filtro de vigencia solo aplica en las consultas de cálculo de precio (2.1), no en el listado administrativo.

## 3. Frontend — Configuración (`TarifarioExceptionsModal.tsx`)

Se agregan al formulario de cada regla (hoy tiene: Nombre, Importe, Zonas Incluidas/Excluidas, Categorías, Prioridad):

- **Servicio Inicial**: input de texto simple (documental, sin validación contra catálogo — igual de simple que el campo `Servicio` en `TarifarioPage.tsx`, que ya es texto libre).
- **Servicio(s) Final(es)**: nuevo selector tipo badges-toggle, mismo patrón visual que el selector de "Categorías" que ya existe en este modal (líneas ~246-287), pero con las opciones viniendo del catálogo `SIATC.FSM_TipoServicio`. Se confirmó que no existe ningún endpoint que exponga este catálogo al frontend hoy — se crea uno nuevo, `GET /api/services`, devolviendo `{ Id, Descripcion }[]` desde `SIATC.FSM_TipoServicio` (mismo patrón que `GET /api/materials/categories`). Conecta con el campo `Servicios` (array) ya existente en el modelo.
- **Fecha Inicio / Fecha Fin**: dos `<input type="date">`, mismo estilo que los usados en `TarifarioPage.tsx` para editar `Fecha_inicio`/`Fecha_fin` del tarifario base.

## 4. Frontend — Valorizaciones (`ValuationsPage.tsx`)

### 4.1 En pantalla
La tabla de tickets muestra un badge/indicador nuevo cuando un ticket tiene `ReglaAplicada` no nulo (ej. junto a la columna de servicio), con tooltip mostrando `ServicioInicial` → servicio final y el nombre de la regla.

### 4.2 Exportar Borrador (`handleExportExcel`, hoja "Detalle Servicios")
Nueva columna "SERVICIO INICIAL" (o "CASO ESPECIAL") en el header `dHeaders` (línea ~1234), poblada con `tk.ServicioInicial || '-'`.

### 4.3 Cierre de Valorización (`handleExportClosureExcel`)
Misma columna nueva, mismo criterio, en el export que se genera al cerrar la quincena — para que quede en el histórico oficial.

## Plan de verificación

- Migración de columnas: verificar en BD que las reglas de Excepciones existentes (creadas antes del cambio) siguen aplicando exactamente igual (Fecha_Inicio/Fin en NULL = sin filtro).
- Crear una regla de prueba con fechas acotadas y confirmar que un ticket con fecha fuera de rango NO la toma (cae al tarifario base normal).
- Confirmar que `ServicioInicial` nunca participa en ningún `WHERE`/`JOIN` — solo se lee y se muestra.
- Probar el flujo completo: crear regla en Casos Especiales → generar valorización de un ticket que matchea CAS+Servicio Final → verificar que aparece en pantalla, en Exportar Borrador y en Cierre de Valorización.

## Plan de reversión

Los 3 campos nuevos son `NULL`-ables y aditivos — un rollback de código simplemente deja de leerlos/escribirlos sin romper nada. Si hace falta revertir la migración de BD: `ALTER TABLE ... DROP COLUMN ServicioInicial, Fecha_Inicio, Fecha_Fin` (seguro, no hay otras tablas/vistas dependientes de estas columnas nuevas).
