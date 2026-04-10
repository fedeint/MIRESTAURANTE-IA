/**
 * 012_nda_equipo.js
 * Creates the nda_equipo table for team NDA management.
 * Run with: node migrations/012_nda_equipo.js
 */

'use strict';

require('dotenv').config();
const { Client } = require('pg');

const client = new Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE || 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
      }
);

async function run(label, sql) {
  try {
    await client.query(sql);
    console.log(`  OK  ${label}`);
  } catch (e) {
    if (e.code === '42P07' || e.code === '42710') {
      console.log(`  SKIP ${label} (already exists)`);
    } else {
      console.error(`  FAIL ${label}: ${e.message}`);
      throw e;
    }
  }
}

async function migrate() {
  await client.connect();
  console.log('Migration 012_nda_equipo starting...\n');

  await run('Create sequence nda_equipo_nro_seq',
    `CREATE SEQUENCE IF NOT EXISTS nda_equipo_nro_seq START WITH 1 INCREMENT BY 1`
  );

  await run('Create table nda_equipo', `
    CREATE TABLE IF NOT EXISTS nda_equipo (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      nro_nda VARCHAR(30) NOT NULL UNIQUE,
      nombre_completo VARCHAR(200) NOT NULL,
      dni VARCHAR(15) NOT NULL,
      email VARCHAR(200),
      telefono VARCHAR(20),
      cargo VARCHAR(200),
      area VARCHAR(200),
      pdf_original BYTEA NOT NULL,
      pdf_hash VARCHAR(64) NOT NULL,
      pdf_firmado BYTEA,
      firma_png BYTEA,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'firmado', 'expirado')),
      token_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
      firmado_ip VARCHAR(45),
      firmado_user_agent TEXT,
      firmado_at TIMESTAMP WITH TIME ZONE,
      email_enviado_at TIMESTAMP WITH TIME ZONE,
      created_by INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await run('Create index idx_nda_equipo_token',
    `CREATE INDEX IF NOT EXISTS idx_nda_equipo_token ON nda_equipo (token)`
  );

  await run('Create index idx_nda_equipo_estado',
    `CREATE INDEX IF NOT EXISTS idx_nda_equipo_estado ON nda_equipo (estado)`
  );

  await run('Create index idx_nda_equipo_tenant',
    `CREATE INDEX IF NOT EXISTS idx_nda_equipo_tenant ON nda_equipo (tenant_id)`
  );

  console.log('\nMigration 012_nda_equipo complete.');
  await client.end();
}

migrate().catch(async (err) => {
  console.error('\nMigration failed:', err.message);
  await client.end();
  process.exit(1);
});
