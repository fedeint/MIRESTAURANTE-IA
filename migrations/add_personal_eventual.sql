-- Migration: add_personal_eventual.sql
-- Personal eventual: trabajadores por día/2-3 días/semana/prueba/recurrente
-- Idempotente (IF NOT EXISTS y ADD COLUMN IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS personal_eventual (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER       NOT NULL,
  nombre          VARCHAR(150)  NOT NULL,
  cargo           VARCHAR(100)  DEFAULT 'Ayudante',
  telefono        VARCHAR(20)   NULL,
  tipo_contrato   VARCHAR(20)   NOT NULL DEFAULT 'por_dia',
    -- por_dia | dos_tres_dias | semana | prueba | recurrente
  fecha_inicio    DATE          NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin       DATE          NULL,
  monto_dia       DECIMAL(10,2) NOT NULL DEFAULT 0,
  horas_dia       DECIMAL(4,1)  DEFAULT 8,
  estado          VARCHAR(20)   DEFAULT 'activo',
    -- activo | terminado | promovido
  puntualidad     INTEGER       DEFAULT 100,  -- porcentaje 0-100
  pedidos_dia     INTEGER       DEFAULT 0,
  errores         INTEGER       DEFAULT 0,
  notas           TEXT          NULL,
  activo          BOOLEAN       DEFAULT TRUE,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eventual_tenant
  ON personal_eventual (tenant_id, activo, fecha_inicio DESC);

-- Extend personal table tipo_contrato enum to allow 'eventual'
-- (PostgreSQL requires ALTER TYPE — simpler: just add a column flag)
ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS es_eventual BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eventual_id INTEGER NULL;
