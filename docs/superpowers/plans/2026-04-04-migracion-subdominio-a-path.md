# Migración Subdominio → Path-Based Routing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el sistema multi-tenant de subdominios (`chuleta.mirestconia.com`) a rutas por path (`mirestconia.com/chuleta`), sin afectar la separación de datos por tenant ni la personalización de DallIA.

**Architecture:** El slug del tenant se extrae del primer segmento del URL path en lugar del hostname. Un middleware `slugResolver` intercepta requests, valida si el primer segmento es un slug válido de tenant (excluyendo rutas reservadas), y setea `req.tenantId` + `req.tenant` igual que antes. Las rutas internas del tenant se montan bajo `/:slug/*`. Las rutas públicas, superadmin y auth se mantienen en la raíz.

**Tech Stack:** Express.js, PostgreSQL/Supabase, EJS, Vercel

---

## Mapa de Archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `middleware/tenant.js` | **Reescribir** | Resolver tenant desde path slug en vez de hostname |
| `middleware/subdomainGuard.js` | **Reescribir → renombrar a `tenantGuard.js`** | Proteger rutas `/:slug/*` sin sesión |
| `middleware/slugRouter.js` | **Crear** | Router Express que monta todas las rutas de tenant bajo `/:slug` |
| `server.js` | **Modificar** | Cambiar orden de middleware, montar `slugRouter` |
| `routes/superadmin.js` | **Modificar** | Cambiar label de "subdominio" a "slug/URL" en API y validación |
| `views/superadmin/tenants.ejs` | **Modificar** | UI del modal muestra `mirestconia.com/slug` en vez de `slug.mirestconia.com` |
| `views/superadmin/dashboard.ejs` | **Modificar** | Links a tenants usan path en vez de subdominio |
| `services/notificaciones-trial.js` | **Modificar** | URLs en emails cambian a path-based |
| `services/crm-sync.js` | **Modificar** | URL del tenant en CRM cambia a path-based |
| `views/login.ejs` | **Modificar** | Login de tenant detecta slug de path en vez de subdominio |
| `routes/public.js` | **Modificar** | Quitar lógica de `isSubdomain` |
| `views/public/homepage.ejs` | **Modificar** | Links a restaurantes usan path |
| `views/public/restaurantes.ejs` | **Modificar** | Links a restaurantes usan path |
| `routes/chat.js` | **Modificar** | System prompt de DalIA actualiza URL |
| `views/legal/privacidad.ejs` | **Modificar** | Referencias estáticas de URL |
| `views/legal/terminos.ejs` | **Modificar** | Referencias estáticas de URL |
| `views/landing.ejs` | **Modificar** | Referencias de URL |
| `views/libro-reclamaciones.ejs` | **Modificar** | Referencias de URL |
| `routes/reportes.js` | **Modificar** | URL en PDFs generados |

---

## Rutas Reservadas (no son slugs de tenant)

Estos prefijos de path NUNCA deben resolverse como slug de tenant:

```javascript
const RESERVED_PATHS = [
  'api', 'auth', 'login', 'logout', 'home', 'landing',
  'superadmin', 'dashboard', 'mesas', 'cocina', 'caja',
  'almacen', 'pedidos', 'reportes', 'config', 'chat',
  'personal', 'recetas', 'productos', 'categorias',
  'cambiar-contrasena', 'vendor', 'css', 'js', 'logo',
  'public', 'uploads', 'favicon.ico', 'sw.js',
  'manifest.json', 'legal', 'privacidad', 'terminos',
  'libro-reclamaciones', 'restaurantes', 'solicitar-demo',
  'icon-192.png', 'icon-512.png'
];
```

---

### Task 1: Reescribir middleware/tenant.js — resolver desde path

**Files:**
- Modify: `middleware/tenant.js`

- [ ] **Step 1: Leer el archivo actual completo para tener contexto**

El archivo actual tiene 111 líneas. La función clave es `attachTenant` (línea 54-95) que extrae subdominio de `req.hostname`.

