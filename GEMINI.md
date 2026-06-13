# SIATC — Reglas de Seguridad para Agentes AI

Estas reglas aplican a todos los repos del ecosistema SIATC. Son obligatorias en cada cambio de código.

## 1. Autenticación — Dos middlewares, no uno

- **`verifyToken`** → solo acepta `Authorization: Bearer <token>`. Usar en **todos** los endpoints.
- **`verifyTokenForDownload`** → acepta header Y `req.query.token`. Usar **únicamente** en endpoints GET que sirven archivos descargados directamente por el browser (`window.location.href`, Excel, PDF).

**Nunca** agregar `req.query.token` al `verifyToken` principal. Si necesitas un endpoint de descarga, usa `verifyTokenForDownload`.

## 2. Row Level Security (RLS)

Todo endpoint que sirva datos (tickets, pagos, penalidades, colaboradores, técnicos) debe filtrar por empresa CAS:

```typescript
if (currentUser.casId !== null) {
    // Usuario empresa CAS — solo ve sus propios datos
    request.input('casId', sql.VarChar(50), currentUser.casId);
    query += ' AND ID_cas = @casId';
}
// casId === null → empleado Sole, ve todo
```

## 3. Tipos SQL Explícitos en .input()

Todos los `.input()` deben declarar el tipo SQL. Nunca pasar `req.params` o `req.body` directamente:

```typescript
// ✅ Correcto
.input('id', sql.UniqueIdentifier, req.params.id)
.input('name', sql.VarChar(100), req.body.name)
.input('amount', sql.Decimal(10, 2), amount)

// ❌ Incorrecto — susceptible a type confusion
.input('id', req.params.id)
```

Tipos de referencia por campo:
| Campo | Tipo SQL |
|---|---|
| EBM.Users.Id | `sql.UniqueIdentifier` |
| ID penalidad (hex 4 bytes) | `sql.VarChar(8)` |
| CAS ID | `sql.VarChar(50)` |
| RUC | `sql.VarChar(20)` |
| Nombres, textos | `sql.VarChar(N)` |
| Montos | `sql.Decimal(10, 2)` |

## 4. Path Traversal — path.resolve + startsWith

Para endpoints que sirven archivos desde una carpeta base:

```typescript
// ✅ Correcto
const fullPath = path.resolve(BASE_DIR, userInput);
if (!fullPath.startsWith(path.resolve(BASE_DIR) + path.sep)) {
    return res.status(400).json({ error: 'Ruta inválida.' });
}

// ❌ Incorrecto — la regex no cubre todos los casos de traversal
const safePath = path.normalize(input).replace(/^(\.\.[\/\\])+/, '');
```

## 5. Variables de Entorno — Sin Paths Hardcodeados

Nunca usar rutas absolutas de sistemas de archivos locales:

```typescript
// ✅ Correcto
const STORAGE_PATH = process.env.STORAGE_PATH || '';
if (!STORAGE_PATH) return res.status(503).json({ error: 'Almacenamiento no configurado.' });

// ❌ Incorrecto — ruta local que no existe en el servidor Dokploy
const STORAGE_PATH = 'C:\\Users\\someone\\OneDrive\\...';
```

## 6. Guards de Producción

Los warnings de configuración (CORS, env vars) solo deben activarse en producción:

```typescript
// ✅ Correcto
if (process.env.NODE_ENV === 'production' && !(process.env.ALLOWED_ORIGINS || '').trim()) {
    console.warn('WARNING: ALLOWED_ORIGINS no configurado.');
}
```

## 7. AppConfigContext — Autenticación en /api/applications

El endpoint `GET /api/applications` siempre debe tener `verifyToken`. El frontend (`AppConfigContext.tsx`) usa `StorageService.getToken()` para enviar el header cuando hay sesión activa. No revertir este patrón.

## 8. Antes de hacer push

Ejecutar el verificador automático:
```bash
./check-security.sh
```

O instalar como hook permanente:
```bash
cp check-security.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```
