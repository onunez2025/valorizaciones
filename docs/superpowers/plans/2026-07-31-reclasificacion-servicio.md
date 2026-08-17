# Valorización especial por reclasificación de servicio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extender el sistema de "Casos Especiales" (`GAC_APP_TB_TARIFARIO_EXCEPCIONES`) para que un admin pueda registrar una regla de precio especial documentando un "Servicio Inicial" (informativo) y un "Servicio Final" (que sí filtra), con vigencia por fechas, y que ese dato se refleje en pantalla y en los dos exports de Valorizaciones (Borrador y Cierre).

**Architecture:** Extensión aditiva de una tabla y endpoints ya existentes, no un subsistema nuevo. El matching de precio sigue siendo CAS + Servicio Final + fecha (mismo mecanismo que ya usa Casos Especiales); "Servicio Inicial" nunca participa en ningún `WHERE`. Ver spec completo en `docs/superpowers/specs/2026-07-31-reclasificacion-servicio-design.md`.

**Tech Stack:** Node/Express + `mssql` (backend, `server.ts` → compila a `dist-server/server.js`), React + TypeScript + ExcelJS (frontend), Azure SQL Server.

## Global Constraints

- Todas las columnas nuevas son `NULL`-ables — reglas/registros existentes deben seguir funcionando exactamente igual sin ellas.
- Todo `.input()` de mssql debe declarar tipo SQL explícito (usar `addInput()` de `lib/db.ts`, patrón ya usado en todo `server.ts`) — regla de seguridad del proyecto (`CLAUDE.md` sección 3).
- No hay test runner configurado en este repo (`package.json` no tiene script `test`). La verificación de cada tarea es: `npx tsc -p tsconfig.server.json` (backend), `npx tsc --noEmit -p tsconfig.json` (frontend), `npx eslint <archivo>`, y verificación manual contra la base de datos real / navegador (mismo patrón usado en el resto de esta sesión).
- Después de cada cambio en `server.ts`, correr `npx tsc -p tsconfig.server.json` para regenerar `dist-server/server.js` — el repo commitea el build compilado, no solo el fuente.
- Commits en español, estilo `tipo(area): descripción corta`, consistente con el historial del repo (`git log --oneline`).

---

### Task 1: Migración de base de datos — columnas nuevas

**Files:**
- Modify: `server.ts:187-210` (función `runMigrations`)
- Test: verificación manual vía SQL (ver Step 3)

**Interfaces:**
- Produce: columnas `ServicioInicial NVARCHAR(100) NULL`, `Fecha_Inicio DATE NULL`, `Fecha_Fin DATE NULL` en `[dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES]`; columna `Servicio_Inicial VARCHAR(100) NULL` en `[dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE]`. Todas las tareas siguientes dependen de que estas columnas existan.

- [ ] **Step 1: Agregar los dos bloques de migración**

Editar `server.ts`, dentro de `runMigrations`, agregando dos bloques nuevos justo después del bloque existente de "Canal Institucional" (después de la línea `console.log('[Migration] Canal Institucional → Cupo_Area OK');` y antes del `} catch (err) {` de cierre):

```typescript
        // Migración: Casos Especiales gana Servicio Inicial (documental) y vigencia por fecha
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

        // Migración: Detalle de valorización guarda el Servicio Inicial documental
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
```

- [ ] **Step 2: Compilar**

Run: `npx tsc -p tsconfig.server.json`
Expected: sin errores (el cambio es solo texto SQL dentro de un template string, no afecta tipos).

- [ ] **Step 3: Verificar que la migración corre — levantar el backend local una vez**

Requiere `.env` local con `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `PORT=3000` apuntando a la misma base de datos de siempre (ver sesiones anteriores para cómo se obtuvieron esas credenciales — están en el MCP server local de azure-sql si existe, o pedirlas al usuario).

Run: `node dist-server/server.js`
Expected en el log: líneas `[Migration] Excepciones → ServicioInicial/Fecha_Inicio/Fecha_Fin OK` y `[Migration] Detalle Valorización → Servicio_Inicial OK`, sin `[Migration] Error:`.

Detener el proceso (Ctrl+C) después de confirmar el log — no hace falta dejarlo corriendo.

- [ ] **Step 4: Verificar las columnas directamente en SQL**

Ejecutar contra la base de datos real:

```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE (TABLE_NAME = 'GAC_APP_TB_TARIFARIO_EXCEPCIONES' AND COLUMN_NAME IN ('ServicioInicial','Fecha_Inicio','Fecha_Fin'))
   OR (TABLE_NAME = 'GAC_APP_TB_VALORIZACIONES_DETALLE' AND COLUMN_NAME = 'Servicio_Inicial')