- [ ] **Step 2: Reescribir `resolveTenant` para buscar por slug (campo `subdominio` en DB)**

La columna `subdominio` en la DB se mantiene igual — solo cambia de dónde se extrae el valor (path en vez de hostname).

```javascript
// middleware/tenant.js
'use strict';
const db = require('../db');

// Cache de tenants (5 min)
const tenantCache = {};
const CACHE_TTL = 5 * 60 * 1000;

// Rutas reservadas que NUNCA son slugs de tenant
const RESERVED_PATHS = new Set([
  'api', 'auth', 'login', 'logout', 'home', 'landing',
  'superadmin', 'dashboard', 'mesas', 'cocina', 'caja',
  'almacen', 'pedidos', 'reportes', 'config', 'chat',
  'personal', 'recetas', 'productos', 'categorias',
  'cambiar-contrasena', 'vendor', 'css', 'js', 'logo',
  'public', 'uploads', 'favicon.ico', 'sw.js',
  'manifest.json', 'legal', 'privacidad', 'terminos',
  'libro-reclamaciones', 'restaurantes', 'solicitar-demo',
  'icon-192.png', 'icon-512.png'
]);

async function resolveTenantBySlug(slug) {
  const cached = tenantCache[slug];
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.data;
  try {
    const [[tenant]] = await db.query(
      'SELECT id, nombre, subdominio, plan, activo, estado_trial, trial_inicio, trial_fin FROM tenants WHERE subdominio = ? AND activo = true LIMIT 1',
      [slug]
    );
    if (tenant) tenantCache[slug] = { data: tenant, ts: Date.now() };
    return tenant || null;
  } catch (e) { return null; }
}

async function resolveTenantById(id) {
  const cached = tenantCache['id_' + id];
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.data;
  try {
    const [[tenant]] = await db.query(
      'SELECT id, nombre, subdominio, plan, activo, estado_trial, trial_inicio, trial_fin FROM tenants WHERE id = ? LIMIT 1',
      [id]
    );
    if (tenant) tenantCache['id_' + id] = { data: tenant, ts: Date.now() };
    return tenant || null;
  } catch (e) { return null; }
}

// Limites por plan
const PLAN_LIMITS = {
  free: { usuarios: 1, mesas: 10, productos: 50, almacen: false, recetas: false, caja: false, reportes_pdf: false, ia_voz: false, canales: false },
  pro: { usuarios: -1, mesas: -1, productos: -1, almacen: true, recetas: true, caja: true, reportes_pdf: true, ia_voz: true, canales: true },
  enterprise: { usuarios: -1, mesas: -1, productos: -1, almacen: true, recetas: true, caja: true, reportes_pdf: true, ia_voz: true, canales: true }
};

function setTenantOnReq(req, res, tenant) {
  req.tenantId = tenant.id;
  req.tenant = tenant;
  req.planLimits = PLAN_LIMITS[tenant.plan] || PLAN_LIMITS.free;
  res.locals.tenantId = tenant.id;
  res.locals.tenant = tenant;
  res.locals.planLimits = req.planLimits;
}

/**
 * Extrae el slug del primer segmento del path.
 * Retorna null si es una ruta reservada o no hay segmento.
 */
function extractSlugFromPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0].toLowerCase();
  if (RESERVED_PATHS.has(first)) return null;
  return first;
}

/**
 * Middleware principal: resuelve tenant desde path slug o sesión.
 */
function attachTenant(req, res, next) {
  const userTenantId = req.session?.user?.tenant_id;
  const userRole = req.session?.user?.rol;

  // Superadmin: siempre tenant 1 con enterprise
  if (userRole === 'superadmin') {
    req.tenantId = 1;
    req.tenant = { id: 1, plan: 'enterprise', estado_trial: 'activo', activo: true };
    req.planLimits = PLAN_LIMITS.enterprise;
    res.locals.tenantId = 1;
    res.locals.tenant = req.tenant;
    res.locals.planLimits = req.planLimits;
    res.locals.tenantSlug = null;
    res.locals.isTenantPath = false;
    return next();
  }

  const slug = extractSlugFromPath(req.path);

  if (slug) {
    // Path-based tenant: mirestconia.com/:slug/...
    resolveTenantBySlug(slug).then(tenant => {
      if (tenant) {
        setTenantOnReq(req, res, tenant);
        res.locals.tenantSlug = slug;
        res.locals.isTenantPath = true;
      } else {
        // No es un tenant válido — tratar como ruta normal
        req.tenantId = userTenantId || 1;
        req.planLimits = PLAN_LIMITS.free;
        res.locals.tenantId = req.tenantId;
        res.locals.planLimits = req.planLimits;
        res.locals.tenantSlug = null;
        res.locals.isTenantPath = false;
      }
      next();
    }).catch(() => {
      req.tenantId = userTenantId || 1;
      req.planLimits = PLAN_LIMITS.free;
      res.locals.tenantId = req.tenantId;
      res.locals.tenantSlug = null;
      res.locals.isTenantPath = false;
      next();
    });
  } else if (userTenantId) {
    // Ruta sin slug pero user logueado — resolver desde sesión
    resolveTenantById(userTenantId).then(tenant => {
      if (tenant) { setTenantOnReq(req, res, tenant); }
      else {
        req.tenantId = userTenantId;
        req.planLimits = PLAN_LIMITS.free;
        res.locals.tenantId = userTenantId;
        res.locals.planLimits = req.planLimits;
      }
      res.locals.tenantSlug = null;
      res.locals.isTenantPath = false;
      next();
    }).catch(() => {
      req.tenantId = userTenantId;
      req.planLimits = PLAN_LIMITS.free;
      res.locals.tenantId = userTenantId;
      res.locals.tenantSlug = null;
      res.locals.isTenantPath = false;
      next();
    });
  } else {
    // Sin slug, sin sesión — público
    req.tenantId = 1;
    req.planLimits = PLAN_LIMITS.free;
    res.locals.tenantId = 1;
    res.locals.planLimits = req.planLimits;
    res.locals.tenantSlug = null;
    res.locals.isTenantPath = false;
    next();
  }
}

function requirePlan(feature) {
  return (req, res, next) => {
    const limits = req.planLimits || PLAN_LIMITS.free;
    if (limits[feature] === false) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(403).json({ error: 'Esta funcion requiere plan Pro. Actualiza en configuracion.' });
      }
      return res.status(403).render('error', { error: { message: 'Esta funcion requiere plan Pro', stack: '' } });
    }
    next();
  };
}

module.exports = { attachTenant, requirePlan, PLAN_LIMITS, extractSlugFromPath, RESERVED_PATHS };
```

