// migrations/020_login_attempts.js
// DB-backed brute force lockout table.
// Replaces the in-memory loginAttempts map in routes/auth.js
// so lockout works across multiple Vercel instances.
'use strict';

const db = require('../db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key  VARCHAR(300) PRIMARY KEY,
      attempts     INTEGER      NOT NULL DEFAULT 0,
      last_attempt TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      locked_until TIMESTAMPTZ
    )
  `);

  // Index for cleanup cron (delete expired rows)
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until
      ON login_attempts (locked_until)
  `);

  console.log('✅ migration 020_login_attempts: table created');
}

async function down() {
  await db.query('DROP TABLE IF EXISTS login_attempts');
  console.log('↩️  migration 020_login_attempts: table dropped');
}

up().catch(e => { console.error(e); process.exit(1); });
