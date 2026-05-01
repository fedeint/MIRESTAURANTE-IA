-- Migration: add_sprint4.sql
-- Sprint 4: Mantenimiento + Eventos + Gastos Fijos + Fidelidad + Promociones + Propinas
-- Run once; IF NOT EXISTS guards make it idempotent

-- ── Mantenimiento de equipos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mantenimiento_equipos (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INTEGER      NOT NULL,
  nombre              VARCHAR(150) NOT NULL,
  descripcion         TEXT,
  periodicidad_dias   INTEGER      DEFAULT 30,
  ultimo_mantenimiento DATE        NULL,
  proximo_mantenimiento DATE       NULL,
  proveedor           VARCHAR(150) NULL,
  costo_estimado      DECIMAL(10,2) NULL,
  notas               TEXT         NULL,
  activo              BOOLEAN      DEFAULT TRUE,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mant_tenant ON mantenimiento_equipos (tenant_id, activo, proximo_mantenimiento);

-- ── Eventos / Catering ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eventos (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER         NOT NULL,
  nombre        VARCHAR(200)    NOT NULL,
  fecha         DATE            NOT NULL,
  hora_inicio   VARCHAR(5)      NULL,
  personas      INTEGER         DEFAULT 1,
  presupuesto   DECIMAL(10,2)   NULL,
  menu_descripcion TEXT         NULL,
  notas_insumos TEXT            NULL,
  estado        VARCHAR(20)     DEFAULT 'confirmado',
  activo        BOOLEAN         DEFAULT TRUE,
  created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_eventos_tenant ON eventos (tenant_id, activo, fecha);

-- ── Gastos fijos mensuales ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gastos_fijos (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER         NOT NULL,
  nombre      VARCHAR(150)    NOT NULL,
  icono       VARCHAR(10)     DEFAULT '💳',
  monto       DECIMAL(10,2)   NOT NULL,
  dia_vence   INTEGER         NULL,   -- día del mes que vence (1-31)
  categoria   VARCHAR(50)     DEFAULT 'general',
  activo      BOOLEAN         DEFAULT TRUE,
  created_at  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gastos_tenant ON gastos_fijos (tenant_id, activo);

-- ── Fidelidad ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fidelidad_clientes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER         NOT NULL,
  nombre      VARCHAR(150)    NOT NULL,
  telefono    VARCHAR(20)     NULL,
  email       VARCHAR(200)    NULL,
  puntos      INTEGER         DEFAULT 0,
  visitas     INTEGER         DEFAULT 0,
  activo      BOOLEAN         DEFAULT TRUE,
  created_at  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  ultimo_visita TIMESTAMP     NULL,
  UNIQUE (tenant_id, telefono)
);
CREATE INDEX IF NOT EXISTS idx_fidel_tenant ON fidelidad_clientes (tenant_id, puntos DESC);

CREATE TABLE IF NOT EXISTS fidelidad_movimientos (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER      NOT NULL,
  cliente_id    INTEGER      NOT NULL REFERENCES fidelidad_clientes(id),
  tipo          VARCHAR(10)  NOT NULL CHECK (tipo IN ('acumulo','canje')),
  puntos        INTEGER      NOT NULL,
  referencia    VARCHAR(100) NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fidelidad_config (
  id                    SERIAL PRIMARY KEY,
  tenant_id             INTEGER        NOT NULL UNIQUE,
  puntos_por_sol        DECIMAL(5,2)   DEFAULT 1.0,
  puntos_canje_minimo   INTEGER        DEFAULT 100,
  sol_por_canje         DECIMAL(5,2)   DEFAULT 1.0,
  activo                BOOLEAN        DEFAULT TRUE,
  updated_at            TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

-- ── Promociones ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promociones (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER         NOT NULL,
  codigo          VARCHAR(50)     NOT NULL,
  descuento       DECIMAL(5,2)    NOT NULL,
  tipo_descuento  VARCHAR(20)     DEFAULT 'porcentaje',
  origen          VARCHAR(50)     NULL,
  aplica_en       TEXT[]          DEFAULT ARRAY['salon'],
  fecha_inicio    DATE            NULL,
  fecha_fin       DATE            NULL,
  usos_max        INTEGER         NULL,
  usos_por_cliente INTEGER        DEFAULT 1,
  usos_actuales   INTEGER         DEFAULT 0,
  monto_vendido   DECIMAL(10,2)   DEFAULT 0,
  monto_descuento DECIMAL(10,2)   DEFAULT 0,
  activo          BOOLEAN         DEFAULT TRUE,
  created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_promos_tenant ON promociones (tenant_id, activo);

-- ── Propinas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS propinas_config (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER      NOT NULL UNIQUE,
  modo_reparto    VARCHAR(20)  DEFAULT 'partes_iguales',
  porcentajes     TEXT[]       DEFAULT ARRAY['5','10','15'],
  metodo          VARCHAR(20)  DEFAULT 'incluida',
  updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Agregar propina_mesero_id a facturas si no existe
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS propina_metodo VARCHAR(20) NULL;