- [ ] **Step 3: Verificar que el archivo no tiene errores de sintaxis**

Run: `node -c middleware/tenant.js`
Expected: `Syntax OK`

- [ ] **Step 4: Commit**

```bash
git add middleware/tenant.js
git commit -m "refactor: tenant middleware resolves from path slug instead of hostname"
```

---

### Task 2: Reescribir subdomainGuard.js → tenantGuard.js

**Files:**
- Create: `middleware/tenantGuard.js`
- Delete: `middleware/subdomainGuard.js` (después de actualizar imports)

- [ ] **Step 1: Crear tenantGuard.js que protege rutas /:slug/**

```javascript
// middleware/tenantGuard.js
'use strict';

/**
 * Middleware that restricts access on tenant path routes.
 * On paths like /chuleta/mesas, only /slug/login and
 * static/auth routes are accessible without an active session.
 */
function tenantGuard(req, res, next) {
  const isTenantPath = res.locals.isTenantPath;

  if (!isTenantPath) {
    res.locals.isSubdomain = false; // backwards compat for views that check this
    return next();
  }

  const slug = res.locals.tenantSlug;
  res.locals.isSubdomain = true; // backwards compat
  res.locals.subdomainSlug = slug; // backwards compat

  // Strip slug prefix to get the "inner" path
  const innerPath = req.path.replace(new RegExp(`^/${slug}`), '') || '/';

  // Allow these inner routes without session
  const allowed = [
    '/login', '/auth/', '/api/auth/',
    '/cambiar-contrasena',
    '/vendor/', '/css/', '/js/', '/logo/',
    '/favicon', '/sw.js', '/manifest.json',
    '/icon-', '/api/health'
  ];

  if (allowed.some(p => innerPath.startsWith(p))) return next();

  // POST /slug/logout always allowed
  if (innerPath === '/logout' && req.method === 'POST') return next();

  // No session → redirect to tenant login
  if (!req.session || !req.session.user) {
    return res.redirect(`/${slug}/login`);
  }

  next();
}

