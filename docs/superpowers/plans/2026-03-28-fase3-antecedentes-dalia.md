# Fase 3: Antecedentes DalIA — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear las tablas, servicios y rutas necesarios para que DalIA responda 165 preguntas de administradores: asistencia, historial precios, calendario, sub-recetas con costeo automático, delivery integrado (Rappi/PedidosYa/LlamaFood), feature flags por tenant, y contratos.

**Architecture:** 3 migraciones por dominio (016 operativos, 017 recetas v2, 018 delivery). Middleware `requireModulo()` para feature flags por tenant. Servicios aislados por dominio. Inyección condicional en DalIA vía `knowledge-base.js`.

**Tech Stack:** Node.js/Express, PostgreSQL (Supabase), Knex-style migrations via `db.query()`, EJS views, existing auth/tenant middleware.

**Spec:** `docs/superpowers/specs/2026-03-28-fase3-antecedentes-dalia-design.md`

---

## File Structure

### New files to create:
```
migrations/016_antecedentes_operativos.js
migrations/017_recetas_v2.js
migrations/018_delivery.js
middleware/requireModulo.js
services/costeo-recetas.js
services/delivery/rappi.js
services/delivery/pedidosya.js
services/delivery/llamafood.js
services/delivery/delivery-core.js
services/delivery/webhook-handler.js
routes/delivery.js
views/delivery.ejs
views/delivery-config.ejs
```

### Existing files to modify:
```
routes/auth.js              — insert asistencia marcaciones on login/logout
routes/productos.js         — insert historial_precios on price change
routes/almacen.js           — insert historial_precios on costo change + trigger recálculo
routes/recetas.js           — support sub_receta type + trigger costeo
routes/recetas-standalone.js — UI for sub-recetas
middleware/tenant.js         — add modulos to PLAN_LIMITS
services/knowledge-base.js  — add new DalIA context sections
routes/chat.js              — add new context in obtenerContextoNegocio
routes/contratos.js         — add modulos_contratados fields
routes/cotizaciones.js      — add modulos to cotización
routes/superadmin.js        — add modulos toggle per tenant
server.js                   — mount delivery routes
```

---

## Task 1: Migración 016 — Antecedentes operativos

**Files:**
- Create: `migrations/016_antecedentes_operativos.js`

- [ ] **Step 1: Create migration file**

```javascript
// migrations/016_antecedentes_operativos.js
'use strict';
const db = require('../db');

async function up() {
  // 1. Asistencia marcaciones
  await db.query(`
    CREATE TABLE IF NOT EXISTS asistencia_marcaciones (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      usuario_id INT NOT NULL,
      tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address VARCHAR(45),
      user_agent TEXT,
      metodo VARCHAR(20) DEFAULT 'auto_session',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_asistencia_tenant_fecha ON asistencia_marcaciones(tenant_id, (timestamp::date))`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_asistencia_usuario ON asistencia_marcaciones(usuario_id, timestamp)`);

  // 2. Asistencia resumen diario
  await db.query(`
    CREATE TABLE IF NOT EXISTS asistencia_resumen_diario (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      usuario_id INT NOT NULL,
      fecha DATE NOT NULL,
      hora_entrada TIME,
      hora_salida TIME,
      horas_trabajadas DECIMAL(5,2),
      horas_extra DECIMAL(5,2) DEFAULT 0,
      costo_hora DECIMAL(10,2),
      costo_total DECIMAL(10,2),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, usuario_id, fecha)
    )
  `);

  // 3. Historial de precios
  await db.query(`
    CREATE TABLE IF NOT EXISTS historial_precios (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      entidad_tipo VARCHAR(20) NOT NULL CHECK (entidad_tipo IN ('producto', 'ingrediente')),
      entidad_id INT NOT NULL,
      precio_anterior DECIMAL(10,2) NOT NULL,
      precio_nuevo DECIMAL(10,2) NOT NULL,
      campo VARCHAR(30) NOT NULL,
      usuario_id INT,
      motivo TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_historial_precios_entidad ON historial_precios(tenant_id, entidad_tipo, entidad_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_historial_precios_fecha ON historial_precios(created_at)`);

  // 4. Calendario de eventos
  await db.query(`
    CREATE TABLE IF NOT EXISTS calendario_eventos (
      id SERIAL PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      nombre VARCHAR(150) NOT NULL,
      tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('feriado', 'evento_local', 'deportivo', 'promocion_interna', 'custom')),
      fecha DATE NOT NULL,
      recurrente BOOLEAN DEFAULT false,
      recurrencia_patron VARCHAR(30) CHECK (recurrencia_patron IN ('anual', 'mensual', 'semanal')),
      impacto_esperado VARCHAR(20) DEFAULT 'medio' CHECK (impacto_esperado IN ('alto', 'medio', 'bajo', 'negativo')),
      notas TEXT,
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_calendario_fecha ON calendario_eventos(fecha)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_calendario_tenant ON calendario_eventos(tenant_id)`);

  // 5. Seed feriados peruanos (tenant_id NULL = global)
  const feriados = [
    ['Año Nuevo', '2026-01-01', 'bajo'],
    ['Jueves Santo', '2026-04-02', 'alto'],
    ['Viernes Santo', '2026-04-03', 'alto'],
    ['Día del Trabajo', '2026-05-01', 'medio'],
    ['Batalla de Arica', '2026-06-07', 'bajo'],
    ['Fiestas Patrias', '2026-07-28', 'alto'],
    ['Fiestas Patrias', '2026-07-29', 'alto'],
    ['Santa Rosa de Lima', '2026-08-30', 'medio'],
    ['Combate de Angamos', '2026-10-08', 'bajo'],
    ['Todos los Santos', '2026-11-01', 'medio'],
    ['Inmaculada Concepción', '2026-12-08', 'medio'],
    ['Navidad', '2026-12-25', 'alto'],
    ['Nochevieja', '2026-12-31', 'alto']
  ];
  for (const [nombre, fecha, impacto] of feriados) {
    await db.query(
      `INSERT INTO calendario_eventos (tenant_id, nombre, tipo, fecha, recurrente, recurrencia_patron, impacto_esperado)
       SELECT NULL, ?, 'feriado', ?, true, 'anual', ?
       WHERE NOT EXISTS (SELECT 1 FROM calendario_eventos WHERE nombre=? AND fecha=? AND tenant_id IS NULL)`,
      [nombre, fecha, impacto, nombre, fecha]
    );
  }

  // 6. Campos de configuración
  await db.query(`ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS merma_objetivo_pct DECIMAL(5,2) DEFAULT 3.00`);
  await db.query(`ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS horas_jornada_estandar INT DEFAULT 8`);
  await db.query(`ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS umbral_horas_extra DECIMAL(5,2) DEFAULT 8.00`);

  // 7. Feature flags en tenant_suscripciones
  await db.query(`ALTER TABLE tenant_suscripciones ADD COLUMN IF NOT EXISTS modulos_habilitados JSONB DEFAULT '{"asistencia":true,"historial_precios":true,"calendario_eventos":true,"sub_recetas":true,"costeo_automatico":true,"delivery_rappi":false,"delivery_pedidosya":false,"delivery_llamafood":false}'`);

  // 8. Módulos en contratos
  await db.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS modulos_contratados JSONB DEFAULT '[]'`);
  await db.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS modulos_precio JSONB DEFAULT '{}'`);

  console.log('Migration 016_antecedentes_operativos: OK');
}

module.exports = { up };
```

- [ ] **Step 2: Run migration**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "require('./migrations/016_antecedentes_operativos').up().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"`

Expected: `Migration 016_antecedentes_operativos: OK`

- [ ] **Step 3: Verify tables exist**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "const db=require('./db');(async()=>{const[r]=await db.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('asistencia_marcaciones','asistencia_resumen_diario','historial_precios','calendario_eventos') ORDER BY table_name\");console.log(r.map(x=>x.table_name));process.exit(0)})()"`

Expected: `['asistencia_marcaciones', 'asistencia_resumen_diario', 'calendario_eventos', 'historial_precios']`

- [ ] **Step 4: Commit**

```bash
git add migrations/016_antecedentes_operativos.js
git commit -m "feat: add migration 016 — attendance, price history, calendar, config fields, feature flags"
```

---

## Task 2: Middleware requireModulo

**Files:**
- Create: `middleware/requireModulo.js`
- Modify: `middleware/tenant.js`

- [ ] **Step 1: Create requireModulo middleware**

```javascript
// middleware/requireModulo.js
'use strict';
const db = require('../db');

/**
 * Middleware that checks if a module is enabled for the current tenant.
 * Reads from tenant_suscripciones.modulos_habilitados JSONB field.
 * @param {string} modulo - Module key (e.g. 'sub_recetas', 'delivery_rappi')
 */
function requireModulo(modulo) {
  return async (req, res, next) => {
    const tid = req.tenantId || 1;
    try {
      const [[sub]] = await db.query(
        `SELECT modulos_habilitados FROM tenant_suscripciones WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`,
        [tid]
      );
      const modulos = sub?.modulos_habilitados || {};
      if (!modulos[modulo]) {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json')) || String(req.path || '').startsWith('/api/')) {
          return res.status(403).json({ error: `Módulo "${modulo}" no disponible en tu plan. Contacta a soporte para activarlo.` });
        }
        return res.status(403).render('error', {
          error: { message: `El módulo "${modulo}" no está incluido en tu plan actual.`, stack: '' }
        });
      }
      next();
    } catch (e) {
      // Fail open if table doesn't exist yet
      next();
    }
  };
}

module.exports = { requireModulo };
```

- [ ] **Step 2: Commit**

```bash
git add middleware/requireModulo.js
git commit -m "feat: add requireModulo middleware for feature flags per tenant"
```

---

## Task 3: Asistencia — marcaciones en login/logout

**Files:**
- Modify: `routes/auth.js:167-198` (after login success, before redirect)
- Modify: `routes/auth.js:209-218` (logout)

- [ ] **Step 1: Add marcación entrada on login success**

In `routes/auth.js`, after line 181 (the `registrarAudit` call) and before line 198 (`res.redirect`), add:

```javascript
    // Marcación de asistencia - entrada
    try {
      await db.query(
        `INSERT INTO asistencia_marcaciones (tenant_id, usuario_id, tipo, ip_address, user_agent, metodo)
         VALUES (?, ?, 'entrada', ?, ?, 'auto_session')`,
        [req.tenantId || 1, u.id, req.ip, String(req.headers['user-agent'] || '').substring(0, 300)]
      );
    } catch (_) {}
