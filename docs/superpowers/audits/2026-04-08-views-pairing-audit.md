# Views Pairing Audit

**Fecha:** 2026-04-08
**Scope:** Todas las vistas EJS del proyecto (excluye `views/partials/`)
**Total de archivos:** 118 vistas EJS
**Proposito:** Identificar pares existentes, huerfanos y contaminacion responsive para planificar iteraciones futuras.

## Resumen por categoria

| Categoria | Cant | Descripcion |
|-----------|------|-------------|
| **PWA (marked)** | 1 | `dashboard.ejs` — tiene marker `@variant: pwa` ✓ |
| **Desktop (marked)** | 1 | `dashboard-desktop.ejs` — tiene marker `@variant: desktop` ✓ |
| **PWA (no marker)** | 70 | Diseno PWA (max-width 480px, 100dvh) sin marker declarado |
| **Desktop (no marker)** | 8 | Diseno desktop (sidebar, col-lg-*) sin marker declarado |
| **Mixed hints** | 13 | Vista con hints de ambas variantes — responsive contaminante |
| **Unknown** | 25 | No tiene hints claros — requiere inspeccion manual |

## Leyenda

- **pwa-marked / desktop-marked** — ya tiene el marker `@variant` declarado ✓
- **pwa** — detectado como PWA por hints (`max-width: 480px`, `100dvh`, `apple-mobile-web-app`, `bottom nav`) pero sin marker
- **desktop** — detectado como desktop por hints (`dg-sidebar`, `sidebar-expanded`, `col-lg-*`, `min-width: 992px`)
- **mixed** — contiene hints de AMBAS variantes → responsive contaminante, hay que dividirlo
- **unknown** — sin hints reconocibles (landing, modales, componentes especiales)

## Inventario completo

