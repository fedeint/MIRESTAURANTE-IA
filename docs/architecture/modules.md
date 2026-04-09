# Arquitectura — Mapa de Módulos

> **Objetivo**: que cualquier worker pueda ubicarse en el código en <10 min y saber qué archivos tocar para su módulo.

Última actualización: 2026-04-08

---

## Vista de 10000 pies

```
┌─────────────────────────────────────────────────────────────────┐
│                    Request del usuario                           │
│  (browser phone/tablet → PWA  |  browser desktop → desktop)      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  server.js — Express app                                         │
│  - helmet (headers)    - ipGuard (rate limit + blacklist)        │
│  - cookie-parser       - sessionTimeout                          │
│  - session + passport  - attachUserToLocals                      │
│  - csrf-csrf           - tenant resolution                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  middleware/ — auth, tenant, caja, password change, geo, trial   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  routes/ — 53 route modules grouped by feature                   │
│                                                                   │
│   OPS            Corazón         Admin          Sistema           │
│   caja.js        almacen.js      admin...js     usuarios.js       │
│   cocina.js      productos.js    sunat.js       config...js       │
│   mesas.js       recetas.js      reportes.js    soporte.js        │
│   pedidos.js     clientes.js                                      │
│   delivery.js                                                     │
│   ventas.js      IA              Legal/SaaS                       │
│                  chat.js         contratos.js                     │
│                  sostac.js       nda-equipo.js                    │
│                                  superadmin.js                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  lib/deviceRouter.js → elige pwa|desktop                         │
│  views/<page>.ejs (pwa) OR views/<page>-desktop.ejs (desktop)    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase Postgres (db.js pool)                                  │
│  Tablas: tenants, usuarios, productos, pedidos, mesas, clientes, │
│          almacen_*, recetas, facturas, ataques_log, audit_log... │
└─────────────────────────────────────────────────────────────────┘
```

---

## Capas del código

### 1. Entry point

- **`server.js`** — monta todos los middlewares, routes, y helpers. **Prohibido** para workers tocarlo sin coordinar.

### 2. Database

- **`db.js`** — pool de PostgreSQL, helper `db.query(sql, params)`. Crea tablas + índices al arrancar.
- **`migrations/*.sql`** — migraciones versionadas. Solo `@Leonidasx8` las modifica.

### 3. Libs (`lib/`)

Código reusable que **no** son middleware ni route. Cualquiera puede importarlos.

| Archivo | Responsabilidad |
|---|---|
| `deviceRouter.js` | Picker PWA vs desktop por User-Agent (fuente de verdad) |
| `logger.js` | Structured logging con niveles (DEBUG, INFO, WARN, ERROR, SECURITY) |
| `audit.js` | Audit trail de acciones de negocio (insert en `audit_log`) |
| `alertas.js` | Envío de alertas Email + WhatsApp para eventos críticos |
| `mailer.js` | SMTP wrapper con fallback |
| `grafana-client.js` | Cliente HTTP para Grafana Cloud con circuit breaker |
| `ip-protection.js` | Lectura y cache de la `ip_blacklist` tabla |
| `loginGuard.js` | Lockout por brute force en login |
| `posthog-events.js` | Envío de eventos de producto a PostHog |
| `schemas.js` | Zod schemas compartidos entre rutas |
| `tenantContext.js` | Helpers para resolver el tenant activo |
| `tenantUrl.js` | Builder de URLs con subdominio del tenant |

### 4. Middleware (`middleware/`)

Funciones Express que se enganchan en el pipeline. Se ejecutan en orden.

| Archivo | Qué hace | Cuándo se aplica |
|---|---|---|
| `requestId.js` | Asigna un ID único a cada request (para logs) | Global |
| `telemetry.js` | Mide duración, status, logs básicos | Global |
| `geoContext.js` | Resuelve país/ciudad del IP via CF headers | Global |
| `sessionGeo.js` | Guarda geo en la session | Post-session |
| `ipGuard.js` | Rate limit + check blacklist | Global |
| `sessionTimeout.js` | 8h idle, 24h absolute session expiry | Post-session |
| `tenant.js` | Resuelve tenant por subdominio o path | Post-session |
| `tenantGuard.js` | Bloquea acceso cross-tenant | Post-tenant |
| `slugRouter.js` | Router dinámico por slug de tenant | Post-tenant |
| `auth.js` | `requireAuth`, `requireRole`, `attachUserToLocals` | Por-route |
| `requireCaja.js` | Bloquea ops de mesa/cocina si caja está cerrada | Por-route |
| `requirePasswordChange.js` | Fuerza cambio si password es default | Por-route |
| `requireTrial.js` | Bloquea tenants con trial expirado | Por-route |
| `requireModulo.js` | Bloquea si el módulo no está en el plan del tenant | Por-route |
| `moduloUsage.js` | Trackea uso de módulos para billing | Por-route |
| `validate.js` | Wrapper de Zod (`validateBody(schema)`) | Por-route |

