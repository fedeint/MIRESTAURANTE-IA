# Homepage + Páginas Públicas — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear homepage marketing + 5 páginas públicas (paquetes, demo, restaurantes, beneficios, marketplace) con header/footer compartido, API pública de restaurantes, y formulario de demo.

**Architecture:** Nuevas vistas EJS en `views/public/`, partials compartidos para header/footer, nueva ruta `routes/public.js` montada sin auth, API pública para restaurantes y demos, Leaflet.js para mapa. Estilo dark mode por defecto siguiendo V3.

**Tech Stack:** Express.js, EJS, PostgreSQL, Leaflet.js (CDN), Bootstrap Icons, DM Sans font

**Spec:** `docs/superpowers/specs/2026-04-02-homepage-paginas-publicas-design.md`

---

## Archivos involucrados

| Archivo | Acción |
|---|---|
| `views/partials/public-header.ejs` | Crear: nav header compartido |
| `views/partials/public-footer.ejs` | Crear: footer compartido |
| `views/public/homepage.ejs` | Crear: homepage marketing V3-style |
| `views/public/paquetes.ejs` | Crear: planes software + hardware |
| `views/public/demo.ejs` | Crear: formulario agendar demo |
| `views/public/restaurantes.ejs` | Crear: directorio + mapa Perú |
| `views/public/beneficios.ejs` | Crear: 3 tabs (comensales, profesionales, devs) |
| `views/public/marketplace.ejs` | Crear: app store para restaurantes |
| `routes/public.js` | Crear: todas las rutas públicas + API |
| `migrations/add_demo_solicitudes.sql` | Crear: tabla demo_solicitudes |
| `server.js` | Modificar: montar routes/public.js, cambiar / redirect |

## Orden de ejecución

| # | Task | Dependencia |
|---|---|---|
| 1 | Migración DB + API pública | Ninguna |
| 2 | Header + Footer partials | Ninguna |
| 3 | Homepage | Task 2 |
| 4 | Paquetes | Task 2 |
| 5 | Demo | Tasks 1, 2 |
| 6 | Restaurantes (+ mapa) | Tasks 1, 2 |
| 7 | Beneficios | Task 2 |
| 8 | Marketplace | Task 2 |
| 9 | Rutas + montar en server.js | Tasks 1-8 |
| 10 | Verificación Playwright | Task 9 |

**Parallelizables:** Tasks 1 y 2. Luego tasks 3-8 (todas dependen de 2 pero son independientes entre sí).

---

## Task 1: Migración DB + API pública de restaurantes/demos

**Files:**
- Create: `migrations/add_demo_solicitudes.sql`
- Create: `routes/public.js` (solo la parte de API por ahora)

- [ ] **Step 1: Crear migración**

Crear `migrations/add_demo_solicitudes.sql`:

```sql
-- migrations/add_demo_solicitudes.sql
-- Stores demo appointment requests from /demo page

CREATE TABLE IF NOT EXISTS demo_solicitudes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  restaurante VARCHAR(200),
  whatsapp VARCHAR(20),
  paquete VARCHAR(50),
  fecha_preferida DATE,
  estado VARCHAR(20) DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT NOW()
);
```

- [ ] **Step 2: Ejecutar migración**

```bash
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes"
node -e "
const db = require('./db');
const fs = require('fs');
(async () => {
  const sql = fs.readFileSync('migrations/add_demo_solicitudes.sql', 'utf8');
  for (const stmt of sql.split(';').filter(s => s.trim())) await db.query(stmt);
  console.log('Migration done');
  process.exit(0);
})();
"
```

- [ ] **Step 3: Crear routes/public.js con API**

Crear `routes/public.js`:

```javascript
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// ---------------------------------------------------------------------------
// API: GET /api/restaurantes — Public restaurant search
// ---------------------------------------------------------------------------
router.get('/api/restaurantes', async (req, res) => {
  try {
    const { buscar, tipo, ciudad } = req.query;
    let where = "WHERE t.activo = true AND t.estado_trial != 'pendiente'";
    const params = [];

    if (buscar) {
      params.push(`%${buscar}%`);
      where += ` AND (t.nombre ILIKE ? OR t.subdominio ILIKE ?)`;
      params.push(`%${buscar}%`);
    }
    if (tipo && tipo !== 'todos') {
      params.push(tipo);
      where += ` AND t.tipo_negocio = ?`;
    }
    if (ciudad) {
      params.push(`%${ciudad}%`);
      where += ` AND (t.distrito ILIKE ? OR t.departamento ILIKE ?)`;
      params.push(`%${ciudad}%`);
    }

    const [restaurantes] = await db.query(
      `SELECT t.nombre, t.subdominio, t.tipo_negocio, t.distrito, t.departamento,
              t.latitud, t.longitud, t.foto_local_url, t.plan
       FROM tenants t ${where}
       ORDER BY t.created_at DESC
       LIMIT 50`,
      params
    );

    res.json(restaurantes || []);
  } catch (err) {
    console.error('Public restaurantes error:', err.message);
    res.status(500).json({ error: 'Error al buscar restaurantes' });
  }
});

// ---------------------------------------------------------------------------
// API: POST /api/demos — Save demo appointment request
// ---------------------------------------------------------------------------
router.post('/api/demos', async (req, res) => {
  try {
    const { nombre, restaurante, whatsapp, paquete, fecha_preferida } = req.body;

    if (!nombre || !whatsapp) {
      return res.status(400).json({ error: 'Nombre y WhatsApp son requeridos' });
    }

    await db.query(
      `INSERT INTO demo_solicitudes (nombre, restaurante, whatsapp, paquete, fecha_preferida)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre, restaurante || null, whatsapp, paquete || null, fecha_preferida || null]
    );

    // Notify sales email
    try {
      const { sendEmail } = require('../services/notificaciones-trial');
      // Fire and forget — don't block the response
    } catch (_) {}

    res.json({ ok: true, message: 'Demo agendada exitosamente. Te contactaremos por WhatsApp.' });
  } catch (err) {
    console.error('Demo solicitud error:', err.message);
    res.status(500).json({ error: 'Error al agendar demo' });
  }
});

