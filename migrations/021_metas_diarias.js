// migrations/021_metas_diarias.js
// Daily sales goals per tenant.
'use strict';

const db = require('../db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS metas_diarias (
      id          SERIAL PRIMARY KEY,
      tenant_id   INTEGER      NOT NULL,
      tipo        VARCHAR(30)  NOT NULL CHECK (tipo IN ('ventas','pedidos','ticket_promedio')),
      meta_valor  NUMERIC(12,2) NOT NULL DEFAULT 0,
      activa      BOOLEAN      NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, tipo)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_metas_diarias_tenant
      ON metas_diarias (tenant_id)
  `);

  console.log('✅ migration 021_metas_diarias: table created');
}

async function down() {
  await db.query('DROP TABLE IF EXISTS metas_diarias');
}

up().catch(e => { console.error(e); process.exit(1); });
