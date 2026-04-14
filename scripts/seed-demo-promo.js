// ⚠️ SCRIPT DE DESARROLLO — NO EJECUTAR EN PRODUCCIÓN
// scripts/seed-demo-promo.js
// Seed a demo promo code "DEMO20" (20% off) for the demo tenant.
// Idempotent: no-op if the code already exists.
//
// USAGE: node -r dotenv/config scripts/seed-demo-promo.js dotenv_config_path=/tmp/prod.env

'use strict';
const db = require('../db');

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force-prod')) {
  console.error('❌ Este script está bloqueado en producción. Pasa --force-prod si realmente sabes lo que haces.');
  process.exit(1);
}

const TENANT_ID = 1;

async function seed() {
  const [[existing]] = await db.query(
    `SELECT id FROM promociones WHERE tenant_id = ? AND codigo_cupon = 'DEMO20'`,
    [TENANT_ID]
  );

  if (existing) {
    console.log(`Promo DEMO20 ya existe (id=${existing.id}). Nada que hacer.`);
    process.exit(0);
  }

  await db.query(
    `INSERT INTO promociones
       (tenant_id, nombre, tipo, valor, codigo_cupon, activa, usos_maximo, usos_actual)
     VALUES (?, ?, ?, ?, ?, true, 100, 0)`,
    [TENANT_ID, 'Demo 20% off', 'porcentaje', 20, 'DEMO20']
  );

  console.log('✅ Promo DEMO20 creada (20% off, 100 usos máximos).');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
