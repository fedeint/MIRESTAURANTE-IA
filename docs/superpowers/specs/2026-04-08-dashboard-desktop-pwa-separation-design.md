# Separación Desktop / PWA — Iteración 1 (Fundamento)

**Fecha:** 2026-04-08
**Autor:** Claude + Leonidas
**Estado:** Diseño aprobado, pendiente plan

## Problema

El commit `c28544e` (31 de marzo 2026) intentó separar el dashboard desktop del mobile PWA pero ambos archivos quedaron idénticos:

- `views/dashboard.ejs` — diseño PWA mobile (correcto)
- `views/dashboard-desktop.ejs` — copia idéntica del mobile (incorrecto)

La detección por User-Agent en `server.js` ya está activa pero es inútil porque renderiza el mismo template a desktop y mobile.

Adicionalmente, durante la verificación local encontramos varios bugs que bloquean el arranque del servidor:
- `csrf-csrf` v4: `generateToken` se renombró a `generateCsrfToken`
- `cookie-parser` middleware faltante
- `getSessionIdentifier` requerido en la config de `doubleCsrf`
- Variable `logger` se usaba antes de definirse

## Regla arquitectónica fundamental

**Cero responsive entre desktop y PWA.** Cada página tiene exactamente dos archivos exclusivos:

- `<page>.ejs` — variante PWA (phones + tablets)
- `<page>-desktop.ejs` — variante desktop (Mac/Windows/Linux browsers)

El router elige uno u otro según User-Agent. **Nunca** un template responsive intenta servir a ambos. Si abrís en mobile, jamás debes ver layout desktop, ni viceversa.

### Detección de dispositivo

```js
// lib/deviceRouter.js
const isTouchDevice = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
  req.headers['user-agent'] || ''
);
```

| Dispositivo | Variante |
|-------------|----------|
| iPhone, Android phone | PWA (`view.ejs`) |
| iPad, Android tablet | PWA (`view.ejs`) — centrado a 480px en tablets |
| Mac/Windows/Linux desktop | Desktop (`view-desktop.ejs`) |

Tablets aceptan el shell PWA estrecho centrado (patrón común tipo Twitter/X mobile en iPad). Si en el futuro se quiere un diseño específico para tablets, será una iteración aparte.

## Objetivos de Iteración 1

1. Corregir los bugs CSRF que bloquean el servidor local (commit los parches que ya aplicamos en sesión)
2. Crear `lib/deviceRouter.js` como helper único de detección + render
3. Crear `views/partials/desktop-layout.ejs` con el shell desktop (sidebar + main + tokens del nuevo diseño)
4. Reescribir `dashboard-desktop.ejs` con el diseño nuevo del frame `1920w default` (`9RPaz`)
5. Construir infraestructura de prevención (markers, tests, hook, docs)
6. Auditar las 80+ vistas y catalogar pares mobile/desktop existentes y faltantes
7. Generar specs por módulo para iteraciones futuras (basado en la auditoría)

## Diseño Desktop (frame `9RPaz` - 1920w default)

### Layout general
- Viewport base: 1920x1258
- Fondo: gradiente `#fff8f0` → `#fafaf7`
- Sidebar: 280px ancho a la izquierda (x:70, y:55)
- Main content: 1441x1093 con border-radius 12px, fondo `#ffffffc7` (blanco semi-transparente con backdrop blur)

### Sidebar
- Posición: `top: 55px, left: 70px`, altura `calc(100vh - 121px)`
- Border radius: 15px (todos los lados)
- Fondo: gradiente lineal vertical `#10152f` → `#0a0f24` → `#090d1d` con dos gradientes radiales overlay (naranja sutil arriba-izquierda, azul sutil arriba)
- Shadow: `0 24px 52.5px #03071259`
- Brand row: imagotipo SVG (160x42) + botón collapse (40x44, corner-radius 12)
- Secciones: Inter 11px, weight 700, letter-spacing 2.42px, color `#cf985f9e` (dorado tenue), uppercase
- Links: 248x50px, corner-radius 16px
  - Hover: fondo `#ffffff0a`
  - Activo (Inicio): gradiente naranja 8-stop (`#fefbf5` → `#fdb75e` → `#fd9931` → `#ef520f` → `#df2c05` → `#e13809` → `#fba251` → `#ee6d2d`) con shadow glow doble
- Footer: borde superior `#ffffff0f`, padding 16px

**Reusará el `views/partials/sidebar.ejs` existente** que ya tiene la mayor parte de esta estructura. Solo se ajustarán colores/spacing donde difieran del diseño nuevo.

### Main content - DASHBOARD VIEW (`M0kcC`)

**Header:**
- "Buenos dias, {nombre}" — Inter 38px, weight 800, color `#1f2430`, letter-spacing -1.52px
- Subtítulo: "{día}, {fecha} · {dominio}" — Inter 18px, color `#7a8090`
- Top-right: Toggle DallIA (172x48 con avatar), notificación (42x42), avatar usuario (48x48 gradiente naranja con iniciales)

**Columna izquierda (0-905px):**

1. **Pendientes**
   - Heading: "Pendientes" Inter 22px weight 800
   - Botón "+ Agregar" (120x45) gradiente naranja `#f08a4f` → `#d9501f` con shadow
   - Card de tarea (904x98, corner-radius 20):
     - Checkbox circular 28x28 (border `#2b2f3b`)
     - Título tarea Inter 20px weight 800
     - Badge "DallIA" naranja `#f8915924`
     - Subtítulo Inter 17px color `#81889a`
     - Botón acción (94x45) fondo `#15192c`

