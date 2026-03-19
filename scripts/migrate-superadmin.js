/**
 * migrate-superadmin.js
 * Adds superadmin role to the enum, ensures tenant columns exist,
 * and creates the default superadmin user.
 * Run with: node scripts/migrate-superadmin.js
 */

'use strict';

require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

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

async function run(label, sql, params = []) {
  try {
    await client.query(sql, params);
    console.log(`  OK  ${label}`);
  } catch (err) {
    if (
      err.code === '42710' ||
      err.code === '42P07' ||
      err.message.includes('already exists')
    ) {
      console.log(`  --  ${label} (already exists, skipped)`);
    } else {
      console.error(`  ERR ${label}: ${err.message}`);
      throw err;
    }
  }
}

async function main() {
  console.log('=============================================================');
  console.log('  Superadmin Migration                                       ');
  console.log('=============================================================');

  await client.connect();
  console.log('Connected.\n');

  // 1. Add 'superadmin' to rol_usuario_enum
  // ALTER TYPE ... ADD VALUE is idempotent in PG 14+ with IF NOT EXISTS
  try {
    await client.query(`ALTER TYPE rol_usuario_enum ADD VALUE IF NOT EXISTS 'superadmin'`);
    console.log('  OK  rol_usuario_enum += superadmin');
  } catch (err) {
    // PG < 14 does not support IF NOT EXISTS on ADD VALUE; check manually
    if (err.message.includes('already exists') || err.message.includes('invalid input')) {
      console.log('  --  rol_usuario_enum += superadmin (already exists)');
    } else {
      console.error('  ERR rol_usuario_enum:', err.message);
      throw err;
    }
  }

  // Commit the transaction so the new enum value is visible for subsequent DDL
  // (ALTER TYPE is transactional in PG but the value is only usable after commit)
  await client.query('COMMIT').catch(() => {});

  // 2. Add modulos_habilitados JSONB column to tenants if not exists
  try {
    await client.query(`ALTER TABLE tenants ADD COLUMN modulos_habilitados JSONB NULL`);
    console.log('  OK  tenants.modulos_habilitados (added)');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('  --  tenants.modulos_habilitados (already exists)');
    } else {
      console.error('  ERR tenants.modulos_habilitados:', err.message);
      throw err;
    }
  }

  // 3. activo column on tenants (already in schema as BOOLEAN DEFAULT TRUE, but ensure it)
  try {
    await client.query(`ALTER TABLE tenants ADD COLUMN activo BOOLEAN DEFAULT TRUE`);
    console.log('  OK  tenants.activo (added)');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('  --  tenants.activo (already exists)');
    } else {
      console.error('  ERR tenants.activo:', err.message);
      throw err;
    }
  }

  // 4. Create superadmin user
  const superadminPassword = 'Super2026!';
  const hash = await bcrypt.hash(superadminPassword, 10);

  const existing = await client.query(`SELECT id FROM usuarios WHERE usuario = 'superadmin' LIMIT 1`);
  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO usuarios (usuario, nombre, password_hash, rol, activo, tenant_id)
       VALUES ($1, $2, $3, 'superadmin', true, 1)`,
      ['superadmin', 'Super Administrador', hash]
    );
    console.log('  OK  superadmin user created (usuario=superadmin, password=Super2026!)');
  } else {
    // Update password in case it was different
    await client.query(
      `UPDATE usuarios SET password_hash = $1, rol = 'superadmin', activo = true, nombre = 'Super Administrador' WHERE usuario = 'superadmin'`,
      [hash]
    );
    console.log('  --  superadmin user already exists (password updated)');
  }

  console.log('\n=============================================================');
  console.log('  Migration completed.');
  console.log('  Login: usuario=superadmin  password=Super2026!');
  console.log('  Panel: /superadmin');
  console.log('=============================================================\n');

  await client.end();
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
