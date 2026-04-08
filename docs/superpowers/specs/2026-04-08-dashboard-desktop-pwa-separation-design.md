# Separación Dashboard Desktop / PWA Mobile

**Fecha:** 2026-04-08
**Autor:** Claude + Leonidas
**Estado:** Diseño aprobado, pendiente plan

## Problema

El commit `c28544e` (31 de marzo 2026) intentó separar el dashboard desktop del mobile PWA pero ambos archivos quedaron idénticos:

- `views/dashboard.ejs` — diseño PWA mobile (correcto)
- `views/dashboard-desktop.ejs` — copia idéntica del mobile (incorrecto)

La detección por User-Agent en `server.js` ya está activa pero es inútil porque renderiza el mismo template a desktop y mobile.

Adicionalmente, durante la verificación encontramos varios bugs latentes en `csrf-csrf` v4:
- Función `generateToken` se renombró a `generateCsrfToken`
- Falta `cookie-parser` middleware
- Falta `getSessionIdentifier` en la config de `doubleCsrf`
- Variable `logger` se usaba antes de definirse

## Objetivos

1. **Recrear `dashboard-desktop.ejs`** con el diseño desktop nuevo del frame `1920w default` (`9RPaz`) en `UI.DELSISTEMA.pen`
2. **Mantener `dashboard.ejs`** sin cambios — ya tiene el diseño PWA correcto
3. **Prevenir** que ambos archivos vuelvan a quedar sincronizados accidentalmente
4. **Estabilizar** los bugs CSRF que bloquean el servidor en local

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

**Reusará el `views/partials/sidebar.ejs` existente** que ya tiene esta estructura. Solo se ajustarán colores/spacing donde difieran del diseño nuevo.

### Main content - DASHBOARD VIEW (`M0kcC`)

**Header (y:0):**
- "Buenos dias, {nombre}" — Inter 38px, weight 800, color `#1f2430`, letter-spacing -1.52px
- Subtítulo: "{día de la semana}, {fecha} · {dominio}" — Inter 18px, color `#7a8090`
- Botones derecha (top-right): Toggle DallIA (172x48 con avatar), notificación (42x42), avatar usuario (48x48 gradiente naranja con iniciales)

**Columna izquierda (0-905px):**

1. **Pendientes** (y:93)
   - Heading: "Pendientes" Inter 22px weight 800
   - Botón "+ Agregar" (120x45) gradiente naranja `#f08a4f` → `#d9501f` con shadow
   - Card de tarea (904x98, corner-radius 20):
     - Checkbox circular 28x28 (border `#2b2f3b`)
     - Título tarea Inter 20px weight 800
     - Badge "DallIA" naranja `#f8915924`
     - Subtítulo Inter 17px color `#81889a`
     - Botón "Pagar" (94x45) fondo `#15192c`

2. **Agenda** (y:280)
   - Card 904x183, corner-radius 28
   - Heading: "Agenda" Inter 22px
   - Fecha actual derecha: "Jue, 27 Mar." color `#f1703a`
   - 7 botones día (112x78, corner-radius 18):
     - Día activo: gradiente naranja con shadow glow
     - Resto: fondo blanco semi-transparente

3. **Completadas** (y:490)
   - Heading "Completadas" Inter 22px weight 800
   - Badge count (46x30, corner-radius 12) gradiente naranja
   - Chevron expand/collapse SVG

**Columna derecha (932px+):**

1. **Hoy en numeros** (y:0)
   - Heading "Hoy en numeros" Inter 22px weight 800
   - 3 KPI cards (142x77, corner-radius 22) en fila:
     - Ventas: "S/ 125.00" + "Ventas" texto secundario
     - Mesas: "0/42" en naranja `#f1703a` + "Mesas"
     - Platos: "5" + "Platos"
   - Cards: fondo `#ffffffc7`, shadow soft

