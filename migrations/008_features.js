exports.up = async function(knex) {
  // 1. Reservas
  await knex.schema.createTable('reservas', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('cliente_id').unsigned().nullable();
    t.integer('mesa_id').unsigned().nullable();
    t.date('fecha').notNullable();
    t.time('hora').notNullable();
    t.integer('cantidad_personas').notNullable();
    t.enum('estado', ['pendiente','confirmada','sentada','completada','no_show','cancelada']).defaultTo('pendiente');
    t.enum('canal_origen', ['telefono','whatsapp','web','presencial','app']).defaultTo('telefono');
    t.string('nombre_cliente', 150).nullable();
    t.string('telefono_cliente', 20).nullable();
    t.string('notas', 300).nullable();
    t.timestamp('confirmada_at').nullable();
    t.integer('usuario_id').unsigned().nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'fecha', 'hora'], 'idx_reserva_fecha');
  });

  // 2. Delivery
  await knex.schema.createTable('pedidos_delivery', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('pedido_id').unsigned().nullable();
    t.integer('factura_id').unsigned().nullable();
    t.enum('tipo', ['delivery','para_llevar']).notNullable();
    t.enum('plataforma', ['propio','rappi','pedidosya','ubereats','otro']).defaultTo('propio');
    t.text('direccion').nullable();
    t.string('telefono', 20).nullable();
    t.string('nombre_cliente', 150).nullable();
    t.string('repartidor', 100).nullable();
    t.enum('estado_entrega', ['preparando','en_camino','entregado','cancelado']).defaultTo('preparando');
    t.integer('tiempo_estimado_min').nullable();
    t.decimal('comision_plataforma', 10, 2).defaultTo(0);
    t.string('notas', 300).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'estado_entrega'], 'idx_delivery_estado');
  });

  // 3. Promociones
  await knex.schema.createTable('promociones', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 100).notNullable();
    t.enum('tipo', ['porcentaje','monto_fijo','2x1','happy_hour','combo']).notNullable();
    t.decimal('valor', 10, 2).nullable();
    t.string('codigo_cupon', 50).nullable();
    t.date('fecha_inicio').nullable();
    t.date('fecha_fin').nullable();
    t.time('hora_inicio').nullable();
    t.time('hora_fin').nullable();
    t.json('productos_aplicables').nullable();
    t.integer('usos_maximo').nullable();
    t.integer('usos_actual').defaultTo(0);
    t.boolean('activa').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 4. Descuentos aplicados
  await knex.schema.createTable('descuentos_aplicados', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('factura_id').unsigned().notNullable();
    t.integer('promocion_id').unsigned().nullable().references('id').inTable('promociones');
    t.string('tipo', 50).notNullable();
    t.decimal('monto_descuento', 10, 2).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 5. Fidelidad puntos
  await knex.schema.createTable('fidelidad_puntos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('cliente_id').unsigned().notNullable();
    t.integer('puntos_acumulados').defaultTo(0);
    t.integer('puntos_canjeados').defaultTo(0);
    t.integer('puntos_disponibles').defaultTo(0);
    t.enum('nivel', ['bronce','plata','oro','platino']).defaultTo('bronce');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'cliente_id']);
  });

  // 6. Fidelidad movimientos
  await knex.schema.createTable('fidelidad_movimientos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('cliente_id').unsigned().notNullable();
    t.enum('tipo', ['acumulacion','canje','vencimiento','ajuste']).notNullable();
    t.integer('puntos').notNullable();
    t.integer('factura_id').unsigned().nullable();
    t.string('descripcion', 200).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 7. Modificadores grupo
  await knex.schema.createTable('modificadores_grupo', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 100).notNullable();
    t.enum('tipo', ['unico','multiple']).defaultTo('unico');
    t.boolean('obligatorio').defaultTo(false);
    t.boolean('activo').defaultTo(true);
  });

  // 8. Modificadores
  await knex.schema.createTable('modificadores', t => {
    t.increments('id');
    t.integer('grupo_id').unsigned().notNullable().references('id').inTable('modificadores_grupo').onDelete('CASCADE');
    t.string('nombre', 100).notNullable();
    t.decimal('precio_adicional', 10, 2).defaultTo(0);
    t.boolean('activo').defaultTo(true);
  });

  // 9. Producto-modificadores
  await knex.schema.createTable('producto_modificadores', t => {
    t.integer('producto_id').unsigned().notNullable();
    t.integer('grupo_id').unsigned().notNullable().references('id').inTable('modificadores_grupo');
    t.primary(['producto_id', 'grupo_id']);
  });

  // Pre-cargar modificadores comunes Peru
  const [g1] = await knex('modificadores_grupo').insert({ tenant_id: 1, nombre: 'Termino de coccion', tipo: 'unico' });
  await knex('modificadores').insert([
    { grupo_id: g1, nombre: 'Crudo' },
    { grupo_id: g1, nombre: 'Termino medio' },
    { grupo_id: g1, nombre: 'Tres cuartos' },
    { grupo_id: g1, nombre: 'Bien cocido' },
  ]);

  const [g2] = await knex('modificadores_grupo').insert({ tenant_id: 1, nombre: 'Extras', tipo: 'multiple' });
  await knex('modificadores').insert([
    { grupo_id: g2, nombre: 'Extra aji', precio_adicional: 1.00 },
    { grupo_id: g2, nombre: 'Extra arroz', precio_adicional: 3.00 },
    { grupo_id: g2, nombre: 'Extra salsa criolla', precio_adicional: 2.00 },
  ]);

  const [g3] = await knex('modificadores_grupo').insert({ tenant_id: 1, nombre: 'Sin ingrediente', tipo: 'multiple' });
  await knex('modificadores').insert([
    { grupo_id: g3, nombre: 'Sin cebolla' },
    { grupo_id: g3, nombre: 'Sin aji' },
    { grupo_id: g3, nombre: 'Sin culantro' },
    { grupo_id: g3, nombre: 'Sin sal' },
  ]);
};

exports.down = async function(knex) {
  const tables = ['producto_modificadores','modificadores','modificadores_grupo',
    'fidelidad_movimientos','fidelidad_puntos','descuentos_aplicados',
    'promociones','pedidos_delivery','reservas'];
  for (const t of tables) await knex.schema.dropTableIfExists(t);
};