| Path | Estado | Iteracion objetivo |
|------|--------|---|
| `dashboard` | pwa-marked ✓ | **1 (HECHO)** |
| `dashboard-desktop` | desktop-marked ✓ | **1 (HECHO)** |
| `404` | pwa | 9 (Auth/Public) |
| `administracion/dashboard` | desktop | 6 (Admin) |
| `administracion/gastos` | desktop | 6 (Admin) |
| `administracion/planilla` | unknown | 6 (Admin) |
| `almacen/alertas` | unknown | 2 (Almacen) |
| `almacen/conteo-fisico` | unknown | 2 (Almacen) |
| `almacen/dashboard` | desktop | 2 (Almacen) |
| `almacen/entradas` | unknown | 2 (Almacen) |
| `almacen/historial` | unknown | 2 (Almacen) |
| `almacen/inventario` | unknown | 2 (Almacen) |
| `almacen/proveedores` | unknown | 2 (Almacen) |
| `almacen/que-comprar` | unknown | 2 (Almacen) |
| `almacen/salidas` | unknown | 2 (Almacen) |
| `backups` | pwa | 6 (Admin) |
| `caja` | pwa | 4 (Caja/Ventas) |
| `cambiar-contrasena` | pwa | 9 (Auth) |
| `canales` | pwa | 6 (Admin) |
| `chat` | pwa | 11 (DallIA) |
| `checkout` | pwa | 4 (Caja/Ventas) |
| `clientes` | pwa | 3 (Productos) |
| `cocina-display` | pwa | 5 (Mesas/Cocina) |
| `cocina` | pwa | 5 (Mesas/Cocina) |
| `comanda` | pwa | 5 (Mesas/Cocina) |
| `competencia` | pwa | 6 (Admin) |
| `config/alertas` | pwa | 6 (Admin) |
| `config/dallia` | pwa | 6 (Admin) |
| `config/horarios` | pwa | 6 (Admin) |
| `config/modulos` | pwa | 6 (Admin) |
| `config/tour` | pwa | 6 (Admin) |
| `configuracion` | **mixed** | 6 (Admin) |
| `contratos` | pwa | 7 (Legal) |
| `cortesia-nueva` | pwa | 5 (Mesas/Cocina) |
| `dallia-chat` | pwa | 11 (DallIA) |
| `dallia-voz` | pwa | 11 (DallIA) |
| `dashboard-almacenero` | **mixed** | 2 (Almacen) |
| `dashboard-cajero` | **mixed** | 4 (Caja/Ventas) |
| `dashboard-mesero` | **mixed** | 5 (Mesas/Cocina) |
| `delivery-config` | pwa | 5 (Mesas/Cocina) |
| `delivery` | pwa | 5 (Mesas/Cocina) |
| `error` | pwa | 9 (Auth/Public) |
| `espera-verificacion` | pwa | 9 (Auth) |
| `eventos` | pwa | 8 (Features) |
| `factura` | pwa | 4 (Caja/Ventas) |
| `features/delivery` | unknown | 8 (Features) |
| `features/fidelidad` | unknown | 8 (Features) |
| `features/menu-digital` | desktop | 8 (Features) |
| `features/promociones` | unknown | 8 (Features) |
| `features/reservas` | unknown | 8 (Features) |
| `fidelidad-config` | pwa | 8 (Features) |
| `fidelidad-dashboard` | pwa | 8 (Features) |
| `fidelidad-scan` | pwa | 8 (Features — solo-PWA autorizado) |
| `firmar` | pwa | 7 (Legal) |
| `gastos-fijos` | pwa | 6 (Admin) |
| `index` | pwa | 9 (Public) |
| `landing` | **mixed** | 9 (Public) |
| `layout` | pwa | 9 (Public) |
| `legal-permisos` | pwa | 7 (Legal) |
| `legal/privacidad` | unknown | 7 (Legal) |
| `legal/terminos` | unknown | 7 (Legal) |
| `libro-reclamaciones-admin` | pwa | 7 (Legal) |
| `libro-reclamaciones` | **mixed** | 7 (Legal) |
| `loader` | unknown | 9 (Public) |
| `login` | pwa | 9 (Auth) |
| `mantenimiento` | pwa | 8 (Features) |
| `mas` | pwa | 11 (DallIA — solo-PWA autorizado) |
| `mesa-cobrar` | pwa | 5 (Mesas/Cocina) |
| `mesa-cuenta` | pwa | 5 (Mesas/Cocina) |
| `mesa-ronda` | pwa | 5 (Mesas/Cocina) |
| `mesas` | **mixed** | 5 (Mesas/Cocina) |
| `nda-equipo` | pwa | 7 (Legal) |
| `nota-credito-emitir` | pwa | 4 (Caja/Ventas) |
| `nota-credito` | pwa | 4 (Caja/Ventas) |
| `onboarding-dallia` | pwa | 9 (Auth) |
| `onboarding-wizard` | pwa | 9 (Auth) |
| `onboarding` | pwa | 9 (Auth) |
| `para-llevar-nuevo` | pwa | 5 (Mesas/Cocina) |
| `pedido-nuevo` | pwa | 5 (Mesas/Cocina) |
| `pedidos-lista` | pwa | 5 (Mesas/Cocina) |
| `personal-eventual` | pwa | 6 (Admin) |
| `productos` | **mixed** | 3 (Productos) |
| `promociones` | pwa | 3 (Productos) |
| `propinas-config` | pwa | 4 (Caja/Ventas) |
| `propinas` | pwa | 4 (Caja/Ventas) |
| `public/beneficios` | unknown | 9 (Public) |
| `public/demo` | pwa | 9 (Public) |
| `public/homepage` | pwa | 9 (Public) |
| `public/marketplace` | **mixed** | 9 (Public) |
| `public/paquetes` | pwa | 9 (Public) |
| `public/restaurantes` | unknown | 9 (Public) |
| `ranking` | **mixed** | 3 (Productos) |
| `recetas-standalone` | pwa | 3 (Productos) |
| `redes-sociales` | **mixed** | 6 (Admin) |
| `reportes` | pwa | 4 (Caja/Ventas) |
| `setup-sistema` | pwa | 9 (Auth) |
| `setup` | **mixed** | 9 (Auth) |
| `solicitud-confirmacion` | unknown | 9 (Public) |
| `solicitud` | pwa | 9 (Public) |
| `soporte` | pwa | 6 (Admin) |
| `sostac/brief` | unknown | 6 (Admin) |
| `sostac/index` | **mixed** | 6 (Admin) |
| `sostac/situacion` | unknown | 6 (Admin) |
| `sunat-calendario` | pwa | 7 (Legal) |
| `sunat-igv` | pwa | 7 (Legal) |
| `sunat-planilla` | pwa | 7 (Legal) |
| `sunat` | pwa | 7 (Legal) |
| `superadmin/analytics-dallia` | unknown | 10 (Superadmin — solo-desktop autorizado) |
| `superadmin/analytics-infrastructure` | unknown | 10 (Superadmin — solo-desktop autorizado) |
| `superadmin/billing` | desktop | 10 (Superadmin — solo-desktop autorizado) |
| `superadmin/cotizador` | desktop | 10 (Superadmin — solo-desktop autorizado) |
| `superadmin/dashboard` | desktop | 10 (Superadmin — solo-desktop autorizado) |
| `superadmin/observabilidad` | desktop | 10 (Superadmin — solo-desktop autorizado) |
| `superadmin/solicitudes` | unknown | 10 (Superadmin — solo-desktop autorizado) |
| `superadmin/tenants` | unknown | 10 (Superadmin — solo-desktop autorizado) |
| `trial-expirado` | pwa | 9 (Auth/Public) |
| `usuarios` | pwa | 6 (Admin) |
| `ventas` | pwa | 4 (Caja/Ventas) |

