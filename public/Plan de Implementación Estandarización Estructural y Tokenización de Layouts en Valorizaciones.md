# Estandarización Estructural y Tokenización de Layouts en Valorizaciones

El objetivo de este plan de implementación es reemplazar las clases de estilo hardcoded (quemadas en código) en el proyecto **Valorizaciones** por un sistema unificado y centralizado de tokens de diseño (`SIATC_THEME`). Esto alineará completamente la estética visual (paddings, botones, modales, bordes, tipografías y tablas) con el proyecto **Gestor FSM** bajo el sistema visual **SIATC / Crypto Blue**.

Este cambio permitirá modificar cualquier aspecto visual de la interfaz del proyecto en el futuro editando únicamente los archivos de tokens, asegurando la consistencia del diseño en toda la suite de aplicaciones.

---

## User Review Required

> [!WARNING]
> **Cambios de Estructura de Alturas y Scroll Interno:**
> La cabecera global cambiará de una altura dinámica de aproximadamente `56px` a una fija de `h-20` (80px), y el envolvente del contenido principal pasará a controlar su scroll internamente mediante `SIATC_THEME.LAYOUT.VIEWPORT`. Esto podría desplazar elementos verticales o requerir ajustes finos de overflow en tablas densas como las de [ValuationsPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/ValuationsPage.tsx).

> [!IMPORTANT]
> **Componente Custom Select y Menú de Filtro:**
> En Valorizaciones, los selectores de CAS y rangos de fecha flotantes en la página de auditoría de valorizaciones serán adaptados a la estructura visual y al comportamiento de filtros de Gestor FSM, lo cual puede variar sutilmente el flujo de clicks del usuario final.

---

## Open Questions (Resolvidas)

> [!NOTE]
> **Decisiones del usuario:**
> 1. **Cursor personalizado:** No implementar el cursor de puntero de Gestor FSM, manteniendo el estándar del navegador.
> 2. **Nombre de Logo:** Estandarizar a minúsculas (`/logo.png`) tanto en el archivo de la carpeta `public` como en las referencias en el código, ya que esto mejora la compatibilidad multiplataforma y consistencia.

---

## Proposed Changes

### 1. Sistema de Estilos y Configuración CSS Global

Se actualizará la hoja de estilos raíz de la aplicación para añadir todos los tokens y variables CSS que habilitan el sistema *SIATC*.

---

#### [MODIFY] [index.css](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/index.css)
* Añadir extensiones en `@theme` para admitir curvaturas personalizadas (`--radius-cb-chip`, `--radius-cb-btn`, `--radius-cb-card`, `--radius-cb-modal`) y sombras (`--shadow-cb-level-1`, `--shadow-cb-level-2`, `--shadow-cb-level-3`).
* Declarar variables específicas de SIATC en `:root` y `.dark` (`--cb-bg`, `--cb-text-primary`, `--cb-text-secondary`, `--cb-border`).

#### [NEW] [siatc-theme.ts](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/utils/siatc-theme.ts)
* Crear el motor de temas con la definición del objeto `SIATC_THEME` que centraliza todas las clases de Tailwind de layouts, tablas, tipografías, estados y botones (idéntico a Gestor FSM).

---

### 2. Estructura y Envolventes Principales (Layouts)

Se modificará el diseño de la barra lateral, la cabecera y el layout maestro para aplicar el diseño de tarjetas con bordes redondeados tipo SIATC y efectos de Glassmorphism.

---

#### [MODIFY] [MainLayout.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/layout/MainLayout.tsx)
* Reestructurar el envolvente general, la cabecera de `h-20` con Glassmorphism (`SIATC_THEME.EFFECTS.GLASS_PANEL`) y el contenedor del viewport (`SIATC_THEME.LAYOUT.VIEWPORT`).

#### [MODIFY] [Sidebar.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/layout/Sidebar.tsx)
* Modificar las clases de los enlaces activos e inactivos para usar `SIATC_THEME.LAYOUT.SIDEBAR_ITEM_ACTIVE` y `SIATC_THEME.LAYOUT.SIDEBAR_ITEM_INACTIVE`.
* Estandarizar el espaciado interior del menú y el contenedor.

#### [MODIFY] [AppSwitcher.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/layout/AppSwitcher.tsx)
* Adaptar el botón flotante del selector de aplicaciones con los radios de borde del sistema de tokens.

---

### 3. Vistas y Páginas de Flujo Principal

Se refactorizarán los componentes y páginas principales del sistema para consumir los tokens de diseño y retirar estilos quemados.

---

#### [MODIFY] [LoginPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/LoginPage.tsx)
* Integrar `SIATC_THEME.LOGIN_LAYOUT` en la estructura de pantallas divididas del inicio de sesión (Login).