2. **DallIA dice:** (y:148)
   - Heading "DallIA dice:" Inter 22px weight 800
   - Cards 452x~80px, corner-radius 22
   - Cada card: dot indicador (8x8) + texto Inter 16px weight 600 + "Consejo de DallIA" subtítulo

3. **Acceso rapido** (y:412)
   - Heading "Acceso rapido" Inter 22px weight 800
   - Grid 2x2 de botones (219x64, corner-radius 20):
     - Mesas, Cocina, Productos, Asistente IA
     - Cada uno con icono SVG + label Inter 16px weight 700

### Tipografía global
- Familia: **Inter** (no DM Sans como en mobile)
- Razón: el diseño usa Inter en el `.pen`, mantenemos coherencia

### Notas
- **Logo SVG falta**: el imagotipo de "MiRest con IA" en el sidebar usará el placeholder existente con fuente Fredoka One hasta que se incorpore el SVG real. La referencia visual del `.pen` muestra un SVG `Imagotipo.svg` que aún no está en el repo.

## Routing

`server.js` ya tiene la lógica correcta (línea ~977):

```js
const ua = req.headers['user-agent'] || '';
const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
res.render(isMobile ? 'dashboard' : 'dashboard-desktop', { dashboard });
```

No hay cambios en routing — solo necesitamos que el template desktop sea diferente del mobile.

## Prevención: cómo evitar que se mezclen de nuevo

### 1. Comentario marker en cada archivo
Cada template lleva un comentario obligatorio en el head que declara su variante:

```html
<!-- @variant: pwa-mobile (max-width 480px, bottom nav, no sidebar) -->
<!-- @variant: desktop (sidebar + 2-column layout, min-width 992px) -->
```

### 2. Test de no-equivalencia
Test simple en `tests/dashboard-variants.test.js` que falla si los dos archivos quedan idénticos:

```js
const fs = require('fs');
const mobile = fs.readFileSync('views/dashboard.ejs', 'utf8');
const desktop = fs.readFileSync('views/dashboard-desktop.ejs', 'utf8');

test('dashboard.ejs y dashboard-desktop.ejs deben ser distintos', () => {
  expect(mobile).not.toBe(desktop);
});

test('dashboard.ejs debe declarar variant pwa-mobile', () => {
  expect(mobile).toContain('@variant: pwa-mobile');
});

test('dashboard-desktop.ejs debe declarar variant desktop', () => {
  expect(desktop).toContain('@variant: desktop');
});
```

Este test corre en CI antes de cualquier merge.

### 3. Pre-commit hook
Hook de git en `.husky/pre-commit` o equivalente que ejecute el test anterior si alguno de los dos archivos cambia.

### 4. Documentación en CLAUDE.md
Agregar una sección "Dashboard variants" que explique:
- `dashboard.ejs` es PWA mobile-only — NO tocar para cambios desktop
- `dashboard-desktop.ejs` es desktop-only — NO tocar para cambios mobile
- Si necesitas cambiar lógica compartida (data, KPIs), modifica el controlador en `server.js` no los templates

## Bugs CSRF descubiertos durante la verificación

Estos bugs bloquean el servidor local. Se arreglarán como parte del plan:

1. **`csrf-csrf` v4 API change** — `generateToken` renombrado a `generateCsrfToken`. Ya parcheado en sesión actual.
2. **`cookie-parser` faltante** — instalado y agregado al middleware. Ya parcheado.
3. **`getSessionIdentifier` requerido** — agregado en la config `doubleCsrf`. Ya parcheado.
4. **`logger` undefined** — `require('./lib/logger')` movido al top del archivo. Ya parcheado.

Estos parches deben commitearse antes de empezar el trabajo del dashboard.

## Out of scope

- Actualización de los demás 20 screens desktop al diseño nuevo (queda para iteraciones futuras)
- Logo SVG real "Imagotipo.svg" (placeholder por ahora)
- Datos reales de Pendientes/Agenda/Completadas — usaremos los datos existentes del controlador `dashboard` o stubs si no existen
- Mejora del sidebar con animaciones de iconos al presionar (queda para iteración posterior)
