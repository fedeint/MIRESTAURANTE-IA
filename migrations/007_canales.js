exports.up = async function(knex) {
  await knex.schema.createTable('canales', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 50).notNullable();
    t.string('descripcion', 200).nullable();
    t.json('roles_permitidos').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'nombre']);
  });

  await knex.schema.createTable('canal_mensajes', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('canal_id').unsigned().notNullable().references('id').inTable('canales');
    t.integer('usuario_id').unsigned().nullable();
    t.enum('tipo', ['texto', 'alerta', 'sistema']).defaultTo('texto');
    t.text('mensaje').notNullable();
    t.enum('prioridad', ['normal', 'alta', 'urgente']).defaultTo('normal');
    t.boolean('pinned').defaultTo(false);
    t.datetime('pinned_until').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'canal_id', 'created_at'], 'idx_canal_msg');
  });

  await knex.schema.createTable('canal_mensajes_leidos', t => {
    t.integer('mensaje_id').unsigned().notNullable();
    t.integer('usuario_id').unsigned().notNullable();
    t.timestamp('leido_at').defaultTo(knex.fn.now());
    t.primary(['mensaje_id', 'usuario_id']);
  });

  // Pre-cargar canales
  await knex('canales').insert([
    { tenant_id: 1, nombre: '#inventario', descripcion: 'Alertas de stock y compras', roles_permitidos: JSON.stringify(['administrador', 'cocinero']) },
    { tenant_id: 1, nombre: '#meseros', descripcion: 'Avisos del dia, platos disponibles', roles_permitidos: JSON.stringify(['administrador', 'mesero']) },
    { tenant_id: 1, nombre: '#cocina', descripcion: 'Comunicacion cocina', roles_permitidos: JSON.stringify(['administrador', 'cocinero']) },
    { tenant_id: 1, nombre: '#administracion', descripcion: 'Alertas financieras, cierres', roles_permitidos: JSON.stringify(['administrador']) },
    { tenant_id: 1, nombre: '#soporte', descripcion: 'Problemas y sugerencias', roles_permitidos: null },
  ]);
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('canal_mensajes_leidos');
  await knex.schema.dropTableIfExists('canal_mensajes');
  await knex.schema.dropTableIfExists('canales');
};