```

- [ ] **Step 2: Add marcación salida on logout**

In `routes/auth.js`, replace the logout handler (lines 210-218) with:

```javascript
router.post('/logout', async (req, res) => {
  try {
    const user = req.session?.user;
    if (user) {
      try {
        await db.query(
          `INSERT INTO asistencia_marcaciones (tenant_id, usuario_id, tipo, ip_address, user_agent, metodo)
           VALUES (?, ?, 'salida', ?, ?, 'auto_session')`,
          [req.tenantId || 1, user.id, req.ip, String(req.headers['user-agent'] || '').substring(0, 300)]
        );
      } catch (_) {}
    }
    req.session.destroy(() => {
      res.redirect('/login');
    });
  } catch (_) {
    res.redirect('/login');
  }
});
```

- [ ] **Step 3: Verify login creates marcación**

Run: start dev server, login as admin, check DB:
```bash
node -e "const db=require('./db');(async()=>{const[r]=await db.query('SELECT * FROM asistencia_marcaciones ORDER BY id DESC LIMIT 3');console.log(r);process.exit(0)})()"
```

Expected: at least one row with `tipo: 'entrada'`

- [ ] **Step 4: Commit**

```bash
git add routes/auth.js
git commit -m "feat: auto-insert attendance marcaciones on login/logout"
```

---

## Task 4: Historial de precios — productos

**Files:**
- Modify: `routes/productos.js` (PUT /:id endpoint)

- [ ] **Step 1: Add price history tracking to product update**

In `routes/productos.js`, in the `PUT /:id` endpoint, before the UPDATE query, add code to fetch old price and after the update insert history:

```javascript
    // --- Historial de precios ---
    const tid = req.tenantId || 1;
    try {
      const [[oldProd]] = await db.query('SELECT precio_unidad FROM productos WHERE id=? AND tenant_id=?', [req.params.id, tid]);
      const oldPrice = Number(oldProd?.precio_unidad || 0);
      const newPrice = Number(precio_unidad || 0);
      if (oldProd && oldPrice !== newPrice && newPrice > 0) {
        await db.query(
          `INSERT INTO historial_precios (tenant_id, entidad_tipo, entidad_id, precio_anterior, precio_nuevo, campo, usuario_id)
           VALUES (?, 'producto', ?, ?, ?, 'precio_unidad', ?)`,
          [tid, req.params.id, oldPrice, newPrice, req.session?.user?.id || null]
        );
      }
    } catch (_) {}
```

Note: This block goes AFTER the validation and BEFORE the `UPDATE productos SET...` query. The `tid` variable should use the existing pattern in the file.

- [ ] **Step 2: Commit**

```bash
git add routes/productos.js
git commit -m "feat: track product price changes in historial_precios"
```

---

## Task 5: Historial de precios — ingredientes + trigger costeo

**Files:**
- Modify: `routes/almacen.js` (PUT /api/ingredientes/:id endpoint)

- [ ] **Step 1: Add price history + costeo trigger to ingredient update**

In `routes/almacen.js`, in the `PUT /api/ingredientes/:id` endpoint, before the UPDATE query, add:

```javascript
    // --- Historial de precios + trigger costeo ---
    try {
      const [[oldIng]] = await db.query('SELECT costo_unitario FROM almacen_ingredientes WHERE id=? AND tenant_id=?', [req.params.id, tid]);
      const oldCost = Number(oldIng?.costo_unitario || 0);
      const newCost = Number(costo_unitario || 0);
      if (oldIng && oldCost !== newCost && newCost > 0) {
        await db.query(
          `INSERT INTO historial_precios (tenant_id, entidad_tipo, entidad_id, precio_anterior, precio_nuevo, campo, usuario_id)
           VALUES (?, 'ingrediente', ?, ?, ?, 'costo_unitario', ?)`,
          [tid, req.params.id, oldCost, newCost, req.session?.user?.id || null]
        );
        // Trigger costeo automático
        try {
          const { recalcularPorIngrediente } = require('../services/costeo-recetas');
          await recalcularPorIngrediente(tid, Number(req.params.id));
        } catch (_) {}
      }
    } catch (_) {}
```

- [ ] **Step 2: Commit**

```bash
git add routes/almacen.js
git commit -m "feat: track ingredient cost changes + trigger recipe cost recalculation"
```

---

## Task 6: Migración 017 — Recetas V2

**Files:**
- Create: `migrations/017_recetas_v2.js`

- [ ] **Step 1: Create migration file**

```javascript
// migrations/017_recetas_v2.js
'use strict';
const db = require('../db');

async function up() {
  // 1. Add sub-recipe support to receta_items
  await db.query(`ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'ingrediente'`);
  await db.query(`ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS sub_receta_id INT DEFAULT NULL`);

  // Make ingrediente_id nullable (was NOT NULL for ingredient-only items)
  // In PostgreSQL: ALTER COLUMN ... DROP NOT NULL
  try {
    await db.query(`ALTER TABLE receta_items ALTER COLUMN ingrediente_id DROP NOT NULL`);
  } catch (_) {} // Already nullable

  // 2. Recipe cost cache table
  await db.query(`
    CREATE TABLE IF NOT EXISTS receta_costos_cache (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      receta_id INT NOT NULL,
      costo_total DECIMAL(10,4),
      costo_por_porcion DECIMAL(10,4),
      food_cost_pct DECIMAL(5,2),
      precio_venta DECIMAL(10,2),
      margen_contribucion DECIMAL(10,2),
      ingredientes_detalle JSONB,
      tiene_sub_recetas BOOLEAN DEFAULT false,
      actualizado_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, receta_id)
    )
  `);

  console.log('Migration 017_recetas_v2: OK');
}

module.exports = { up };
```

- [ ] **Step 2: Run migration**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "require('./migrations/017_recetas_v2').up().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"`

Expected: `Migration 017_recetas_v2: OK`

- [ ] **Step 3: Commit**

```bash
git add migrations/017_recetas_v2.js
git commit -m "feat: add migration 017 — sub-recipes and recipe cost cache"
```

---

## Task 7: Servicio costeo-recetas.js

**Files:**
- Create: `services/costeo-recetas.js`

- [ ] **Step 1: Create the costing service**

