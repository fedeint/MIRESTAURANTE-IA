-- 2026-04-08 — Pedidos consolidation: unify mesa + delivery + para_llevar
--
-- Spec: docs/superpowers/specs/2026-04-08-pedidos-consolidation-design.md
-- Plan: docs/superpowers/plans/2026-04-08-pedidos-consolidation.md
--
-- DO NOT RUN IN PRODUCTION UNTIL iter 1.7 lands and QA approves.
-- This migration is idempotent (uses IF NOT EXISTS / IF EXISTS) so it can
-- be retried safely.

BEGIN;

-- ============================================================================
-- 1. Make mesa_id nullable — delivery and para_llevar orders don't have a mesa
-- ============================================================================

ALTER TABLE pedidos ALTER COLUMN mesa_id DROP NOT NULL;

-- ============================================================================
-- 2. Discriminator column: mesa | delivery | para_llevar
-- ============================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo VARCHAR(20);
UPDATE pedidos SET tipo = 'mesa' WHERE tipo IS NULL;
ALTER TABLE pedidos ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE pedidos ALTER COLUMN tipo SET DEFAULT 'mesa';

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_tipo_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_tipo_check
    CHECK (tipo IN ('mesa', 'delivery', 'para_llevar'));

-- ============================================================================
-- 3. Delivery-specific columns (nullable)
-- ============================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion_entrega TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS referencia_entrega TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_telefono VARCHAR(20);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motorizado_id INT REFERENCES usuarios(id);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS hora_estimada_entrega TIMESTAMP;

-- ============================================================================
-- 4. Para-llevar-specific columns (nullable)
-- ============================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_nombre_recojo VARCHAR(100);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS hora_recojo TIMESTAMP;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS listo_para_recojo BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 5. Consistency constraints (tipo implies required fields)
-- ============================================================================

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_mesa_required_for_mesa_type;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_mesa_required_for_mesa_type
    CHECK ((tipo = 'mesa' AND mesa_id IS NOT NULL) OR tipo <> 'mesa');

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_direccion_required_for_delivery;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_direccion_required_for_delivery
    CHECK ((tipo = 'delivery' AND direccion_entrega IS NOT NULL) OR tipo <> 'delivery');

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_nombre_required_for_para_llevar;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_nombre_required_for_para_llevar
    CHECK ((tipo = 'para_llevar' AND cliente_nombre_recojo IS NOT NULL) OR tipo <> 'para_llevar');

-- ============================================================================
-- 6. Indexes for the new query patterns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_tipo_estado ON pedidos(tipo, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_motorizado ON pedidos(motorizado_id) WHERE tipo = 'delivery';
CREATE INDEX IF NOT EXISTS idx_pedidos_hora_recojo ON pedidos(hora_recojo) WHERE tipo = 'para_llevar';

COMMIT;

-- ============================================================================
-- Verification queries (run manually after migration to confirm):
-- ============================================================================
--   SELECT tipo, COUNT(*) FROM pedidos GROUP BY tipo;
--   \d pedidos                                   -- psql: inspect the table structure
--   SELECT conname FROM pg_constraint WHERE conrelid = 'pedidos'::regclass;
-- ============================================================================
