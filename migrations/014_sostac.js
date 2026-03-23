/**
 * 014_sostac.js
 * Creates SOSTAC strategic framework tables:
 *   sostac_briefs      — structured Q&A captured by the Brief Express wizard
 *   sostac_situacion   — auto-generated situational analysis per brief/period
 *   sostac_objetivos   — SMART/OKR objectives linked to a brief
 */

exports.up = async function(knex) {
  // 1. sostac_briefs — master brief record per tenant
  await knex.schema.createTable('sostac_briefs', t => {
    t.increments('id');
    t.integer('tenant_id').unsigned().notNullable();
    t.jsonb('datos').notNullable().defaultTo('{}');
    t.string('generado_por', 50).defaultTo('delfino');
    t.integer('version').defaultTo(1);
    t.boolean('activo').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 2. sostac_situacion — situational analysis snapshots
  await knex.schema.createTable('sostac_situacion', t => {
    t.increments('id');
    t.integer('tenant_id').unsigned().notNullable();
    t.integer('brief_id').unsigned().references('id').inTable('sostac_briefs').onDelete('SET NULL');
    t.jsonb('datos').notNullable().defaultTo('{}');
    t.string('periodo', 20);    // e.g. '2026-Q1', '2026-03'
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 3. sostac_objetivos — SMART / OKR objective tracking
  await knex.schema.createTable('sostac_objetivos', t => {
    t.increments('id');
    t.integer('tenant_id').unsigned().notNullable();
    t.integer('brief_id').unsigned().references('id').inTable('sostac_briefs').onDelete('SET NULL');
    t.string('titulo', 200).notNullable();
    t.string('tipo', 20).defaultTo('smart');          // smart | okr
    t.string('metrica', 100);
    t.decimal('valor_actual', 12, 2);
    t.decimal('valor_objetivo', 12, 2);
    t.date('fecha_limite');
    t.string('estado', 20).defaultTo('activo');       // activo | completado | cancelado
    t.integer('progreso').defaultTo(0);               // 0–100
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_sostac_briefs_tenant   ON sostac_briefs(tenant_id, activo)`,
    `CREATE INDEX IF NOT EXISTS idx_sostac_situacion_brief ON sostac_situacion(brief_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sostac_objetivos_brief ON sostac_objetivos(brief_id, tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sostac_objetivos_estado ON sostac_objetivos(tenant_id, estado)`,
  ];
  for (const sql of indexes) {
    try { await knex.raw(sql); } catch (_) {}
  }
};

exports.down = async function(knex) {
  const indexes = [
    'idx_sostac_objetivos_estado',
    'idx_sostac_objetivos_brief',
    'idx_sostac_situacion_brief',
    'idx_sostac_briefs_tenant',
  ];
  for (const name of indexes) {
    try { await knex.raw(`DROP INDEX IF EXISTS ${name}`); } catch (_) {}
  }

  await knex.schema.dropTableIfExists('sostac_objetivos');
  await knex.schema.dropTableIfExists('sostac_situacion');
  await knex.schema.dropTableIfExists('sostac_briefs');
};
