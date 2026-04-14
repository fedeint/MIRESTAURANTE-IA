// migrations/024_productos_carta_columns.js
// Adds carta/PWA columns to productos used by /setup-sistema, /pedido-nuevo,
// /mesa-cuenta, /para-llevar, /cortesias. Production schema only had the
// legacy codigo/precio_unidad/precio_kg/precio_libra columns.
'use strict';

const db = require('../db');

async function up() {
  await db.query(`
    ALTER TABLE productos
      ADD COLUMN IF NOT EXISTS activo      BOOLEAN       DEFAULT true,
      ADD COLUMN IF NOT EXISTS descripcion TEXT,
      ADD COLUMN IF NOT EXISTS precio      DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS emoji       VARCHAR(10)   DEFAULT '🍽️'
  `);
  // Backfill: if precio is 0/null, copy precio_unidad when present
  await db.query(`
    UPDATE productos
       SET precio = COALESCE(NULLIF(precio, 0), precio_unidad, 0)
     WHERE (precio IS NULL OR precio = 0)
       AND precio_unidad IS NOT NULL
  `).catch(() => {});
  console.log('✅ migration 024: productos.activo/descripcion/precio/emoji added');
}

async function down() {
  await db.query(`
    ALTER TABLE productos
      DROP COLUMN IF EXISTS activo,
      DROP COLUMN IF EXISTS descripcion,
      DROP COLUMN IF EXISTS precio,
      DROP COLUMN IF EXISTS emoji
  `);
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { up, down };
