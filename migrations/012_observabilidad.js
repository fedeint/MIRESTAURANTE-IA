/**
 * 012_observabilidad.js
 * Creates observability tables: usage tracking, KPI snapshots, alerts,
 * IP security, request counting (UNLOGGED), session geo, and performance indexes.
 */

exports.up = async function(knex) {
  // 1. modulo_usage — per-module daily hit counters
  await knex.schema.createTable('modulo_usage', t => {
    t.increments('id');
    t.integer('tenant_id').unsigned().notNullable();
    t.string('modulo', 50).notNullable();
    t.date('fecha').notNullable();
    t.integer('hits').defaultTo(1);
    t.unique(['tenant_id', 'modulo', 'fecha']);
  });

  // 2. kpi_snapshots — cached KPI calculations
  await knex.schema.createTable('kpi_snapshots', t => {
    t.increments('id');
    t.string('tipo', 50).notNullable().unique();
    t.jsonb('datos').nullable();
    t.timestamp('calculado_en').defaultTo(knex.fn.now());
  });

  // 3. alertas_estado — runtime state of each alert rule
  await knex.schema.createTable('alertas_estado', t => {
    t.increments('id');
    t.string('regla', 80).notNullable().unique();
    t.timestamp('ultimo_envio').nullable();
    t.integer('conteo').defaultTo(0);
    t.timestamp('silenciado_hasta').nullable();
  });

  // 4. alertas_configuracion — alert rule definitions
  await knex.schema.createTable('alertas_configuracion', t => {
    t.increments('id');
    t.string('regla', 80).notNullable().unique();
    t.jsonb('umbral').nullable();
    t.string('severidad', 20).defaultTo('media');
    t.string('canal', 30).defaultTo('email');
    t.boolean('activa').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 5. ip_blacklist — blocked IPs
  await knex.schema.createTable('ip_blacklist', t => {
    t.increments('id');
    t.string('ip', 45).notNullable().unique();
    t.string('razon', 200).nullable();
    t.string('tipo', 30).defaultTo('auto');
    t.timestamp('bloqueado_en').defaultTo(knex.fn.now());
    t.timestamp('expira_en').nullable();
    t.integer('hits_bloqueados').defaultTo(0);
  });

  // 6. ip_whitelist — trusted IPs
  await knex.schema.createTable('ip_whitelist', t => {
    t.increments('id');
    t.string('ip', 45).notNullable().unique();
    t.string('descripcion', 200).nullable();
    t.timestamp('agregado_en').defaultTo(knex.fn.now());
  });

  // 7. ataques_log — attack event log
  await knex.schema.createTable('ataques_log', t => {
    t.increments('id');
    t.string('ip', 45).notNullable();
    t.string('tipo', 50).notNullable();
    t.string('ruta', 200).nullable();
    t.integer('requests_por_minuto').nullable();
    t.string('geo_pais', 100).nullable();
    t.string('geo_ciudad', 100).nullable();
    t.decimal('geo_lat', 10, 7).nullable();
    t.decimal('geo_lon', 10, 7).nullable();
    t.string('accion_tomada', 50).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 8. request_counts — UNLOGGED (ephemeral, no WAL)
  await knex.raw(`
    CREATE UNLOGGED TABLE IF NOT EXISTS request_counts (
      id BIGSERIAL PRIMARY KEY,
      ip VARCHAR(45) NOT NULL,
      ruta VARCHAR(300),
      status_code SMALLINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 9. session_geo — geographic session tracking
  await knex.schema.createTable('session_geo', t => {
    t.increments('id');
    t.string('session_id', 128).notNullable().unique();
    t.integer('tenant_id').unsigned().nullable();
    t.integer('usuario_id').unsigned().nullable();
    t.string('ip', 45).nullable();
    t.string('pais', 5).nullable();
    t.string('ciudad', 100).nullable();
    t.decimal('lat', 10, 7).nullable();
    t.decimal('lon', 10, 7).nullable();
    t.timestamp('last_seen').defaultTo(knex.fn.now());
  });

  // 10. ALTER tenants — add geo columns
  try {
    await knex.raw(`ALTER TABLE tenants ADD COLUMN geo_lat DECIMAL(10,7)`);
  } catch (_) { /* column may already exist */ }
  try {
    await knex.raw(`ALTER TABLE tenants ADD COLUMN geo_lon DECIMAL(10,7)`);
  } catch (_) { /* column may already exist */ }

  // 11. Performance indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_facturas_fecha_tenant ON facturas(fecha, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_tenant ON pedidos(fecha, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_request_counts_ip_created ON request_counts(ip, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_request_counts_created ON request_counts(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_ataques_log_ip ON ataques_log(ip, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_modulo_usage_tenant_fecha ON modulo_usage(tenant_id, fecha)`,
    `CREATE INDEX IF NOT EXISTS idx_session_geo_tenant ON session_geo(tenant_id, last_seen)`,
    `CREATE INDEX IF NOT EXISTS idx_ip_blacklist_expira ON ip_blacklist(expira_en)`,
  ];
  for (const sql of indexes) {
    try { await knex.raw(sql); } catch (_) {}
  }

  // 12. Seed alertas_configuracion with 15 default rules
  const defaultAlerts = [
    { regla: 'login_fallido_repetido', umbral: JSON.stringify({ count: 5, window_min: 15 }), severidad: 'critical', canal: 'email_whatsapp' },
    { regla: 'error_rate_alto', umbral: JSON.stringify({ percent: 5, window_min: 60 }), severidad: 'critical', canal: 'email_whatsapp' },
    { regla: 'db_pool_saturado', umbral: JSON.stringify({ max_connections: 3, duration_min: 2 }), severidad: 'critical', canal: 'email_whatsapp' },
    { regla: 'tenant_inactivo', umbral: JSON.stringify({ dias: 7 }), severidad: 'warning', canal: 'email' },
    { regla: 'latencia_alta', umbral: JSON.stringify({ p95_ms: 2000, duration_min: 10 }), severidad: 'warning', canal: 'email' },
    { regla: 'descuadre_caja', umbral: JSON.stringify({ percent: 10 }), severidad: 'warning', canal: 'email' },
    { regla: 'rate_limit_excesivo', umbral: JSON.stringify({ hits_dia: 50 }), severidad: 'warning', canal: 'email' },
    { regla: 'cambio_precio_sospechoso', umbral: JSON.stringify({ percent: 50 }), severidad: 'warning', canal: 'email' },
    { regla: 'suscripcion_por_vencer', umbral: JSON.stringify({ dias: 3 }), severidad: 'warning', canal: 'email' },
    { regla: 'churn_mensual_alto', umbral: JSON.stringify({ percent: 10 }), severidad: 'warning', canal: 'email' },
    { regla: 'ddos_detectado', umbral: JSON.stringify({ req_per_min: 100 }), severidad: 'critical', canal: 'email_whatsapp' },
    { regla: 'brute_force', umbral: JSON.stringify({ login_fails: 5, window_min: 15 }), severidad: 'critical', canal: 'email_whatsapp' },
    { regla: 'credential_stuffing', umbral: JSON.stringify({ distinct_users: 10 }), severidad: 'critical', canal: 'email_whatsapp' },
    { regla: 'api_abuse', umbral: JSON.stringify({ req_per_min: 60 }), severidad: 'warning', canal: 'email' },
    { regla: 'ataque_sostenido', umbral: JSON.stringify({ blocks_24h: 3 }), severidad: 'critical', canal: 'email_whatsapp' },
  ];

  for (const alert of defaultAlerts) {
    try {
      await knex('alertas_configuracion').insert({
        ...alert,
        activa: true,
      });
    } catch (_) { /* rule may already exist */ }
  }
};

exports.down = async function(knex) {
  // Drop indexes first
  const indexes = [
    'idx_facturas_fecha_tenant',
    'idx_pedidos_fecha_tenant',
    'idx_audit_log_created',
    'idx_request_counts_ip_created',
    'idx_request_counts_created',
    'idx_ataques_log_ip',
    'idx_modulo_usage_tenant_fecha',
    'idx_session_geo_tenant',
    'idx_ip_blacklist_expira',
  ];
  for (const name of indexes) {
    try { await knex.raw(`DROP INDEX IF EXISTS ${name}`); } catch (_) {}
  }

  // Remove geo columns from tenants
  try { await knex.raw(`ALTER TABLE tenants DROP COLUMN IF EXISTS geo_lat`); } catch (_) {}
  try { await knex.raw(`ALTER TABLE tenants DROP COLUMN IF EXISTS geo_lon`); } catch (_) {}

  // Drop tables in reverse dependency order
  await knex.schema.dropTableIfExists('session_geo');
  await knex.raw('DROP TABLE IF EXISTS request_counts');
  await knex.schema.dropTableIfExists('ataques_log');
  await knex.schema.dropTableIfExists('ip_whitelist');
  await knex.schema.dropTableIfExists('ip_blacklist');
  await knex.schema.dropTableIfExists('alertas_configuracion');
  await knex.schema.dropTableIfExists('alertas_estado');
  await knex.schema.dropTableIfExists('kpi_snapshots');
  await knex.schema.dropTableIfExists('modulo_usage');
};
