# Pedidos Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate Mesa + Delivery + Para Llevar into a single `/pedidos` page with 3 tabs, backed by a unified `pedidos` table with a `tipo` column.

**Architecture:** Extend the existing `pedidos` table with nullable columns for delivery/para-llevar metadata and a `tipo` discriminator. Build `/pedidos` as a new consolidated route that reads all three types. Keep existing `/mesas`, `/delivery`, `/para-llevar-nuevo` routes for backwards compatibility (301 redirects to `/pedidos?tab=...`).

**Tech Stack:** PostgreSQL (Supabase), Express, EJS, zod for validation.

**Spec reference:** `docs/superpowers/specs/2026-04-08-pedidos-consolidation-design.md`

**Dependencies:** Iteration 1 (desktop/PWA separation) must be merged first.

---

## Task 1: Create migration SQL file

**Files:**
- Create: `migrations/20260408_pedidos_consolidation.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 2026-04-08 — Pedidos consolidation: unify mesa + delivery + para_llevar

-- Make mesa_id nullable (delivery/para-llevar don't have mesa)
ALTER TABLE pedidos ALTER COLUMN mesa_id DROP NOT NULL;

-- Discriminator column
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo VARCHAR(20);
UPDATE pedidos SET tipo = 'mesa' WHERE tipo IS NULL;
ALTER TABLE pedidos ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE pedidos ALTER COLUMN tipo SET DEFAULT 'mesa';

-- Check constraint for tipo values
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_tipo_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_tipo_check
  CHECK (tipo IN ('mesa', 'delivery', 'para_llevar'));

-- Delivery-specific columns
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion_entrega TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS referencia_entrega TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_telefono VARCHAR(20);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motorizado_id INT REFERENCES usuarios(id);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS hora_estimada_entrega TIMESTAMP;

-- Para-llevar-specific columns
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_nombre_recojo VARCHAR(100);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS hora_recojo TIMESTAMP;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS listo_para_recojo BOOLEAN DEFAULT FALSE;

-- Consistency constraints
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_mesa_required_for_mesa_type;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_mesa_required_for_mesa_type
  CHECK ((tipo = 'mesa' AND mesa_id IS NOT NULL) OR tipo <> 'mesa');

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_direccion_required_for_delivery;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_direccion_required_for_delivery
  CHECK ((tipo = 'delivery' AND direccion_entrega IS NOT NULL) OR tipo <> 'delivery');

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_nombre_required_for_para_llevar;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_nombre_required_for_para_llevar
  CHECK ((tipo = 'para_llevar' AND cliente_nombre_recojo IS NOT NULL) OR tipo <> 'para_llevar');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pedidos_tipo_estado ON pedidos(tipo, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_motorizado ON pedidos(motorizado_id) WHERE tipo = 'delivery';
CREATE INDEX IF NOT EXISTS idx_pedidos_hora_recojo ON pedidos(hora_recojo) WHERE tipo = 'para_llevar';
```

- [ ] **Step 2: Run the migration locally**

Run: `psql "$DATABASE_URL" -f migrations/20260408_pedidos_consolidation.sql`

Expected: no errors. Verify with:
```sql
\d pedidos
```

Check that `tipo`, `direccion_entrega`, `cliente_nombre_recojo` columns exist and constraints are listed.

- [ ] **Step 3: Commit**

```bash
git add migrations/20260408_pedidos_consolidation.sql
git commit -m "feat(db): add tipo discriminator and delivery/para-llevar columns to pedidos"
```

---

## Task 2: Add zod schemas for the new payloads

**Files:**
- Modify: `lib/schemas.js`

- [ ] **Step 1: Add schemas**

Append to `lib/schemas.js`:

```js
const { z } = require('zod');

const pedidoDeliverySchema = z.object({
  cliente_nombre: z.string().min(2).max(100),
  cliente_telefono: z.string().min(6).max(20),
  direccion_entrega: z.string().min(5).max(500),
  referencia_entrega: z.string().max(500).optional(),
  hora_estimada_entrega: z.string().datetime().optional(),
  items: z.array(z.object({
    producto_id: z.number().int().positive(),
    cantidad: z.number().int().positive(),
    notas: z.string().max(500).optional(),
  })).min(1),
});

const pedidoParaLlevarSchema = z.object({
  cliente_nombre_recojo: z.string().min(2).max(100),
  cliente_telefono: z.string().max(20).optional(),
  hora_recojo: z.string().datetime(),
  items: z.array(z.object({
    producto_id: z.number().int().positive(),
    cantidad: z.number().int().positive(),
    notas: z.string().max(500).optional(),
  })).min(1),
});

module.exports = {
  ...module.exports,
  pedidoDeliverySchema,
  pedidoParaLlevarSchema,
};
```

- [ ] **Step 2: Commit**

---

## Task 3: Create `routes/pedidos.js` with the consolidated endpoints

**Files:**
- Create: `routes/pedidos.js`
- Modify: `server.js` (mount the route)

- [ ] **Step 1: Create the route module**