```javascript
// services/costeo-recetas.js
'use strict';
const db = require('../db');

/**
 * Explode a recipe into base ingredients using recursive CTE.
 * Handles sub-recipes up to 3 levels deep.
 */
async function explotarIngredientes(recetaId) {
  const [rows] = await db.query(`
    WITH RECURSIVE explosion AS (
      SELECT ri.receta_id, ri.ingrediente_id, ri.sub_receta_id, ri.tipo,
             ri.cantidad::numeric, ri.unidad_medida, 1 as nivel
      FROM receta_items ri
      WHERE ri.receta_id = ?

      UNION ALL

      SELECT e.receta_id, ri2.ingrediente_id, ri2.sub_receta_id, ri2.tipo,
             (ri2.cantidad::numeric * (e.cantidad / GREATEST(r.rendimiento_porciones, 1)))::numeric,
             ri2.unidad_medida, e.nivel + 1
      FROM explosion e
      JOIN recetas r ON r.id = e.sub_receta_id
      JOIN receta_items ri2 ON ri2.receta_id = r.id
      WHERE e.tipo = 'sub_receta' AND e.nivel < 3
    )
    SELECT ingrediente_id, SUM(cantidad) as cantidad_total, unidad_medida
    FROM explosion
    WHERE tipo = 'ingrediente' AND ingrediente_id IS NOT NULL
    GROUP BY ingrediente_id, unidad_medida
  `, [recetaId]);
  return rows;
}

/**
 * Recalculate the cost of a single recipe and update cache.
 * Also recalculates parent recipes that use this one as sub-recipe.
 */
async function recalcularCostoReceta(tenantId, recetaId, _depth = 0) {
  if (_depth > 3) return; // Safety: max recursion

  const [[receta]] = await db.query(
    'SELECT id, producto_id, rendimiento_porciones FROM recetas WHERE id = ? AND tenant_id = ?',
    [recetaId, tenantId]
  );
  if (!receta) return;

  const ingredientes = await explotarIngredientes(recetaId);

  // Check if recipe has sub-recipes
  const [[subCheck]] = await db.query(
    `SELECT COUNT(*) as cnt FROM receta_items WHERE receta_id = ? AND tipo = 'sub_receta'`,
    [recetaId]
  );
  const tieneSub = Number(subCheck?.cnt || 0) > 0;

  // Calculate cost from ingredient prices
  let costoTotal = 0;
  const detalle = [];

  for (const ing of ingredientes) {
    const [[ingData]] = await db.query(
      'SELECT nombre, costo_unitario, unidad_medida, merma_preparacion_pct FROM almacen_ingredientes WHERE id = ?',
      [ing.ingrediente_id]
    );
    if (!ingData) continue;

    const costoBase = Number(ingData.costo_unitario) || 0;
    const merma = Number(ingData.merma_preparacion_pct) || 0;
    const costoConMerma = merma > 0 ? costoBase / (1 - merma) : costoBase;
    const cant = Number(ing.cantidad_total) || 0;
    const unidad = String(ing.unidad_medida || '').toLowerCase();
    const ingUnidad = String(ingData.unidad_medida || '').toLowerCase();

    let costoUnit = costoConMerma;
    if ((unidad === 'g' || unidad === 'ml') && (ingUnidad === 'kg' || ingUnidad === 'lt')) {
      costoUnit = costoConMerma / 1000;
    }

    const subtotal = costoUnit * cant;
    costoTotal += subtotal;

    detalle.push({
      ingrediente_id: ing.ingrediente_id,
      nombre: ingData.nombre,
      cantidad: cant,
      unidad_medida: ing.unidad_medida,
      costo_unitario: costoUnit,
      subtotal: Math.round(subtotal * 100) / 100
    });
  }

  // Get product price
  let precioVenta = 0;
  if (receta.producto_id) {
    const [[prod]] = await db.query('SELECT precio_unidad FROM productos WHERE id = ?', [receta.producto_id]);
    precioVenta = Number(prod?.precio_unidad || 0);
  }

  const rendimiento = Math.max(Number(receta.rendimiento_porciones) || 1, 1);
  const costoPorcion = costoTotal / rendimiento;
  const foodCostPct = precioVenta > 0 ? (costoPorcion / precioVenta) * 100 : 0;
  const margen = precioVenta - costoPorcion;

  // Upsert cache
  await db.query(`
    INSERT INTO receta_costos_cache (tenant_id, receta_id, costo_total, costo_por_porcion, food_cost_pct, precio_venta, margen_contribucion, ingredientes_detalle, tiene_sub_recetas, actualizado_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON CONFLICT (tenant_id, receta_id) DO UPDATE SET
      costo_total = EXCLUDED.costo_total,
      costo_por_porcion = EXCLUDED.costo_por_porcion,
      food_cost_pct = EXCLUDED.food_cost_pct,
      precio_venta = EXCLUDED.precio_venta,
      margen_contribucion = EXCLUDED.margen_contribucion,
      ingredientes_detalle = EXCLUDED.ingredientes_detalle,
      tiene_sub_recetas = EXCLUDED.tiene_sub_recetas,
      actualizado_at = NOW()
  `, [
    tenantId, recetaId,
    Math.round(costoTotal * 10000) / 10000,
    Math.round(costoPorcion * 10000) / 10000,
    Math.round(foodCostPct * 100) / 100,
    precioVenta,
    Math.round(margen * 100) / 100,
    JSON.stringify(detalle),
    tieneSub
  ]);

  // Recalculate parent recipes that use this recipe as sub-recipe
  const [padres] = await db.query(
    `SELECT DISTINCT ri.receta_id FROM receta_items ri
     JOIN recetas r ON r.id = ri.receta_id
     WHERE ri.sub_receta_id = ? AND ri.tipo = 'sub_receta' AND r.tenant_id = ? AND r.activa = true`,
    [recetaId, tenantId]
  );
  for (const padre of padres) {
    await recalcularCostoReceta(tenantId, padre.receta_id, _depth + 1);
  }
}

/**
 * Recalculate all recipes that use a specific ingredient.
 */
async function recalcularPorIngrediente(tenantId, ingredienteId) {
  const [recetas] = await db.query(
    `SELECT DISTINCT ri.receta_id FROM receta_items ri
     JOIN recetas r ON r.id = ri.receta_id
     WHERE ri.ingrediente_id = ? AND r.tenant_id = ? AND r.activa = true`,
    [ingredienteId, tenantId]
  );
  for (const rec of recetas) {
    await recalcularCostoReceta(tenantId, rec.receta_id);
  }
}

/**
 * Recalculate all active recipes for a tenant.
 * Processes leaf recipes first (no sub-recipes), then parents.
 */
async function recalcularTodas(tenantId) {
  // Leaf recipes first (no sub-recipes)
  const [hojas] = await db.query(
    `SELECT r.id FROM recetas r
     WHERE r.tenant_id = ? AND r.activa = true
       AND NOT EXISTS (SELECT 1 FROM receta_items ri WHERE ri.receta_id = r.id AND ri.tipo = 'sub_receta')
     ORDER BY r.id`,
    [tenantId]
  );
  for (const r of hojas) {
    await recalcularCostoReceta(tenantId, r.id);
  }

  // Then recipes with sub-recipes
  const [padres] = await db.query(
    `SELECT DISTINCT r.id FROM recetas r
     JOIN receta_items ri ON ri.receta_id = r.id
     WHERE r.tenant_id = ? AND r.activa = true AND ri.tipo = 'sub_receta'
     ORDER BY r.id`,
    [tenantId]
  );
  for (const r of padres) {
    await recalcularCostoReceta(tenantId, r.id);
  }
}

/**
 * Validate no circular references exist.
 * Returns true if adding sub_receta_id to recetaId would create a cycle.
 */
async function detectarCiclo(recetaId, subRecetaId, _visited = new Set()) {
  if (recetaId === subRecetaId) return true;
  if (_visited.has(subRecetaId)) return false;
  _visited.add(subRecetaId);

  const [items] = await db.query(
    `SELECT sub_receta_id FROM receta_items WHERE receta_id = ? AND tipo = 'sub_receta' AND sub_receta_id IS NOT NULL`,
    [subRecetaId]
  );
  for (const item of items) {
    if (await detectarCiclo(recetaId, item.sub_receta_id, _visited)) return true;
  }
  return false;
}

module.exports = {
  recalcularCostoReceta,
  recalcularPorIngrediente,
  recalcularTodas,
  explotarIngredientes,
  detectarCiclo
};
```

- [ ] **Step 2: Commit**

```bash
git add services/costeo-recetas.js
git commit -m "feat: add costeo-recetas service with recursive sub-recipe costing"
```

---

## Task 8: Actualizar recetas.js para sub-recetas + costeo

**Files:**
- Modify: `routes/recetas.js`

- [ ] **Step 1: Update GET /:productoId to include sub-recipe items**

In `routes/recetas.js`, update the items query (line 19-28) to also join sub-recipes:

Replace the existing items query with:

```javascript
        // Items con ingrediente O sub-receta
        const [items] = await db.query(`
            SELECT ri.*,
                   ai.nombre as ingrediente_nombre, ai.costo_unitario as ingrediente_costo,
                   ai.unidad_medida as ingrediente_unidad, ai.stock_actual,
                   ai.merma_preparacion_pct,
                   sr.id as sr_id,
                   (SELECT p2.nombre FROM productos p2 WHERE p2.id = sr.producto_id) as sub_receta_nombre,
                   src.costo_por_porcion as sub_receta_costo
            FROM receta_items ri
            LEFT JOIN almacen_ingredientes ai ON ai.id = ri.ingrediente_id AND ri.tipo = 'ingrediente'
            LEFT JOIN recetas sr ON sr.id = ri.sub_receta_id AND ri.tipo = 'sub_receta'
            LEFT JOIN receta_costos_cache src ON src.receta_id = sr.id
            WHERE ri.receta_id = ?
            ORDER BY ri.id
        `, [receta.id]);
```

Update the cost calculation loop to handle sub-recipes:

```javascript
        let costoTotal = 0;
        items.forEach(item => {
            if (item.tipo === 'sub_receta' && item.sub_receta_costo) {
                // Sub-recipe: cost = portions used * cost per portion
                item.costo_item = Number(item.sub_receta_costo) * Number(item.cantidad || 1);
                costoTotal += item.costo_item;
            } else if (item.ingrediente_id) {
                const costoBase = Number(item.ingrediente_costo) || 0;
                const merma = Number(item.merma_preparacion_pct) || 0;
                const costoConMerma = merma > 0 ? costoBase / (1 - merma) : costoBase;
                const cant = Number(item.cantidad) || 0;
                const unidad = String(item.unidad_medida || '').toLowerCase();
                const ingUnidad = String(item.ingrediente_unidad || '').toLowerCase();

                let costoUnitConvertido = costoConMerma;
                if ((unidad === 'g' || unidad === 'ml') && (ingUnidad === 'kg' || ingUnidad === 'lt')) {
                    costoUnitConvertido = costoConMerma / 1000;
                }

                item.costo_item = costoUnitConvertido * cant;
                costoTotal += item.costo_item;
            }
        });
```

- [ ] **Step 2: Update POST /:productoId to validate sub-recipes + trigger costeo**

In `routes/recetas.js`, add cycle detection before inserting items, and trigger costeo after save. Add at the top of the file:

```javascript
const { recalcularCostoReceta, detectarCiclo } = require('../services/costeo-recetas');
```

In the POST handler, after creating the recipe and before inserting items, add validation:

```javascript
        // Validate sub-recipes: no cycles, max depth
        for (const item of items) {
          if (item.sub_receta_id) {
            const hasCycle = await detectarCiclo(recetaId, item.sub_receta_id);
            if (hasCycle) {
              return res.status(400).json({ error: `Sub-receta ${item.sub_receta_id} crearía una referencia circular` });
            }
          }
        }
```

After inserting all items, add costeo trigger:

```javascript
        // Trigger costeo automático
        try {
          await recalcularCostoReceta(tid, recetaId);
        } catch (_) {}
```

- [ ] **Step 3: Update descontar-stock to handle sub-recipes**

In the `POST /descontar-stock` endpoint, update the items query to explode sub-recipes:

```javascript
        // Use explosion for sub-recipe support
        let itemsParaDescontar;
        try {
          const { explotarIngredientes } = require('../services/costeo-recetas');
          itemsParaDescontar = await explotarIngredientes(receta.id);
        } catch (_) {
          // Fallback to flat items
          const [flatItems] = await db.query('SELECT ingrediente_id, cantidad, unidad_medida FROM receta_items WHERE receta_id=? AND ingrediente_id IS NOT NULL', [receta.id]);
          itemsParaDescontar = flatItems.map(i => ({ ingrediente_id: i.ingrediente_id, cantidad_total: i.cantidad, unidad_medida: i.unidad_medida }));
        }
```

Then update the loop to use `itemsParaDescontar` instead of `items`, using `item.cantidad_total` instead of `item.cantidad`.

- [ ] **Step 4: Commit**

```bash
git add routes/recetas.js
git commit -m "feat: support sub-recipes in recetas routes + auto-costing trigger"
```

---

## Task 9: Migración 018 — Delivery

**Files:**
- Create: `migrations/018_delivery.js`

- [ ] **Step 1: Create migration file**

```javascript
// migrations/018_delivery.js
'use strict';
const db = require('../db');

async function up() {
  // 1. Delivery config per platform per tenant
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_config (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      plataforma VARCHAR(20) NOT NULL CHECK (plataforma IN ('rappi', 'pedidosya', 'llamafood')),
      activo BOOLEAN DEFAULT false,
      client_id VARCHAR(255),
      client_secret TEXT,
      access_token TEXT,
      token_expira_at TIMESTAMPTZ,
      store_id VARCHAR(100),
      chain_id VARCHAR(100),
      webhook_secret TEXT,
      comision_pct DECIMAL(5,2),
      config_extra JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, plataforma)
    )
  `);

  // 2. Delivery orders
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_pedidos (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      plataforma VARCHAR(20) NOT NULL,
      pedido_externo_id VARCHAR(100),
      pedido_interno_id INT,
      factura_id INT,
      estado_externo VARCHAR(30),
      estado_interno VARCHAR(30) DEFAULT 'recibido' CHECK (estado_interno IN ('recibido','aceptado','preparando','listo','despachado','entregado','cancelado')),
      cliente_nombre VARCHAR(150),
      cliente_telefono VARCHAR(20),
      cliente_direccion TEXT,
      cliente_notas TEXT,
      items JSONB NOT NULL DEFAULT '[]',
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      descuento DECIMAL(10,2) DEFAULT 0,
      comision_plataforma DECIMAL(10,2),
      costo_envio DECIMAL(10,2) DEFAULT 0,
      propina DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      metodo_pago VARCHAR(30),
      tiempo_aceptacion_seg INT,
      tiempo_preparacion_min INT,
      repartidor_nombre VARCHAR(100),
      repartidor_telefono VARCHAR(20),
      tracking_url TEXT,
      payload_original JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, plataforma, pedido_externo_id)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_tenant ON delivery_pedidos(tenant_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_estado ON delivery_pedidos(tenant_id, estado_interno)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_plataforma ON delivery_pedidos(tenant_id, plataforma)`);

  // 3. Webhook log
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_webhook_log (
      id SERIAL PRIMARY KEY,
      tenant_id INT,
      plataforma VARCHAR(20) NOT NULL,
      evento VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      signature_valida BOOLEAN,
      procesado BOOLEAN DEFAULT false,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_webhook_log_fecha ON delivery_webhook_log(created_at DESC)`);

  // 4. Menu sync
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_menu_sync (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      plataforma VARCHAR(20) NOT NULL,
      producto_id INT NOT NULL,
      producto_externo_id VARCHAR(100),
      precio_plataforma DECIMAL(10,2),
      disponible BOOLEAN DEFAULT true,
      ultimo_sync_at TIMESTAMPTZ,
      estado_sync VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_sync IN ('pendiente','sincronizado','error','aprobacion')),
      error_sync TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, plataforma, producto_id)
    )
  `);

  console.log('Migration 018_delivery: OK');
}

module.exports = { up };
```