```

Expected: 4 filas, todas con `IS_NULLABLE = 'YES'`.

- [ ] **Step 5: Commit**

```bash
git add server.ts dist-server/server.js
git commit -m "feat(tarifario): migracion para ServicioInicial y vigencia por fecha en Casos Especiales"
```

---

### Task 2: Endpoint `GET /api/services` — catálogo de servicios

**Files:**
- Modify: `server.ts` (agregar endpoint nuevo, junto a `app.get('/api/materials/categories', ...)` en la línea ~1879, mismo bloque de rutas de catálogos)

**Interfaces:**
- Produce: `GET /api/services` → `{ Id: string; Descripcion: string }[]`. Consumido por Task 5 (frontend del selector de "Servicio Final").

- [ ] **Step 1: Agregar el endpoint**

Insertar inmediatamente después del bloque de `app.get('/api/materials/categories', ...)` (que termina en `});` alrededor de la línea 1885):

```typescript
app.get('/api/services', verifyToken, async (req: Request, res: Response) => {
    try {
        const db = await getDb();
        const result = await db.request().query("SELECT Id, Descripcion FROM [SIATC].[FSM_TipoServicio] ORDER BY Descripcion");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});
```

- [ ] **Step 2: Compilar**

Run: `npx tsc -p tsconfig.server.json`
Expected: sin errores.

- [ ] **Step 3: Verificar manualmente**

Con el backend local corriendo (`node dist-server/server.js`) y un token JWT válido (obtenido haciendo login contra `/api/auth/login`), probar:

```bash
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/services | head -c 300
```

Expected: JSON array de objetos `{"Id":"CA_1","Descripcion":"Instalación"}` etc., 25 elementos (mismo catálogo verificado en la sesión de análisis del tarifario).

- [ ] **Step 4: Commit**

```bash
git add server.ts dist-server/server.js
git commit -m "feat(api): endpoint GET /api/services para catalogo FSM_TipoServicio"
```

---

### Task 3: Persistir `ServicioInicial`/`Fecha_Inicio`/`Fecha_Fin` en Casos Especiales

**Files:**
- Modify: `server.ts:1996-2031` (`POST /api/tarifarios/exceptions/save`)

**Interfaces:**
- Consume: columnas creadas en Task 1.
- Produce: `POST /api/tarifarios/exceptions/save` ahora acepta en el body `servicioInicial?: string`, `fechaInicio?: string | null`, `fechaFin?: string | null`. Consumido por Task 5 (frontend).

- [ ] **Step 1: Reemplazar el endpoint completo**

Reemplazar todo el bloque de `app.post('/api/tarifarios/exceptions/save', ...)` (líneas 1996-2031) por:

```typescript
app.post('/api/tarifarios/exceptions/save', verifyToken, verifyPermission('val.tarifario.edit'), async (req: Request, res: Response) => {
    const { id, empresa, nombre, zonasIncluidas, zonasExcluidas, categorias, servicios, importe, prioridad, estado, servicioInicial, fechaInicio, fechaFin } = req.body;
    try {
        const db = await getDb();
        const finalId = id || crypto.randomBytes(4).toString('hex');

        const excSaveReq = db.request();
        addInput(excSaveReq, 'id', sql.VarChar(8), finalId);
        addInput(excSaveReq, 'empresa', sql.VarChar(50), empresa);
        addInput(excSaveReq, 'nombre', sql.NVarChar(255), nombre);
        addInput(excSaveReq, 'zi', sql.NVarChar(sql.MAX), JSON.stringify(zonasIncluidas || null));
        addInput(excSaveReq, 'ze', sql.NVarChar(sql.MAX), JSON.stringify(zonasExcluidas || null));
        addInput(excSaveReq, 'cat', sql.NVarChar(sql.MAX), JSON.stringify(categorias || null));
        addInput(excSaveReq, 'serv', sql.NVarChar(sql.MAX), JSON.stringify(servicios || null));
        addInput(excSaveReq, 'imp', sql.Decimal(18, 2), importe);
        addInput(excSaveReq, 'prio', sql.Int, prioridad || 0);
        addInput(excSaveReq, 'est', sql.VarChar(1), estado || 'A');
        addInput(excSaveReq, 'servInicial', sql.NVarChar(100), servicioInicial || null);
        addInput(excSaveReq, 'fechaIni', sql.Date, fechaInicio || null);
        addInput(excSaveReq, 'fechaFin', sql.Date, fechaFin || null);
        await excSaveReq.query(`
                IF EXISTS (SELECT 1 FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE IdExcepcion = @id)
                BEGIN
                    UPDATE [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES]
                    SET Nombre = @nombre, Zonas_Incluidas = @zi, Zonas_Excluidas = @ze, 
                        Categorias = @cat, Servicios = @serv, Importe = @imp, 
                        Prioridad = @prio, Estado = @est,
                        ServicioInicial = @servInicial, Fecha_Inicio = @fechaIni, Fecha_Fin = @fechaFin
                    WHERE IdExcepcion = @id
                END
                ELSE
                BEGIN
                    INSERT INTO [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] 
                    (IdExcepcion, Empresa, Nombre, Zonas_Incluidas, Zonas_Excluidas, Categorias, Servicios, Importe, Prioridad, Estado, ServicioInicial, Fecha_Inicio, Fecha_Fin)
                    VALUES (@id, @empresa, @nombre, @zi, @ze, @cat, @serv, @imp, @prio, @est, @servInicial, @fechaIni, @fechaFin)
                END
            `);
        res.json({ success: true, id: finalId });
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});
```

- [ ] **Step 2: Compilar**

Run: `npx tsc -p tsconfig.server.json`
Expected: sin errores.

- [ ] **Step 3: Verificar manualmente contra un CAS de prueba**

Con el backend local corriendo, usando un `casId` real (ej. el de SILAR, `6a138c82`, o cualquiera de prueba) y un token con permiso `val.tarifario.edit`:

```bash
curl -s -X POST http://localhost:3000/api/tarifarios/exceptions/save \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"empresa":"6a138c82","nombre":"Prueba reclasificacion","servicios":["Verificación de área"],"importe":25,"prioridad":5,"estado":"A","servicioInicial":"Instalación","fechaInicio":"2026-07-01","fechaFin":"2026-12-31"}'
```

Expected: `{"success":true,"id":"<8 chars hex>"}`.

Luego verificar en SQL:

```sql
SELECT IdExcepcion, Nombre, Servicios, ServicioInicial, Fecha_Inicio, Fecha_Fin, Importe
FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES]
WHERE Nombre = 'Prueba reclasificacion'
```

Expected: 1 fila con `ServicioInicial = 'Instalación'`, `Fecha_Inicio = 2026-07-01`, `Fecha_Fin = 2026-12-31`.

Dejar esta fila de prueba en la base — se reutiliza para verificar Task 4.

- [ ] **Step 4: Commit**

```bash
git add server.ts dist-server/server.js
git commit -m "feat(tarifario): persistir ServicioInicial y vigencia en Casos Especiales"
```

---

### Task 4: Filtro de vigencia + exponer regla aplicada en las consultas de precio

**Files:**
- Modify: `server.ts:727-753` (`OUTER APPLY` de resolución de tarifa en `GET /api/valuations/:ruc`)
- Modify: `server.ts` (subconsulta de Excepciones dentro de `CalculoTarifas` en `GET /api/dashboard/stats`, ~línea 2307)
- Modify: `server.ts` (subconsulta de Excepciones dentro de `CalculoTarifas` en `GET /api/dashboard/trends`, ~línea 2398)

**Interfaces:**
- Consume: fila de prueba creada en Task 3 (Empresa `6a138c82`, Servicios `["Verificación de área"]`, vigente 2026-07-01 a 2026-12-31).
- Produce: cada ticket devuelto por `GET /api/valuations/:ruc` gana `ServicioInicial: string | null` y `ReglaAplicada: string | null`. Consumido por Task 7 (frontend).

- [ ] **Step 1: Reescribir el `OUTER APPLY` de `/api/valuations/:ruc`**

Ubicar el bloque exacto (líneas 727-753):

```typescript
            OUTER APPLY (
                SELECT TOP 1 CAST(Importe AS FLOAT) as Importe 
                FROM (
                    -- 1. Buscar en Excepciones
                    SELECT ex.Importe, ex.Prioridad, ex.Creado_El, 1 as Source
                    FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                    WHERE ex.Empresa = s.IdCAS
                      AND ex.Estado = 'A'
                      AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = ISNULL(m.Categoria, 'N/A')))
                      AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = s.IdServicio OR value = s.Servicio))
                      AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                      AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                    
                    UNION ALL
                    
                    -- 2. Tarifario Base
                    SELECT t.Importe, 0 as Prioridad, t.Fecha_inicio as Creado_El, 0 as Source
                    FROM [dbo].[GAC_APP_TB_TARIFARIO] t 
                    WHERE t.Empresa = s.IdCAS 
                      AND (t.Servicio = s.IdServicio OR t.Servicio = s.Servicio)
                      AND TRIM(t.Categoria) = TRIM(ISNULL(m.Categoria, 'N/A'))
                      AND s.CheckOut >= t.Fecha_inicio 
                      AND (t.Fecha_fin IS NULL OR s.CheckOut <= t.Fecha_fin)
                      AND t.Estado = 'A'
                ) all_rates
                ORDER BY Source DESC, Prioridad DESC, Creado_El DESC
            ) rate