```js
// routes/pedidos.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { pedidoDeliverySchema, pedidoParaLlevarSchema } = require('../lib/schemas');
const { renderForDevice } = require('../lib/deviceRouter');

// GET /pedidos — consolidated view with 3 tabs
router.get('/', requireAuth, async (req, res) => {
  const tenantId = req.session.tenantId;
  const tab = req.query.tab || 'mesa';

  const [mesaPedidos, deliveryPedidos, paraLlevarPedidos] = await Promise.all([
    db.query("SELECT * FROM pedidos WHERE tenant_id=? AND tipo='mesa' AND estado NOT IN ('cerrado','cancelado','rechazado')", [tenantId]),
    db.query("SELECT * FROM pedidos WHERE tenant_id=? AND tipo='delivery' AND estado NOT IN ('cerrado','cancelado','rechazado')", [tenantId]),
    db.query("SELECT * FROM pedidos WHERE tenant_id=? AND tipo='para_llevar' AND estado NOT IN ('cerrado','cancelado','rechazado')", [tenantId]),
  ]);

  renderForDevice(req, res, 'pedidos', {
    tab,
    mesaPedidos: mesaPedidos[0] || [],
    deliveryPedidos: deliveryPedidos[0] || [],
    paraLlevarPedidos: paraLlevarPedidos[0] || [],
    counts: {
      mesa: (mesaPedidos[0] || []).length,
      delivery: (deliveryPedidos[0] || []).length,
      para_llevar: (paraLlevarPedidos[0] || []).length,
    },
  });
});

// POST /api/pedidos/delivery
router.post('/delivery', requireAuth, validateBody(pedidoDeliverySchema), async (req, res) => {
  // Insert tipo='delivery' with direccion_entrega, cliente_telefono, etc.
  // Return the created pedido ID
});

// POST /api/pedidos/para-llevar
router.post('/para-llevar', requireAuth, validateBody(pedidoParaLlevarSchema), async (req, res) => {
  // Insert tipo='para_llevar' with cliente_nombre_recojo, hora_recojo
});

// PATCH /api/pedidos/:id/listo — mark para-llevar ready for pickup
router.patch('/:id/listo', requireAuth, async (req, res) => {
  // UPDATE pedidos SET listo_para_recojo=true WHERE id=? AND tipo='para_llevar'
});

// PATCH /api/pedidos/:id/asignar-motorizado — assign delivery driver
router.patch('/:id/asignar-motorizado', requireAuth, async (req, res) => {
  // UPDATE pedidos SET motorizado_id=? WHERE id=? AND tipo='delivery'
});

module.exports = router;
```

- [ ] **Step 2: Mount the route in server.js**

Add after the other route mounts:

```js
app.use('/pedidos', require('./routes/pedidos'));
app.use('/api/pedidos', require('./routes/pedidos'));
```

- [ ] **Step 3: Add deprecation redirects**

```js
// 301 redirects for old URLs
app.get('/delivery', (req, res) => res.redirect(301, '/pedidos?tab=delivery'));
app.get('/para-llevar-nuevo', (req, res) => res.redirect(301, '/pedidos?tab=para_llevar'));
// /mesas stays for now since it has legacy sub-routes; add a soft redirect on the dashboard
```

- [ ] **Step 4: Commit**

---

## Task 4: Create `views/pedidos.ejs` and `views/pedidos-desktop.ejs`

Both templates with `@variant: pwa` / `@variant: desktop` markers.

- [ ] **Step 1: `views/pedidos.ejs` (PWA)**

Mobile layout with 3 top tabs, sticky header, card list per tab.

- [ ] **Step 2: `views/pedidos-desktop.ejs` (desktop)**

Desktop layout with the 3 tabs as pills in the header, plus the content area. Uses the sidebar + main container from the desktop design system.

- [ ] **Step 3: Register the pair in `tests/view-variants.test.js`**

```js
const REGISTERED_PAIRS = [
  { pwa: 'dashboard.ejs', desktop: 'dashboard-desktop.ejs' },
  { pwa: 'pedidos.ejs', desktop: 'pedidos-desktop.ejs' },
];
```

- [ ] **Step 4: Run `npm test` — must pass**

- [ ] **Step 5: Commit**

---

## Task 5: Update `/cocina` to show tipo badges

**Files:**
- Modify: `views/cocina.ejs`, `views/cocina-desktop.ejs` (create if missing)
- Modify: `routes/cocina.js` or equivalent

Show `[MESA 3]`, `[DELIVERY]`, or `[LLEVAR]` badge on each order card. Add filter pills to show only one type.

---

## Task 6: Verify backwards compatibility

Manually test:
- Old `/delivery` URL → redirects to `/pedidos?tab=delivery`
- Old `/para-llevar-nuevo` URL → redirects to `/pedidos?tab=para_llevar`
- Existing mesa orders still display in the Mesa tab
- Cocina page still shows all in-progress orders
- Creating a delivery order works end-to-end

---

## Out of scope

- Rappi/PedidosYa integration
- Real-time motorizado tracking
- SMS/WhatsApp auto-notifications
- Post-order rating

## Notes for future

This plan is a SKELETON. Before executing it, a full brainstorming session should be held to:
1. Inspect the current `routes/mesas.js` to understand the mesa flow depth
2. Decide if `/mesas` also redirects or stays as a sub-app
3. Design the visual for each tab in the `.pen` file
4. Validate the DB migration on a staging DB first