### 5. Routes (`routes/`)

53 route modules agrupados por feature. Cada uno monta un `express.Router()`.

#### 📦 OPS (operaciones diarias)

| Route | Views | Owner (futuro) |
|---|---|---|
| `caja.js` | `caja.ejs` / `caja-desktop.ejs` | Anthony |
| `cocina.js` | `cocina.ejs` / `cocina-desktop.ejs` + `comanda.ejs` + `cocina-display.ejs` | Anthony |
| `cocina-display.js` | `cocina-display.ejs` | Anthony |
| `mesas.js` | `mesas.ejs` / `mesas-desktop.ejs` + `mesa-*.ejs` | Jhonatan |
| `mesa-cuenta.js` | `mesa-cuenta.ejs` | Jhonatan |
| `delivery.js` | `delivery.ejs` / `delivery-desktop.ejs` | Ian Miguel |
| `pedidos.js` | `pedidos.ejs` / `pedidos-desktop.ejs` (iter 1.6 — consolidado) | TBD (iter 1.7) |
| `pedidos-lista.js` | `pedidos-lista.ejs` | TBD |
| `pedido-nuevo.js` | `pedido-nuevo.ejs` | TBD |
| `para-llevar.js` | `para-llevar-nuevo.ejs` | TBD |
| `ventas.js` | `ventas.ejs` | @Leonidasx8 |
| `facturas.js` | `factura.ejs` + `checkout.ejs` | @Leonidasx8 |
| `cortesias.js` | `cortesia-nueva.ejs` | @Leonidasx8 |
| `pagos.js` | — (API only, Izipay integration) | @Leonidasx8 |

#### 💚 Corazón (inventory + menu)

| Route | Views | Owner |
|---|---|---|
| `almacen.js` | `almacen/*.ejs` | Daniel |
| `productos.js` | `productos.ejs` / `productos-desktop.ejs` + `ranking.ejs` | Ian Miguel |
| `recetas.js` | `recetas-standalone.ejs` | Bruce |
| `recetas-standalone.js` | `recetas-standalone.ejs` | Bruce |
| `clientes.js` | `clientes.ejs` / `clientes-desktop.ejs` | Bruce |

#### 📊 Administración

| Route | Views | Owner |
|---|---|---|
| `administracion.js` | `administracion/*.ejs` | @Leonidasx8 |
| `reportes.js` | `reportes.ejs` | Daniel |
| `sunat.js` / `sunat-pwa.js` | `sunat*.ejs` | @Leonidasx8 |
| `canales.js` | `canales.ejs` | @Leonidasx8 |
| `social-api.js` | — (API only, Meta/TikTok) | @Leonidasx8 |

#### 🤖 IA + DallIA

| Route | Views | Owner |
|---|---|---|
| `chat.js` | `chat.ejs` + `dallia-chat.ejs` + `dallia-voz.ejs` | @Leonidasx8 |
| `sostac.js` | `sostac/*.ejs` | @Leonidasx8 |
| `onboarding-dallia.js` | `onboarding-dallia.ejs` | @Leonidasx8 |
| `tts.js` | — (API only, text-to-speech) | @Leonidasx8 |

#### 🔧 Sistema

| Route | Views | Owner |
|---|---|---|
| `usuarios.js` | `usuarios.ejs` | @Leonidasx8 |
| `configuracion.js` | `configuracion.ejs` + `config/*.ejs` | @Leonidasx8 |
| `config-pwa.js` | `config/*.ejs` | @Leonidasx8 |
| `soporte.js` | `soporte.ejs` | @Leonidasx8 |
| `backups.js` | `backups.ejs` | @Leonidasx8 |
| `setup-sistema.js` | `setup-sistema.ejs` | @Leonidasx8 |
| `sync.js` | — (offline sync API) | @Leonidasx8 |

