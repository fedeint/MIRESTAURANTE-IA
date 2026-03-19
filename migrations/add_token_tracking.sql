-- ============================================================
-- Migration: DalIA Token Tracking
-- Run once against your PostgreSQL database (Supabase or local)
-- ============================================================

-- Add token quota columns to tenant subscriptions
ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS tokens_total     INTEGER DEFAULT 2000000;

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS tokens_consumidos INTEGER DEFAULT 0;

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS tokens_reset_fecha DATE;

-- Set initial reset date for all existing active subscriptions
UPDATE tenant_suscripciones
   SET tokens_reset_fecha = CURRENT_DATE
 WHERE tokens_reset_fecha IS NULL;

-- Token consumption log table
CREATE TABLE IF NOT EXISTS token_consumo (
    id           SERIAL PRIMARY KEY,
    tenant_id    INTEGER    NOT NULL,
    usuario_id   INTEGER,
    tipo         VARCHAR(20) DEFAULT 'chat',
    tokens_usados INTEGER    NOT NULL,
    modelo       VARCHAR(50),
    created_at   TIMESTAMP  DEFAULT NOW()
);

-- Index for fast per-tenant queries
CREATE INDEX IF NOT EXISTS idx_token_consumo_tenant
    ON token_consumo (tenant_id, created_at DESC);

-- ============================================================
-- How to run:
--   psql $DATABASE_URL -f migrations/add_token_tracking.sql
-- Or paste the contents directly into Supabase SQL editor.
-- ============================================================
