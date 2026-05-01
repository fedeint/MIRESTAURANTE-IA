-- Migration: add setup progress columns to tenants
-- Run once after deploying PASO 3 (Setup del Sistema)

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS setup_dia1_ok BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_dia2_ok BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_dia3_ok BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_completado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_caja JSONB,
  ADD COLUMN IF NOT EXISTS config_sunat JSONB;
