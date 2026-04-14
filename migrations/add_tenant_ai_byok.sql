-- ============================================================
-- Migration: BYOK (Bring Your Own Key) — credenciales IA por tenant
--
-- Cada tenant puede traer su propia API key de Google AI Studio
-- (plan Básico, gratis) o contratar plan Premium donde nosotros
-- ponemos la key maestra con billing activo.
--
-- Idempotente. Seguro correr múltiples veces.
-- ============================================================

-- ── 1. Credenciales IA cifradas por tenant ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_ai_credentials (
    tenant_id                INTEGER     PRIMARY KEY,
    google_ai_key_encrypted  TEXT,                          -- AES-256-GCM base64 blob
    google_ai_key_preview    VARCHAR(20),                   -- ej: "AIza...xxxx" para UI
    google_ai_key_validated  BOOLEAN     DEFAULT FALSE,
    google_ai_key_last_test  TIMESTAMP,
    plan_tipo                VARCHAR(20) DEFAULT 'basico',  -- basico | premium | trial
    voice_minutos_dia        INTEGER     DEFAULT 0,         -- minutos de voz hoy (reset cron diario)
    voice_minutos_mes        INTEGER     DEFAULT 0,
    voice_minutos_limite_dia INTEGER     DEFAULT 0,         -- 0 = basico free tier; 60 = premium
    created_at               TIMESTAMP   DEFAULT NOW(),
    updated_at               TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_cred_plan
    ON tenant_ai_credentials (plan_tipo);

-- ── 2. Agregar plan_tipo a tenant_suscripciones si no existe ───────────────
ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS plan_tipo         VARCHAR(20) DEFAULT 'basico';

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS plan_precio_soles DECIMAL(10,2) DEFAULT 0;

-- Marcar tenants existentes como plan básico por default
UPDATE tenant_suscripciones
   SET plan_tipo = 'basico'
 WHERE plan_tipo IS NULL;

-- ── 3. Log de uso de voz para facturación Premium ──────────────────────────
CREATE TABLE IF NOT EXISTS tenant_voice_usage (
    id            SERIAL PRIMARY KEY,
    tenant_id     INTEGER     NOT NULL,
    tipo          VARCHAR(10) NOT NULL,         -- 'tts' | 'stt'
    duracion_seg  INTEGER     NOT NULL,
    caracteres    INTEGER,                       -- solo para tts
    modelo        VARCHAR(50),
    source_key    VARCHAR(10) DEFAULT 'tenant', -- 'tenant' | 'master' | 'fallback'
    created_at    TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_usage_tenant_fecha
    ON tenant_voice_usage (tenant_id, created_at DESC);

-- ── 4. Eventos de fallback (cuándo saltamos de Gemini a DeepSeek) ──────────
CREATE TABLE IF NOT EXISTS ai_fallback_log (
    id           SERIAL PRIMARY KEY,
    tenant_id    INTEGER     NOT NULL,
    origen       VARCHAR(30) NOT NULL,          -- gemini | deepseek
    destino      VARCHAR(30) NOT NULL,          -- deepseek | kimi | claude
    razon        VARCHAR(100),                  -- quota_exceeded | network | invalid_key
    tipo_call    VARCHAR(20),                   -- chat | tts | stt
    created_at   TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fallback_tenant_fecha
    ON ai_fallback_log (tenant_id, created_at DESC);

-- ============================================================
-- Cómo ejecutar:
--   psql $DATABASE_URL -f migrations/add_tenant_ai_byok.sql
-- O pegar en Supabase SQL Editor.
-- ============================================================
