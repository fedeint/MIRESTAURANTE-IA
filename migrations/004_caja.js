exports.up = async function(knex) {
  // 1. Turnos
  await knex.schema.createTable('turnos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 50).notNullable();
    t.time('hora_inicio').notNullable();
    t.time('hora_fin').notNullable();
    t.boolean('activo').defaultTo(true);
  });

  // Pre-cargar turnos
  await knex('turnos').insert([
    { tenant_id: 1, nombre: 'Manana', hora_inicio: '06:00', hora_fin: '14:00' },
    { tenant_id: 1, nombre: 'Tarde', hora_inicio: '14:00', hora_fin: '22:00' },
  ]);

  // 2. Metodos de pago
  await knex.schema.createTable('metodos_pago', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 50).notNullable();
    t.enum('tipo', ['efectivo', 'tarjeta', 'transferencia', 'digital', 'credito']).notNullable();
    t.decimal('comision_pct', 5, 2).defaultTo(0);
    t.boolean('activo').defaultTo(true);
    t.unique(['tenant_id', 'nombre']);
  });

  // Pre-cargar metodos Peru
  await knex('metodos_pago').insert([
    { tenant_id: 1, nombre: 'Efectivo', tipo: 'efectivo', comision_pct: 0 },
    { tenant_id: 1, nombre: 'Visa POS', tipo: 'tarjeta', comision_pct: 3.50 },
    { tenant_id: 1, nombre: 'Mastercard POS', tipo: 'tarjeta', comision_pct: 3.50 },
    { tenant_id: 1, nombre: 'Yape', tipo: 'digital', comision_pct: 0 },
    { tenant_id: 1, nombre: 'Plin', tipo: 'digital', comision_pct: 0 },
    { tenant_id: 1, nombre: 'Transferencia BCP', tipo: 'transferencia', comision_pct: 0 },
    { tenant_id: 1, nombre: 'Transferencia Interbank', tipo: 'transferencia', comision_pct: 0 },
    { tenant_id: 1, nombre: 'Credito casa', tipo: 'credito', comision_pct: 0 },
  ]);

  // 3. Cajas
  await knex.schema.createTable('cajas', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('turno_id').unsigned().nullable().references('id').inTable('turnos');
    t.integer('usuario_id').unsigned().notNullable();
    t.string('nombre_caja', 50).defaultTo('Caja 1');
    t.datetime('fecha_apertura').notNullable();
    t.datetime('fecha_cierre').nullable();
    t.decimal('monto_apertura', 10, 2).defaultTo(0);
    t.decimal('monto_cierre_sistema', 10, 2).nullable();
    t.decimal('monto_cierre_real', 10, 2).nullable();
    t.decimal('diferencia', 10, 2).nullable();
    t.json('denominacion_cierre').nullable();
    t.enum('estado', ['abierta', 'cerrada']).defaultTo('abierta');
    t.decimal('umbral_efectivo', 10, 2).defaultTo(1500);
    t.text('notas').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'estado', 'fecha_apertura'], 'idx_caja_estado');
  });

  // 4. Movimientos de caja
  await knex.schema.createTable('caja_movimientos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('caja_id').unsigned().notNullable().references('id').inTable('cajas');
    t.enum('tipo', ['ingreso', 'egreso']).notNullable();
    t.enum('concepto', [
      'venta_factura', 'propina',
      'retiro_caja_fuerte', 'retiro_banco', 'retiro_propietario',
      'gasto_compra_almacen', 'gasto_servicio', 'gasto_otro',
      'pago_planilla', 'devolucion_cliente',
      'fondo_inicial', 'ajuste'
    ]).notNullable();
    t.decimal('monto', 10, 2).notNullable();
    t.integer('metodo_pago_id').unsigned().nullable().references('id').inTable('metodos_pago');
    t.string('referencia_tipo', 50).nullable();
    t.integer('referencia_id').nullable();
    t.boolean('es_propina').defaultTo(false);
    t.boolean('anulado').defaultTo(false);
    t.integer('anulado_por').unsigned().nullable();
    t.string('anulado_motivo', 200).nullable();
    t.integer('autorizado_por').unsigned().nullable();
    t.integer('usuario_id').unsigned().notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'caja_id', 'created_at'], 'idx_cajamov_caja');
    t.index(['tenant_id', 'tipo', 'concepto'], 'idx_cajamov_tipo');
  });

  // 5. Agregar propina a facturas
  const hasPropina = await knex.schema.hasColumn('facturas', 'propina');
  if (!hasPropina) {
    await knex.schema.alterTable('facturas', t => {
      t.decimal('propina', 10, 2).defaultTo(0);
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('caja_movimientos');
  await knex.schema.dropTableIfExists('cajas');
  await knex.schema.dropTableIfExists('metodos_pago');
  await knex.schema.dropTableIfExists('turnos');
};