```

Reemplazar por:

```typescript
            OUTER APPLY (
                SELECT TOP 1 CAST(Importe AS FLOAT) as Importe, ServicioInicial, Nombre
                FROM (
                    -- 1. Buscar en Excepciones
                    SELECT ex.Importe, ex.Prioridad, ex.Creado_El, 1 as Source, ex.ServicioInicial, ex.Nombre
                    FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                    WHERE ex.Empresa = s.IdCAS
                      AND ex.Estado = 'A'
                      AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = ISNULL(m.Categoria, 'N/A')))
                      AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = s.IdServicio OR value = s.Servicio))
                      AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                      AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = s.Ciudad OR value = s.Distrito))
                      AND (ex.Fecha_Inicio IS NULL OR s.CheckOut >= ex.Fecha_Inicio)
                      AND (ex.Fecha_Fin IS NULL OR s.CheckOut <= ex.Fecha_Fin)
                    
                    UNION ALL
                    
                    -- 2. Tarifario Base
                    SELECT t.Importe, 0 as Prioridad, t.Fecha_inicio as Creado_El, 0 as Source, NULL as ServicioInicial, NULL as Nombre
                    FROM [dbo].[GAC_APP_TB_TARIFARIO] t 
                    WHERE t.Empresa = s.IdCAS 
                      AND (t.Servicio = s.IdServicio OR t.Servicio = s.Servicio)
                      AND TRIM(t.Categoria) = TRIM(ISNULL(m.Categoria, 'N/A'))
                      AND s.CheckOut >= t.Fecha_inicio 
                      AND (t.Fecha_fin IS NULL OR s.CheckOut <= t.Fecha_fin)
                      AND t.Estado = 'A'
                ) all_rates
                ORDER BY Source DESC, Prioridad DESC, Creado_El DESC
            ) rate
```

- [ ] **Step 2: Exponer las 2 columnas nuevas en el `SELECT` principal**

En el mismo query, ubicar la línea `                END as Adicionales` (fin del `SELECT` principal, línea ~721) y agregar justo después (antes de `            FROM [APPGAC].[ServiciosViewSQL] s`):

```typescript
                END as Adicionales,
                rate.ServicioInicial as ServicioInicial,
                rate.Nombre as ReglaAplicada
```

(Reemplaza la línea `END as Adicionales` — que antes no tenía coma al final — agregando la coma y las dos columnas nuevas.)

- [ ] **Step 3: Agregar el filtro de fecha a la subconsulta de Excepciones en `/api/dashboard/stats`**

Ubicar (dentro de `CalculoTarifas`, ~línea 2307):

```sql
                        (SELECT TOP 1 ex.Importe 
                         FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                         WHERE ex.Empresa = tc.ID_CAS
                           AND ex.Estado = 'A'
                           AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = tc.Categoria))
                           AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = tc.IdServicio))
                           AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = tc.Ciudad OR value = tc.Distrito))
                           AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = tc.Ciudad OR value = tc.Distrito))
                         ORDER BY ex.Prioridad DESC, ex.Creado_El DESC),