- [ ] **Step 2: Run migration**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "require('./migrations/018_delivery').up().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"`

Expected: `Migration 018_delivery: OK`

- [ ] **Step 3: Commit**

```bash
git add migrations/018_delivery.js
git commit -m "feat: add migration 018 — delivery config, orders, webhooks, menu sync"
```

---

## Task 10: Delivery services — core + LlamaFood

**Files:**
- Create: `services/delivery/delivery-core.js`
- Create: `services/delivery/llamafood.js`

- [ ] **Step 1: Create delivery-core.js**

```javascript
// services/delivery/delivery-core.js
'use strict';
const db = require('../../db');

/**
 * Process an incoming delivery order from any platform.
 * Creates internal order (pedidos + pedido_items) and delivery_pedidos record.
 */
async function procesarPedidoEntrante(tenantId, plataforma, data) {
  // data: { pedido_externo_id, cliente_nombre, cliente_telefono, cliente_direccion,
  //         cliente_notas, items: [{nombre, producto_id, cantidad, precio, notas}],
  //         subtotal, descuento, comision_plataforma, costo_envio, propina, total,
  //         metodo_pago, estado_externo, payload_original }

  // 1. Insert delivery_pedidos
  const [result] = await db.query(`
    INSERT INTO delivery_pedidos (tenant_id, plataforma, pedido_externo_id, estado_externo, estado_interno,
      cliente_nombre, cliente_telefono, cliente_direccion, cliente_notas, items,
      subtotal, descuento, comision_plataforma, costo_envio, propina, total, metodo_pago, payload_original)
    VALUES (?,?,?,?,  'recibido', ?,?,?,?, ?::jsonb, ?,?,?,?,?,?,?,?::jsonb)
    ON CONFLICT (tenant_id, plataforma, pedido_externo_id) DO NOTHING
    RETURNING id
  `, [
    tenantId, plataforma, data.pedido_externo_id, data.estado_externo || 'new',
    data.cliente_nombre || '', data.cliente_telefono || null, data.cliente_direccion || null,
    data.cliente_notas || null, JSON.stringify(data.items || []),
    data.subtotal || 0, data.descuento || 0, data.comision_plataforma || null,
    data.costo_envio || 0, data.propina || 0, data.total || 0,
    data.metodo_pago || null, JSON.stringify(data.payload_original || {})
  ]);

  const deliveryId = result?.insertId || result?.[0]?.id;
  if (!deliveryId) return null; // Duplicate order

  // 2. Create internal pedido (as delivery type)
  const [pedidoResult] = await db.query(`
    INSERT INTO pedidos (tenant_id, mesa_id, estado, mesero_nombre)
    VALUES (?, NULL, 'abierto', ?)
    RETURNING id
  `, [tenantId, `Delivery ${plataforma}`]);
  const pedidoId = pedidoResult?.insertId || pedidoResult?.[0]?.id;

  // 3. Create pedido_items from delivery items
  if (pedidoId && Array.isArray(data.items)) {
    for (const item of data.items) {
      // Try to map to internal product via delivery_menu_sync
      let productoId = item.producto_id || null;
      if (!productoId && item.producto_externo_id) {
        const [[sync]] = await db.query(
          `SELECT producto_id FROM delivery_menu_sync WHERE tenant_id=? AND plataforma=? AND producto_externo_id=?`,
          [tenantId, plataforma, item.producto_externo_id]
        );
        productoId = sync?.producto_id || null;
      }

      await db.query(`
        INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, estado, nota)
        VALUES (?, ?, ?, ?, ?, 'enviado', ?)
      `, [pedidoId, productoId, item.cantidad || 1, item.precio || 0,
          (item.cantidad || 1) * (item.precio || 0), item.notas || null]);
    }
  }

  // 4. Link delivery order to internal order
  await db.query('UPDATE delivery_pedidos SET pedido_interno_id=? WHERE id=?', [pedidoId, deliveryId]);

  return { deliveryId, pedidoId };
}

/**
 * Update delivery order status.
 */
async function actualizarEstado(tenantId, deliveryPedidoId, estadoInterno) {
  await db.query(
    `UPDATE delivery_pedidos SET estado_interno=?, updated_at=NOW() WHERE id=? AND tenant_id=?`,
    [estadoInterno, deliveryPedidoId, tenantId]
  );
}

/**
 * Get delivery analytics for a tenant.
 */
async function calcularAnalytics(tenantId, dias = 30) {
  const [porPlataforma] = await db.query(`
    SELECT plataforma,
      COUNT(*) as pedidos,
      COALESCE(SUM(total), 0) as venta_total,
      COALESCE(SUM(comision_plataforma), 0) as comisiones,
      COALESCE(SUM(total - COALESCE(comision_plataforma, 0)), 0) as ingreso_neto,
      COALESCE(AVG(tiempo_preparacion_min), 0) as tiempo_prep_promedio,
      COALESCE(AVG(tiempo_aceptacion_seg), 0) as aceptacion_promedio
    FROM delivery_pedidos
    WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL '1 day' * ?
    GROUP BY plataforma
  `, [tenantId, dias]);

  return porPlataforma;
}

module.exports = { procesarPedidoEntrante, actualizarEstado, calcularAnalytics };
```

- [ ] **Step 2: Create llamafood.js (manual only)**

```javascript
// services/delivery/llamafood.js
'use strict';
const { procesarPedidoEntrante, actualizarEstado } = require('./delivery-core');

/**
 * LlamaFood: manual order entry only (no API available).
 * All orders are entered by admin through the delivery UI.
 */
async function crearPedidoManual(tenantId, data) {
  return procesarPedidoEntrante(tenantId, 'llamafood', {
    pedido_externo_id: `LF-${Date.now()}`,
    ...data,
    estado_externo: 'manual',
    payload_original: { source: 'manual_entry' }
  });
}

async function actualizarEstadoPedido(tenantId, pedidoId, estado) {
  return actualizarEstado(tenantId, pedidoId, estado);
}

async function obtenerHistorial(tenantId, desde, hasta) {
  const db = require('../../db');
  const [rows] = await db.query(
    `SELECT * FROM delivery_pedidos WHERE tenant_id=? AND plataforma='llamafood'
     AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC`,
    [tenantId, desde, hasta]
  );
  return rows;
}

module.exports = { crearPedidoManual, actualizarEstadoPedido, obtenerHistorial };
```

- [ ] **Step 3: Commit**

```bash
mkdir -p services/delivery
git add services/delivery/delivery-core.js services/delivery/llamafood.js
git commit -m "feat: add delivery-core and llamafood services"
```

---

## Task 11: Delivery services — Rappi

**Files:**
- Create: `services/delivery/rappi.js`

- [ ] **Step 1: Create rappi.js**

```javascript
// services/delivery/rappi.js
'use strict';
const db = require('../../db');
const crypto = require('crypto');
const { procesarPedidoEntrante } = require('./delivery-core');

const RAPPI_BASE_URL = 'https://dev-portal.rappi.com';

/**
 * Get or refresh Rappi access token for a tenant.
 */
