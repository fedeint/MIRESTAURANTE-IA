exports.up = async function(knex) {
  // 1. Personal
  await knex.schema.createTable('personal', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('usuario_id').unsigned().nullable();
    t.string('nombre', 150).notNullable();
    t.string('dni', 8).nullable();
    t.string('cargo', 100).notNullable();
    t.enum('tipo_contrato', ['planilla', 'recibo_honorarios', 'informal']).defaultTo('planilla');
    t.enum('tipo_pago', ['diario', 'semanal', 'quincenal', 'mensual']).defaultTo('diario');
    t.decimal('monto_pago', 10, 2).notNullable();
    t.enum('regimen_pension', ['onp', 'afp_integra', 'afp_prima', 'afp_profuturo', 'afp_habitat', 'ninguno']).defaultTo('onp');
    t.date('fecha_ingreso').nullable();
    t.boolean('activo').defaultTo(true);
    t.timestamp('deleted_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 2. Planilla pagos
  await knex.schema.createTable('planilla_pagos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('personal_id').unsigned().notNullable().references('id').inTable('personal');
    t.date('fecha').notNullable();
    t.decimal('monto_bruto', 10, 2).notNullable();
    t.decimal('deduccion_onp_afp', 10, 2).defaultTo(0);
    t.decimal('deduccion_ir_5ta', 10, 2).defaultTo(0);
    t.decimal('monto_neto', 10, 2).notNullable();
    t.decimal('aporte_essalud', 10, 2).defaultTo(0);
    t.decimal('aporte_sctr', 10, 2).defaultTo(0);
    t.decimal('horas_trabajadas', 5, 2).nullable();
    t.string('notas', 200).nullable();
    t.boolean('pagado').defaultTo(false);
    t.integer('caja_id').unsigned().nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'fecha'], 'idx_planilla_fecha');
  });

  // 3. Categorias de gastos
  await knex.schema.createTable('gastos_categorias', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 100).notNullable();
    t.enum('tipo', ['fijo', 'variable']).defaultTo('variable');
    t.enum('grupo', ['compras', 'servicios', 'marketing', 'sueldos', 'inmovilizado', 'legal', 'otros']).defaultTo('otros');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Pre-cargar categorias
  await knex('gastos_categorias').insert([
    { tenant_id: 1, nombre: 'Alquiler local', tipo: 'fijo', grupo: 'inmovilizado' },
    { tenant_id: 1, nombre: 'Luz', tipo: 'fijo', grupo: 'inmovilizado' },
    { tenant_id: 1, nombre: 'Agua', tipo: 'fijo', grupo: 'inmovilizado' },
    { tenant_id: 1, nombre: 'Internet', tipo: 'fijo', grupo: 'inmovilizado' },
    { tenant_id: 1, nombre: 'Gas', tipo: 'variable', grupo: 'inmovilizado' },
    { tenant_id: 1, nombre: 'Seguro', tipo: 'fijo', grupo: 'inmovilizado' },
    { tenant_id: 1, nombre: 'Alarma', tipo: 'fijo', grupo: 'inmovilizado' },
    { tenant_id: 1, nombre: 'Suministros', tipo: 'variable', grupo: 'inmovilizado' },
    { tenant_id: 1, nombre: 'Contador/Gestoria', tipo: 'fijo', grupo: 'legal' },
    { tenant_id: 1, nombre: 'Abogados', tipo: 'variable', grupo: 'legal' },
    { tenant_id: 1, nombre: 'Comisiones bancarias', tipo: 'variable', grupo: 'legal' },
    { tenant_id: 1, nombre: 'Facebook Ads', tipo: 'variable', grupo: 'marketing' },
    { tenant_id: 1, nombre: 'Instagram Ads', tipo: 'variable', grupo: 'marketing' },
    { tenant_id: 1, nombre: 'Google Ads', tipo: 'variable', grupo: 'marketing' },
    { tenant_id: 1, nombre: 'Transporte', tipo: 'variable', grupo: 'otros' },
    { tenant_id: 1, nombre: 'Mantenimiento', tipo: 'variable', grupo: 'otros' },
    { tenant_id: 1, nombre: 'Otros gastos', tipo: 'variable', grupo: 'otros' },
  ]);

  // 4. Gastos
  await knex.schema.createTable('gastos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('categoria_id').unsigned().notNullable().references('id').inTable('gastos_categorias');
    t.string('concepto', 200).notNullable();
    t.decimal('monto', 10, 2).notNullable();
    t.date('fecha').notNullable();
    t.integer('periodo_mes').nullable();
    t.integer('periodo_anio').nullable();
    t.boolean('recurrente').defaultTo(false);
    t.enum('frecuencia', ['diario', 'semanal', 'mensual', 'anual']).nullable();
    t.string('comprobante', 200).nullable();
    t.text('notas').nullable();
    t.integer('usuario_id').unsigned().nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'fecha'], 'idx_gastos_fecha');
    t.index(['tenant_id', 'categoria_id'], 'idx_gastos_cat');
  });

  // 5. Presupuesto mensual
  await knex.schema.createTable('presupuestos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('categoria_id').unsigned().notNullable().references('id').inTable('gastos_categorias');
    t.integer('mes').notNullable();
    t.integer('anio').notNullable();
    t.decimal('monto_presupuestado', 10, 2).notNullable();
    t.unique(['tenant_id', 'categoria_id', 'mes', 'anio'], 'uq_presupuesto');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('presupuestos');
  await knex.schema.dropTableIfExists('gastos');
  await knex.schema.dropTableIfExists('gastos_categorias');
  await knex.schema.dropTableIfExists('planilla_pagos');
  await knex.schema.dropTableIfExists('personal');
};
