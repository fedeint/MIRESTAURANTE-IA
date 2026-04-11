// migrations/022_tenant_setup_flag.js
// Adds setup_pwa_completado flag to tenants table.
// Replaces localStorage-only approach so the wizard doesn't
// re-appear on new devices / cleared caches.
'use strict';

const db = require('../db');

async function up() {
  await db.query(`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS setup_pwa_completado BOOLEAN NOT NULL DEFAULT false
  `);
  console.log('✅ migration 022: tenants.setup_pwa_completado added');
}

async function down() {
  await db.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS setup_pwa_completado`);
}

up().catch(e => { console.error(e); process.exit(1); });
