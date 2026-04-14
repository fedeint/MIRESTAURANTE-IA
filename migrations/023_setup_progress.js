// migrations/023_setup_progress.js
// Adds setup progress columns to tenants table used by /setup-sistema.
// Replaces the manual migrations/add_setup_progress.sql so the columns
// are guaranteed to exist in every environment.
'use strict';

const db = require('../db');

async function up() {
  await db.query(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS setup_dia1_ok    BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS setup_dia2_ok    BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS setup_dia3_ok    BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS setup_completado BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS config_caja      JSONB,
      ADD COLUMN IF NOT EXISTS config_sunat     JSONB
  `);
  console.log('✅ migration 023: tenants.setup_* + config_caja/config_sunat added');
}

async function down() {
  await db.query(`
    ALTER TABLE tenants
      DROP COLUMN IF EXISTS setup_dia1_ok,
      DROP COLUMN IF EXISTS setup_dia2_ok,
      DROP COLUMN IF EXISTS setup_dia3_ok,
      DROP COLUMN IF EXISTS setup_completado,
      DROP COLUMN IF EXISTS config_caja,
      DROP COLUMN IF EXISTS config_sunat
  `);
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { up, down };