module.exports = { tenantGuard };
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node -c middleware/tenantGuard.js`
Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
git add middleware/tenantGuard.js
git commit -m "feat: create tenantGuard middleware for path-based tenant access control"
```

---

### Task 3: Crear slugRouter.js — Router para rutas de tenant

**Files:**
- Create: `middleware/slugRouter.js`

Este router monta todas las rutas internas del tenant bajo `/:slug/`. Cuando un request llega a `/:slug/mesas`, el router lo reenvía internamente a `/mesas` con el tenant ya resuelto en `req`.

- [ ] **Step 1: Crear el router**

```javascript
// middleware/slugRouter.js
'use strict';
const express = require('express');
const { extractSlugFromPath, RESERVED_PATHS } = require('./tenant');

/**
 * Crea un sub-router que monta las rutas de la app bajo /:slug/.
 * Ejemplo: GET /chuleta/mesas → ejecuta la ruta /mesas con req.tenant = chuleta
 *
 * @param {express.Router} appRoutes - El router principal con todas las rutas de la app
 * @returns {express.Router}
 */
function createSlugRouter(appRoutes) {
  const router = express.Router();

  // /:slug/* — solo si el slug fue validado como tenant en attachTenant
  router.use('/:slug', (req, res, next) => {
    if (!res.locals.isTenantPath) {
      return next('route'); // No es tenant, pasar al siguiente handler
    }
    // Reescribir req.url para quitar el slug prefix
    // Esto permite que las rutas internas funcionen sin cambios
    req.url = req.url.replace(new RegExp(`^/${req.params.slug}`), '') || '/';
    // Guardar el slug base para generar URLs en views
    res.locals.basePath = `/${req.params.slug}`;
    next();
  }, appRoutes);

  return router;
}

module.exports = { createSlugRouter };
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node -c middleware/slugRouter.js`
Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
git add middleware/slugRouter.js
git commit -m "feat: create slugRouter to mount tenant routes under /:slug path"
```

---

### Task 4: Modificar server.js — nuevo orden de middleware

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Actualizar imports**

Reemplazar:
```javascript
const { subdomainGuard } = require('./middleware/subdomainGuard');
```
Por:
```javascript
const { tenantGuard } = require('./middleware/tenantGuard');
const { createSlugRouter } = require('./middleware/slugRouter');
```

- [ ] **Step 2: Reemplazar `subdomainGuard` por `tenantGuard` en el middleware chain**

Buscar donde se usa `subdomainGuard` en server.js y reemplazar por `tenantGuard`:

```javascript
// ANTES:
app.use(subdomainGuard);

