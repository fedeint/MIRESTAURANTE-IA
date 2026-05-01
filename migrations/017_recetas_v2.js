'use strict';
const db = require('../db');

async function up() {
  // 1. Add sub-recipe support to receta_items
  await db.query(`ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'ingrediente'`);
  await db.query(`ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS sub_receta_id INT DEFAULT NULL`);

  // Make ingrediente_id nullable
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
