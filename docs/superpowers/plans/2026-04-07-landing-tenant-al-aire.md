# Landing Publica del Tenant + "Salimos al Aire" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing publica por tenant en `/:slug` con menu digital, disponibilidad en tiempo real, pedido por WhatsApp pre-rellenado, y flujo "Salimos al Aire" para generacion de demanda diaria.

**Architecture:** EJS server-rendered (SEO), vanilla JS para interactividad (carrito + WhatsApp link), tabla `al_aire` para estado diario, APIs publicas sin auth para datos del tenant. Device Preview (puerto 3001) para testear mobile/desktop/tablet en paralelo.

**Tech Stack:** Express.js, EJS, PostgreSQL, vanilla JS, CSS custom properties, services/disponibilidad.js, services/whatsapp-api.js

**Spec:** `docs/superpowers/specs/2026-04-05-landing-tenant-demanda-design.md`
**Diseno Pencil:** `UI.DELSISTEMA.pen` nodos `cwK9Q` (mobile dark) y `LIt8l` (desktop light)

---

## File Structure

```
# Nuevos archivos
migrations/add_al_aire.js                    — Tabla al_aire + menu_suscriptores + landing_pedidos + ALTER usuarios
routes/al-aire.js                            — Rutas internas: salir/cerrar al aire, broadcast, menu-dia
routes/landing-tenant.js                     — Ruta publica /:slug → landing + APIs publicas
services/al-aire.js                          — Logica de negocio: salir al aire, cerrar, estado
services/broadcast-menu.js                   — Envio WhatsApp broadcast del menu del dia
views/landing-tenant.ejs                     — Vista EJS de la landing publica (standalone, sin layout)
public/css/landing-tenant.css                — Estilos responsivos (mobile dark + desktop light)
public/js/landing-tenant.js                  — Carrito localStorage + generador WhatsApp link

# Archivos modificados
server.js                                    — Registrar rutas landing-tenant ANTES del slugRewrite (~linea 610)
middleware/tenant.js                         — Agregar 'al-aire' a RESERVED_PATHS
preview/device-preview.html                  — Agregar route chip para /:slug en Device Preview
```

---

### Task 1: Migracion de base de datos

**Files:**
- Create: `migrations/add_al_aire.js`

- [ ] **Step 1: Crear archivo de migracion**

```javascript
// migrations/add_al_aire.js
const db = require('../db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS al_aire (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      fecha DATE NOT NULL DEFAULT CURRENT_DATE,
      estado VARCHAR(20) DEFAULT 'fuera' CHECK (estado IN ('fuera', 'preparando', 'en_vivo')),
      platos_aprobados JSON,
      menu_dia JSON,
      combos_activos JSON,
      al_aire_por INTEGER,
      al_aire_at TIMESTAMP,
      fuera_at TIMESTAMP,
      broadcast_enviado BOOLEAN DEFAULT FALSE,
      broadcast_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(tenant_id, fecha)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS menu_suscriptores (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      telefono VARCHAR(20) NOT NULL,
      nombre VARCHAR(100),
      activo BOOLEAN DEFAULT TRUE,
      suscrito_at TIMESTAMP DEFAULT NOW(),
      baja_at TIMESTAMP,
      fuente VARCHAR(20) DEFAULT 'landing' CHECK (fuente IN ('landing', 'whatsapp', 'manual')),
      UNIQUE(tenant_id, telefono)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS landing_pedidos (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      telefono VARCHAR(20),
      items JSON,
      tipo VARCHAR(20) DEFAULT 'recojo' CHECK (tipo IN ('delivery', 'recojo', 'mesa')),
      total DECIMAL(10,2),
      mensaje_whatsapp TEXT,
      estado VARCHAR(20) DEFAULT 'generado' CHECK (estado IN ('generado', 'enviado', 'confirmado', 'completado')),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Nuevos campos en usuarios para landing
  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS visible_en_landing BOOLEAN DEFAULT FALSE
  `);
  await db.query(`
    ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS bio_publica VARCHAR(200)
  `);

  // Nuevos campos en configuracion_impresion para landing
  await db.query(`
    ALTER TABLE configuracion_impresion
    ADD COLUMN IF NOT EXISTS tagline VARCHAR(200),
    ADD COLUMN IF NOT EXISTS cover_url TEXT,
    ADD COLUMN IF NOT EXISTS horario_apertura TIME,
    ADD COLUMN IF NOT EXISTS horario_cierre TIME,
    ADD COLUMN IF NOT EXISTS whatsapp_landing VARCHAR(20)
  `);

  console.log('[Migration] al_aire tables created');
}

