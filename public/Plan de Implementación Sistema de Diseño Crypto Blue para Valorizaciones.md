# Plan de Implementación: Sistema de Diseño Crypto Blue para "Valorizaciones"

Este plan detalla la migración técnica de la aplicación al sistema de diseño **Crypto Blue**, estableciendo un **Sistema de Tokens de Diseño** centralizado para facilitar el mantenimiento y la escalabilidad futura.

## User Review Required

> [!IMPORTANT]
> La migración cambiará radicalmente la tipografía de la aplicación. Se utilizará **DM Sans** para la interfaz general y **JetBrains Mono** exclusivamente para datos numéricos y financieros para garantizar alineación tabular.

> [!WARNING]
> Se eliminará el uso de la fuente **Lato** actual en favor de los nuevos estándares de Crypto Blue.

## Propuesta de Sistema de Tokens (Centralización)

Para cumplir con el requerimiento de "cambiar en una sola parte", utilizaremos las capacidades de **Tailwind CSS v4** integradas en `src/index.css`. Esto permitirá que cualquier cambio en una variable CSS se propague instantáneamente a toda la aplicación.

---

## Fases de Implementación

### Fase 1: Infraestructura de Tokens y Fuentes
Configuración centralizada de la identidad visual.

#### [MODIFY] [index.css](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/index.css)
- **Importación de Fuentes:** Añadir `@import` de Google Fonts para DM Sans y JetBrains Mono.
- **Definición de Tokens en `@theme`:**
    - `--font-sans`: 'DM Sans', sans-serif.
    - `--font-mono`: 'JetBrains Mono', monospace.
    - `--color-primary`: `#4C5F80` (Coinbase Blue).
    - `--color-primary-hover`: `#707F99`.
    - `--color-success`: `#05B169`.
    - `--color-error`: `#DF2935`.
    - `--radius-base`: `8px`.
    - `--radius-card`: `12px`.

### Fase 2: Refactorización de Componentes Globales
Aplicación de la nueva "piel" a los elementos base.

#### [MODIFY] [App.css](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/App.css)
- Ajustar estilos globales de botones y contenedores para usar los nuevos tokens.
- Implementar la clase `.font-data` que utilice JetBrains Mono para ser aplicada a columnas de tablas.

#### [MODIFY] [Layout.tsx o Componentes de Navegación]
- Ajustar la barra superior y menús a la altura de 60px y colores de superficie de Crypto Blue.

### Fase 3: Optimización de Páginas de Datos
Refuerzo de la claridad financiera en las vistas principales.

#### [MODIFY] [ValuationsPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/ValuationsPage.tsx)
- Aplicar `font-mono` (JetBrains Mono) a todas las columnas de montos (S/.).
- Actualizar estados de tickets y penalidades con los nuevos colores semánticos (`#05B169`, `#DF2935`).
- Ajustar alineación derecha en celdas numéricas.

---

## Verificación y Calidad

### Análisis de Errores
- **Linting:** Ejecutar `npm run lint` (si está disponible) para asegurar que no hay errores de sintaxis tras los cambios.
- **Visual:** Comprobar que JetBrains Mono se renderiza correctamente con `font-variant-numeric: tabular-nums`.

### Sincronización de Repositorio
Finalizada la implementación y verificación, se procederá a:
1. `git add .`
2. `git commit -m "feat: implement centralized Crypto Blue design system and tokens"`
3. `git push origin main`

## Plan de Verificación

### Pruebas Automatizadas
- Ejecutar el comando de build `npm run build` para asegurar que el sistema de tokens de Tailwind v4 compila correctamente.

### Verificación Manual
- Abrir la página de Valorizaciones y confirmar que los números en las tablas están perfectamente alineados verticalmente.
- Verificar que el color azul principal coincide con el estándar `#4C5F80`.
