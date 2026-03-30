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
  if (_depth > 3) return;

  const [[receta]] = await db.query(
    'SELECT id, producto_id, rendimiento_porciones FROM recetas WHERE id = ? AND tenant_id = ?',
    [recetaId, tenantId]
  );
  if (!receta) return;

  const ingredientes = await explotarIngredientes(recetaId);

  const [[subCheck]] = await db.query(
    `SELECT COUNT(*) as cnt FROM receta_items WHERE receta_id = ? AND tipo = 'sub_receta'`,
    [recetaId]
  );
  const tieneSub = Number(subCheck?.cnt || 0) > 0;

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

  let precioVenta = 0;
  if (receta.producto_id) {
    const [[prod]] = await db.query('SELECT precio_unidad FROM productos WHERE id = ?', [receta.producto_id]);
    precioVenta = Number(prod?.precio_unidad || 0);
  }

  const rendimiento = Math.max(Number(receta.rendimiento_porciones) || 1, 1);
  const costoPorcion = costoTotal / rendimiento;
  const foodCostPct = precioVenta > 0 ? (costoPorcion / precioVenta) * 100 : 0;
  const margen = precioVenta - costoPorcion;

  await db.query(`
    INSERT INTO receta_costos_cache (tenant_id, receta_id, costo_total, costo_por_porcion, food_cost_pct, precio_venta, margen_contribucion, ingredientes_detalle, tiene_sub_recetas, actualizado_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, NOW())
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