module.exports = { up };
```

- [ ] **Step 2: Ejecutar migracion**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "require('./migrations/add_al_aire').up().then(() => process.exit())"`
Expected: `[Migration] al_aire tables created`

- [ ] **Step 3: Verificar tablas**

Run: `node -e "const db = require('./db'); db.query(\"SELECT table_name FROM information_schema.tables WHERE table_name IN ('al_aire','menu_suscriptores','landing_pedidos')\").then(r => { console.log(r.rows); process.exit(); })"`
Expected: 3 tablas listadas

- [ ] **Step 4: Commit**

```bash
git add migrations/add_al_aire.js
git commit -m "feat: add al_aire, menu_suscriptores, landing_pedidos tables"
```

---

### Task 2: Servicio al-aire.js

**Files:**
- Create: `services/al-aire.js`

- [ ] **Step 1: Crear servicio con funciones core**

```javascript
// services/al-aire.js
const db = require('../db');
const { rankingDisponibilidad, calcularDisponibilidadProducto } = require('./disponibilidad');

/**
 * Obtiene el estado al aire de hoy para un tenant
 */
async function getEstadoHoy(tenantId) {
  const { rows } = await db.query(
    `SELECT * FROM al_aire WHERE tenant_id = $1 AND fecha = CURRENT_DATE LIMIT 1`,
    [tenantId]
  );
  return rows[0] || null;
}

/**
 * Salir al aire: confirmar carta del dia y activar landing
 */
async function salirAlAire(tenantId, { platosAprobados, menuDia, combosActivos, userId }) {
  const { rows } = await db.query(`
    INSERT INTO al_aire (tenant_id, fecha, estado, platos_aprobados, menu_dia, combos_activos, al_aire_por, al_aire_at)
    VALUES ($1, CURRENT_DATE, 'en_vivo', $2, $3, $4, $5, NOW())
    ON CONFLICT (tenant_id, fecha) DO UPDATE SET
      estado = 'en_vivo',
      platos_aprobados = $2,
      menu_dia = $3,
      combos_activos = $4,
      al_aire_por = $5,
      al_aire_at = NOW()
    RETURNING *
  `, [tenantId, JSON.stringify(platosAprobados), JSON.stringify(menuDia), JSON.stringify(combosActivos), userId]);
  return rows[0];
}

/**
 * Fuera del aire: cerrar landing
 */
async function fueraDelAire(tenantId) {
  const { rows } = await db.query(`
    UPDATE al_aire SET estado = 'fuera', fuera_at = NOW()
    WHERE tenant_id = $1 AND fecha = CURRENT_DATE
    RETURNING *
  `, [tenantId]);
  return rows[0] || null;
}

/**
 * Datos completos para la landing publica (todo en una query eficiente)
 */
async function getDatosLanding(tenantId) {
  // Ejecutar queries en paralelo
  const [estadoRes, productosRes, equipoRes, configRes, tenantRes] = await Promise.all([
    // Estado al aire de hoy
    db.query(`SELECT * FROM al_aire WHERE tenant_id = $1 AND fecha = CURRENT_DATE LIMIT 1`, [tenantId]),
    // Productos activos con categoria
    db.query(`SELECT id, nombre, precio_unidad, descripcion, emoji, categoria, imagen FROM productos WHERE tenant_id = $1 AND activo = true ORDER BY categoria, nombre`, [tenantId]),
    // Equipo visible en landing
    db.query(`SELECT id, nombre, rol, google_avatar, bio_publica FROM usuarios WHERE tenant_id = $1 AND activo = true AND visible_en_landing = true ORDER BY rol`, [tenantId]),
    // Config del negocio
    db.query(`SELECT nombre_negocio, direccion, telefono, logo_src, tagline, cover_url, horario_apertura, horario_cierre, whatsapp_landing FROM configuracion_impresion WHERE tenant_id = $1 LIMIT 1`, [tenantId]),
    // Datos del tenant
    db.query(`SELECT nombre, subdominio, plan FROM tenants WHERE id = $1`, [tenantId])
  ]);

  const estado = estadoRes.rows[0] || null;
  const productos = productosRes.rows;
  const equipo = equipoRes.rows;
  const config = configRes.rows[0] || {};
  const tenant = tenantRes.rows[0] || {};

  // Calcular disponibilidad para cada producto (usa cache)
  const productosConDisp = await Promise.all(productos.map(async (p) => {
    try {
      const disp = await calcularDisponibilidadProducto(p.id);
      return { ...p, disponibilidad: disp.disponible };
    } catch {
      return { ...p, disponibilidad: -1 };
    }
  }));

  // Agrupar por categoria
  const categorias = {};
  for (const p of productosConDisp) {
    const cat = p.categoria || 'Otros';
    if (!categorias[cat]) categorias[cat] = [];
    categorias[cat].push(p);
  }

  return {
    estado: estado ? estado.estado : 'fuera',
    menuDia: estado ? estado.menu_dia : null,
    combosActivos: estado ? estado.combos_activos : null,
    productos: productosConDisp,
    categorias,
    equipo,
    config,
    tenant,
    enVivo: estado?.estado === 'en_vivo'
  };
}

/**
 * Marcar broadcast como enviado
 */
async function marcarBroadcastEnviado(tenantId) {
  await db.query(`
    UPDATE al_aire SET broadcast_enviado = true, broadcast_at = NOW()
    WHERE tenant_id = $1 AND fecha = CURRENT_DATE
  `, [tenantId]);
}

/**
 * Suscribir telefono al menu diario
 */
async function suscribirMenuDiario(tenantId, telefono, nombre, fuente = 'landing') {
  const { rows } = await db.query(`
    INSERT INTO menu_suscriptores (tenant_id, telefono, nombre, fuente)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (tenant_id, telefono) DO UPDATE SET activo = true, baja_at = NULL
    RETURNING *
  `, [tenantId, telefono, nombre, fuente]);
  return rows[0];
}

/**
 * Registrar pedido desde landing
 */
async function registrarPedidoLanding(tenantId, { telefono, items, tipo, total, mensajeWhatsapp }) {
  const { rows } = await db.query(`
    INSERT INTO landing_pedidos (tenant_id, telefono, items, tipo, total, mensaje_whatsapp)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [tenantId, telefono, JSON.stringify(items), tipo, total, mensajeWhatsapp]);
  return rows[0];
}