#### 🔐 Auth + Legal + SaaS

| Route | Views | Owner |
|---|---|---|
| `auth.js` | `login.ejs` + `setup.ejs` + `cambiar-contrasena.ejs` | @Leonidasx8 |
| `google-auth.js` | — (OAuth flow) | @Leonidasx8 |
| `webauthn.js` | — (biometric auth) | @Leonidasx8 |
| `onboarding.js` | `onboarding*.ejs` | @Leonidasx8 |
| `solicitud.js` | `solicitud*.ejs` | @Leonidasx8 |
| `public.js` | `public/*.ejs` + `landing.ejs` | @Leonidasx8 |
| `legal.js` / `legal-pwa.js` | `legal-permisos.ejs` | @Leonidasx8 |
| `contratos.js` | `contratos.ejs` | @Leonidasx8 |
| `nda-equipo.js` | `nda-equipo.ejs` | @Leonidasx8 |
| `firmar.js` | `firmar.ejs` | @Leonidasx8 |
| `superadmin.js` | `superadmin/*.ejs` | @Leonidasx8 |
| `observabilidad.js` | `superadmin/observabilidad.ejs` | @Leonidasx8 |
| `cotizaciones.js` | `superadmin/cotizador.ejs` | @Leonidasx8 |
| `cron.js` | — (Vercel Cron endpoints) | @Leonidasx8 |
| `features.js` | `features/*.ejs` | @Leonidasx8 |
| `sprint4.js` | `eventos.ejs`, `fidelidad-*.ejs`, etc (legacy bundle) | @Leonidasx8 |

---

## Flow de datos típico

### Ejemplo 1: admin abre el dashboard

```
1. GET /  (browser desktop)
2. helmet → cookie-parser → session → csrf → ipGuard (pass) → sessionTimeout (not expired)
3. tenant middleware → resuelve tenant por subdominio
4. tenantGuard → verifica que el usuario pertenece al tenant
5. app.get('/', requireAuth, async (req, res) => {
     // carga dashboard.pendientes, mesas, ventas, iaInsights
     renderForDevice(req, res, 'dashboard', { dashboard });
   });
6. deviceRouter detecta UA de Mac → renderiza 'dashboard-desktop'
7. dashboard-desktop.ejs incluye partials/sidebar.ejs
8. Respuesta HTML al browser
```

### Ejemplo 2: mesero abre una comanda

```
1. POST /mesas/:id/comanda  (iPhone)
2. helmet → cookie-parser → session → csrf (valid token) → ipGuard → tenant
3. routes/mesas.js → requireAuth → requireRole(['mesero','administrador']) → requireCaja
4. INSERT INTO pedidos (tenant_id, mesa_id, mesero_nombre, tipo, ...) RETURNING id
5. redirect a /mesas/:id/tomar-pedido
6. deviceRouter → renderiza versión PWA
```

### Ejemplo 3: login

```
1. POST /login con { usuario, password, _csrf }
2. csrf-csrf valida __csrf cookie vs _csrf body
3. rate limit: loginLimiter (10 intentos / 15 min)
4. lib/loginGuard → verifica lockout por brute force
5. bcrypt.compare(password, user.password_hash)
6. passport.login → req.session.user
7. lib/audit → INSERT INTO login_history con geo + success
8. redirect a /
```

---

## Tenancy

Cada **tenant** es un restaurante cliente del SaaS. Cada tenant tiene:
- Un registro en `tenants` con `slug`, `nombre`, `plan`, `trial_ends_at`
- Un subdominio: `<slug>.mirestconia.com` (o path: `/t/<slug>/...`)
- Usuarios propios (roles: administrador, mesero, cajero, cocinero, almacenero)
- Datos completamente aislados por `tenant_id` en cada tabla

**Regla de oro**: TODA query a datos del negocio (`pedidos`, `productos`, `clientes`, etc) debe tener `WHERE tenant_id = ?` con el valor de `req.session.tenantId`. Nunca de `req.body`.

---

## Autenticación y roles