async function autenticar(tenantId) {
  const [[config]] = await db.query(
    'SELECT * FROM delivery_config WHERE tenant_id=? AND plataforma=? AND activo=true',
    [tenantId, 'rappi']
  );
  if (!config || !config.client_id || !config.client_secret) {
    throw new Error('Rappi no configurado para este tenant');
  }

  // Check if token still valid (with 1h buffer)
  if (config.access_token && config.token_expira_at && new Date(config.token_expira_at) > new Date(Date.now() + 3600000)) {
    return config.access_token;
  }

  // Refresh token
  const resp = await fetch(`${RAPPI_BASE_URL}/restaurants/auth/v1/token/login/integrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.client_id, client_secret: config.client_secret })
  });
  if (!resp.ok) throw new Error(`Rappi auth failed: ${resp.status}`);
  const data = await resp.json();

  // Token valid for 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await db.query(
    'UPDATE delivery_config SET access_token=?, token_expira_at=?, updated_at=NOW() WHERE id=?',
    [data.access_token || data.token, expiresAt, config.id]
  );

  return data.access_token || data.token;
}

/**
 * Validate Rappi webhook HMAC signature.
 */
function validarWebhook(payload, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expected));
}

/**
 * Process incoming Rappi order webhook.
 */
async function recibirPedido(tenantId, webhookPayload) {
  const order = webhookPayload.order || webhookPayload;
  return procesarPedidoEntrante(tenantId, 'rappi', {
    pedido_externo_id: String(order.id || order.order_id),
    cliente_nombre: order.client?.name || order.customer_name || '',
    cliente_telefono: order.client?.phone || '',
    cliente_direccion: order.delivery_address?.description || order.address || '',
    cliente_notas: order.instructions || order.notes || '',
    items: (order.items || order.products || []).map(i => ({
      nombre: i.name || i.product_name,
      producto_externo_id: String(i.id || i.sku || ''),
      cantidad: i.quantity || 1,
      precio: Number(i.price || i.unit_price || 0),
      notas: i.comments || i.special_instructions || ''
    })),
    subtotal: Number(order.total_products || order.subtotal || 0),
    descuento: Number(order.total_discounts || 0),
    comision_plataforma: null, // Comes from Financial API, not order webhook
    costo_envio: Number(order.charges?.shipping || order.delivery_fee || 0),
    propina: Number(order.other_totals?.tip || order.tip || 0),
    total: Number(order.total_order || order.total || 0),
    metodo_pago: order.payment_method || 'tarjeta',
    estado_externo: 'SENT',
    payload_original: webhookPayload
  });
}

/**
 * Accept a Rappi order.
 */
async function aceptarPedido(tenantId, orderId, cookingTimeMin = 20) {
  const token = await autenticar(tenantId);
  const [[config]] = await db.query(
    'SELECT store_id FROM delivery_config WHERE tenant_id=? AND plataforma=?',
    [tenantId, 'rappi']
  );
  const resp = await fetch(
    `${RAPPI_BASE_URL}/restaurants/orders/v1/stores/${config.store_id}/orders/${orderId}/cooking_time/${cookingTimeMin}/take`,
    { method: 'PUT', headers: { 'x-authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return resp.ok;
}

/**
 * Reject a Rappi order.
 */
async function rechazarPedido(tenantId, orderId, cancelType = 'RESTAURANT_CANCEL') {
  const token = await autenticar(tenantId);
  const [[config]] = await db.query(
    'SELECT store_id FROM delivery_config WHERE tenant_id=? AND plataforma=?',
    [tenantId, 'rappi']
  );
  const resp = await fetch(
    `${RAPPI_BASE_URL}/restaurants/orders/v1/stores/${config.store_id}/orders/${orderId}/cancel_type/${cancelType}/reject`,
    { method: 'PUT', headers: { 'x-authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return resp.ok;
}

/**
 * Sync menu to Rappi.
 */
async function sincronizarMenu(tenantId) {
  const token = await autenticar(tenantId);
  const [[config]] = await db.query(
    'SELECT store_id FROM delivery_config WHERE tenant_id=? AND plataforma=?',
    [tenantId, 'rappi']
  );

  const [productos] = await db.query(
    `SELECT p.id, p.nombre, p.precio_unidad, dms.producto_externo_id, dms.precio_plataforma, dms.disponible
     FROM productos p
     LEFT JOIN delivery_menu_sync dms ON dms.producto_id = p.id AND dms.plataforma = 'rappi' AND dms.tenant_id = ?
     WHERE p.tenant_id = ?`,
    [tenantId, tenantId]
  );

  // Update sync status
  for (const prod of productos) {
    await db.query(`
      INSERT INTO delivery_menu_sync (tenant_id, plataforma, producto_id, precio_plataforma, disponible, ultimo_sync_at, estado_sync)
      VALUES (?, 'rappi', ?, ?, true, NOW(), 'pendiente')
      ON CONFLICT (tenant_id, plataforma, producto_id) DO UPDATE SET
        precio_plataforma = EXCLUDED.precio_plataforma, ultimo_sync_at = NOW(), estado_sync = 'pendiente'
    `, [tenantId, prod.id, prod.precio_plataforma || prod.precio_unidad]);
  }

  return { synced: productos.length };
}

module.exports = { autenticar, validarWebhook, recibirPedido, aceptarPedido, rechazarPedido, sincronizarMenu };
```

- [ ] **Step 2: Commit**

```bash
git add services/delivery/rappi.js
git commit -m "feat: add Rappi delivery service — auth, orders, menu sync, webhooks"
```

---

## Task 12: Delivery services — PedidosYa

**Files:**
- Create: `services/delivery/pedidosya.js`

- [ ] **Step 1: Create pedidosya.js**

```javascript
// services/delivery/pedidosya.js
'use strict';
const db = require('../../db');
const { procesarPedidoEntrante } = require('./delivery-core');

const PEDIDOSYA_BASE_URL = 'https://pedidosya.partner.deliveryhero.io';

/**
 * Get or refresh PedidosYa access token.
 */
async function autenticar(tenantId) {
  const [[config]] = await db.query(
    'SELECT * FROM delivery_config WHERE tenant_id=? AND plataforma=? AND activo=true',
    [tenantId, 'pedidosya']
  );
  if (!config || !config.client_id || !config.client_secret) {
    throw new Error('PedidosYa no configurado para este tenant');
  }

  if (config.access_token && config.token_expira_at && new Date(config.token_expira_at) > new Date(Date.now() + 300000)) {
    return { token: config.access_token, chainId: config.chain_id };
  }

  const resp = await fetch(`${PEDIDOSYA_BASE_URL}/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.client_id,
      client_secret: config.client_secret
    })
  });
  if (!resp.ok) throw new Error(`PedidosYa auth failed: ${resp.status}`);
  const data = await resp.json();

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await db.query(
    'UPDATE delivery_config SET access_token=?, token_expira_at=?, updated_at=NOW() WHERE id=?',
    [data.access_token, expiresAt, config.id]
  );

  return { token: data.access_token, chainId: config.chain_id };
}

/**
 * Process incoming PedidosYa order webhook.
 */
async function recibirPedido(tenantId, webhookPayload) {
  const order = webhookPayload;
  return procesarPedidoEntrante(tenantId, 'pedidosya', {
    pedido_externo_id: String(order.order_id || order.id),
    cliente_nombre: order.customer?.name || '',
    cliente_telefono: order.customer?.phone || '',
    cliente_direccion: order.delivery_address?.formatted || order.address || '',
    cliente_notas: order.special_instructions || order.notes || '',
    items: (order.items || order.products || []).map(i => ({
      nombre: i.name || i.product_name,
      producto_externo_id: String(i.id || i.sku || ''),
      cantidad: i.quantity || 1,
      precio: Number(i.unit_price || i.price || 0),
      notas: i.comment || ''
    })),
    subtotal: Number(order.subtotal || 0),
    descuento: Number(order.discount || 0),
    comision_plataforma: null,
    costo_envio: Number(order.delivery_fee || 0),
    propina: Number(order.tip || 0),
    total: Number(order.total || 0),
    metodo_pago: order.payment_method || 'tarjeta',
    estado_externo: 'RECEIVED',
    payload_original: webhookPayload
  });
}

/**
 * Accept a PedidosYa order.
 */
async function aceptarPedido(tenantId, orderId) {
  const { token, chainId } = await autenticar(tenantId);
  const resp = await fetch(
    `${PEDIDOSYA_BASE_URL}/v2/chains/${chainId}/orders/${orderId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACCEPTED' })
    }
  );
  return resp.ok;
}

/**
 * Mark order as ready for pickup.
 */
async function marcarListo(tenantId, orderId) {
  const { token, chainId } = await autenticar(tenantId);
  const resp = await fetch(
    `${PEDIDOSYA_BASE_URL}/v2/chains/${chainId}/orders/${orderId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY_FOR_PICKUP' })
    }
  );
  return resp.ok;
}

/**
 * Sync menu to PedidosYa catalog.
 */
async function sincronizarMenu(tenantId) {
  const { token, chainId } = await autenticar(tenantId);
  const [[config]] = await db.query(
    'SELECT store_id FROM delivery_config WHERE tenant_id=? AND plataforma=?',
    [tenantId, 'pedidosya']
  );

  const [productos] = await db.query(
    `SELECT p.id, p.nombre, p.precio_unidad, dms.producto_externo_id, dms.precio_plataforma
     FROM productos p
     LEFT JOIN delivery_menu_sync dms ON dms.producto_id=p.id AND dms.plataforma='pedidosya' AND dms.tenant_id=?
     WHERE p.tenant_id=?`,
    [tenantId, tenantId]
  );

  for (const prod of productos) {
    await db.query(`
      INSERT INTO delivery_menu_sync (tenant_id, plataforma, producto_id, precio_plataforma, disponible, ultimo_sync_at, estado_sync)
      VALUES (?, 'pedidosya', ?, ?, true, NOW(), 'pendiente')
      ON CONFLICT (tenant_id, plataforma, producto_id) DO UPDATE SET
        precio_plataforma = EXCLUDED.precio_plataforma, ultimo_sync_at = NOW(), estado_sync = 'pendiente'
    `, [tenantId, prod.id, prod.precio_plataforma || prod.precio_unidad]);
  }

  return { synced: productos.length };
}

/**
 * Get order history from PedidosYa API.
 */
