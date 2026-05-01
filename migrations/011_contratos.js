/**
 * 011_contratos.js
 * Creates the contratos table for digital contract management.
 * Run with: node migrations/011_contratos.js
 */

'use strict';

require('dotenv').config();
const { Client } = require('pg');

const client = new Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST || 'db.vfltsjcktxgmqbrzwthn.supabase.co',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE || 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'SUPAAAAAAHHHHCOCACOLA',
        ssl: { rejectUnauthorized: false },
      }
);

async function run(label, sql) {
  try {
    await client.query(sql);
    console.log(`  OK  ${label}`);
  } catch (e) {
    if (e.code === '42P07' || e.code === '42710') {
      // 42P07 = relation already exists, 42710 = object already exists
      console.log(`  SKIP ${label} (already exists)`);
    } else {
      console.error(`  FAIL ${label}: ${e.message}`);
      throw e;
    }
  }
}

async function migrate() {
  await client.connect();
  console.log('Migration 011_contratos starting...\n');

  // Sequence for nro_contrato
  await run('Create sequence contratos_nro_seq',
    `CREATE SEQUENCE IF NOT EXISTS contratos_nro_seq START WITH 1 INCREMENT BY 1`
  );

  // Main table
  await run('Create table contratos', `
    CREATE TABLE IF NOT EXISTS contratos (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      nro_contrato VARCHAR(30) NOT NULL UNIQUE,
      nombre_cliente VARCHAR(200) NOT NULL,
      razon_social VARCHAR(200),
      dni VARCHAR(8) NOT NULL,
      ruc VARCHAR(11),
      email VARCHAR(200),
      telefono VARCHAR(20),
      direccion TEXT,
      nombre_establecimiento VARCHAR(200),
      nombre_representante VARCHAR(200),
      cargo_representante VARCHAR(100),
      dni_representante VARCHAR(8),
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

  // Indexes
  await run('Create index idx_contratos_token',
    `CREATE INDEX IF NOT EXISTS idx_contratos_token ON contratos (token)`
  );

  await run('Create index idx_contratos_estado',
    `CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos (estado)`
  );

  await run('Create index idx_contratos_tenant',
    `CREATE INDEX IF NOT EXISTS idx_contratos_tenant ON contratos (tenant_id)`
  );

  console.log('\nMigration 011_contratos complete.');
  await client.end();
}

migrate().catch(async (err) => {
  console.error('\nMigration failed:', err.message);
  await client.end();
  process.exit(1);
});