// DESPUÉS:
app.use(tenantGuard);
```

- [ ] **Step 3: Montar el slugRouter DESPUÉS de las rutas de raíz**

Después de todas las rutas normales (superadmin, public, auth, etc.), agregar:

```javascript
// Tenant path routes: /:slug/mesas, /:slug/chat, etc.
// Usa el mismo appRouter pero bajo el prefix del slug
app.use(createSlugRouter(appRouter));
```

NOTA: Esto requiere que las rutas de la app estén agrupadas en un router `appRouter` que se pueda reusar. Si actualmente están montadas directamente en `app`, hay que extraerlas a un router.

Alternativa más simple (si las rutas están en `app` directamente): usar un middleware catch-all que haga el rewrite de URL:

```javascript
// DESPUÉS de todas las rutas normales, ANTES del 404 handler:
// Redirect /:slug/* requests — rewrite URL and replay through app
app.use((req, res, next) => {
  if (res.locals.isTenantPath && res.locals.tenantSlug) {
    const slug = res.locals.tenantSlug;
    // Rewrite: /chuleta/mesas → /mesas (tenant ya está en req)
    req.url = req.url.replace(new RegExp(`^/${slug}`), '') || '/';
    res.locals.basePath = `/${slug}`;
    // Re-dispatch through the app
    return app.handle(req, res, next);
  }
  next();
});
```

- [ ] **Step 4: Quitar lógica de hostname splitting de cualquier otro middleware en server.js**

Buscar cualquier referencia a `req.hostname.split('.')` o `parts[1] === 'mirestconia'` en server.js y eliminarla. El tenant ahora se resuelve solo por path.

- [ ] **Step 5: Mantener compatibilidad temporal con subdominios (redirect 301)**

Agregar como primer middleware un redirect de subdominio → path para no romper links existentes:

```javascript
// Redirect subdomain to path (temporary backwards compat)
app.use((req, res, next) => {
  const parts = (req.hostname || '').split('.');
  const isSubdomain = parts.length >= 3
    && parts[1] === 'mirestconia'
    && parts[2] === 'com'
    && parts[0] !== 'www';
  if (isSubdomain) {
    const slug = parts[0];
    const newUrl = `https://mirestconia.com/${slug}${req.originalUrl}`;
    return res.redirect(301, newUrl);
  }
  next();
});
```

- [ ] **Step 6: Verificar que el servidor arranca sin errores**

Run: `node -c server.js && timeout 5 node server.js || true`
Expected: Sin errores de sintaxis, servidor arranca

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "refactor: switch server middleware from subdomain to path-based tenant routing"
```

---

### Task 5: Actualizar vistas EJS — URLs de tenant

**Files:**
- Modify: `views/superadmin/tenants.ejs`
- Modify: `views/superadmin/dashboard.ejs`
- Modify: `views/login.ejs`
- Modify: `views/public/homepage.ejs`
- Modify: `views/public/restaurantes.ejs`

- [ ] **Step 1: tenants.ejs — Cambiar modal de creación**

En `views/superadmin/tenants.ejs`, línea 220-223, cambiar:
```html
<!-- ANTES -->
<input type="text" class="form-control" id="c_subdominio" placeholder="elmarineritopicante">
<span class="input-group-text" ...>.mirestconia.com</span>

<!-- DESPUÉS -->
<span class="input-group-text" ...>mirestconia.com/</span>
<input type="text" class="form-control" id="c_subdominio" placeholder="elmarineritopicante">
```

- [ ] **Step 2: tenants.ejs — Cambiar display en tabla**

En `views/superadmin/tenants.ejs`, línea 130, cambiar:
```html
<!-- ANTES -->
<div style="font-size:0.7rem;color:#64748b;"><%= t.subdominio %>.mirestconia.com</div>

<!-- DESPUÉS -->
<div style="font-size:0.7rem;color:#64748b;">mirestconia.com/<%= t.subdominio %></div>
```

- [ ] **Step 3: dashboard.ejs — Cambiar display de tenants**

En `views/superadmin/dashboard.ejs`, línea 193, cambiar:
```html
<!-- ANTES -->
<div style="font-size:0.7rem;color:#64748b;"><%= t.subdominio %>.mirestconia.com</div>

<!-- DESPUÉS -->
<div style="font-size:0.7rem;color:#64748b;">mirestconia.com/<%= t.subdominio %></div>
```

- [ ] **Step 4: login.ejs — Cambiar detección de tenant**