```
anonymous → login → session.user con { id, usuario, rol, tenantId }
                    ↓
                    ├─ rol: 'administrador' → acceso total al tenant
                    ├─ rol: 'cajero' → caja + facturación
                    ├─ rol: 'mesero' → mesas + cocina + facturación
                    ├─ rol: 'cocinero' → cocina
                    ├─ rol: 'almacenero' → almacen + productos + recetas
                    └─ rol: 'superadmin' → panel del SaaS (cross-tenant)
```

`requireAuth` → chequea `req.session.user`
`requireRole(['admin','mesero'])` → además chequea el rol

---

## Device routing (zero responsive)

Ver [CLAUDE.md](../../CLAUDE.md) sección "Variantes de vistas".

TL;DR:
- `lib/deviceRouter.js` es la fuente de verdad
- `isPhoneOrTablet(ua)` → regex estricto
- `renderForDevice(req, res, 'nombre')` → renderiza `nombre.ejs` o `nombre-desktop.ejs`
- Tests en `tests/view-variants.test.js` aseguran que los archivos nunca quedan idénticos

---

## Observability

| Herramienta | Qué observa |
|---|---|
| Grafana Cloud | Métricas de latencia, errores HTTP, queries DB, resource usage |
| `audit_log` (DB) | Acciones de negocio (crear factura, cerrar caja, etc) |
| `login_history` (DB) | Intentos de login con geo |
| `ataques_log` (DB) | DDoS, brute force, scanner, API abuse detectados |
| `request_counts` (DB) | Ventana deslizante de 5min para rate limit |
| `/superadmin/observabilidad` | Dashboard visual con 6 tabs |

Flujo de detección de ataques:
```
ipGuard → request_counts → cron/attack-detection (cada 1 min) →
  ip-protection.js → ataques_log + ip_blacklist + alertas (email/WhatsApp) + Grafana
```

---

## Cron jobs

Definidos en `vercel.json`, ejecutados por Vercel Cron:

| Path | Frecuencia | Qué hace |
|---|---|---|
| `/api/cron/attack-detection` | 1 min | Detecta patrones de ataque y banea IPs |
| `/api/cron/daily-cleanup` | Diario 3am | Limpia `request_counts`, rota logs |
| `/api/cron/weekly-reports` | Lunes 6am | Envía reportes weekly por email |
| `/api/cron/trial-expire-check` | Diario 5am | Notifica trials por vencer + expira los vencidos |

Auth de cron: header `Authorization: Bearer $CRON_SECRET`.

---

## Dónde está qué

**"Quiero agregar un botón a la pantalla de caja":**
1. `views/caja.ejs` (PWA) y `views/caja-desktop.ejs` (desktop)
2. Si es un form, maneja el POST en `routes/caja.js`
3. Valida input con Zod en `lib/schemas.js`
4. Corre `npm test` y revisa visualmente en navegador

**"Quiero consultar pedidos del día":**
- Lee en `routes/pedidos.js` o `routes/ventas.js`
- Query: `SELECT * FROM pedidos WHERE tenant_id = ? AND DATE(created_at) = CURRENT_DATE`
- Renderiza con `renderForDevice`

**"Quiero agregar un módulo nuevo":**
1. Crea `routes/mi-modulo.js` con su `express.Router()`
2. Crea `views/mi-modulo.ejs` (pwa) + `views/mi-modulo-desktop.ejs` (desktop) con markers `@variant`
3. Monta en `server.js`: `app.use('/mi-modulo', require('./routes/mi-modulo'))`
4. Agrega el par a `tests/view-variants.test.js` → `REGISTERED_PAIRS`
5. Agrega el link al sidebar en `views/partials/sidebar.ejs` con su icono + role check
6. Registra la entry en `CODEOWNERS`
7. Corre `npm test`

---

## Referencias

- [CLAUDE.md](../../CLAUDE.md) — reglas arquitectónicas y de seguridad
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — cómo contribuir
- [SECURITY.md](../../SECURITY.md) — reglas de seguridad obligatorias
- [docs/superpowers/audits/2026-04-08-views-pairing-audit.md](../superpowers/audits/2026-04-08-views-pairing-audit.md) — catálogo de vistas por estado
- [docs/onboarding/README.md](../onboarding/README.md) — día 1 para workers