async function obtenerHistorial(tenantId, desde, hasta) {
  const { token, chainId } = await autenticar(tenantId);
  const [[config]] = await db.query(
    'SELECT store_id FROM delivery_config WHERE tenant_id=? AND plataforma=?',
    [tenantId, 'pedidosya']
  );
  const resp = await fetch(
    `${PEDIDOSYA_BASE_URL}/v2/chains/${chainId}/vendors/${config.store_id}/orders?start_date=${desde}&end_date=${hasta}&page_size=500`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.orders || data.data || [];
}

module.exports = { autenticar, recibirPedido, aceptarPedido, marcarListo, sincronizarMenu, obtenerHistorial };
```

- [ ] **Step 2: Commit**

```bash
git add services/delivery/pedidosya.js
git commit -m "feat: add PedidosYa delivery service — auth, orders, menu sync, history"
```

---

## Task 13: Delivery webhook handler

**Files:**
- Create: `services/delivery/webhook-handler.js`

- [ ] **Step 1: Create webhook-handler.js**

```javascript
// services/delivery/webhook-handler.js
'use strict';
const db = require('../../db');

/**
 * Process incoming webhook: validate, log, route to correct service.
 */
async function procesarWebhook(plataforma, req) {
  const payload = req.body;
  let tenantId = null;
  let signatureValida = null;

  if (plataforma === 'rappi') {
    // Validate HMAC signature
    const signature = req.headers['rappi-signature'] || '';
    // Find tenant by store_id in payload
    const storeId = payload.store_id || payload.order?.store_id || payload.store?.id;
    if (storeId) {
      const [[config]] = await db.query(
        'SELECT tenant_id, webhook_secret FROM delivery_config WHERE store_id=? AND plataforma=?',
        [String(storeId), 'rappi']
      );
      tenantId = config?.tenant_id;
      if (config?.webhook_secret && signature) {
        try {
          const rappi = require('./rappi');
          signatureValida = rappi.validarWebhook(payload, signature, config.webhook_secret);
        } catch (_) { signatureValida = null; }
      }
    }
  } else if (plataforma === 'pedidosya') {
    // Find tenant by vendor_id or store_id
    const vendorId = payload.vendor_id || payload.store_id;
    if (vendorId) {
      const [[config]] = await db.query(
        'SELECT tenant_id FROM delivery_config WHERE store_id=? AND plataforma=?',
        [String(vendorId), 'pedidosya']
      );
      tenantId = config?.tenant_id;
    }
    signatureValida = true; // PedidosYa uses IP whitelist, not HMAC
  }

  // Log webhook
  const evento = payload.event || payload.type || payload.status || 'unknown';
  await db.query(
    `INSERT INTO delivery_webhook_log (tenant_id, plataforma, evento, payload, signature_valida)
     VALUES (?, ?, ?, ?::jsonb, ?)`,
    [tenantId, plataforma, evento, JSON.stringify(payload), signatureValida]
  );

  if (!tenantId) {
    return { error: 'Tenant not found for webhook', processed: false };
  }

  // Route to correct handler
  let result = null;
  try {
    if (plataforma === 'rappi') {
      const rappi = require('./rappi');
      result = await rappi.recibirPedido(tenantId, payload);
    } else if (plataforma === 'pedidosya') {
      const pedidosya = require('./pedidosya');
      result = await pedidosya.recibirPedido(tenantId, payload);
    }

    // Mark as processed
    await db.query(
      `UPDATE delivery_webhook_log SET procesado=true WHERE tenant_id=? AND plataforma=?
       AND created_at = (SELECT MAX(created_at) FROM delivery_webhook_log WHERE tenant_id=? AND plataforma=?)`,
      [tenantId, plataforma, tenantId, plataforma]
    );
  } catch (e) {
    await db.query(
      `UPDATE delivery_webhook_log SET error=? WHERE tenant_id=? AND plataforma=?
       AND created_at = (SELECT MAX(created_at) FROM delivery_webhook_log WHERE tenant_id=? AND plataforma=?)`,
      [e.message, tenantId, plataforma, tenantId, plataforma]
    );
  }

  return { tenantId, result, processed: true };
}

module.exports = { procesarWebhook };
```

- [ ] **Step 2: Commit**

```bash
git add services/delivery/webhook-handler.js
git commit -m "feat: add delivery webhook handler — validate, log, route"
```

---

## Task 14: Delivery routes + views

**Files:**
- Create: `routes/delivery.js`
- Create: `views/delivery.ejs`
- Create: `views/delivery-config.ejs`
- Modify: `server.js` (mount routes)

- [ ] **Step 1: Create routes/delivery.js**

```javascript
// routes/delivery.js
'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');
const { registrarAudit } = require('../services/audit');

// GET /delivery — Dashboard
router.get('/', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const [activos] = await db.query(
      `SELECT * FROM delivery_pedidos WHERE tenant_id=? AND estado_interno NOT IN ('entregado','cancelado') ORDER BY created_at DESC`,
      [tid]
    );
    const [configs] = await db.query('SELECT * FROM delivery_config WHERE tenant_id=?', [tid]);
    const { calcularAnalytics } = require('../services/delivery/delivery-core');
    const analytics = await calcularAnalytics(tid, 30);
    res.render('delivery', { pedidos: activos, configs, analytics, user: req.session.user });
  } catch (e) {
    res.status(500).render('error', { error: { message: e.message, stack: '' } });
  }
});

// GET /delivery/config — Configuration page
router.get('/config', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const [configs] = await db.query('SELECT * FROM delivery_config WHERE tenant_id=?', [tid]);
    const configMap = {};
    for (const c of configs) configMap[c.plataforma] = c;
    res.render('delivery-config', { configs: configMap, user: req.session.user });
  } catch (e) {
    res.status(500).render('error', { error: { message: e.message, stack: '' } });
  }
});