#### [MODIFY] [DashboardPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/DashboardPage.tsx)
* Reemplazar las tarjetas de métricas por `SIATC_THEME.COMPONENTS.KPI_CARD_CONTAINER` y `SIATC_THEME.COMPONENTS.KPI_CARD_VALUE`.
* Estandarizar los botones de filtro y el selector desplegable (dropdown) personalizado usando tokens de componentes.

#### [MODIFY] [ValuationsPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/ValuationsPage.tsx)
* Realizar una refactorización estructural de la cabecera del módulo, los selectores de fechas y CAS, las métricas financieras superiores.
* Adaptar la visualización de la tabla principal para implementar la estructura de filas con alto `h-[64px]` definida en `SIATC_THEME.TABLE.BODY_ROW` y las celdas alineadas verticalmente de `SIATC_THEME.TABLE.CELL`.

#### [MODIFY] [TarifarioPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/TarifarioPage.tsx)
* Tokenizar los botones de acciones, el buscador y las tablas de tarifas bases y excepciones.

#### [MODIFY] [MaterialsPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/MaterialsPage.tsx)
* Aplicar los tokens en los filtros de búsqueda superior, tablas de consumos y botones de registro.

#### [MODIFY] [PenaltiesPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/PenaltiesPage.tsx)
* Estandarizar los layouts de grillas y envolventes.

---

### 4. Diálogos, Modales y Sub-páginas de Configuración

Se unificará el aspecto de todos los modales internos y del submódulo de configuración (roles, usuarios, logs de auditoría) para emplear los estilos de tokens.

---

#### [MODIFY] [ConfigLayout.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/config/ConfigLayout.tsx)
* Tokenizar la barra lateral y contenedor interior del panel de administración.

#### [MODIFY] [UsersPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/config/UsersPage.tsx)
* Modificar inputs de formularios, botones de crear/editar y filas de la tabla de usuarios.

#### [MODIFY] [RolesPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/config/RolesPage.tsx)
* Unificar el listado de roles y la visualización de permisos.

#### [MODIFY] [AuditLogPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/config/AuditLogPage.tsx)
* Tokenizar tabla de eventos, filtros de fechas y badges de acciones.

#### [MODIFY] [ConfigDistritosPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/config/ConfigDistritosPage.tsx)
* Aplicar tokens a tablas de distritos, tarifas y zonas de asignación.

#### [MODIFY] [ConfigCanalInstitucionalPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/config/ConfigCanalInstitucionalPage.tsx)
* Tokenizar filtros y campos de asignación institucional.

#### [MODIFY] [SettingsPage.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/pages/config/SettingsPage.tsx)
* Tokenizar inputs numéricos e inputs generales de configuración del sistema (como días máximos de cierre).

#### [MODIFY] [Modal.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/common/Modal.tsx)
* Asegurar que el modal consuma `SIATC_THEME.COMPONENTS.MODAL_CONTENT` y use el overlay blur de fondo.

#### [MODIFY] [ConfirmDialog.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/common/ConfirmDialog.tsx)
* Adaptar el modal de confirmación con los botones de peligro, información y primario unificados.

#### [MODIFY] [PenaltyModal.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/penalties/PenaltyModal.tsx), [TarifarioModal.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/tarifario/TarifarioModal.tsx), [TarifarioExceptionsModal.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/tarifario/TarifarioExceptionsModal.tsx), [MaterialRegisterModal.tsx](file:///d:/diego/Documentos/Antigravity/Valorizaciones/valorizaciones/src/components/materials/MaterialRegisterModal.tsx)
* Modificar clases de los campos de texto, combos de selección, leyendas y botones de envío para utilizar los tokens de UI semánticos.

---

## Verification Plan

### Automated Tests
* Ejecución de linting para verificar que no haya errores de sintaxis TypeScript ni importaciones rotas:
  ```powershell
  npm run lint
  ```
* Compilación del bundle de producción para asegurar que el compilador de Tailwind CSS v4 genere correctamente todos los estilos integrados:
  ```powershell
  npm run build
  ```

### Manual Verification
1. **Inicio de Sesión y Navegación:**
   * Validar que la página de Login se renderice en pantalla completa idéntica a la de Gestor FSM.
   * Probar la barra lateral y verificar que el responsive oculte/muestre el menú usando el overlay desenfocado (blur).
2. **Auditoría de Valorizaciones:**
   * Cargar la página de Valorizaciones y comprobar que la tabla de servicios muestre un alto uniforme por fila de 64px.
   * Verificar la legibilidad y consistencia del modo oscuro en las tablas densas de datos.
3. **Modales y Diálogos:**
   * Abrir el modal de Penalidades o Tarifas y validar que los bordes curvados de `16px` (`rounded-cb-modal`) y las sombras de nivel superior se apliquen homogéneamente.
