-- ============================================================
-- Migration: Planes en 3 capas (Licencia + Nube + IA)
--
-- Separa las 3 dimensiones independientes de pricing:
--   1. LICENCIA   → tenant_suscripciones (licencia_*)
--   2. NUBE       → tenant_suscripciones (nube_*)
--   3. IA         → tenant_ai_credentials (plan_tipo)
--
-- Ver docs/IA/planes.md para precios y reglas de negocio.
-- Idempotente. Seguro correr múltiples veces.
-- ============================================================

-- ── 1. LICENCIA (software) ─────────────────────────────────────────────────
ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS licencia_tipo       VARCHAR(20) DEFAULT 'trial';
-- Valores: 'trial' | 'mensual' | 'mensual_sin_nube' | 'anual_bundle' | 'anual_separado' | 'lifetime'

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS licencia_precio_soles DECIMAL(10,2) DEFAULT 0;

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS licencia_fecha_inicio DATE;

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS licencia_fecha_fin    DATE;
-- NULL para lifetime

-- ── 2. NUBE (hosting) ──────────────────────────────────────────────────────
ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS nube_tipo       VARCHAR(20) DEFAULT 'incluida';
-- Valores: 'incluida' (bundled con licencia) | 'mensual' | 'anual'

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS nube_precio_soles DECIMAL(10,2) DEFAULT 0;

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS nube_fecha_inicio DATE;

ALTER TABLE tenant_suscripciones
    ADD COLUMN IF NOT EXISTS nube_fecha_fin    DATE;

-- ── 3. IA — ya existe en tenant_ai_credentials.plan_tipo ───────────────────
-- Valores actuales: 'basico' (= BYOK) | 'premium' | 'trial'
-- Agregamos columna de billing (mensual o anual) para Premium

ALTER TABLE tenant_ai_credentials
    ADD COLUMN IF NOT EXISTS plan_ia_billing VARCHAR(10) DEFAULT 'mensual';
-- Valores: 'mensual' | 'anual' (solo aplica cuando plan_tipo='premium')

ALTER TABLE tenant_ai_credentials
    ADD COLUMN IF NOT EXISTS plan_ia_precio_soles DECIMAL(10,2) DEFAULT 0;

ALTER TABLE tenant_ai_credentials
    ADD COLUMN IF NOT EXISTS plan_ia_fecha_inicio DATE;

ALTER TABLE tenant_ai_credentials
    ADD COLUMN IF NOT EXISTS plan_ia_fecha_fin    DATE;

-- ── 4. Catálogo de precios (fuente única de verdad) ────────────────────────
-- Tabla de referencia para la UI del cotizador y validaciones server-side.

CREATE TABLE IF NOT EXISTS plan_catalogo (
    id               SERIAL PRIMARY KEY,
    capa             VARCHAR(20) NOT NULL,       -- 'licencia' | 'nube' | 'ia'
    codigo           VARCHAR(40) NOT NULL UNIQUE, -- ej 'licencia_mensual_bundle'
    nombre           VARCHAR(100) NOT NULL,
    descripcion      TEXT,
    precio_soles     DECIMAL(10,2) NOT NULL,
    periodo          VARCHAR(20),                -- 'mensual' | 'anual' | 'unico' | 'trial_15d'
    incluye_nube     BOOLEAN DEFAULT FALSE,
    activo           BOOLEAN DEFAULT TRUE,
    orden            INTEGER DEFAULT 0,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);

-- Seeds de precios vigentes (idempotente via codigo UNIQUE)
INSERT INTO plan_catalogo (capa, codigo, nombre, descripcion, precio_soles, periodo, incluye_nube, orden) VALUES
    -- Licencia
    ('licencia', 'licencia_trial',           'Trial 15 días',        'Prueba gratis con nube incluida', 0,    'trial_15d', TRUE, 1),
    ('licencia', 'licencia_mensual_bundle',  'Mensual',              'Licencia + nube mensual',          160,  'mensual',   TRUE, 2),
    ('licencia', 'licencia_mensual_sin_nube','Mensual sin nube',     'Solo licencia, nube aparte',        90,  'mensual',   FALSE, 3),
    ('licencia', 'licencia_anual_bundle',    'Anual BUNDLE (oferta)', 'Licencia + nube anual — ahorra S/ 220', 1700, 'anual',  TRUE, 4),
    ('licencia', 'licencia_anual',           'Anual solo licencia',  'Licencia anual, nube aparte',      1100, 'anual',     FALSE, 5),
    ('licencia', 'licencia_lifetime',        'Lifetime (pago único)','Licencia de por vida, nube aparte', 2700, 'unico',     FALSE, 6),

    -- Nube
    ('nube',     'nube_mensual',             'Nube mensual',         'Hosting y almacenamiento mensual',   70, 'mensual',   FALSE, 1),
    ('nube',     'nube_anual',               'Nube anual',           'Ahorra S/ 140 pagando anual',       700, 'anual',     FALSE, 2),

    -- IA
    ('ia',       'ia_byok',                  'BYOK (tu key)',        'Gratis con tu cuenta de Google AI',   0, 'mensual',   FALSE, 1),
    ('ia',       'ia_premium_mensual',       'Premium IA mensual',   '1 hora voz/día + chat ilimitado',    40, 'mensual',   FALSE, 2),
    ('ia',       'ia_premium_anual',         'Premium IA anual',     'Misma cosa, pagada adelantada (17% off)', 400, 'anual', FALSE, 3)
ON CONFLICT (codigo) DO UPDATE SET
    precio_soles = EXCLUDED.precio_soles,
    descripcion  = EXCLUDED.descripcion,
    updated_at   = NOW();

-- ── 5. Índices de consulta ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_susc_licencia_fin
    ON tenant_suscripciones (licencia_fecha_fin);

CREATE INDEX IF NOT EXISTS idx_susc_nube_fin
    ON tenant_suscripciones (nube_fecha_fin);

CREATE INDEX IF NOT EXISTS idx_plan_catalogo_capa
    ON plan_catalogo (capa, activo, orden);

-- ============================================================
-- Cómo ejecutar:
--   psql $DATABASE_URL -f migrations/add_planes_3_capas.sql
-- O pegar en Supabase SQL Editor.
-- ============================================================
