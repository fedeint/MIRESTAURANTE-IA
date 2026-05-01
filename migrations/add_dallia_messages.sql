-- PASO 6: DallIA Chat persistence
-- Run once per environment

CREATE TABLE IF NOT EXISTS dallia_mensajes (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   INTEGER      NOT NULL DEFAULT 1,
  usuario_id  INTEGER,
  role        VARCHAR(10)  NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT         NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dallia_msg_tenant
  ON dallia_mensajes(tenant_id, created_at DESC);