2. **Agenda**
   - Card 904x183, corner-radius 28
   - Heading "Agenda" Inter 22px
   - Fecha actual derecha en naranja `#f1703a`
   - 7 botones día (112x78, corner-radius 18):
     - Día activo: gradiente naranja con shadow glow
     - Resto: fondo blanco semi-transparente

3. **Completadas**
   - Heading "Completadas" Inter 22px weight 800
   - Badge count (46x30, corner-radius 12) gradiente naranja
   - Chevron expand/collapse SVG

**Columna derecha (932px+):**

1. **Hoy en numeros**
   - Heading "Hoy en numeros" Inter 22px weight 800
   - 3 KPI cards (142x77, corner-radius 22) en fila:
     - Ventas: "S/ {monto}" + "Ventas"
     - Mesas: "{ocupadas}/{total}" en naranja `#f1703a` + "Mesas"
     - Platos: "{count}" + "Platos"
   - Cards: fondo `#ffffffc7`, shadow soft

2. **DallIA dice:**
   - Heading "DallIA dice:" Inter 22px weight 800
   - Cards 452x~80px, corner-radius 22
   - Cada card: dot indicador (8x8) + texto Inter 16px weight 600 + "Consejo de DallIA" subtítulo

3. **Acceso rapido**
   - Heading "Acceso rapido" Inter 22px weight 800
   - Grid 2x2 de botones (219x64, corner-radius 20):
     - Mesas, Cocina, Productos, Asistente IA
     - Cada uno con icono SVG + label Inter 16px weight 700

### Tipografía global desktop
- Familia: **Inter** (no DM Sans como en mobile)
- Razón: el diseño en `.pen` usa Inter, mantenemos coherencia con el frame fuente

### Logo placeholder
El imagotipo SVG real "MiRest con IA" no está en el repo. Usamos el placeholder existente con fuente Fredoka One hasta que se incorpore.

## Prevención: cómo evitar que se mezclen de nuevo

### 1. Markers de variante obligatorios
Cada template lleva un comentario en el head que declara su variante:

```html
<!-- @variant: pwa -->
<!-- @variant: desktop -->
```

### 2. Helper de routing centralizado
`lib/deviceRouter.js` exporta `renderForDevice(req, res, viewName, data)`. Todas las rutas que tengan ambas variantes deben usar este helper. Las rutas que solo tienen una variante (ej: solo desktop o solo PWA) usan `res.render` normal pero con un check explícito que loguea warning si el dispositivo no coincide.

### 3. Tests
Test suite en `tests/view-variants.test.js`:

```js
// Para cada par <name>.ejs / <name>-desktop.ejs:
// 1. Ambos archivos existen
// 2. Son distintos byte-a-byte
// 3. Cada uno declara su marker correcto
```

### 4. Pre-commit hook
Hook que ejecuta el test de variantes si tocaste archivos en `views/`. Bloquea commit si:
- Algún par mobile/desktop quedó idéntico
- Falta el marker `@variant`

### 5. Documentación en CLAUDE.md
Sección "Variantes de vistas" con:
- La regla "cero responsive"
- Cómo crear una vista nueva (siempre en pares)
- Cómo usar `deviceRouter`
- Lista de excepciones autorizadas (vistas solo-desktop o solo-PWA)

## Auditoría de vistas existentes

Como parte de Iteración 1 generamos `docs/superpowers/audits/2026-04-08-views-pairing-audit.md` con:

| View | PWA | Desktop | Estado |
|------|-----|---------|--------|
| `dashboard` | ✓ existente | ✓ creado en este plan | OK |
| `almacen/inventario` | ✗ falta | ✓ con responsive contaminante | PWA por crear (Iter 2) |
| `productos` | ✗ falta | ✓ | PWA por crear (Iter 3) |
| ... | | | |

La auditoría categoriza cada vista en una de estas:
- **OK**: ambas variantes existen y son distintas
- **Falta PWA**: tiene desktop, hay que crear PWA
- **Falta desktop**: tiene PWA, hay que crear desktop nuevo
- **Responsive contaminante**: una sola vista intentando hacer ambos — hay que dividirla en dos
- **Solo-desktop autorizado**: módulos administrativos que no necesitan PWA (ej: superadmin/observabilidad). Mobile muestra mensaje "vista solo desktop"
- **Solo-PWA autorizado**: features mobile-exclusive (ej: scan QR fidelidad)

A partir de la auditoría se generan los specs y planes de iteraciones 2+, una por módulo.

## Bugs CSRF a corregir como parte del plan

Estos bugs ya los parcheamos en sesión durante la verificación, pero hay que commitearlos:

1. `csrf-csrf` v4 — `generateToken` → `generateCsrfToken` (server.js:284)
2. `cookie-parser` — agregado al middleware (server.js:137)
3. `getSessionIdentifier` — agregado a `doubleCsrf` config (server.js:286)
4. `logger` — `require('./lib/logger')` movido al top (server.js:20)

También se agregaron `SESSION_SECRET` y `PORT` al `.env` local.

## Out of scope (Iteración 1)

- Crear las versiones PWA faltantes para módulos completos (irá en iteraciones por módulo)
- Actualizar los demás screens desktop existentes al nuevo diseño (irá en iteraciones por módulo)
- Logo SVG real del imagotipo (placeholder por ahora)
- Animaciones de iconos del sidebar al presionar
- Diseño tablet específico (PWA estrecho centrado por ahora)
