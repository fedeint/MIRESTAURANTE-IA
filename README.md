# MiRest con IA

> **Sistema SaaS multi-tenant de gestión de restaurantes peruanos con IA conversacional (DallIA).**
> PWA mobile-first para micro-restaurantes hasta cadenas.

[![CI](https://github.com/Leonidasx8/MiRestconIA/actions/workflows/ci.yml/badge.svg)](https://github.com/Leonidasx8/MiRestconIA/actions/workflows/ci.yml)

---

## Descripción

MiRest con IA es una plataforma integral para restaurantes que unifica:

- **Operaciones** — caja, pedidos (mesa + delivery + para llevar), cocina, ventas
- **Gestión de cocina** — almacén, productos, recetas, costeo
- **Clientes y fidelización** — base de clientes, promociones, fidelidad por QR
- **Administración** — P&L, planilla, gastos, facturación electrónica SUNAT
- **IA conversacional (DallIA)** — asistente que responde preguntas del negocio en lenguaje natural
- **Multi-tenant** — cada restaurante es un tenant con subdominio propio (`restaurante.mirestconia.com`)

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Express 4 + Node.js 24 |
| Vistas | EJS (Server-Side Rendering) |
| DB | PostgreSQL (Supabase en producción, local opcional) |
| Auth | Sessions + Google OAuth 2.0 + WebAuthn biométrico |
| PWA | Service Worker + IndexedDB offline queue |
| Deploy | Vercel (Fluid Compute + Vercel Cron) |
| Tests | `node:test` built-in (sin Jest/Mocha) |
| Observability | Grafana Cloud + custom dashboard `/superadmin/observabilidad` |
| IA | Claude (Anthropic) vía `@anthropic-ai/sdk` |

---

## Arquitectura: Dos variantes por página (ZERO responsive)

Cada página tiene **exactamente** dos archivos EJS mutuamente excluyentes:

| Variante | Archivo | Dispositivos |
|---|---|---|
| PWA mobile | `views/<page>.ejs` | iPhone, Android phone, iPad, Android tablet |
| Desktop | `views/<page>-desktop.ejs` | Mac, Windows, Linux |

La decisión se hace server-side via User-Agent en `lib/deviceRouter.js`:

```js
const { renderForDevice } = require('./lib/deviceRouter');

app.get('/pedidos', requireAuth, (req, res) => {
  renderForDevice(req, res, 'pedidos', { data });
  // phone/tablet → views/pedidos.ejs
  // desktop → views/pedidos-desktop.ejs
});
```

**Regla estricta**: jamás un template intenta ser responsive para ambos. Cada uno es exclusivo. Un test guard en `tests/view-variants.test.js` **falla CI** si algún par queda byte-idéntico.

Detalles completos en [CLAUDE.md](./CLAUDE.md) sección "Variantes de vistas".

---

## Quickstart (desarrollo local)

### 1. Requisitos

- Node.js **24 LTS** (no 18)
- PostgreSQL local **O** acceso a la base de Supabase dev
- Git

### 2. Clonar e instalar

```bash
git clone https://github.com/Leonidasx8/MiRestconIA.git
cd MiRestconIA
npm install
```

### 3. Configurar `.env`

Pídele a `@Leonidasx8` el archivo `.env.local` con las credenciales de desarrollo. **Nunca comitees este archivo.**

Si necesitas crearlo desde cero, mira `.env.example` para la lista de variables requeridas. Las críticas:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
SESSION_SECRET=<generate with: openssl rand -hex 32>
PORT=1995
```

### 4. Instalar el pre-commit hook

```bash
npm run hooks:install
```

Esto activa el hook que corre `npm test` automáticamente antes de cada commit que toque `views/` o `lib/deviceRouter*`. **No lo saltes con `--no-verify`** salvo autorización explícita.

### 5. Arrancar el servidor

```bash
npm run dev    # con nodemon, recarga automática
# o
npm start      # sin recarga
```

Luego abre http://localhost:1995

**Credenciales default** (primer acceso):
- Usuario: `admin`
- Contraseña: `admin123`

**Cambia esta contraseña inmediatamente en tu primer login.**

---

## Comandos disponibles

```bash
npm start              # Arranca el servidor (node server.js)
npm run dev            # Arranca con nodemon (recarga en cambios)
npm test               # Corre toda la suite (22+ tests)
npm run hooks:install  # Instala el pre-commit hook (una sola vez)
npm run build          # Build ejecutable Windows (pkg)
npm run local          # Modo local sin Supabase
```

---

## Estructura del proyecto

```
.
├── server.js                     # Entry point — mount routes, middleware, helpers
├── db.js                         # Pool Postgres + helpers de queries
├── lib/
│   ├── deviceRouter.js           # PWA vs desktop picker (fuente de verdad)
│   ├── deviceRouter.test.js      # Tests del picker
│   ├── logger.js                 # Structured logging + niveles
│   ├── alertas.js                # Email/WhatsApp para eventos críticos
│   ├── grafana-client.js         # Cliente de Grafana Cloud con circuit breaker
│   └── schemas.js                # Zod schemas compartidos
├── middleware/
│   ├── auth.js                   # requireAuth, requireRole, attachUserToLocals
│   ├── tenant.js                 # Resolución de tenant por subdomain/path
│   ├── tenantGuard.js            # Bloqueo cross-tenant
│   ├── ipGuard.js                # Rate limit + blacklist
│   ├── sessionTimeout.js         # 8h idle, 24h absoluto
│   └── ...
├── routes/
│   ├── auth.js                   # Login, logout, Google OAuth, WebAuthn
│   ├── mesas.js                  # Flow de mesas
│   ├── cocina.js                 # Display de cocina + cola
│   ├── pedidos.js                # (iter 1.6) vista consolidada mesa/delivery/para-llevar
│   ├── ...
│   └── superadmin/               # Panel de admin del SaaS
├── views/
│   ├── dashboard.ejs             # @variant: pwa  (admin)
│   ├── dashboard-desktop.ejs     # @variant: desktop (admin)
│   ├── pedidos.ejs               # @variant: pwa
│   ├── pedidos-desktop.ejs       # @variant: desktop
│   ├── partials/
│   │   ├── sidebar.ejs           # Sidebar desktop (role-based)
│   │   ├── navbar.ejs            # Navbar alt
│   │   └── desktop-layout.ejs    # Shell reusable para vistas desktop
│   ├── almacen/                  # Sub-módulo de almacén
│   ├── administracion/           # P&L, planilla, gastos
│   └── superadmin/               # Panel superadmin
├── public/
│   ├── css/, js/, img/
│   └── vendor/                   # Libs third-party (Bootstrap Icons, etc)
├── migrations/
│   └── *.sql                     # Migraciones versionadas
├── tests/
│   └── view-variants.test.js     # Guard: ningún par PWA/desktop identical
├── docs/
│   └── superpowers/
│       ├── specs/                # Diseños de features (brainstorm → spec)
│       ├── plans/                # Planes de implementación
│       └── audits/               # Auditorías del código
├── .github/
│   ├── CODEOWNERS                # Review routing
│   ├── PULL_REQUEST_TEMPLATE.md  # Template obligatorio de PR
│   ├── ISSUE_TEMPLATE/           # Bug + feature templates
│   ├── workflows/ci.yml          # GitHub Actions CI
│   └── dependabot.yml            # Auto-update de deps
├── .githooks/
│   └── pre-commit                # Hook local (instalar con `npm run hooks:install`)
├── CLAUDE.md                     # Instrucciones arquitectónicas / reglas (leer primero)
├── CONTRIBUTING.md               # Guía para workers/contribuidores
├── SECURITY.md                   # Política de seguridad
└── README.md                     # Este archivo
```

---

## Roles de usuario

| Rol | Accesos |
|---|---|
| `administrador` | Todo el sistema del tenant (dashboard, caja, mesas, cocina, ventas, almacén, productos, admin, usuarios, config, reportes, SUNAT, chat IA) |
| `cajero` | Caja, facturación |
| `mesero` | Mesas, cocina, facturación |
| `cocinero` | Cocina |
| `almacenero` | Almacén, productos, recetas |
| `superadmin` | Panel del SaaS (todos los tenants, billing, observabilidad, solicitudes, cotizador, NDA, contratos) — menú separado del tenant |

---

## Para contribuir

**Lee estos tres archivos antes de abrir tu primer PR:**

1. [CONTRIBUTING.md](./CONTRIBUTING.md) — workflow de PRs, branch naming, reglas
2. [SECURITY.md](./SECURITY.md) — reglas innegociables de seguridad
3. [CLAUDE.md](./CLAUDE.md) — arquitectura, regla de variantes, reglas de seguridad detalladas

**Resumen rápido:**
- Toca **solo** los archivos de tu módulo asignado (ver [CODEOWNERS](./.github/CODEOWNERS))
- Crea una rama con formato `<tipo>/<tu-nombre>-<descripcion>`
- Pre-commit hook corre `npm test` automáticamente
- Abre el PR con el template completo
- Espera review de `@Leonidasx8` (y del AI reviewer automático)
- **Jamás** push a `main` directamente

---

## Documentación adicional

- [CLAUDE.md](./CLAUDE.md) — fuente de verdad de reglas arquitectónicas y de seguridad
- [docs/superpowers/specs/](./docs/superpowers/specs/) — diseños de features nuevas
- [docs/superpowers/plans/](./docs/superpowers/plans/) — planes de implementación
- [docs/superpowers/audits/](./docs/superpowers/audits/) — auditorías de código
- [UI.DELSISTEMA.pen](./UI.DELSISTEMA.pen) — archivo Pencil con 80+ pantallas diseñadas

---

## Reportar bugs o vulnerabilidades

- **Bugs normales** → abre un issue con el template de bug
- **Vulnerabilidades de seguridad** → **NO abras issue público**, lee [SECURITY.md](./SECURITY.md) y contacta a `@Leonidasx8` privado

---

## Licencia

Propietario — `@Leonidasx8`. Uso interno del equipo MiRest con IA.

---

🤖 Última actualización: 2026-04-08