```

Reemplazar por (agrega 2 líneas `AND` antes del `ORDER BY`):

```sql
                        (SELECT TOP 1 ex.Importe 
                         FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] ex
                         WHERE ex.Empresa = tc.ID_CAS
                           AND ex.Estado = 'A'
                           AND (ex.Categorias IS NULL OR ex.Categorias = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Categorias) WHERE value = tc.Categoria))
                           AND (ex.Servicios IS NULL OR ex.Servicios = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Servicios) WHERE value = tc.IdServicio))
                           AND (ex.Zonas_Excluidas IS NULL OR ex.Zonas_Excluidas = 'null' OR NOT EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Excluidas) WHERE value = tc.Ciudad OR value = tc.Distrito))
                           AND (ex.Zonas_Incluidas IS NULL OR ex.Zonas_Incluidas = 'null' OR EXISTS (SELECT 1 FROM OPENJSON(ex.Zonas_Incluidas) WHERE value = tc.Ciudad OR value = tc.Distrito))
                           AND (ex.Fecha_Inicio IS NULL OR tc.CheckOut >= ex.Fecha_Inicio)
                           AND (ex.Fecha_Fin IS NULL OR tc.CheckOut <= ex.Fecha_Fin)
                         ORDER BY ex.Prioridad DESC, ex.Creado_El DESC),
```

- [ ] **Step 4: Repetir el mismo cambio del Step 3 en `/api/dashboard/trends`**

Es el mismo texto exacto, en la segunda ocurrencia de este patrón dentro de `server.ts` (dentro de la segunda `CalculoTarifas AS (`, ~línea 2398). Aplicar el mismo reemplazo (agregar las 2 líneas `AND (ex.Fecha_Inicio...)` / `AND (ex.Fecha_Fin...)` antes del `ORDER BY ex.Prioridad DESC, ex.Creado_El DESC)`).

- [ ] **Step 5: Compilar**

Run: `npx tsc -p tsconfig.server.json`
Expected: sin errores.

- [ ] **Step 6: Verificar manualmente con la fila de prueba de Task 3**

Con el backend local corriendo y usando un rango de fechas que caiga dentro de 2026-07-01/2026-12-31, llamar:

```bash
curl -s "http://localhost:3000/api/valuations/<RUC_DE_SILAR>?start=2026-07-01&end=2026-07-31" -H "Authorization: Bearer <TOKEN>" | python3 -m json.tool | grep -A2 "ReglaAplicada"
```

Expected: para tickets de SILAR cuyo `Servicio` sea "Verificación de área" dentro de ese rango, `ReglaAplicada: "Prueba reclasificacion"` y `ServicioInicial: "Instalación"`. Para el resto de tickets, ambos campos `null`.

Si SILAR no tiene tickets de "Verificación de área" en ese rango en este momento, alternativamente verificar directo en SQL Server Management Studio / Azure Data Studio corriendo la porción del `OUTER APPLY` de forma aislada contra un ticket conocido.

- [ ] **Step 7: Borrar la fila de prueba**

```sql
DELETE FROM [dbo].[GAC_APP_TB_TARIFARIO_EXCEPCIONES] WHERE Nombre = 'Prueba reclasificacion'
```

- [ ] **Step 8: Commit**

```bash
git add server.ts dist-server/server.js
git commit -m "feat(tarifario): filtrar Casos Especiales por vigencia y exponer regla aplicada en valorizaciones"
```

---

### Task 5: Frontend — Configuración en "Casos Especiales"

**Files:**
- Modify: `src/components/tarifario/TarifarioExceptionsModal.tsx`

**Interfaces:**
- Consume: `GET /api/services` (Task 2), `POST /tarifarios/exceptions/save` con los campos nuevos (Task 3).
- Produce: ninguna otra tarea depende de este archivo.

- [ ] **Step 1: Ampliar la interfaz `Exception`**

Reemplazar (líneas 13-24):

```typescript
interface Exception {
    IdExcepcion?: string;
    Empresa: string;
    Nombre: string;
    Zonas_Incluidas: string[] | null;
    Zonas_Excluidas: string[] | null;
    Categorias: string[] | null;
    Servicios: string[] | null;
    Importe: number;
    Prioridad: number;
    Estado: string;
}
```

por:

```typescript
interface Exception {
    IdExcepcion?: string;
    Empresa: string;
    Nombre: string;
    Zonas_Incluidas: string[] | null;
    Zonas_Excluidas: string[] | null;
    Categorias: string[] | null;
    Servicios: string[] | null;
    Importe: number;
    Prioridad: number;
    Estado: string;
    ServicioInicial: string | null;
    Fecha_Inicio: string | null;
    Fecha_Fin: string | null;
}

interface ServiceOption {
    Id: string;
    Descripcion: string;
}
```

- [ ] **Step 2: Cargar el catálogo de servicios**

Agregar estado nuevo junto a `availableDistritos` (línea 39):

```typescript
    const [availableServices, setAvailableServices] = useState<ServiceOption[]>([]);
```

Agregar `fetchServices()` a la llamada del `useEffect` (línea 41-47), quedando:

```typescript
    useEffect(() => {
        if (isOpen) {
            fetchExceptions();
            fetchCategories();
            fetchDistritos();
            fetchServices();
        }
    }, [isOpen, cas.ID_CAS]);
```

Agregar la función `fetchServices`, junto a `fetchDistritos` (después de la línea 85):

```typescript
    const fetchServices = async () => {
        try {
            const data = await ApiClient.request('/services');
            setAvailableServices(data);
        } catch (err) {
            console.error("Error fetching services:", err);
        }
    };
```

- [ ] **Step 3: Inicializar los campos nuevos al crear una regla**

En `handleAdd` (líneas 87-100), reemplazar el objeto `newEx` por:

```typescript
    const handleAdd = () => {
        const newEx: Exception = {
            Empresa: cas.ID_CAS.toString(),
            Nombre: 'Nuevo Caso Especial',
            Zonas_Incluidas: [],
            Zonas_Excluidas: [],
            Categorias: [],
            Servicios: [],
            Importe: 0,
            Prioridad: 1,
            Estado: 'A',
            ServicioInicial: null,
            Fecha_Inicio: null,
            Fecha_Fin: null
        };
        setExceptions([newEx, ...exceptions]);
    };
