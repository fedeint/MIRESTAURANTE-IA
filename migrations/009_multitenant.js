exports.up = async function(knex) {
  // 1. Tenants
  await knex.schema.createTable('tenants', t => {
    t.increments('id');
    t.string('nombre', 200).notNullable();
    t.string('subdominio', 100).notNullable().unique();
    t.enum('plan', ['free', 'pro', 'enterprise']).defaultTo('free');
    t.string('ruc', 20).nullable();
    t.string('email_admin', 150).notNullable();
    t.string('telefono', 20).nullable();
    t.string('logo_url', 500).nullable();
    t.json('config').nullable();
    t.boolean('activo').defaultTo(true);
    t.date('fecha_inicio').notNullable();
    t.date('fecha_vencimiento').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 2. Suscripciones
  await knex.schema.createTable('tenant_suscripciones', t => {
    t.increments('id');
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants');
    t.enum('plan', ['free', 'pro', 'enterprise']).notNullable();
    t.decimal('precio_mensual', 10, 2).notNullable();
    t.date('fecha_inicio').notNullable();
    t.date('fecha_fin').nullable();
    t.enum('estado', ['activa', 'vencida', 'cancelada', 'prueba']).defaultTo('prueba');
    t.string('metodo_pago', 50).nullable();
    t.string('referencia_pago', 100).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Pre-cargar tenant actual
  await knex('tenants').insert({
    id: 1,
    nombre: 'Mi Restaurante',
    subdominio: 'mirestaurante',
    plan: 'pro',
    email_admin: 'admin@mirestconia.com',
    fecha_inicio: new Date().toISOString().split('T')[0],
    activo: true
  });

  await knex('tenant_suscripciones').insert({
    tenant_id: 1,
    plan: 'pro',
    precio_mensual: 0,
    fecha_inicio: new Date().toISOString().split('T')[0],
    estado: 'activa'
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('tenant_suscripciones');
  await knex.schema.dropTableIfExists('tenants');
};