En `views/login.ejs`, línea 229, cambiar:
```html
<!-- ANTES -->
<% if (typeof isSubdomain !== 'undefined' && isSubdomain && tenant) { %>

<!-- DESPUÉS (mantener la misma condición — tenantGuard ya setea isSubdomain=true para backwards compat) -->
<% if (typeof isSubdomain !== 'undefined' && isSubdomain && tenant) { %>
```

Este archivo NO necesita cambios en la condición porque `tenantGuard.js` ya setea `res.locals.isSubdomain = true` como backwards compat. Solo verificar que funciona.

- [ ] **Step 5: homepage.ejs — Cambiar links a restaurantes**

En `views/public/homepage.ejs`, línea 950, cambiar:
```javascript
// ANTES
window.location.href = 'https://' + sub + '.mirestconia.com';

// DESPUÉS
window.location.href = '/' + sub;
```

- [ ] **Step 6: restaurantes.ejs — Cambiar links**

En `views/public/restaurantes.ejs`, línea 585, cambiar:
```javascript
// ANTES
const url = 'https://' + subdomain + '.mirestconia.com';

// DESPUÉS
const url = '/' + subdomain;
```

- [ ] **Step 7: Commit**

```bash
git add views/superadmin/tenants.ejs views/superadmin/dashboard.ejs views/login.ejs views/public/homepage.ejs views/public/restaurantes.ejs
git commit -m "refactor: update all EJS views to use path-based tenant URLs"
```

---

### Task 6: Actualizar servicios — emails y CRM

**Files:**
- Modify: `services/notificaciones-trial.js`
- Modify: `services/crm-sync.js`

- [ ] **Step 1: notificaciones-trial.js — Cambiar URL en email de bienvenida**

En `services/notificaciones-trial.js`, línea 167, cambiar:
```javascript
// ANTES
const subdominioUrl = `https://${subdominio}.mirestconia.com`;

// DESPUÉS
const subdominioUrl = `https://mirestconia.com/${subdominio}`;
```

En línea 182, cambiar:
```html
<!-- ANTES -->
<a href="${subdominioUrl}" ...>${subdominio}.mirestconia.com</a>

<!-- DESPUÉS -->
<a href="${subdominioUrl}" ...>mirestconia.com/${subdominio}</a>
```

- [ ] **Step 2: crm-sync.js — Cambiar URL del tenant**

En `services/crm-sync.js`, línea 110, cambiar:
```javascript
// ANTES
domainName: `${tenant.subdominio}.mirestconia.com`,

