'use strict';
const db = require('../db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS vault_items (
      id         SERIAL PRIMARY KEY,
      categoria  VARCHAR(50)  NOT NULL DEFAULT 'otros',
      titulo     VARCHAR(255) NOT NULL,
      usuario    VARCHAR(255),
      encrypted  TEXT         NOT NULL,
      url        VARCHAR(500),
      notas      TEXT,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_vault_categoria ON vault_items(categoria)
  `);
}

module.exports = { up };
