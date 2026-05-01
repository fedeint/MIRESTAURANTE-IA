-- migrations/add_onboarding_trial.sql
-- Onboarding interactivo con Google Auth y trial de 5 días

-- 1. Columnas Google Auth en usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_email VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_avatar TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local';

-- 2. Columnas trial + ubicación en tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS estado_trial VARCHAR(20) DEFAULT 'pendiente';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_inicio TIMESTAMP;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_fin TIMESTAMP;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS latitud DECIMAL(10,8);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS longitud DECIMAL(11,8);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS distrito VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS departamento VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS num_mesas INTEGER;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS num_trabajadores INTEGER;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS antiguedad VARCHAR(20);

-- 3. Tabla solicitudes_registro
CREATE TABLE IF NOT EXISTS solicitudes_registro (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER REFERENCES tenants(id),
  usuario_id      INTEGER REFERENCES usuarios(id),
  estado          VARCHAR(20) DEFAULT 'pendiente',
  fotos           JSONB,
  video_url       TEXT,
  video_duracion  INTEGER,
  motivo_rechazo  TEXT,
  intento         INTEGER DEFAULT 1,
  revisado_por    INTEGER REFERENCES usuarios(id),
  revisado_at     TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_registro(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_tenant ON solicitudes_registro(tenant_id);

-- 4. Tabla google_emails_bloqueados
CREATE TABLE IF NOT EXISTS google_emails_bloqueados (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) UNIQUE NOT NULL,
  motivo      TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