// POST /delivery/config/:plataforma — Save platform credentials
router.post('/config/:plataforma', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const plat = req.params.plataforma;
    if (!['rappi', 'pedidosya', 'llamafood'].includes(plat)) {
      return res.status(400).json({ error: 'Plataforma inválida' });
    }
    const { client_id, client_secret, store_id, chain_id, webhook_secret, comision_pct, activo } = req.body;
    await db.query(`
      INSERT INTO delivery_config (tenant_id, plataforma, client_id, client_secret, store_id, chain_id, webhook_secret, comision_pct, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (tenant_id, plataforma) DO UPDATE SET
        client_id=EXCLUDED.client_id, client_secret=EXCLUDED.client_secret,
        store_id=EXCLUDED.store_id, chain_id=EXCLUDED.chain_id,
        webhook_secret=EXCLUDED.webhook_secret, comision_pct=EXCLUDED.comision_pct,
        activo=EXCLUDED.activo, updated_at=NOW()
    `, [tid, plat, client_id||null, client_secret||null, store_id||null, chain_id||null,
        webhook_secret||null, comision_pct||null, activo === 'true' || activo === true]);

    registrarAudit({ tenantId: tid, usuarioId: req.session?.user?.id||0, accion: 'UPSERT', modulo: 'delivery', tabla: 'delivery_config', ip: req.ip });
    res.json({ message: `Configuración ${plat} guardada` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /delivery/manual — Manual order (LlamaFood or any)
router.post('/manual', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { plataforma, cliente_nombre, cliente_telefono, cliente_direccion, cliente_notas, items, total, metodo_pago } = req.body;
    const { crearPedidoManual } = require('../services/delivery/llamafood');
    const result = await crearPedidoManual(tid, {
      cliente_nombre, cliente_telefono, cliente_direccion, cliente_notas,
      items: items || [], total: total || 0, subtotal: total || 0,
      metodo_pago: metodo_pago || 'efectivo'
    });
    registrarAudit({ tenantId: tid, usuarioId: req.session?.user?.id||0, accion: 'INSERT', modulo: 'delivery', tabla: 'delivery_pedidos', ip: req.ip });
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /delivery/historial — Order history
router.get('/historial', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { plataforma, desde, hasta } = req.query;
    let query = 'SELECT * FROM delivery_pedidos WHERE tenant_id=?';
    const params = [tid];
    if (plataforma) { query += ' AND plataforma=?'; params.push(plataforma); }
    if (desde) { query += ' AND created_at >= ?'; params.push(desde); }
    if (hasta) { query += ' AND created_at <= ?'; params.push(hasta); }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const [pedidos] = await db.query(query, params);
    res.json(pedidos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/delivery/:id/estado — Update order status
router.put('/:id/estado', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { estado } = req.body;
    const { actualizarEstado } = require('../services/delivery/delivery-core');
    await actualizarEstado(tid, req.params.id, estado);

    // Notify external platform if applicable
    const [[pedido]] = await db.query('SELECT plataforma, pedido_externo_id FROM delivery_pedidos WHERE id=? AND tenant_id=?', [req.params.id, tid]);
    if (pedido && estado === 'listo') {
      try {
        if (pedido.plataforma === 'rappi') {
          // Rappi doesn't have a "ready" endpoint separate from handoff
        } else if (pedido.plataforma === 'pedidosya') {
          const peya = require('../services/delivery/pedidosya');
          await peya.marcarListo(tid, pedido.pedido_externo_id);
        }
      } catch (_) {}
    }

    res.json({ message: 'Estado actualizado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /delivery/analytics — Analytics endpoint
router.get('/analytics', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const dias = Number(req.query.dias) || 30;
    const { calcularAnalytics } = require('../services/delivery/delivery-core');
    const data = await calcularAnalytics(tid, dias);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/delivery/webhook/rappi — Rappi webhook
router.post('/webhook/rappi', async (req, res) => {
  res.status(200).json({ status: 'ok' }); // Respond immediately (Rappi requirement)
  try {
    const { procesarWebhook } = require('../services/delivery/webhook-handler');
    await procesarWebhook('rappi', req);
  } catch (e) {
    console.error('Rappi webhook error:', e.message);
  }
});

// POST /api/delivery/webhook/pedidosya — PedidosYa webhook
router.post('/webhook/pedidosya', async (req, res) => {
  res.status(200).json({ status: 'ok' });
  try {
    const { procesarWebhook } = require('../services/delivery/webhook-handler');
    await procesarWebhook('pedidosya', req);
  } catch (e) {
    console.error('PedidosYa webhook error:', e.message);
  }
});

// GET /api/delivery/sync-menu/:plataforma — Sync menu
router.get('/sync-menu/:plataforma', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const plat = req.params.plataforma;
    let result;
    if (plat === 'rappi') {
      const rappi = require('../services/delivery/rappi');
      result = await rappi.sincronizarMenu(tid);
    } else if (plat === 'pedidosya') {
      const peya = require('../services/delivery/pedidosya');
      result = await peya.sincronizarMenu(tid);
    } else {
      return res.status(400).json({ error: 'Plataforma no soporta sync de menú' });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Create views/delivery.ejs (minimal dashboard)**

```html
<%- include('partials/header', { title: 'Delivery' }) %>
<div class="container-fluid py-3">
  <h4><i class="bi bi-bicycle"></i> Delivery</h4>

  <!-- Analytics cards -->
  <div class="row g-3 mb-4">
    <% (analytics || []).forEach(a => { %>
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h6 class="text-capitalize"><%= a.plataforma %></h6>
          <p class="mb-1"><strong><%= a.pedidos %></strong> pedidos (30d)</p>
          <p class="mb-1">Venta: <strong>S/ <%= Number(a.venta_total).toFixed(2) %></strong></p>
          <p class="mb-1">Comisiones: <strong>S/ <%= Number(a.comisiones).toFixed(2) %></strong></p>
          <p class="mb-0">Neto: <strong>S/ <%= Number(a.ingreso_neto).toFixed(2) %></strong></p>
        </div>
      </div>
    </div>
    <% }) %>
  </div>

  <!-- Active orders -->
  <h5>Pedidos activos</h5>
  <div class="table-responsive">
    <table class="table table-sm">
      <thead><tr><th>#</th><th>Plataforma</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Hora</th><th>Acciones</th></tr></thead>
      <tbody>
        <% (pedidos || []).forEach(p => { %>
        <tr>
          <td><%= p.pedido_externo_id || p.id %></td>
          <td><span class="badge bg-info text-capitalize"><%= p.plataforma %></span></td>
          <td><%= p.cliente_nombre %></td>
          <td>S/ <%= Number(p.total).toFixed(2) %></td>
          <td><span class="badge bg-warning"><%= p.estado_interno %></span></td>
          <td><%= new Date(p.created_at).toLocaleTimeString('es-PE') %></td>
          <td>
            <select class="form-select form-select-sm" style="width:auto;display:inline" onchange="cambiarEstado(<%= p.id %>, this.value)">
              <option value="">Cambiar...</option>
              <option value="aceptado">Aceptar</option>
              <option value="preparando">Preparando</option>
              <option value="listo">Listo</option>
              <option value="despachado">Despachado</option>
              <option value="entregado">Entregado</option>
              <option value="cancelado">Cancelar</option>
            </select>
          </td>
        </tr>
        <% }) %>
        <% if (!pedidos || pedidos.length === 0) { %>
        <tr><td colspan="7" class="text-center text-muted">Sin pedidos activos</td></tr>
        <% } %>
      </tbody>
    </table>
  </div>

  <a href="/delivery/config" class="btn btn-outline-secondary btn-sm mt-3"><i class="bi bi-gear"></i> Configurar plataformas</a>
</div>
<script>
async function cambiarEstado(id, estado) {
  if (!estado) return;
  const r = await fetch(`/api/delivery/${id}/estado`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({estado}) });
  if (r.ok) location.reload();
  else alert('Error al cambiar estado');
}
</script>
<%- include('partials/footer') %>
```

- [ ] **Step 3: Create views/delivery-config.ejs**

```html
<%- include('partials/header', { title: 'Delivery - Configuración' }) %>
<div class="container py-3">
  <h4><i class="bi bi-gear"></i> Configuración Delivery</h4>
  <a href="/delivery" class="btn btn-sm btn-outline-secondary mb-3"><i class="bi bi-arrow-left"></i> Volver</a>

  <% ['rappi', 'pedidosya', 'llamafood'].forEach(plat => { const c = configs[plat] || {}; %>
  <div class="card mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <strong class="text-capitalize"><%= plat %></strong>
      <span class="badge <%= c.activo ? 'bg-success' : 'bg-secondary' %>"><%= c.activo ? 'Activo' : 'Inactivo' %></span>
    </div>
    <div class="card-body">
      <form id="form-<%= plat %>">
        <div class="row g-2">
          <% if (plat !== 'llamafood') { %>
          <div class="col-md-6"><label class="form-label">Client ID</label><input name="client_id" class="form-control form-control-sm" value="<%= c.client_id || '' %>"></div>
          <div class="col-md-6"><label class="form-label">Client Secret</label><input name="client_secret" type="password" class="form-control form-control-sm" value="<%= c.client_secret ? '••••••••' : '' %>"></div>
          <div class="col-md-4"><label class="form-label">Store ID</label><input name="store_id" class="form-control form-control-sm" value="<%= c.store_id || '' %>"></div>
          <% if (plat === 'pedidosya') { %>
          <div class="col-md-4"><label class="form-label">Chain ID</label><input name="chain_id" class="form-control form-control-sm" value="<%= c.chain_id || '' %>"></div>
          <% } %>
          <% if (plat === 'rappi') { %>
          <div class="col-md-4"><label class="form-label">Webhook Secret</label><input name="webhook_secret" class="form-control form-control-sm" value="<%= c.webhook_secret || '' %>"></div>
          <% } %>
          <% } %>
          <div class="col-md-3"><label class="form-label">Comisión %</label><input name="comision_pct" type="number" step="0.01" class="form-control form-control-sm" value="<%= c.comision_pct || '' %>"></div>
          <div class="col-md-3"><label class="form-label">Estado</label><select name="activo" class="form-select form-select-sm"><option value="true" <%= c.activo?'selected':'' %>>Activo</option><option value="false" <%= !c.activo?'selected':'' %>>Inactivo</option></select></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm mt-2">Guardar</button>
      </form>
    </div>
  </div>
  <% }) %>
</div>
<script>
['rappi','pedidosya','llamafood'].forEach(plat => {
  document.getElementById('form-'+plat).addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    const r = await fetch('/delivery/config/'+plat, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    const j = await r.json();
    alert(j.message || j.error);
  });
});
</script>
<%- include('partials/footer') %>
```

- [ ] **Step 4: Mount delivery routes in server.js**

In `server.js`, add after the cotizaciones routes (~line 842):

```javascript
const deliveryRoutes = require('./routes/delivery');
```

And in the route mounting section:

```javascript
app.use('/delivery', requireAuth, requireRole('administrador'), deliveryRoutes);
app.use('/api/delivery', deliveryRoutes); // Webhooks are unauthenticated
```

Note: Webhook endpoints (`/api/delivery/webhook/*`) must NOT require auth since they're called by Rappi/PedidosYa servers. Non-webhook API endpoints in the route file should be protected individually or the route split accordingly. The simplest approach: mount `/api/delivery/webhook` separately without auth, and protect the rest.

Adjust to:
```javascript
app.use('/delivery', requireAuth, requireRole('administrador'), deliveryRoutes);
app.use('/api/delivery/webhook', deliveryRoutes); // Webhooks - no auth
app.use('/api/delivery', requireAuth, requireRole('administrador'), deliveryRoutes);
```

- [ ] **Step 5: Commit**

```bash
git add routes/delivery.js views/delivery.ejs views/delivery-config.ejs server.js
git commit -m "feat: add delivery routes, views, and mount in server.js"
```

---

## Task 15: Inyección en DalIA — knowledge-base.js

**Files:**
- Modify: `services/knowledge-base.js`

- [ ] **Step 1: Add new context sections to buildContext()**

Add the following sections after section 4 (CONOCIMIENTO ADICIONAL) in `services/knowledge-base.js`, before the final `return`:

```javascript
    // ── 5. P&L RESUMIDO ─────────────────────────────────────────────────────
    try {
      const now = new Date();
      const mes = now.getMonth() + 1;
      const anio = now.getFullYear();
      const [[ventas30]] = await db.query(
        `SELECT COALESCE(SUM(total),0) as ingresos, COUNT(*) as facturas FROM facturas WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?`,
        [tenantId, mes, anio]
      );
      const [[gastos30]] = await db.query(
        `SELECT COALESCE(SUM(monto),0) as total_gastos FROM gastos WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?`,
        [tenantId, mes, anio]
      );
      const [[planilla30]] = await db.query(
        `SELECT COALESCE(SUM(monto_bruto),0) as total_planilla FROM planilla_pagos WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?`,
        [tenantId, mes, anio]
      );
      const ingresos = Number(ventas30.ingresos);
      const totalGastos = Number(gastos30.total_gastos);
      const totalPlanilla = Number(planilla30.total_planilla);
      const margenBruto = ingresos - totalGastos - totalPlanilla;
      const margenPct = ingresos > 0 ? ((margenBruto / ingresos) * 100).toFixed(1) : '0';

      const lines = [`=== P&L RESUMIDO (${mes}/${anio}) ===`];
      lines.push(`Ingresos: S/ ${ingresos.toFixed(2)} (${ventas30.facturas} facturas)`);
      lines.push(`Gastos operativos: S/ ${totalGastos.toFixed(2)}`);
      lines.push(`Planilla: S/ ${totalPlanilla.toFixed(2)}`);
      lines.push(`Margen: S/ ${margenBruto.toFixed(2)} (${margenPct}%)`);
      parts.push(lines.join('\n'));
    } catch (_) {}

    // ── 6. FOOD COST POR PLATO (top 15) ─────────────────────────────────────
    try {
      const [costos] = await db.query(`
        SELECT p.nombre, p.precio_unidad, rcc.costo_por_porcion, rcc.food_cost_pct, rcc.margen_contribucion
        FROM receta_costos_cache rcc
        JOIN recetas r ON r.id = rcc.receta_id
        JOIN productos p ON p.id = r.producto_id
        WHERE rcc.tenant_id = ?
        ORDER BY rcc.food_cost_pct DESC LIMIT 15
      `, [tenantId]);
      if (costos.length > 0) {
        const lines = ['=== FOOD COST POR PLATO ==='];
        for (const c of costos) {
          lines.push(`- ${c.nombre}: costo S/${Number(c.costo_por_porcion).toFixed(2)}, precio S/${Number(c.precio_venta || c.precio_unidad).toFixed(2)}, food cost ${Number(c.food_cost_pct).toFixed(1)}%, margen S/${Number(c.margen_contribucion).toFixed(2)}`);
        }
        parts.push(lines.join('\n'));
      }
    } catch (_) {}

    // ── 7. MERMA VS OBJETIVO ─────────────────────────────────────────────────
    try {
      const [[merma]] = await db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN am.tipo='merma' THEN am.cantidad * ai.costo_unitario ELSE 0 END), 0) as merma_soles,
          COALESCE(SUM(CASE WHEN am.tipo IN ('salida','merma') THEN am.cantidad * ai.costo_unitario ELSE 0 END), 1) as consumo_total
        FROM almacen_movimientos am
        JOIN almacen_ingredientes ai ON ai.id = am.ingrediente_id
        WHERE am.tenant_id = ? AND am.created_at >= NOW() - INTERVAL '30 days'
      `, [tenantId]);
      const [[config]] = await db.query('SELECT merma_objetivo_pct FROM configuracion_impresion LIMIT 1');
      const objetivo = Number(config?.merma_objetivo_pct || 3);
      const mermaPct = Number(merma.consumo_total) > 0 ? (Number(merma.merma_soles) / Number(merma.consumo_total) * 100) : 0;
      const lines = ['=== MERMA ==='];
      lines.push(`Merma actual: ${mermaPct.toFixed(1)}% (S/ ${Number(merma.merma_soles).toFixed(2)}) — Objetivo: ${objetivo}%`);
      if (mermaPct > objetivo) lines.push(`⚠ Merma por encima del objetivo en ${(mermaPct - objetivo).toFixed(1)} puntos`);
      parts.push(lines.join('\n'));
    } catch (_) {}

    // ── 8. DELIVERY (30 días) ────────────────────────────────────────────────
    try {
      const [delivery] = await db.query(`
        SELECT plataforma, COUNT(*) as pedidos, COALESCE(SUM(total),0) as venta,
          COALESCE(SUM(comision_plataforma),0) as comisiones,
          COALESCE(SUM(total - COALESCE(comision_plataforma,0)),0) as neto
        FROM delivery_pedidos WHERE tenant_id=? AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY plataforma
      `, [tenantId]);
      if (delivery.length > 0) {
        const lines = ['=== DELIVERY (30 dias) ==='];
        for (const d of delivery) {
          lines.push(`- ${d.plataforma}: ${d.pedidos} pedidos, venta S/${Number(d.venta).toFixed(2)}, comisiones S/${Number(d.comisiones).toFixed(2)}, neto S/${Number(d.neto).toFixed(2)}`);
        }
        parts.push(lines.join('\n'));
      }
    } catch (_) {}

    // ── 9. VARIACIÓN DE COSTOS (últimos 30 días) ────────────────────────────
    try {
      const [variaciones] = await db.query(`
        SELECT ai.nombre, hp.precio_anterior, hp.precio_nuevo,
          ROUND((hp.precio_nuevo - hp.precio_anterior) / NULLIF(hp.precio_anterior,0) * 100, 1) as variacion_pct,
          hp.created_at
        FROM historial_precios hp
        JOIN almacen_ingredientes ai ON ai.id = hp.entidad_id
        WHERE hp.tenant_id = ? AND hp.entidad_tipo = 'ingrediente' AND hp.created_at >= NOW() - INTERVAL '30 days'
        ORDER BY ABS(hp.precio_nuevo - hp.precio_anterior) DESC LIMIT 5
      `, [tenantId]);
      if (variaciones.length > 0) {
        const lines = ['=== VARIACION DE COSTOS INSUMOS ==='];
        for (const v of variaciones) {
          const dir = Number(v.variacion_pct) > 0 ? '↑' : '↓';
          lines.push(`- ${v.nombre}: S/${Number(v.precio_anterior).toFixed(2)} → S/${Number(v.precio_nuevo).toFixed(2)} (${dir}${Math.abs(v.variacion_pct)}%)`);
        }
        parts.push(lines.join('\n'));
      }
    } catch (_) {}

    // ── 10. CALENDARIO PRÓXIMOS 14 DÍAS ─────────────────────────────────────
    try {
      const [eventos] = await db.query(`
        SELECT nombre, tipo, fecha, impacto_esperado
        FROM calendario_eventos
        WHERE (tenant_id = ? OR tenant_id IS NULL)
          AND fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
          AND activo = true
        ORDER BY fecha LIMIT 10
      `, [tenantId]);
      if (eventos.length > 0) {
        const lines = ['=== PROXIMOS EVENTOS (14 dias) ==='];
        for (const e of eventos) {
          lines.push(`- ${e.fecha}: ${e.nombre} (${e.tipo}, impacto: ${e.impacto_esperado})`);
        }
        parts.push(lines.join('\n'));
      }
    } catch (_) {}

    // ── 11. ASISTENCIA HOY ──────────────────────────────────────────────────
    try {
      const [marcaciones] = await db.query(`
        SELECT u.nombre, u.rol, am.tipo, am.timestamp
        FROM asistencia_marcaciones am
        JOIN usuarios u ON u.id = am.usuario_id
        WHERE am.tenant_id = ? AND am.timestamp::date = CURRENT_DATE
        ORDER BY am.timestamp
      `, [tenantId]);
      if (marcaciones.length > 0) {
        const lines = ['=== ASISTENCIA HOY ==='];
        for (const m of marcaciones) {
          const hora = new Date(m.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
          lines.push(`- ${m.nombre} (${m.rol}): ${m.tipo} a las ${hora}`);
        }
        parts.push(lines.join('\n'));
      }
    } catch (_) {}
```

- [ ] **Step 2: Commit**

```bash
git add services/knowledge-base.js
git commit -m "feat: inject P&L, food cost, waste, delivery, prices, calendar, attendance into DalIA context"
```

---

## Task 16: Calendario — ruta para gestión de eventos

**Files:**
- Modify: `routes/configuracion.js` (add calendar management endpoints)

- [ ] **Step 1: Add calendar CRUD endpoints**

Add to the end of `routes/configuracion.js` (before `module.exports`):

```javascript
// === CALENDARIO DE EVENTOS ===

// GET /api/configuracion/calendario
router.get('/calendario', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const [eventos] = await db.query(
      `SELECT * FROM calendario_eventos WHERE (tenant_id=? OR tenant_id IS NULL) AND activo=true ORDER BY fecha`,
      [tid]
    );
    res.json(eventos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/configuracion/calendario
router.post('/calendario', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { nombre, tipo, fecha, recurrente, recurrencia_patron, impacto_esperado, notas } = req.body;
    if (!nombre || !tipo || !fecha) return res.status(400).json({ error: 'nombre, tipo y fecha son requeridos' });
    const [result] = await db.query(
      `INSERT INTO calendario_eventos (tenant_id, nombre, tipo, fecha, recurrente, recurrencia_patron, impacto_esperado, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [tid, nombre, tipo, fecha, recurrente || false, recurrencia_patron || null, impacto_esperado || 'medio', notas || null]
    );
    res.status(201).json({ id: result?.insertId || result?.[0]?.id, message: 'Evento creado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/configuracion/calendario/:id
router.delete('/calendario/:id', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    await db.query('UPDATE calendario_eventos SET activo=false WHERE id=? AND tenant_id=?', [req.params.id, tid]);
    res.json({ message: 'Evento desactivado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add routes/configuracion.js
git commit -m "feat: add calendar events CRUD in configuracion routes"
```

---

## Task 17: Recálculo masivo endpoint + producto price trigger

**Files:**
- Modify: `routes/recetas-standalone.js` (add recalculate-all endpoint)
- Modify: `routes/productos.js` (trigger recálculo when price changes)

- [ ] **Step 1: Add recalculate-all endpoint**

Add to `routes/recetas-standalone.js`:

```javascript
// POST /api/recetas-standalone/recalcular-costos — Recalculate all recipe costs
router.post('/recalcular-costos', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { recalcularTodas } = require('../services/costeo-recetas');
    await recalcularTodas(tid);
    res.json({ message: 'Costos recalculados para todas las recetas' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Add costeo trigger to producto price update**

In `routes/productos.js`, in the `PUT /:id` handler, after the historial_precios insert (added in Task 4), add:

```javascript
        // Trigger costeo recalculation for affected recipe
        try {
          const { recalcularPorIngrediente } = require('../services/costeo-recetas');
          const [[receta]] = await db.query(
            'SELECT id FROM recetas WHERE producto_id=? AND tenant_id=? AND activa=true LIMIT 1',
            [req.params.id, tid]
          );
          if (receta) {
            const { recalcularCostoReceta } = require('../services/costeo-recetas');
            await recalcularCostoReceta(tid, receta.id);
          }
        } catch (_) {}
```

- [ ] **Step 3: Commit**

```bash
git add routes/recetas-standalone.js routes/productos.js
git commit -m "feat: add bulk recipe cost recalculation + price change trigger"
```

---

## Task 18: Superadmin — módulos toggle

**Files:**
- Modify: `routes/superadmin.js`

- [ ] **Step 1: Add endpoint to toggle modules per tenant**

Add to `routes/superadmin.js`:

```javascript
// PUT /api/superadmin/tenant/:id/modulos — Toggle modules for a tenant
router.put('/tenant/:id/modulos', async (req, res) => {
  try {
    const { modulos } = req.body; // { "delivery_rappi": true, "sub_recetas": false, ... }
    if (!modulos || typeof modulos !== 'object') {
      return res.status(400).json({ error: 'modulos debe ser un objeto JSON' });
    }
    // Merge with existing
    const [[sub]] = await db.query(
      'SELECT modulos_habilitados FROM tenant_suscripciones WHERE tenant_id=? ORDER BY id DESC LIMIT 1',
      [req.params.id]
    );
    const current = sub?.modulos_habilitados || {};
    const merged = { ...current, ...modulos };
    await db.query(
      'UPDATE tenant_suscripciones SET modulos_habilitados=?::jsonb WHERE tenant_id=?',
      [JSON.stringify(merged), req.params.id]
    );
    res.json({ message: 'Módulos actualizados', modulos: merged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/superadmin/tenant/:id/modulos — Get modules for a tenant
router.get('/tenant/:id/modulos', async (req, res) => {
  try {
    const [[sub]] = await db.query(
      'SELECT modulos_habilitados FROM tenant_suscripciones WHERE tenant_id=? ORDER BY id DESC LIMIT 1',
      [req.params.id]
    );
    res.json(sub?.modulos_habilitados || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add routes/superadmin.js
git commit -m "feat: add superadmin endpoints to toggle modules per tenant"
```

---

## Task 19: Verificación final

- [ ] **Step 1: Verify all migrations run cleanly**

```bash
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes"
node -e "
const m16 = require('./migrations/016_antecedentes_operativos');
const m17 = require('./migrations/017_recetas_v2');
const m18 = require('./migrations/018_delivery');
(async () => {
  await m16.up();
  await m17.up();
  await m18.up();
  console.log('All migrations OK');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
"
```

- [ ] **Step 2: Verify server starts without errors**

```bash
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && timeout 10 node server.js || true
```

Expected: server starts, no require errors, no crash on startup.

- [ ] **Step 3: Verify new routes are accessible**

```bash
curl -s http://localhost:3000/api/delivery/webhook/rappi -X POST -H "Content-Type: application/json" -d '{"test":true}' | head -1
```

Expected: `{"status":"ok"}` (webhook responds immediately)

- [ ] **Step 4: Final commit with all remaining changes**

```bash
git add -A
git status
git commit -m "feat: complete Fase 3 — DalIA antecedentes, recetas v2, delivery integration"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Migration 016: attendance, price history, calendar, config | 1 new |
| 2 | Middleware requireModulo | 1 new |
| 3 | Attendance marcaciones on login/logout | 1 modify |
| 4 | Price history for productos | 1 modify |
| 5 | Price history for ingredientes + costeo trigger | 1 modify |
| 6 | Migration 017: sub-recipes + cost cache | 1 new |
| 7 | Costeo-recetas service | 1 new |
| 8 | Update recetas.js for sub-recipes | 1 modify |
| 9 | Migration 018: delivery tables | 1 new |
| 10 | Delivery core + LlamaFood services | 2 new |
| 11 | Rappi service | 1 new |
| 12 | PedidosYa service | 1 new |
| 13 | Webhook handler | 1 new |
| 14 | Delivery routes + views + server.js | 3 new, 1 modify |
| 15 | DalIA knowledge-base injection | 1 modify |
| 16 | Calendar CRUD endpoints | 1 modify |
| 17 | Recálculo masivo + producto trigger | 2 modify |
| 18 | Superadmin módulos toggle | 1 modify |
| 19 | Verification | — |

**Totals:** 13 new files, 9 modified files, 19 tasks, ~85 steps
