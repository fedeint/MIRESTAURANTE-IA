exports.up = function(knex) {
  return knex.schema.createTable('audit_log', function(table) {
    table.bigIncrements('id');
    table.integer('tenant_id').notNullable().defaultTo(1);
    table.integer('usuario_id').notNullable();
    table.enum('accion', ['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ERROR']).notNullable();
    table.string('modulo', 50).notNullable();
    table.string('tabla_afectada', 100).notNullable();
    table.integer('registro_id').nullable();
    table.json('datos_anteriores').nullable();
    table.json('datos_nuevos').nullable();
    table.string('ip_address', 45).nullable();
    table.string('user_agent', 300).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['tenant_id', 'created_at'], 'idx_audit_tenant');
    table.index(['modulo', 'tabla_afectada', 'created_at'], 'idx_audit_modulo');
    table.index(['usuario_id', 'created_at'], 'idx_audit_usuario');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('audit_log');
};
