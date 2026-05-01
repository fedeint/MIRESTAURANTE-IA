-- PASO 5: Mesa Abierta + Para Llevar + Cortesías
-- Run once against the target database

-- 1. Add ronda tracking to pedido_items
ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS ronda_num INT DEFAULT 1;

-- 2. Cortesías table
CREATE TABLE IF NOT EXISTS cortesias (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER       NOT NULL DEFAULT 1,
  tipo            VARCHAR(20)   NOT NULL DEFAULT 'cliente',  -- cliente|staff|prueba
  motivo          TEXT          NOT NULL,
  producto_id     INTEGER       REFERENCES productos(id),
  producto_nombre VARCHAR(150),
  costo_insumos   DECIMAL(10,2) DEFAULT 0,
  autorizado_por  VARCHAR(100),
  usuario_id      INTEGER,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- 3. Config cortesías (límite diario) on tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS cortesias_limite_diario INT DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cortesias_limite_monto DECIMAL(10,2) DEFAULT 50;

-- 4. Virtual mesa for Para Llevar (one per tenant is fine, created dynamically from app)
-- No SQL needed here — the route does INSERT ... ON CONFLICT DO NOTHING