```

- [ ] **Step 4: Enviar los campos nuevos al guardar**

En `handleSave` (líneas 102-127), dentro del `body: JSON.stringify({...})`, agregar 3 propiedades. El objeto queda:

```typescript
                body: JSON.stringify({
                    id: ex.IdExcepcion,
                    empresa: cas.ID_CAS,
                    nombre: ex.Nombre,
                    zonasIncluidas: ex.Zonas_Incluidas,
                    zonasExcluidas: ex.Zonas_Excluidas,
                    categorias: ex.Categorias,
                    servicios: ex.Servicios,
                    importe: ex.Importe,
                    prioridad: ex.Prioridad,
                    estado: ex.Estado,
                    servicioInicial: ex.ServicioInicial,
                    fechaInicio: ex.Fecha_Inicio,
                    fechaFin: ex.Fecha_Fin
                })
```

- [ ] **Step 5: Agregar los controles de UI**

Ubicar el bloque de "Categorías" (líneas 246-287), que termina justo antes del cierre `</div>` en la línea 288 (`</div>` que cierra `<div className="flex-1 space-y-4">`). Insertar, inmediatamente después del bloque de Categorías (después del `</div>` que cierra el `<div className="space-y-2">` de Categorías, línea 287) y antes de la línea 288:

```tsx
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-bold uppercase text-cb-neutral tracking-wider flex items-center gap-2">
                                                    <Tag className="w-3 h-3" /> Servicio(s) Final(es)
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {availableServices.map(svc => (
                                                        <button
                                                            key={svc.Id}
                                                            type="button"
                                                            onClick={() => {
                                                                const newEx = [...exceptions];
                                                                const current = newEx[idx].Servicios || [];
                                                                newEx[idx] = {
                                                                    ...newEx[idx],
                                                                    Servicios: current.includes(svc.Descripcion)
                                                                        ? current.filter(s => s !== svc.Descripcion)
                                                                        : [...current, svc.Descripcion]
                                                                };
                                                                setExceptions(newEx);
                                                            }}
                                                            className={cn(
                                                                ex.Servicios?.includes(svc.Descripcion)
                                                                    ? cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.PRIMARY, "cursor-pointer")
                                                                    : cn(SIATC_THEME.STATES.BADGE_BASE, "bg-transparent border-dashed border-cb-border text-cb-neutral hover:border-primary/40 cursor-pointer")
                                                            )}
                                                        >
                                                            {svc.Descripcion}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-bold uppercase text-cb-neutral tracking-wider">
                                                        Servicio Inicial (informativo)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={ex.ServicioInicial || ''}
                                                        onChange={e => {
                                                            const newEx = [...exceptions];
                                                            newEx[idx] = { ...newEx[idx], ServicioInicial: e.target.value || null };
                                                            setExceptions(newEx);
                                                        }}
                                                        placeholder="Ej: Instalación"
                                                        className={cn(SIATC_THEME.COMPONENTS.INPUT, "w-full dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-bold uppercase text-cb-neutral tracking-wider">
                                                        Vigente desde
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={ex.Fecha_Inicio ? ex.Fecha_Inicio.split('T')[0] : ''}
                                                        onChange={e => {
                                                            const newEx = [...exceptions];
                                                            newEx[idx] = { ...newEx[idx], Fecha_Inicio: e.target.value || null };
                                                            setExceptions(newEx);
                                                        }}
                                                        className={cn(SIATC_THEME.COMPONENTS.INPUT, "w-full dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-bold uppercase text-cb-neutral tracking-wider">
                                                        Vigente hasta
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={ex.Fecha_Fin ? ex.Fecha_Fin.split('T')[0] : ''}
                                                        onChange={e => {
                                                            const newEx = [...exceptions];
                                                            newEx[idx] = { ...newEx[idx], Fecha_Fin: e.target.value || null };
                                                            setExceptions(newEx);
                                                        }}
                                                        className={cn(SIATC_THEME.COMPONENTS.INPUT, "w-full dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                                    />
                                                </div>
                                            </div>
```

- [ ] **Step 6: Actualizar el parseo de `fetchExceptions`**

`ServicioInicial`, `Fecha_Inicio`, `Fecha_Fin` son escalares (no JSON), no requieren parseo — el `map` existente en `fetchExceptions` (líneas 53-59) ya hace spread de `...ex` primero, así que estos campos pasan sin cambios. No se requiere ninguna edición en este método.

- [ ] **Step 7: Compilar**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

Run: `npx eslint src/components/tarifario/TarifarioExceptionsModal.tsx`
Expected: sin errores nuevos (puede haber warnings preexistentes de `react-hooks/exhaustive-deps` en `fetchExceptions` — no corregir, es preexistente y fuera de alcance).

- [ ] **Step 8: Verificar en navegador**

Con el backend y frontend local corriendo (`npm run dev` + `node dist-server/server.js`), loguearse, ir a Tarifario → seleccionar un CAS → botón "Casos Especiales" → "Agregar Regla". Confirmar que aparecen los 3 controles nuevos (badges de Servicio Final poblados desde el catálogo, input de Servicio Inicial, y 2 inputs de fecha). Llenar una regla de prueba, guardar, cerrar el modal, reabrirlo y confirmar que los valores persistieron.

- [ ] **Step 9: Commit**

```bash
git add src/components/tarifario/TarifarioExceptionsModal.tsx
git commit -m "feat(tarifario): UI para Servicio Inicial, Servicio Final y vigencia en Casos Especiales"
```

---

### Task 6: Persistir `ServicioInicial` al cerrar/guardar una valorización

**Files:**
- Modify: `server.ts:1493-1539` (bulk insert a `GAC_APP_TB_VALORIZACIONES_DETALLE` dentro de `POST /api/valuations/close`)
- Modify: `server.ts:1784-1804` (`SELECT` de detalle de cierre, endpoint que alimenta `closureDetails`)
- Modify: `src/pages/ValuationsPage.tsx:821-840` (`handleCloseFortnightCurrent`, construcción de `ticketDetails`)
- Modify: `src/pages/ValuationsPage.tsx:898-...` (`handleSaveDraft`, mismo patrón — ver Step 3)

**Interfaces:**
- Consume: `ticket.ServicioInicial` (producido por Task 4, disponible en `tickets` state de `ValuationsPage.tsx` una vez completada Task 7 Step 1).
- Produce: `GAC_APP_TB_VALORIZACIONES_DETALLE.Servicio_Inicial` queda poblado al cerrar/guardar; el endpoint `GET` de detalle de cierre lo devuelve como `Servicio_Inicial`. Consumido por Task 7 (`handleExportClosureExcel`).

- [ ] **Step 1: Agregar la columna al bulk insert del backend**

En `server.ts`, dentro del bloque que arma `const table = new sql.Table(...)` (líneas 1495-1513), agregar una línea después de `table.columns.add('Nombre_Equipo', sql.NVarChar(255), { nullable: true });`:

```typescript
                table.columns.add('Servicio_Inicial', sql.VarChar(100), { nullable: true });
```

Y en el bloque `table.rows.add(...)` (líneas 1516-1534), agregar `item.servicioInicial` como último argumento, después de `item.nombreEquipo`:

```typescript
                for (const item of details) {
                    table.rows.add(
                        actualIdCierre,
                        item.ticket,
                        item.monto,
                        item.fecha ? new Date(item.fecha) : null,
                        item.tipo,
                        item.servicio,
                        item.categoria,
                        item.fechaVisita ? new Date(item.fechaVisita) : null,
                        item.fechaCierre ? new Date(item.fechaCierre) : null,
                        item.diasDiferencia,
                        item.codigoExterno,
                        item.tarifaBase,
                        item.adicionales,
                        item.idReferencia ? item.idReferencia.toString() : null,
                        item.distrito,
                        item.departamento,
                        item.nombreEquipo,
                        item.servicioInicial || null
                    );
                }
```

- [ ] **Step 2: Agregar la columna al SELECT de detalle de cierre**

En `server.ts`, ubicar el `SELECT` dentro del endpoint que devuelve el detalle de un cierre (líneas 1784-1804), agregar `d.Servicio_Inicial,` después de `d.Nombre_Equipo`:

```typescript
                    d.Nombre_Equipo,
                    d.Servicio_Inicial
                FROM [dbo].[GAC_APP_TB_VALORIZACIONES_DETALLE] d
```

- [ ] **Step 3: Compilar backend**

Run: `npx tsc -p tsconfig.server.json`
Expected: sin errores.

- [ ] **Step 4: Enviar `servicioInicial` desde el frontend al cerrar/guardar**

En `src/pages/ValuationsPage.tsx`, en `handleCloseFortnightCurrent` (líneas 821-840), agregar `servicioInicial: tk.ServicioInicial,` como última propiedad del objeto mapeado:

```typescript
        const ticketDetails = tickets.map(tk => ({
            ticket: tk.Ticket,
            monto: tk.TarifaBase + (tk.Adicionales || 0),
            fecha: tk.Fecha,
            tipo: 'SERVICIO',
            servicio: tk.ServicioNombre || tk.Servicio,
            categoria: tk.EsInstitucional ? `${tk.Categoria} [OBRAS]` : tk.Categoria,
            fechaVisita: tk.FechaVisita,
            fechaCierre: tk.FechaCierre || tk.Fecha,
            diasDiferencia: tk.DiasDiferencia,
            codigoExterno: tk.CodigoEquipo,
            tarifaBase: tk.TarifaBase,
            adicionales: (tk.Adicionales || 0),
            nombreTecnico: tk.NombreTecnico,
            apellidoTecnico: tk.ApellidoTecnico,
            comentarioTecnico: tk.ComentarioTecnico,
            distrito: tk.Distrito,
            departamento: tk.Departamento,
            nombreEquipo: tk.NombreEquipo,
            servicioInicial: tk.ServicioInicial
        }));
```

- [ ] **Step 5: Repetir el mismo cambio en `handleSaveDraft`**

Buscar la segunda ocurrencia del mismo patrón `const ticketDetails = tickets.map(tk => ({` (dentro de `handleSaveDraft`, ~línea 898) y agregar la misma propiedad `servicioInicial: tk.ServicioInicial` al final del objeto mapeado, igual que en el Step 4.

- [ ] **Step 6: Compilar frontend**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: error esperado en este punto — `Property 'ServicioInicial' does not exist on type 'ValuationTicket'`. Esto es correcto: `ValuationTicket` todavía no tiene el campo, se agrega en Task 7 Step 1. Continuar a Task 7 antes de considerar esta tarea terminada; no hacer commit todavía si el compilador falla.

- [ ] **Step 7: Commit (después de completar Task 7 Step 1, cuando compile limpio)**

```bash
git add server.ts dist-server/server.js src/pages/ValuationsPage.tsx
git commit -m "feat(valorizaciones): persistir Servicio Inicial al cerrar o guardar una valorizacion"
```

---

### Task 7: Frontend — mostrar en pantalla y en ambos exports

**Files:**
- Modify: `src/types.ts:51-75` (interfaz `ValuationTicket`)
- Modify: `src/pages/ValuationsPage.tsx:2003-2007` (tabla en pantalla)
- Modify: `src/pages/ValuationsPage.tsx:1234-1272` (`handleExportExcel`, hoja "Detalle Servicios")
- Modify: `src/pages/ValuationsPage.tsx:1434-1468` (`handleExportClosureExcel`, hoja "Historial Servicios")

**Interfaces:**
- Consume: `ticket.ServicioInicial` / `ticket.ReglaAplicada` (Task 4, para pantalla y Exportar Borrador), `s.Servicio_Inicial` del detalle de cierre (Task 6, para Cierre de Valorización).

- [ ] **Step 1: Agregar los campos a `ValuationTicket`**

En `src/types.ts`, dentro de `interface ValuationTicket` (líneas 51-75), agregar 2 líneas después de `C4CSubject?: string;`:

```typescript
  C4CSubject?: string;
  ServicioInicial?: string | null;
  ReglaAplicada?: string | null;
}
```

- [ ] **Step 2: Compilar (debe quedar limpio ahora, resuelve el error pendiente de Task 6 Step 6)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 3: Badge en la tabla en pantalla**

En `src/pages/ValuationsPage.tsx`, ubicar el bloque de la columna "SERVICIO REALIZADO" (líneas 2003-2007):

```tsx
                                                                                                <td className="px-6 py-4">
                                                                                                    <span className="font-medium text-foreground text-sm">
                                                                                                        {toTitleCase(ticket.ServicioNombre || 'General')}
                                                                                                    </span>
                                                                                                </td>
```

Reemplazar por:

```tsx
                                                                                                <td className="px-6 py-4">
                                                                                                    <span className="font-medium text-foreground text-sm">
                                                                                                        {toTitleCase(ticket.ServicioNombre || 'General')}
                                                                                                    </span>
                                                                                                    {ticket.ReglaAplicada && (
                                                                                                        <div className="mt-1">
                                                                                                            <span
                                                                                                                className="px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-[9px] font-black tracking-tight"
                                                                                                                title={`Servicio inicial: ${ticket.ServicioInicial || 'N/D'} — Regla: ${ticket.ReglaAplicada}`}
                                                                                                            >
                                                                                                                CASO ESPECIAL
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </td>
```

- [ ] **Step 4: Columna nueva en "Exportar Borrador"**

En `handleExportExcel`, ubicar `dHeaders` (línea 1234):

```typescript
        const dHeaders = ["TICKET", "FECHA VISITA", "FECHA CIERRE", "DÍAS DIF.", "SERVICIO", "TECNICO", "COMENTARIO TECNICO", "CÓD. EQUIPO", "DESCRIPCIÓN EQUIPO", "CATEGORÍA", "CATEGORÍA VIRTUAL", "DISTRITO", "DEPARTAMENTO", "TARIFA BASE", "ADICIONALES", "TOTAL"];
```

Reemplazar por (agrega "SERVICIO INICIAL" al final):

```typescript
        const dHeaders = ["TICKET", "FECHA VISITA", "FECHA CIERRE", "DÍAS DIF.", "SERVICIO", "TECNICO", "COMENTARIO TECNICO", "CÓD. EQUIPO", "DESCRIPCIÓN EQUIPO", "CATEGORÍA", "CATEGORÍA VIRTUAL", "DISTRITO", "DEPARTAMENTO", "TARIFA BASE", "ADICIONALES", "TOTAL", "SERVICIO INICIAL"];
```

Ubicar el `sheetDetalle.addRow([...])` (líneas 1243-1260):

```typescript
            const row = sheetDetalle.addRow([
                tk.Ticket,
                tk.FechaVisita ? new Date(tk.FechaVisita) : null,
                tk.FechaCierre ? new Date(tk.FechaCierre) : new Date(tk.Fecha),
                tk.DiasDiferencia ?? '-',
                tk.ServicioNombre || tk.Servicio,
                `${tk.NombreTecnico || ''} ${tk.ApellidoTecnico || ''}`.trim() || '-',
                tk.ComentarioTecnico || '-',
                tk.CodigoEquipo || '-',
                tk.NombreEquipo || '-',
                tk.Categoria,
                tk.EsInstitucional ? "OBRAS" : "-",
                tk.Distrito || '-',
                tk.Departamento || '-',
                tk.TarifaBase ?? (tk.TarifaBase + (tk.Adicionales || 0)), // Si TarifaBase es null, usar el total
                tk.Adicionales || 0,
                (tk.TarifaBase + (tk.Adicionales || 0))
            ]);
```

Agregar `tk.ServicioInicial || '-',` como último elemento del array, antes de `]);`:

```typescript
            const row = sheetDetalle.addRow([
                tk.Ticket,
                tk.FechaVisita ? new Date(tk.FechaVisita) : null,
                tk.FechaCierre ? new Date(tk.FechaCierre) : new Date(tk.Fecha),
                tk.DiasDiferencia ?? '-',
                tk.ServicioNombre || tk.Servicio,
                `${tk.NombreTecnico || ''} ${tk.ApellidoTecnico || ''}`.trim() || '-',
                tk.ComentarioTecnico || '-',
                tk.CodigoEquipo || '-',
                tk.NombreEquipo || '-',
                tk.Categoria,
                tk.EsInstitucional ? "OBRAS" : "-",
                tk.Distrito || '-',
                tk.Departamento || '-',
                tk.TarifaBase ?? (tk.TarifaBase + (tk.Adicionales || 0)), // Si TarifaBase es null, usar el total
                tk.Adicionales || 0,
                (tk.TarifaBase + (tk.Adicionales || 0)),
                tk.ServicioInicial || '-'
            ]);
```

No es necesario tocar los `row.getCell(N).numFmt` existentes (líneas 1261-1265) — todos referencian índices de columna anteriores a la nueva (14, 15, 16), que no cambiaron de posición porque la columna nueva se agregó al final.

- [ ] **Step 5: Columna nueva en "Cierre de Valorización"**

En `handleExportClosureExcel`, ubicar `sHeaders` (línea 1434):

```typescript
        const sHeaders = ["TICKET", "FECHA VISITA", "FECHA CIERRE", "DÍAS DIF.", "SERVICIO", "TECNICO", "COMENTARIO TECNICO", "CÓD. EQUIPO", "DESCRIPCIÓN EQUIPO", "CATEGORÍA", "CATEGORÍA VIRTUAL", "DISTRITO", "DEPARTAMENTO", "TARIFA BASE", "ADICIONALES", "TOTAL"];
```

Reemplazar por:

```typescript
        const sHeaders = ["TICKET", "FECHA VISITA", "FECHA CIERRE", "DÍAS DIF.", "SERVICIO", "TECNICO", "COMENTARIO TECNICO", "CÓD. EQUIPO", "DESCRIPCIÓN EQUIPO", "CATEGORÍA", "CATEGORÍA VIRTUAL", "DISTRITO", "DEPARTAMENTO", "TARIFA BASE", "ADICIONALES", "TOTAL", "SERVICIO INICIAL"];
```

Ubicar el `sheetDetalle.addRow([...])` dentro de `services.forEach` (líneas 1442-1459):

```typescript
            const row = sheetDetalle.addRow([
                s.Ticket as string,
                s.Fecha_Visita ? new Date(s.Fecha_Visita as string) : null,
                s.Fecha_Cierre ? new Date(s.Fecha_Cierre as string) : null,
                (s.Dias_Diferencia as number | undefined) ?? '-',
                s.Servicio_Nombre as string,
                `${(s.NombreTecnico as string) || ''} ${(s.ApellidoTecnico as string) || ''}`.trim() || '-',
                (s.ComentarioTecnico as string) || '-',
                (s.Codigo_Externo as string) || '-',
                (s.NombreEquipo as string) || (s.Nombre_Equipo as string) || '-',
                cleanCategoria,
                isObras ? "OBRAS" : "-",
                (s.Distrito as string) || '-',
                (s.Departamento as string) || '-',
                (s.Tarifa_Base as number | undefined) ?? (s.Monto as number), // Fallback para cierres antiguos
                (s.Adicionales as number | undefined) ?? 0,
                s.Monto as number
            ]);
```

Agregar `(s.Servicio_Inicial as string) || '-'` como último elemento:

```typescript
            const row = sheetDetalle.addRow([
                s.Ticket as string,
                s.Fecha_Visita ? new Date(s.Fecha_Visita as string) : null,
                s.Fecha_Cierre ? new Date(s.Fecha_Cierre as string) : null,
                (s.Dias_Diferencia as number | undefined) ?? '-',
                s.Servicio_Nombre as string,
                `${(s.NombreTecnico as string) || ''} ${(s.ApellidoTecnico as string) || ''}`.trim() || '-',
                (s.ComentarioTecnico as string) || '-',
                (s.Codigo_Externo as string) || '-',
                (s.NombreEquipo as string) || (s.Nombre_Equipo as string) || '-',
                cleanCategoria,
                isObras ? "OBRAS" : "-",
                (s.Distrito as string) || '-',
                (s.Departamento as string) || '-',
                (s.Tarifa_Base as number | undefined) ?? (s.Monto as number), // Fallback para cierres antiguos
                (s.Adicionales as number | undefined) ?? 0,
                s.Monto as number,
                (s.Servicio_Inicial as string) || '-'
            ]);
```

No es necesario tocar `row.getCell(N).numFmt` (líneas 1460-1464) por la misma razón que en Step 4.

- [ ] **Step 6: Compilar**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

Run: `npx eslint src/pages/ValuationsPage.tsx src/types.ts`
Expected: sin errores nuevos.

- [ ] **Step 7: Verificación end-to-end en navegador**

Con backend y frontend local corriendo:
1. Ir a Tarifario → Casos Especiales de un CAS con tickets reales en el rango a probar → crear una regla con Servicio Final = un servicio que sepas que existe en tickets recientes de ese CAS, Servicio Inicial = cualquier texto, vigencia que cubra el rango de fechas que vas a consultar.
2. Ir a Valorizaciones → seleccionar ese mismo CAS y rango de fechas → Generar.
3. Confirmar que el/los ticket(s) que matchean muestran el badge "CASO ESPECIAL" en la tabla.
4. Click "Exportar Borrador" → abrir el `.xlsx` descargado → confirmar columna "SERVICIO INICIAL" en la hoja "Detalle Servicios" con el valor esperado en la fila del ticket que matcheó, y "-" en las demás.
5. Cerrar la quincena (o guardar como borrador) → ir al historial de cierres → abrir ese cierre → "Exportar" → confirmar la misma columna "SERVICIO INICIAL" en la hoja "Historial Servicios".
6. Borrar la regla de prueba creada en el paso 1 (botón eliminar en Casos Especiales).

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/pages/ValuationsPage.tsx
git commit -m "feat(valorizaciones): mostrar Servicio Inicial en pantalla y en ambos exports"
```

---

## Resumen de dependencias entre tareas

```
Task 1 (migración BD)
  ├── Task 2 (endpoint /api/services)          [independiente de Task 1]
  ├── Task 3 (persistir en Excepciones)         → depende de Task 1
  │     └── Task 5 (UI Casos Especiales)        → depende de Task 2 + Task 3
  └── Task 4 (filtro fecha + exponer regla)     → depende de Task 1
        └── Task 6 (persistir en cierre)        → depende de Task 4
              └── Task 7 (pantalla + exports)   → depende de Task 4 + Task 6
```

Orden de ejecución recomendado: 1 → 2 → 3 → 4 → 5 → 6 → 7 (Task 5 puede hacerse en paralelo con 4/6 si se trabaja con dos agentes, ya que no comparte archivos).