## Backlog de iteraciones

### Iter 2 — Almacen (9 vistas)
Crear desktop variants basadas en el nuevo sistema de diseno.
- `almacen/dashboard`
- `almacen/inventario`
- `almacen/entradas`
- `almacen/salidas`
- `almacen/que-comprar`
- `almacen/proveedores`
- `almacen/historial`
- `almacen/alertas`
- `almacen/conteo-fisico`
- `dashboard-almacenero` (responsive contaminante → dividir)

### Iter 3 — Productos + Menu (5 vistas)
- `productos` (responsive contaminante → dividir)
- `ranking` (responsive contaminante → dividir)
- `recetas-standalone`
- `promociones`
- `clientes`

### Iter 4 — Caja + Ventas + Reportes (10 vistas)
- `caja`
- `ventas`
- `reportes`
- `dashboard-cajero` (responsive contaminante → dividir)
- `checkout`
- `factura`
- `nota-credito`
- `nota-credito-emitir`
- `propinas`
- `propinas-config`

### Iter 5 — Mesas + Cocina + Delivery (14 vistas)
- `mesas` (responsive contaminante → dividir)
- `cocina`
- `comanda`
- `cocina-display`
- `mesa-ronda`
- `mesa-cuenta`
- `mesa-cobrar`
- `para-llevar-nuevo`
- `cortesia-nueva`
- `pedido-nuevo`
- `pedidos-lista`
- `delivery`
- `delivery-config`
- `dashboard-mesero` (responsive contaminante → dividir)

### Iter 6 — Administracion + Usuarios + Config (15 vistas)
- `administracion/dashboard`
- `administracion/gastos`
- `administracion/planilla`
- `usuarios`
- `configuracion` (responsive contaminante → dividir)
- `canales`
- `redes-sociales` (responsive contaminante → dividir)
- `personal-eventual`
- `gastos-fijos`
- `config/dallia`
- `config/alertas`
- `config/modulos`
- `config/horarios`
- `config/tour`
- `competencia`
- `soporte`
- `sostac/brief`
- `sostac/index` (responsive contaminante → dividir)
- `sostac/situacion`
- `backups`

### Iter 7 — Legal + SUNAT (11 vistas)
- `sunat`
- `sunat-calendario`
- `sunat-igv`
- `sunat-planilla`
- `legal-permisos`
- `legal/privacidad`
- `legal/terminos`
- `libro-reclamaciones` (responsive contaminante → dividir)
- `libro-reclamaciones-admin`
- `contratos`
- `nda-equipo`
- `firmar`

