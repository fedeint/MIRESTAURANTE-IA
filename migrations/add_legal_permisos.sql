-- Migration: add_legal_permisos.sql
-- Permisos legales del restaurante + extensiones libro_reclamaciones
-- Run once; IF NOT EXISTS guards make it idempotent

-- Permisos y documentos legales del negocio
CREATE TABLE IF NOT EXISTS permisos_legales (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER      NOT NULL,
  nombre            VARCHAR(150) NOT NULL,
  descripcion       TEXT,
  categoria         VARCHAR(50)  DEFAULT 'general',
  empleado_id       INTEGER      NULL,       -- para carnets individuales
  empleado_nombre   VARCHAR(150) NULL,
  proveedor         VARCHAR(150) NULL,
  fecha_emision     DATE         NULL,
  fecha_vencimiento DATE         NULL,
  archivo_url       TEXT         NULL,
  notas             TEXT         NULL,
  activo            BOOLEAN      DEFAULT TRUE,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_permisos_tenant
  ON permisos_legales (tenant_id, activo, fecha_vencimiento);

-- Agregar tenant_id a libro_reclamaciones si no existe
ALTER TABLE libro_reclamaciones
  ADD COLUMN IF NOT EXISTS tenant_id     INTEGER  NULL,
  ADD COLUMN IF NOT EXISTS atendido_por  INTEGER  NULL,   -- usuario_id que responde
  ADD COLUMN IF NOT EXISTS notas_internas TEXT     NULL;

CREATE INDEX IF NOT EXISTS idx_libro_reclamos_tenant
  ON libro_reclamaciones (tenant_id, estado, created_at DESC);