// ---------------------------------------------------------------------------
// Page routes (public, no auth required)
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  // If user is logged in and not on subdomain, redirect to dashboard
  if (req.session?.user && !res.locals.isSubdomain) {
    const rol = req.session.user.rol;
    if (rol === 'superadmin') return res.redirect('/superadmin');
    return res.redirect('/dashboard');
  }
  res.render('public/homepage');
});

router.get('/paquetes', (req, res) => res.render('public/paquetes'));
router.get('/demo', (req, res) => res.render('public/demo'));
router.get('/restaurantes', (req, res) => res.render('public/restaurantes'));
router.get('/beneficios', (req, res) => res.render('public/beneficios'));
router.get('/marketplace', (req, res) => res.render('public/marketplace'));

module.exports = router;
```

- [ ] **Step 4: Commit**

```bash
git add migrations/add_demo_solicitudes.sql routes/public.js
git commit -m "feat(public): add demo_solicitudes migration and public API routes"
```

---

## Task 2: Header + Footer partials

**Files:**
- Create: `views/partials/public-header.ejs`
- Create: `views/partials/public-footer.ejs`

- [ ] **Step 1: Crear public-header.ejs**

Crear `views/partials/public-header.ejs`. Dark sticky header con nav + hamburger mobile.

The header should include:
- Logo (robot isotipo + "MiRestconIA")
- Nav links: Paquetes, Demo, Restaurantes, Beneficios, Marketplace
- CTA button: "Probar gratis" → /auth/google
- Mobile hamburger menu
- Full responsive CSS included inline

- [ ] **Step 2: Crear public-footer.ejs**

Crear `views/partials/public-footer.ejs`. Dark footer with columns.

Columns: Producto (Paquetes, Demo, Restaurantes, Beneficios, Marketplace), Legal (Términos, Privacidad, Libro reclamaciones), Contacto (WhatsApp, ventas@mirestconia.com)

Bottom: © 2026 Dignita Tech — Lima, Perú · Powered by DallIA

- [ ] **Step 3: Commit**

```bash
git add views/partials/public-header.ejs views/partials/public-footer.ejs
git commit -m "feat(public): add shared header and footer partials for public pages"
```

---

## Task 3: Homepage

**Files:**
- Create: `views/public/homepage.ejs`

- [ ] **Step 1: Create homepage**

Create `views/public/homepage.ejs` — full page with all sections from the V3 reference style:

1. Hero section (dark, bold typography, "Probar gratis con Google" CTA)
2. "El viejo modelo" section (Excel, WhatsApp, Cuadernos)
3. Features/benefits section
4. "Buscar mi restaurante" section with autocomplete search
5. Plans summary (3 cards linking to /paquetes)
6. Final CTA section

Include the public-header and public-footer partials.
The search autocomplete calls `GET /api/restaurantes?buscar=X` and redirects to `subdominio.mirestconia.com`.

- [ ] **Step 2: Commit**

```bash
git add views/public/homepage.ejs
git commit -m "feat(public): add homepage with hero, features, search, and plans"
```

---

## Task 4: Paquetes page

**Files:**
- Create: `views/public/paquetes.ejs`

- [ ] **Step 1: Create paquetes page**

Create `views/public/paquetes.ejs` with:

Section 1 — Software plans (3 cards): Free Trial (Gratis/15 días/3 usuarios), Anual POPULAR (S/3,200/año = S/2,500 sistema + S/700 almacenamiento/5 usuarios), De por vida (S/4,500 + S/700/año/ilimitados)

Section 2 — Hardware packages (3 cards): Solo Software S/500, Básico S/1,500 (All-in-one + Impresora), Completo S/3,000 (Tablet + Impresora + Cámara)

Section 3 — FAQ accordion (4 items)

Include public-header and public-footer partials.

- [ ] **Step 2: Commit**

```bash
git add views/public/paquetes.ejs
git commit -m "feat(public): add paquetes page with software plans and hardware packages"
```

---

## Task 5: Demo page

**Files:**
- Create: `views/public/demo.ejs`

- [ ] **Step 1: Create demo page**

Create `views/public/demo.ejs` — centered card with form:

Fields: Nombre, Restaurante, WhatsApp, Paquete (select: Solo Software S/500, Básico S/1,500, Completo S/3,000), Fecha preferida (date input)

Submit → `POST /api/demos` → shows success message.

Robot chef icon at top. Contact: ventas@mirestconia.com

Include public-header and public-footer partials.

- [ ] **Step 2: Commit**

```bash
git add views/public/demo.ejs
git commit -m "feat(public): add demo appointment page with form"
```

---

## Task 6: Restaurantes page (+ mapa Perú)

**Files:**
- Create: `views/public/restaurantes.ejs`

- [ ] **Step 1: Create restaurantes page**

Create `views/public/restaurantes.ejs` with:

1. Header: "RESTAURANTES CON IA" + search input + filter pills (Todos, Criollo, Nikkei, Pizzería, Café, Menú)
2. Leaflet.js map of Peru with markers at Lima (-12.046, -77.043), Cusco (-13.532, -71.967), Arequipa (-16.409, -71.537), Trujillo (-8.112, -79.029)
3. Restaurant grid (cards loaded from `/api/restaurantes`)
4. Benefits section (6 cards)

Leaflet loaded via CDN. Map tiles from OpenStreetMap.
Cards show: nombre, tipo_negocio, distrito, "Entrar →" button linking to `subdominio.mirestconia.com`.
Click on map marker filters by city.

Include public-header and public-footer partials.

- [ ] **Step 2: Commit**

```bash
git add views/public/restaurantes.ejs
git commit -m "feat(public): add restaurantes page with Peru map and restaurant directory"
```

---

## Task 7: Beneficios page

**Files:**
- Create: `views/public/beneficios.ejs`

- [ ] **Step 1: Create beneficios page**

Create `views/public/beneficios.ejs` with 3 tabs:

Tab 1 — Comensales: Juegos/promos, Pedido QR, Lealtad, Cuenta real-time
Tab 2 — Profesionales: LinkedIn-style cards for Mozos (velocidad, mesas, ticket, rating, logros), Chefs (platos, tiempo, recetas, especialidades, logros), Admins (restaurants, revenue, equipo, crecimiento). Badges bronce/plata/oro/diamante. Datos de ejemplo/maqueta.
Tab 3 — Developers: Marketplace teaser, MiroFish/Squads mention, API/Webhooks, CTA to /marketplace

Tabs use Bootstrap nav-tabs, content switches with JS.

Include public-header and public-footer partials.

- [ ] **Step 2: Commit**

```bash
git add views/public/beneficios.ejs
git commit -m "feat(public): add beneficios page with 3 audience tabs"
```

---

## Task 8: Marketplace page

**Files:**
- Create: `views/public/marketplace.ejs`

- [ ] **Step 1: Create marketplace page**

Create `views/public/marketplace.ejs` — static/maqueta with:

1. Header: "MARKETPLACE" + "Apps y herramientas para tu restaurante"
2. Featured products:
   - MiroFish (Motor de predicción IA) — S/.99, S/.199, S/.499/mes — with screenshot from `/para devs/` folder reference
   - Squads de Agentes (Equipos IA especializados) — Evento Gastronómico, Concurso, Campaña Influencers, Lanzamiento Producto
3. "Próximamente" section with placeholder app cards
4. CTA: "¿Eres developer? Publica tu app" → mailto:ventas@mirestconia.com

All static data — no DB required for this version.

Include public-header and public-footer partials.

- [ ] **Step 2: Commit**

```bash
git add views/public/marketplace.ejs
git commit -m "feat(public): add marketplace page with MiroFish and Squads showcase"
```

---

## Task 9: Montar rutas en server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Montar routes/public.js en server.js**

In `server.js`, find where the landing route is defined (line ~389):

```javascript
app.get('/landing', (req, res) => {
    res.render('landing');
});
```

Before it, add:

```javascript
// Public pages (no auth required)
const publicRoutes = require('./routes/public');
app.use(publicRoutes);
```

This mounts all public routes (/, /paquetes, /demo, /restaurantes, /beneficios, /marketplace, /api/restaurantes, /api/demos) without authentication.

- [ ] **Step 2: Create views/public/ directory**

```bash
mkdir -p views/public
```

(This should already exist if tasks 3-8 ran, but ensure it does)

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(public): mount public routes in server.js"
```

---

## Task 10: Verificación Playwright

- [ ] **Step 1: Start server**
- [ ] **Step 2: Verify homepage** — navigate to `http://localhost:1995/`, check hero, search, plans
- [ ] **Step 3: Verify /paquetes** — check 3 software plans + 3 hardware packages
- [ ] **Step 4: Verify /demo** — fill form, submit, check success
- [ ] **Step 5: Verify /restaurantes** — check map loads, cards display
- [ ] **Step 6: Verify /beneficios** — check 3 tabs switch
- [ ] **Step 7: Verify /marketplace** — check MiroFish and Squads cards
- [ ] **Step 8: Verify header nav** — click each link, verify navigation
- [ ] **Step 9: Verify footer** — check all links present
- [ ] **Step 10: Verify search autocomplete** — type restaurant name, check results