// DESPUÉS
domainName: `mirestconia.com/${tenant.subdominio}`,
```

- [ ] **Step 3: Commit**

```bash
git add services/notificaciones-trial.js services/crm-sync.js
git commit -m "refactor: update email and CRM URLs to path-based tenant format"
```

---

### Task 7: Actualizar rutas — public.js, chat.js, reportes.js

**Files:**
- Modify: `routes/public.js`
- Modify: `routes/chat.js`
- Modify: `routes/reportes.js`

- [ ] **Step 1: public.js — Quitar lógica de isSubdomain en redirect**

En `routes/public.js`, línea 78-79, cambiar:
```javascript
// ANTES
if (req.session?.user && !res.locals.isSubdomain) {

// DESPUÉS
if (req.session?.user && !res.locals.isTenantPath) {
```

- [ ] **Step 2: chat.js — Actualizar system prompt de DalIA**

En `routes/chat.js`, línea 49, cambiar:
```javascript
// ANTES
'Eres **DalIA**, la asistente inteligente del sistema **MiRest con IA** (restaurante.mirestconia.com).'

// DESPUÉS
'Eres **DalIA**, la asistente inteligente del sistema **MiRest con IA** (mirestconia.com).'
```

En línea 302, cambiar:
```javascript
// ANTES
'HTTP-Referer': 'https://restaurante.mirestconia.com',

// DESPUÉS
'HTTP-Referer': 'https://mirestconia.com',
```

- [ ] **Step 3: reportes.js — Actualizar URL en PDFs**

En `routes/reportes.js`, línea 88, cambiar:
```javascript
// ANTES
doc.fontSize(10).text('restaurante.mirestconia.com', { align: 'center' });

// DESPUÉS
doc.fontSize(10).text('mirestconia.com', { align: 'center' });
```

- [ ] **Step 4: Commit**

```bash
git add routes/public.js routes/chat.js routes/reportes.js
git commit -m "refactor: update route logic and references from subdomain to path-based URLs"
```

---

### Task 8: Actualizar vistas legales y landing

**Files:**
- Modify: `views/legal/privacidad.ejs`
- Modify: `views/legal/terminos.ejs`
- Modify: `views/landing.ejs`
- Modify: `views/libro-reclamaciones.ejs`

- [ ] **Step 1: Buscar y reemplazar en todas las vistas legales**

En TODOS estos archivos, reemplazar globalmente:

```
restaurante.mirestconia.com → mirestconia.com
```

Archivos y líneas afectadas:
- `views/legal/privacidad.ejs`: líneas 7, 122, 134, 167, 193, 447, 512
- `views/legal/terminos.ejs`: líneas 7, 81, 92, 125, 136, 137, 174, 434, 649
- `views/landing.ejs`: línea 13, 879
- `views/libro-reclamaciones.ejs`: líneas 13, 211, 242, 449

- [ ] **Step 2: Verificar que ningún archivo quedó con `restaurante.mirestconia.com`**

Run: `grep -r "restaurante\.mirestconia" views/ --include="*.ejs" -l`
Expected: Sin resultados

- [ ] **Step 3: Commit**

```bash
git add views/legal/ views/landing.ejs views/libro-reclamaciones.ejs
git commit -m "refactor: update all legal and landing page URLs to mirestconia.com"
```

---

### Task 9: Agregar helper `tenantUrl` para generar URLs en vistas

**Files:**
- Create: `lib/tenantUrl.js`
- Modify: `server.js` (agregar a res.locals)

- [ ] **Step 1: Crear helper**

```javascript
// lib/tenantUrl.js
'use strict';

/**
 * Genera URLs relativas para el tenant actual.
 * Si estamos en un path de tenant (/:slug), prefija con /slug.
 * Si no, devuelve la ruta tal cual.
 *
 * Uso en EJS: tenantUrl('/mesas') → '/chuleta/mesas' o '/mesas'
 */
function createTenantUrlHelper(basePath) {
  return function tenantUrl(path) {
    if (!basePath) return path;
    return basePath + (path.startsWith('/') ? path : '/' + path);
  };
}

module.exports = { createTenantUrlHelper };
```

- [ ] **Step 2: Registrar en server.js como variable global de EJS**

Agregar después de `attachTenant` y `tenantGuard`:

```javascript
const { createTenantUrlHelper } = require('./lib/tenantUrl');

app.use((req, res, next) => {
  res.locals.tenantUrl = createTenantUrlHelper(res.locals.basePath || null);
  next();
});
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node -c lib/tenantUrl.js`
Expected: `Syntax OK`

- [ ] **Step 4: Commit**

```bash
git add lib/tenantUrl.js server.js
git commit -m "feat: add tenantUrl helper for generating tenant-scoped URLs in views"
```

---

### Task 10: Eliminar subdomainGuard.js y limpiar imports

**Files:**
- Delete: `middleware/subdomainGuard.js`
- Modify: `server.js` (verificar que ya no importa subdomainGuard)

- [ ] **Step 1: Verificar que nadie más importa subdomainGuard**

Run: `grep -r "subdomainGuard" --include="*.js" --include="*.ejs" -l`
Expected: Solo `middleware/subdomainGuard.js` (el archivo mismo) y posiblemente docs

- [ ] **Step 2: Eliminar el archivo**

```bash
git rm middleware/subdomainGuard.js
```

- [ ] **Step 3: Commit**

```bash
git commit -m "cleanup: remove obsolete subdomainGuard.js, replaced by tenantGuard.js"
```

---

### Task 11: Configurar Vercel — quitar wildcard DNS

**Files:**
- No code changes — configuración en Vercel dashboard y DNS

- [ ] **Step 1: Documentar los cambios de DNS necesarios**

Después de verificar que todo funciona con path-based routing:

1. **Vercel Dashboard**: Quitar el dominio wildcard `*.mirestconia.com` del proyecto
2. **DNS Provider**: Eliminar el registro wildcard `*.mirestconia.com`
3. **Mantener**: Solo `mirestconia.com` y `www.mirestconia.com`

IMPORTANTE: NO hacer esto hasta que el redirect 301 de subdominios esté funcionando y todos los tenants hayan sido notificados del cambio de URL.

- [ ] **Step 2: Verificar que vercel.json no necesita cambios**

El `vercel.json` actual ya captura todo con `"src": "/(.*)"` → no necesita cambios.

- [ ] **Step 3: Commit de documentación (opcional)**

Este task es de infraestructura manual, no de código.

---

### Task 12: Testing manual end-to-end

- [ ] **Step 1: Verificar ruta pública**

Navegar a `mirestconia.com/home` → debe mostrar homepage sin tenant
Navegar a `mirestconia.com/restaurantes` → debe mostrar directorio

- [ ] **Step 2: Verificar ruta de tenant**

Navegar a `mirestconia.com/chuleta` → debe resolver tenant "chuleta"
Navegar a `mirestconia.com/chuleta/login` → debe mostrar login de tenant
Navegar a `mirestconia.com/chuleta/mesas` → (sin sesión) redirect a `/chuleta/login`

- [ ] **Step 3: Verificar redirect de subdominios legacy**

Navegar a `chuleta.mirestconia.com/mesas` → debe redirect 301 a `mirestconia.com/chuleta/mesas`

- [ ] **Step 4: Verificar superadmin**

Navegar a `mirestconia.com/superadmin/tenants` → crear nuevo tenant
Verificar que muestra `mirestconia.com/slug` en vez de `slug.mirestconia.com`

- [ ] **Step 5: Verificar DalIA**

Entrar a `mirestconia.com/chuleta/chat` → DalIA debe funcionar con el tenant correcto

- [ ] **Step 6: Verificar email de bienvenida**

Crear un tenant de prueba → el email debe contener `mirestconia.com/slug`

---

## Orden de Ejecución y Dependencias

```
Task 1 (tenant.js) ──┐
Task 2 (tenantGuard)──┼── Task 4 (server.js) ── Task 10 (cleanup)
Task 3 (slugRouter) ──┘         │
                                ├── Task 5 (vistas EJS)
Task 9 (tenantUrl helper) ─────┘
                                ├── Task 6 (servicios)
                                ├── Task 7 (rutas)
                                └── Task 8 (legales)
                                         │
                                    Task 11 (Vercel/DNS)
                                         │
                                    Task 12 (testing E2E)
```

Tasks 1, 2, 3, 9 son independientes → pueden ejecutarse en paralelo.
Task 4 depende de 1, 2, 3.
Tasks 5, 6, 7, 8 dependen de 4 y pueden ejecutarse en paralelo.
Task 10 depende de 4.
Task 11 depende de todo lo anterior.
Task 12 depende de todo.

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Links viejos de subdominios dejan de funcionar | Redirect 301 en Task 4 Step 5 mantiene compatibilidad |
| Slug de tenant colisiona con ruta reservada | Lista `RESERVED_PATHS` en Task 1 previene colisiones |
| Tenant existente tiene slug = 'login' o 'api' | Validar en superadmin al crear tenant contra `RESERVED_PATHS` |
| Vistas EJS hardcodean URLs con subdominio | Task 5 + Task 8 las actualizan todas |
| Google OAuth callback URL cambia | NO cambia — el OAuth se hace en `www.mirestconia.com`, no en subdominios |
| PWA manifest/service worker scope | Se mantiene el mismo — scope es `/` del dominio |