module.exports = {
  getEstadoHoy,
  salirAlAire,
  fueraDelAire,
  getDatosLanding,
  marcarBroadcastEnviado,
  suscribirMenuDiario,
  registrarPedidoLanding
};
```

- [ ] **Step 2: Commit**

```bash
git add services/al-aire.js
git commit -m "feat: add al-aire service with landing data functions"
```

---

### Task 3: Rutas internas al-aire (admin)

**Files:**
- Create: `routes/al-aire.js`
- Modify: `server.js:~1057` — registrar ruta

- [ ] **Step 1: Crear router al-aire**

```javascript
// routes/al-aire.js
const express = require('express');
const router = express.Router();
const alAire = require('../services/al-aire');

// GET /api/al-aire/estado — Estado actual del dia
router.get('/estado', async (req, res) => {
  try {
    const estado = await alAire.getEstadoHoy(req.tenantId);
    res.json({ ok: true, estado: estado || { estado: 'fuera' } });
  } catch (err) {
    console.error('[al-aire] Error obteniendo estado:', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener estado' });
  }
});

// POST /api/al-aire/salir — Salir al aire
router.post('/salir', async (req, res) => {
  try {
    const { platos_aprobados, menu_dia, combos_activos } = req.body;
    const resultado = await alAire.salirAlAire(req.tenantId, {
      platosAprobados: platos_aprobados || [],
      menuDia: menu_dia || null,
      combosActivos: combos_activos || null,
      userId: req.user?.id
    });
    res.json({ ok: true, estado: resultado });
  } catch (err) {
    console.error('[al-aire] Error saliendo al aire:', err.message);
    res.status(500).json({ ok: false, error: 'Error al salir al aire' });
  }
});

// POST /api/al-aire/cerrar — Fuera del aire
router.post('/cerrar', async (req, res) => {
  try {
    const resultado = await alAire.fueraDelAire(req.tenantId);
    res.json({ ok: true, estado: resultado });
  } catch (err) {
    console.error('[al-aire] Error cerrando:', err.message);
    res.status(500).json({ ok: false, error: 'Error al cerrar' });
  }
});

// PUT /api/al-aire/menu-dia — Editar menu del dia
router.put('/menu-dia', async (req, res) => {
  try {
    const { menu_dia, combos_activos } = req.body;
    const { rows } = await require('../db').query(`
      UPDATE al_aire SET menu_dia = $1, combos_activos = $2
      WHERE tenant_id = $3 AND fecha = CURRENT_DATE
      RETURNING *
    `, [JSON.stringify(menu_dia), JSON.stringify(combos_activos), req.tenantId]);
    res.json({ ok: true, estado: rows[0] });
  } catch (err) {
    console.error('[al-aire] Error editando menu:', err.message);
    res.status(500).json({ ok: false, error: 'Error al editar menu' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Registrar en server.js**

Agregar despues de la linea donde se registra `/api/cocina` (~linea 1057 de server.js):

```javascript
// Al Aire (salir/cerrar al aire para la landing publica)
const alAireRoutes = require('./routes/al-aire');
app.use('/api/al-aire', requireAuth, requireRole(['administrador']), alAireRoutes);
```

- [ ] **Step 3: Agregar 'al-aire' a RESERVED_PATHS en middleware/tenant.js**

Agregar `'al-aire'` al Set de `RESERVED_PATHS` en `middleware/tenant.js` (~linea 9-28).

- [ ] **Step 4: Commit**

```bash
git add routes/al-aire.js server.js middleware/tenant.js
git commit -m "feat: add /api/al-aire routes for salir/cerrar al aire"
```

---

### Task 4: Ruta publica de la landing + APIs

**Files:**
- Create: `routes/landing-tenant.js`
- Modify: `server.js:~610` — registrar ANTES del slugRewrite

- [ ] **Step 1: Crear router landing-tenant**

```javascript
// routes/landing-tenant.js
const express = require('express');
const router = express.Router();
const alAire = require('../services/al-aire');
const { extractSlugFromPath, RESERVED_PATHS } = require('../middleware/tenant');
const db = require('../db');

// GET /:slug — Landing publica del tenant
router.get('/:slug', async (req, res, next) => {
  const slug = req.params.slug;

  // No interceptar rutas reservadas
  if (RESERVED_PATHS.has(slug)) return next();

  // Resolver tenant
  const { rows } = await db.query(
    `SELECT id, nombre, subdominio, plan, activo FROM tenants WHERE subdominio = $1 AND activo = true LIMIT 1`,
    [slug]
  );
  if (!rows[0]) return next(); // No es un tenant valido, sigue al 404

  const tenant = rows[0];

  // Si esta logueado Y es de este tenant → dashboard
  if (req.user && req.user.tenant_id === tenant.id) {
    return res.redirect(`/${slug}/dashboard`);
  }

  // Obtener datos para la landing
  try {
    const datos = await alAire.getDatosLanding(tenant.id);
    res.render('landing-tenant', {
      layout: false,
      ...datos,
      slug,
      tenantNombre: tenant.nombre
    });
  } catch (err) {
    console.error('[landing-tenant] Error:', err.message);
    return next(err);
  }
});

// GET /api/public/:slug/menu — JSON menu + carta + disponibilidad
router.get('/api/public/:slug/menu', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id FROM tenants WHERE subdominio = $1 AND activo = true LIMIT 1`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Tenant no encontrado' });

    const datos = await alAire.getDatosLanding(rows[0].id);
    res.json({
      ok: true,
      estado: datos.estado,
      enVivo: datos.enVivo,
      menuDia: datos.menuDia,
      combosActivos: datos.combosActivos,
      categorias: datos.categorias
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error al obtener menu' });
  }
});

// POST /api/public/:slug/suscribir — Suscribirse al menu diario
router.post('/api/public/:slug/suscribir', async (req, res) => {
  try {
    const { telefono, nombre } = req.body;
    if (!telefono) return res.status(400).json({ ok: false, error: 'Telefono requerido' });

    const { rows } = await db.query(
      `SELECT id FROM tenants WHERE subdominio = $1 AND activo = true LIMIT 1`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Tenant no encontrado' });

    const suscriptor = await alAire.suscribirMenuDiario(rows[0].id, telefono, nombre);
    res.json({ ok: true, suscriptor });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error al suscribir' });
  }
});

// POST /api/public/:slug/pedido — Registrar pedido desde landing
router.post('/api/public/:slug/pedido', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id FROM tenants WHERE subdominio = $1 AND activo = true LIMIT 1`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Tenant no encontrado' });

    const pedido = await alAire.registrarPedidoLanding(rows[0].id, req.body);
    res.json({ ok: true, pedido });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error al registrar pedido' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Registrar en server.js ANTES del slugRewrite**

En server.js, DESPUES de `app.use(publicRoutes)` (~linea 610) y ANTES del slugRewrite (~linea 1216), agregar:

```javascript
// Landing publica del tenant — DEBE ir antes del slugRewrite
const landingTenantRoutes = require('./routes/landing-tenant');
app.use(landingTenantRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add routes/landing-tenant.js server.js
git commit -m "feat: add public landing route /:slug with APIs"
```

---

### Task 5: Vista EJS de la landing

**Files:**
- Create: `views/landing-tenant.ejs`

- [ ] **Step 1: Crear vista EJS standalone**

Crear `views/landing-tenant.ejs` — HTML completo standalone (sin layout EJS). El archivo es largo, se construye seccion por seccion replicando el diseno de Pencil.

Secciones:
1. `<head>` con meta tags dinamicos, Open Graph, Schema.org Restaurant
2. Top nav (desktop) / sin nav (mobile, usa bottom bar)
3. Cover/hero con nombre, status badge EN VIVO/FUERA, horario, CTAs
4. Menu del dia (condicional: solo si `enVivo && menuDia`)
5. Carta con filtros por categoria, cards de platos con disponibilidad
6. Combos y ofertas (condicional: solo si `combosActivos`)
7. Juegos y premios (link al catalogo)
8. Equipo (loop `equipo`)
9. Footer con CTA suscripcion WhatsApp
10. Bottom nav (mobile)
11. Script inline para carrito + WhatsApp link builder

**Referencia de diseno:** Ejecutar `mcp__pencil__get_screenshot` del nodo `cwK9Q` (mobile) y `LIt8l` (desktop) para replicar exactamente colores, tipografia, espaciado.

**Variables disponibles del controlador:**
- `estado` ('en_vivo'|'fuera'|'preparando'), `enVivo` (boolean)
- `menuDia` (JSON: {entrada, segundo, postre, precio})
- `combosActivos` (JSON array)
- `productos` (array con disponibilidad), `categorias` (object agrupado)
- `equipo` (array de usuarios)
- `config` ({nombre_negocio, direccion, telefono, logo_src, tagline, cover_url, horario_apertura, horario_cierre, whatsapp_landing})
- `tenant` ({nombre, subdominio, plan}), `slug`, `tenantNombre`

El archivo EJS debe incluir:
- `<link rel="stylesheet" href="/css/landing-tenant.css">`
- `<script src="/js/landing-tenant.js" defer></script>`
- Media query para dark (mobile) vs light (desktop) via CSS
- Todos los datos del servidor embebidos como `<script>window.__LANDING__ = <%- JSON.stringify({...}) %></script>`

- [ ] **Step 2: Test con Device Preview**

Run: Iniciar servidor (`npm start` o `node server.js`) y abrir Device Preview (puerto 3001). Navegar a `http://localhost:1995/{slug-de-un-tenant-existente}`. Verificar que renderiza la landing en los 3 viewports.

- [ ] **Step 3: Commit**

```bash
git add views/landing-tenant.ejs
git commit -m "feat: add landing-tenant.ejs with all sections"
```

---

### Task 6: CSS responsivo (mobile dark + desktop light)

**Files:**
- Create: `public/css/landing-tenant.css`

- [ ] **Step 1: Crear CSS con custom properties y media queries**

Usar los design tokens del diseno Pencil:
- Mobile (< 768px): dark navy `#0a0f24`, accent `#ef520f`, font DM Sans
- Desktop (>= 768px): cream `#FAF9F7`, accent `#C2410C`, font Manrope + Inter

Estructura del CSS:
```css
/* Custom properties */
:root { /* desktop light defaults */ }
@media (max-width: 767px) { :root { /* mobile dark overrides */ } }

/* Base layout */
.lt-page { ... }
.lt-cover { ... }
.lt-hero { ... }

/* Menu del dia */
.lt-menu-dia { ... }
.lt-menu-item { ... }

/* Carta */
.lt-carta-grid { ... }
.lt-dish-card { ... }
.lt-dish-agotado { ... }
.lt-disponibilidad { ... }

/* Combos */
.lt-combo-card { ... }

/* Juegos */
.lt-juegos { ... }
.lt-game-card { ... }
.lt-rewards { ... }

/* Equipo */
.lt-equipo-grid { ... }
.lt-member-card { ... }

/* Footer */
.lt-footer { ... }
.lt-footer-cta { ... }

/* Bottom nav (mobile only) */
.lt-bottom-nav { ... }

/* Badge EN VIVO con animacion pulso */
.lt-badge-envivo { ... }
@keyframes pulse { ... }

/* Boton WhatsApp flotante */
.lt-wa-fab { ... }
```

- [ ] **Step 2: Verificar en Device Preview**

Abrir Device Preview en puerto 3001. Verificar:
- Mobile (402px): fondo oscuro, naranja accent, bottom nav visible
- Desktop (1440px): fondo cream, burnt orange accent, top nav visible
- Tablet: transicion suave entre ambos

- [ ] **Step 3: Commit**

```bash
git add public/css/landing-tenant.css
git commit -m "feat: add responsive CSS for landing (dark mobile + light desktop)"
```

---

### Task 7: JavaScript interactivo (carrito + WhatsApp)

**Files:**
- Create: `public/js/landing-tenant.js`

- [ ] **Step 1: Crear JS con modulo de carrito y WhatsApp link builder**

```javascript
// public/js/landing-tenant.js
(function() {
  'use strict';

  const LANDING = window.__LANDING__ || {};
  const CART_KEY = `mirestcon_cart_${LANDING.slug}`;

  // --- Carrito en localStorage ---
  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartUI();
  }

  function addToCart(producto) {
    const cart = getCart();
    const existing = cart.find(i => i.id === producto.id);
    if (existing) {
      existing.cantidad++;
    } else {
      cart.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: 1 });
    }
    saveCart(cart);
  }

  function removeFromCart(productoId) {
    const cart = getCart().filter(i => i.id !== productoId);
    saveCart(cart);
  }

  function getCartTotal() {
    return getCart().reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
  }

  function updateCartUI() {
    const cart = getCart();
    const count = cart.reduce((sum, i) => sum + i.cantidad, 0);
    const badge = document.getElementById('lt-cart-count');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
    // Actualizar FAB de WhatsApp
    const fab = document.getElementById('lt-wa-fab');
    if (fab) fab.style.display = count > 0 ? 'flex' : 'none';
  }

  // --- WhatsApp Link Builder ---
  function buildWhatsAppMessage() {
    const cart = getCart();
    if (!cart.length) return '';

    const restaurante = LANDING.config?.nombre_negocio || LANDING.tenantNombre;
    let msg = `Hola! Quisiera pedir de ${restaurante}:\n\n`;

    for (const item of cart) {
      msg += `- ${item.cantidad}x ${item.nombre} — S/ ${(item.precio * item.cantidad).toFixed(2)}\n`;
    }

    msg += `\nTipo: Recojo en local`;
    msg += `\nTotal estimado: S/ ${getCartTotal().toFixed(2)}`;
    msg += `\n\nEnviado desde mirestconia.com/${LANDING.slug}`;

    return msg;
  }

  function openWhatsApp() {
    const phone = LANDING.config?.whatsapp_landing || LANDING.config?.telefono || '';
    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.length === 9 ? `51${cleanPhone}` : cleanPhone;
    const msg = buildWhatsAppMessage();
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;

    // Registrar pedido (beacon)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`/api/public/${LANDING.slug}/pedido`, JSON.stringify({
        items: getCart(),
        tipo: 'recojo',
        total: getCartTotal(),
        mensaje_whatsapp: msg
      }));
    }

    window.open(url, '_blank');
  }

  // --- Filtros de categoria ---
  function filterCategory(cat) {
    document.querySelectorAll('.lt-dish-card').forEach(card => {
      card.style.display = (cat === 'todos' || card.dataset.cat === cat) ? '' : 'none';
    });
    document.querySelectorAll('.lt-filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.cat === cat);
    });
  }

  // --- Scroll spy para bottom nav ---
  function initScrollSpy() {
    const sections = document.querySelectorAll('[data-section]');
    const navItems = document.querySelectorAll('.lt-nav-item');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navItems.forEach(n => n.classList.remove('active'));
          const target = document.querySelector(`.lt-nav-item[data-target="${entry.target.dataset.section}"]`);
          if (target) target.classList.add('active');
        }
      });
    }, { threshold: 0.3 });
    sections.forEach(s => observer.observe(s));
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', () => {
    updateCartUI();
    initScrollSpy();

    // Delegacion de eventos
    document.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-add-to-cart]');
      if (addBtn) {
        const { id, nombre, precio } = addBtn.dataset;
        addToCart({ id: parseInt(id), nombre, precio: parseFloat(precio) });
        return;
      }

      const waBtn = e.target.closest('[data-open-whatsapp]');
      if (waBtn) { openWhatsApp(); return; }

      const filterBtn = e.target.closest('.lt-filter-chip');
      if (filterBtn) { filterCategory(filterBtn.dataset.cat); return; }

      const navItem = e.target.closest('.lt-nav-item');
      if (navItem) {
        const target = document.getElementById(navItem.dataset.target);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    });
  });

  // Exponer para uso externo
  window.LandingCart = { addToCart, removeFromCart, getCart, openWhatsApp, buildWhatsAppMessage };
})();
```

- [ ] **Step 2: Test en Device Preview**

Abrir landing de un tenant. Verificar:
- Click en "+" agrega plato al carrito
- Badge de conteo se actualiza
- FAB de WhatsApp aparece cuando hay items
- Click en FAB abre WhatsApp con mensaje pre-rellenado correcto
- Filtros de categoria funcionan
- Scroll spy actualiza bottom nav en mobile

- [ ] **Step 3: Commit**

```bash
git add public/js/landing-tenant.js
git commit -m "feat: add landing JS with cart, WhatsApp builder, filters"
```

---

### Task 8: Device Preview — agregar route chip y testeo integral

**Files:**
- Modify: `preview/device-preview.html:~818-827` — agregar chip de landing

- [ ] **Step 1: Agregar route chip en Device Preview**

En `preview/device-preview.html`, en la seccion de route chips (~linea 818-827), agregar un chip para la landing de un tenant de prueba:

Buscar el bloque de chips existente y agregar:

```html
<span class="route-chip" data-route="/corkys">Landing Tenant</span>
```

(Reemplazar `corkys` con el slug de un tenant de prueba existente en la BD)

- [ ] **Step 2: Test integral con Device Preview**

1. Iniciar app: `node server.js` (puerto 1995)
2. Iniciar preview: `node preview/server.js` (puerto 3001)
3. Abrir `http://localhost:3001` en el navegador
4. Click en chip "Landing Tenant"
5. Verificar en los 3 viewports (desktop 1280px, tablet, mobile 402px):
   - Cover con foto/logo placeholder
   - Badge EN VIVO o FUERA DEL AIRE segun estado
   - Menu del dia (si hay estado en_vivo)
   - Carta con platos, precios, disponibilidad
   - Juegos, equipo, footer
   - Bottom nav en mobile
   - Carrito funcional → WhatsApp link

- [ ] **Step 3: Commit**

```bash
git add preview/device-preview.html
git commit -m "feat: add landing tenant route chip to Device Preview"
```

---

### Task 9: Broadcast WhatsApp del menu diario

**Files:**
- Create: `services/broadcast-menu.js`

- [ ] **Step 1: Crear servicio de broadcast**

```javascript
// services/broadcast-menu.js
const db = require('../db');
const { sendTemplate, sendText } = require('./whatsapp-api');
const alAire = require('./al-aire');

/**
 * Envia el menu del dia a todos los suscriptores activos del tenant
 */
async function enviarBroadcastMenu(tenantId) {
  // Obtener estado al aire de hoy
  const estado = await alAire.getEstadoHoy(tenantId);
  if (!estado || estado.estado !== 'en_vivo' || !estado.menu_dia) {
    return { enviados: 0, error: 'No hay menu al aire para enviar' };
  }

  if (estado.broadcast_enviado) {
    return { enviados: 0, error: 'Broadcast ya enviado hoy' };
  }

  // Obtener suscriptores activos
  const { rows: suscriptores } = await db.query(
    `SELECT telefono, nombre FROM menu_suscriptores WHERE tenant_id = $1 AND activo = true`,
    [tenantId]
  );

  if (!suscriptores.length) {
    return { enviados: 0, error: 'No hay suscriptores activos' };
  }

  // Obtener config del tenant
  const { rows: configRows } = await db.query(
    `SELECT nombre_negocio, whatsapp_landing FROM configuracion_impresion WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  const config = configRows[0] || {};
  const { rows: tenantRows } = await db.query(`SELECT subdominio FROM tenants WHERE id = $1`, [tenantId]);
  const slug = tenantRows[0]?.subdominio;

  // Construir mensaje
  const menu = estado.menu_dia;
  let mensaje = `🔴 *EN VIVO* — ${config.nombre_negocio || 'Tu restaurante'}\n\n`;
  mensaje += `📋 *Menu del Dia*\n`;
  if (menu.entrada) mensaje += `🥣 Entrada: ${menu.entrada.nombre}\n`;
  if (menu.segundo) mensaje += `🍛 Segundo: ${menu.segundo.nombre}\n`;
  if (menu.postre) mensaje += `🍮 Postre: ${menu.postre.nombre}\n`;
  if (menu.precio) mensaje += `\n💰 *S/ ${menu.precio}*\n`;
  mensaje += `\n👉 Ver carta completa: mirestconia.com/${slug}`;

  // Enviar a cada suscriptor
  let enviados = 0;
  const errores = [];
  for (const sub of suscriptores) {
    try {
      await sendText(sub.telefono, mensaje);
      enviados++;
    } catch (err) {
      errores.push({ telefono: sub.telefono, error: err.message });
    }
  }

  // Marcar broadcast como enviado
  await alAire.marcarBroadcastEnviado(tenantId);

  return { enviados, total: suscriptores.length, errores };
}

module.exports = { enviarBroadcastMenu };
```

- [ ] **Step 2: Agregar endpoint de broadcast en routes/al-aire.js**

Agregar al final de `routes/al-aire.js`:

```javascript
const { enviarBroadcastMenu } = require('../services/broadcast-menu');

// POST /api/al-aire/broadcast — Enviar menu del dia por WhatsApp
router.post('/broadcast', async (req, res) => {
  try {
    const resultado = await enviarBroadcastMenu(req.tenantId);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[al-aire] Error en broadcast:', err.message);
    res.status(500).json({ ok: false, error: 'Error al enviar broadcast' });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add services/broadcast-menu.js routes/al-aire.js
git commit -m "feat: add WhatsApp broadcast service for daily menu"
```

---

## Orden de ejecucion

```
Task 1 (DB)  →  Task 2 (Service)  →  Task 3 (Rutas admin)
                                          ↓
Task 4 (Ruta publica)  →  Task 5 (EJS)  →  Task 6 (CSS)  →  Task 7 (JS)
                                                                    ↓
                                                            Task 8 (Device Preview + test)
                                                                    ↓
                                                            Task 9 (Broadcast WhatsApp)
```

Tasks 1-3 son backend puro (pueden ir rapido).
Tasks 4-7 son la landing visual (testear con Device Preview en cada paso).
Task 8 es integracion y verificacion.
Task 9 es el broadcast (requiere WhatsApp API configurado).