### Iter 8 — Features (delivery, fidelidad, eventos, etc.) (10 vistas)
- `features/delivery`
- `features/fidelidad`
- `features/menu-digital`
- `features/promociones`
- `features/reservas`
- `fidelidad-dashboard`
- `fidelidad-config`
- `fidelidad-scan` (solo-PWA autorizado)
- `eventos`
- `mantenimiento`

### Iter 9 — Auth + Onboarding + Public (17 vistas)
- `login`
- `setup` (responsive contaminante → dividir)
- `setup-sistema`
- `cambiar-contrasena`
- `onboarding`
- `onboarding-dallia`
- `onboarding-wizard`
- `espera-verificacion`
- `solicitud`
- `solicitud-confirmacion`
- `trial-expirado`
- `landing` (responsive contaminante → dividir)
- `layout`
- `index`
- `loader`
- `error`
- `404`
- `public/homepage`
- `public/demo`
- `public/paquetes`
- `public/beneficios`
- `public/marketplace` (responsive contaminante → dividir)
- `public/restaurantes`

### Iter 10 — Superadmin (solo-desktop autorizado) (8 vistas)
Estas vistas son administrativas y NO necesitan variante PWA. Se agregan al allowlist `ALLOWED_DESKTOP_ORPHANS` del test de variantes. En mobile muestran mensaje "Vista solo disponible en desktop".

- `superadmin/dashboard`
- `superadmin/tenants`
- `superadmin/billing`
- `superadmin/solicitudes`
- `superadmin/observabilidad`
- `superadmin/cotizador`
- `superadmin/analytics-dallia`
- `superadmin/analytics-infrastructure`

### Iter 11 — DallIA + Chat (solo-PWA autorizado consider) (4 vistas)
Evaluar caso por caso si necesitan desktop o se quedan solo-PWA.

- `chat`
- `dallia-chat`
- `dallia-voz`
- `mas`

## Proceso por iteracion

Para cada iteracion futura, el flujo es:

1. Crear spec en `docs/superpowers/specs/YYYY-MM-DD-iterN-<modulo>-design.md`
2. Crear plan en `docs/superpowers/plans/YYYY-MM-DD-iterN-<modulo>.md`
3. Para cada vista del modulo:
   - Si ya existe PWA y falta desktop → crear `-desktop.ejs` con el nuevo diseno del sistema
   - Si ya existe desktop responsive → dividir en `<page>.ejs` (PWA) + `<page>-desktop.ejs` (limpio)
   - Ajustar la ruta en `server.js` / `routes/*.js` a `renderForDevice()`
   - Agregar el par a `REGISTERED_PAIRS` en `tests/view-variants.test.js`
   - Agregar markers `@variant: pwa` y `@variant: desktop`
   - Correr `npm test` — debe pasar antes del commit
   - Verificar visualmente con Playwright
4. Commit por vista (TDD + frequent commits)

## Notas para las iteraciones futuras

**Responsive contaminante (12 vistas)**: Estos archivos tienen clases de Bootstrap (`col-lg-*`) junto con estilos PWA (max-width 480px). Hay que:
1. Copiar el archivo actual a `<name>-desktop.ejs`
2. Limpiar el PWA del `-desktop.ejs` (quitar max-width, hacer full-width)
3. Limpiar el desktop del `<name>.ejs` (quitar Bootstrap responsive, dejar solo PWA shell)
4. Usar `renderForDevice` en el route

**Unknown (25 vistas)**: Inspeccionar manualmente cada una. Puede ser que:
- Sea una vista tan simple que no tenga hints (ej: `error.ejs`)
- Sea una vista administrativa pura sin layout mobile
- Sea un modal o componente embebido

**Superadmin (Iter 10)**: Los hints `desktop` son fuertes. Marcar como solo-desktop en el test allowlist.
