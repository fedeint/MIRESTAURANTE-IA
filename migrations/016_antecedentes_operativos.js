'use strict';
const db = require('../db');

async function up() {
  // 1. Asistencia marcaciones
  await db.query(`
    CREATE TABLE IF NOT EXISTS asistencia_marcaciones (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      usuario_id INT NOT NULL,
      tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address VARCHAR(45),
      user_agent TEXT,
      metodo VARCHAR(20) DEFAULT 'auto_session',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_asistencia_tenant_fecha ON asistencia_marcaciones(tenant_id, timestamp)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_asistencia_usuario ON asistencia_marcaciones(usuario_id, timestamp)`);

  // 2. Asistencia resumen diario
  await db.query(`
    CREATE TABLE IF NOT EXISTS asistencia_resumen_diario (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      usuario_id INT NOT NULL,
      fecha DATE NOT NULL,
      hora_entrada TIME,
      hora_salida TIME,
      horas_trabajadas DECIMAL(5,2),
      horas_extra DECIMAL(5,2) DEFAULT 0,
      costo_hora DECIMAL(10,2),
      costo_total DECIMAL(10,2),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, usuario_id, fecha)
    )
  `);

  // 3. Historial de precios
  await db.query(`
    CREATE TABLE IF NOT EXISTS historial_precios (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      entidad_tipo VARCHAR(20) NOT NULL CHECK (entidad_tipo IN ('producto', 'ingrediente')),
      entidad_id INT NOT NULL,
      precio_anterior DECIMAL(10,2) NOT NULL,
      precio_nuevo DECIMAL(10,2) NOT NULL,
      campo VARCHAR(30) NOT NULL,
      usuario_id INT,
      motivo TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_historial_precios_entidad ON historial_precios(tenant_id, entidad_tipo, entidad_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_historial_precios_fecha ON historial_precios(created_at)`);

  // 4. Calendario de eventos
  await db.query(`
    CREATE TABLE IF NOT EXISTS calendario_eventos (
      id SERIAL PRIMARY KEY,
      tenant_id INT DEFAULT NULL,
      nombre VARCHAR(150) NOT NULL,
      tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('feriado', 'evento_local', 'deportivo', 'promocion_interna', 'custom')),
      fecha DATE NOT NULL,
      recurrente BOOLEAN DEFAULT false,
      recurrencia_patron VARCHAR(30) CHECK (recurrencia_patron IN ('anual', 'mensual', 'semanal')),
      impacto_esperado VARCHAR(20) DEFAULT 'medio' CHECK (impacto_esperado IN ('alto', 'medio', 'bajo', 'negativo')),
      notas TEXT,
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_calendario_fecha ON calendario_eventos(fecha)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_calendario_tenant ON calendario_eventos(tenant_id)`);

  // 5. Seed feriados peruanos (tenant_id NULL = global)
  const feriados = [
    ['Año Nuevo', '2026-01-01', 'bajo'],
    ['Jueves Santo', '2026-04-02', 'alto'],
    ['Viernes Santo', '2026-04-03', 'alto'],
    ['Día del Trabajo', '2026-05-01', 'medio'],
    ['Batalla de Arica', '2026-06-07', 'bajo'],
    ['Fiestas Patrias', '2026-07-28', 'alto'],
    ['Fiestas Patrias', '2026-07-29', 'alto'],
    ['Santa Rosa de Lima', '2026-08-30', 'medio'],
    ['Combate de Angamos', '2026-10-08', 'bajo'],
    ['Todos los Santos', '2026-11-01', 'medio'],
    ['Inmaculada Concepción', '2026-12-08', 'medio'],
    ['Navidad', '2026-12-25', 'alto'],
    ['Nochevieja', '2026-12-31', 'alto']
  ];
  for (const [nombre, fecha, impacto] of feriados) {
    await db.query(
      `INSERT INTO calendario_eventos (tenant_id, nombre, tipo, fecha, recurrente, recurrencia_patron, impacto_esperado)
       SELECT NULL, ?, 'feriado', ?, true, 'anual', ?
       WHERE NOT EXISTS (SELECT 1 FROM calendario_eventos WHERE nombre=? AND fecha=? AND tenant_id IS NULL)`,
      [nombre, fecha, impacto, nombre, fecha]
    );
  }

  // 6. Campos de configuración
  await db.query(`ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS merma_objetivo_pct DECIMAL(5,2) DEFAULT 3.00`);
  await db.query(`ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS horas_jornada_estandar INT DEFAULT 8`);
  await db.query(`ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS umbral_horas_extra DECIMAL(5,2) DEFAULT 8.00`);

  // 7. Feature flags en tenant_suscripciones
  await db.query(`ALTER TABLE tenant_suscripciones ADD COLUMN IF NOT EXISTS modulos_habilitados JSONB DEFAULT '{"asistencia":true,"historial_precios":true,"calendario_eventos":true,"sub_recetas":true,"costeo_automatico":true,"delivery_rappi":false,"delivery_pedidosya":false,"delivery_llamafood":false}'`);

  // 8. Módulos en contratos
  await db.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS modulos_contratados JSONB DEFAULT '[]'`);
  await db.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS modulos_precio JSONB DEFAULT '{}'`);

  console.log('Migration 016_antecedentes_operativos: OK');
}

module.exports = { up };
