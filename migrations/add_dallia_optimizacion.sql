-- ============================================================
-- Migration: DalIA Optimización — FAQ cache + tracking enriquecido
-- Agrega:
--   1) Tabla dallia_faq_cache (cache de respuestas por tenant)
--   2) Columnas en token_consumo para visibilidad y ahorro
--   3) Tabla tenant_dallia_automatizaciones (toggles on/off)
--
-- Idempotente — seguro ejecutar múltiples veces.
-- ============================================================

-- ── 1. FAQ Cache ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dallia_faq_cache (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER      NOT NULL,
    question_hash   VARCHAR(64)  NOT NULL,
    question_text   TEXT         NOT NULL,
    respuesta       TEXT         NOT NULL,
    categoria       VARCHAR(30)  DEFAULT 'general',
    modelo          VARCHAR(50),
    tokens_originales INTEGER    DEFAULT 0,
    hits            INTEGER      DEFAULT 0,
    created_at      TIMESTAMP    DEFAULT NOW(),
    last_hit_at     TIMESTAMP,
    expires_at      TIMESTAMP    DEFAULT (NOW() + INTERVAL '7 days'),
    UNIQUE (tenant_id, question_hash)
);

CREATE INDEX IF NOT EXISTS idx_faq_cache_tenant_hash
    ON dallia_faq_cache (tenant_id, question_hash);

CREATE INDEX IF NOT EXISTS idx_faq_cache_expires
    ON dallia_faq_cache (expires_at);

-- ── 2. Tracking enriquecido en token_consumo ────────────────────────────────
ALTER TABLE token_consumo
    ADD COLUMN IF NOT EXISTS pregunta_texto   TEXT;

ALTER TABLE token_consumo
    ADD COLUMN IF NOT EXISTS categoria        VARCHAR(30);

ALTER TABLE token_consumo
    ADD COLUMN IF NOT EXISTS cache_hit        BOOLEAN DEFAULT FALSE;

ALTER TABLE token_consumo
    ADD COLUMN IF NOT EXISTS tokens_ahorrados INTEGER DEFAULT 0;

ALTER TABLE token_consumo
    ADD COLUMN IF NOT EXISTS costo_estimado_usd DECIMAL(10,6) DEFAULT 0;

-- Índices de consulta por panel
CREATE INDEX IF NOT EXISTS idx_token_consumo_tenant_tipo
    ON token_consumo (tenant_id, tipo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_consumo_pregunta
    ON token_consumo (tenant_id, pregunta_texto);

-- Expandir tipos permitidos (antes solo 'chat')
-- Valores: chat, action, resumen_dia, vencimiento, recordatorio_caja,
--          meta_alcanzada, onboarding, sostac

-- ── 3. Automatizaciones por tenant ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_dallia_automatizaciones (
    tenant_id                   INTEGER   PRIMARY KEY,
    resumen_diario_activo       BOOLEAN   DEFAULT FALSE,
    resumen_diario_hora         TIME      DEFAULT '23:00',
    vencimiento_activo          BOOLEAN   DEFAULT TRUE,
    recordatorio_caja_activo    BOOLEAN   DEFAULT TRUE,
    meta_alcanzada_activo       BOOLEAN   DEFAULT TRUE,
    enviar_pedido_auto          BOOLEAN   DEFAULT FALSE,
    notificaciones_whatsapp     BOOLEAN   DEFAULT FALSE,
    updated_at                  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Cómo ejecutar:
--   psql $DATABASE_URL -f migrations/add_dallia_optimizacion.sql
-- O pegar en Supabase SQL Editor.
-- ============================================================
