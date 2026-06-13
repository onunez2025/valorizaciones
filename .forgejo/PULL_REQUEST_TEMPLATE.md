## Descripción
<!-- ¿Qué cambia y por qué? -->

## Tipo de cambio
- [ ] Bug fix
- [ ] Nueva funcionalidad
- [ ] Refactor / mejora
- [ ] Seguridad
- [ ] UI / estilo

## Checklist de Seguridad SIATC

> Verificar antes de solicitar revisión. Ver `CLAUDE.md` / `GEMINI.md` para detalles.

- [ ] **Auth**: Todos los endpoints nuevos/modificados tienen `verifyToken` (o `verifyTokenForDownload` solo si es descarga de archivo)
- [ ] **RLS**: Endpoints que retornan datos filtran por `casId` cuando `user.casId !== null`
- [ ] **SQL Types**: Todos los `.input()` usan tipo explícito (`sql.VarChar`, `sql.UniqueIdentifier`, `sql.Decimal`, etc.)
- [ ] **Path traversal**: Rutas de archivo usan `path.resolve + startsWith(sep)`, no regex
- [ ] **Env vars**: Sin paths hardcodeados; variables de entorno con guard HTTP 503 si no están configuradas
- [ ] **NODE_ENV**: Warnings de configuración solo activos en `process.env.NODE_ENV === 'production'`
- [ ] **check-security.sh**: Ejecutado localmente sin errores críticos antes de este PR

## Notas adicionales
<!-- Contexto extra, capturas, links a tickets, etc. -->
