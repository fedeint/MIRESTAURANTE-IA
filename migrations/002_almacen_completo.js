exports.up = async function(knex) {
  // 1. Categorias
  await knex.schema.createTable('almacen_categorias', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 100).notNullable();
    t.string('icono', 50).nullable();
    t.string('color', 20).nullable();
    t.integer('orden').defaultTo(0);
    t.boolean('activo').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'nombre']);
  });

  // 2. Proveedores
  await knex.schema.createTable('proveedores', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 200).notNullable();
    t.string('ruc', 20).nullable();
    t.string('telefono', 20).nullable();
    t.string('email', 100).nullable();
    t.string('direccion', 300).nullable();
    t.string('contacto_nombre', 100).nullable();
    t.enum('tipo', ['mayorista', 'minorista', 'productor', 'distribuidor']).defaultTo('mayorista');
    t.integer('calificacion').nullable();
    t.integer('dias_credito').defaultTo(0);
    t.boolean('activo').defaultTo(true);
    t.timestamp('deleted_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 3. Ingredientes
  await knex.schema.createTable('almacen_ingredientes', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('categoria_id').unsigned().nullable().references('id').inTable('almacen_categorias');
    t.integer('proveedor_id').unsigned().nullable().references('id').inTable('proveedores');
    t.string('codigo', 50).nullable();
    t.string('nombre', 150).notNullable();
    t.string('descripcion', 300).nullable();
    t.enum('unidad_medida', ['kg', 'g', 'lt', 'ml', 'und', 'docena', 'saco', 'caja']).defaultTo('kg');
    t.enum('unidad_compra', ['kg', 'g', 'lt', 'ml', 'und', 'docena', 'saco', 'caja']).defaultTo('kg');
    t.decimal('factor_conversion', 10, 4).defaultTo(1);
    t.decimal('stock_actual', 12, 3).defaultTo(0);
    t.decimal('stock_minimo', 12, 3).defaultTo(0);
    t.decimal('stock_maximo', 12, 3).nullable();
    t.decimal('costo_unitario', 10, 4).defaultTo(0);
    t.decimal('costo_promedio', 10, 4).defaultTo(0);
    t.decimal('ultimo_costo', 10, 4).nullable();
    t.decimal('merma_preparacion_pct', 5, 2).defaultTo(0);
    t.string('ubicacion', 100).nullable();
    t.boolean('perecible').defaultTo(true);
    t.integer('dias_vencimiento').nullable();
    t.string('temperatura_almacen', 50).nullable();
    t.integer('ingrediente_sustituto_id').unsigned().nullable();
    t.decimal('factor_sustitucion', 10, 4).nullable();
    t.json('alergenos').nullable();
    t.boolean('activo').defaultTo(true);
    t.timestamp('deleted_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'stock_actual', 'stock_minimo'], 'idx_stock');
    t.index(['tenant_id', 'categoria_id'], 'idx_categoria');
  });

  // 4. Lotes
  await knex.schema.createTable('almacen_lotes', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('ingrediente_id').unsigned().notNullable().references('id').inTable('almacen_ingredientes');
    t.string('numero_lote', 50).nullable();
    t.date('fecha_ingreso').notNullable();
    t.date('fecha_vencimiento').nullable();
    t.decimal('cantidad_inicial', 12, 3).notNullable();
    t.decimal('cantidad_disponible', 12, 3).notNullable();
    t.decimal('costo_unitario', 10, 4).notNullable();
    t.integer('proveedor_id').unsigned().nullable().references('id').inTable('proveedores');
    t.integer('orden_compra_id').unsigned().nullable();
    t.enum('estado', ['disponible', 'agotado', 'vencido', 'descartado']).defaultTo('disponible');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'fecha_vencimiento', 'estado'], 'idx_vencimiento');
    t.index(['tenant_id', 'ingrediente_id', 'fecha_ingreso'], 'idx_fifo');
  });

  // 5. Ordenes de compra
  await knex.schema.createTable('ordenes_compra', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('proveedor_id').unsigned().notNullable().references('id').inTable('proveedores');
    t.string('numero_orden', 50).nullable();
    t.date('fecha_orden').notNullable();
    t.date('fecha_entrega_esperada').nullable();
    t.date('fecha_recibida').nullable();
    t.enum('estado', ['borrador', 'enviada', 'parcial', 'recibida', 'cancelada']).defaultTo('borrador');
    t.decimal('subtotal', 12, 2).defaultTo(0);
    t.decimal('igv', 12, 2).defaultTo(0);
    t.decimal('total', 12, 2).defaultTo(0);
    t.enum('comprobante_tipo', ['boleta', 'factura', 'sin_comprobante']).defaultTo('sin_comprobante');
    t.string('comprobante_numero', 50).nullable();
    t.enum('estado_pago', ['pendiente', 'pagado', 'parcial', 'vencido']).defaultTo('pendiente');
    t.date('fecha_vencimiento_pago').nullable();
    t.decimal('monto_pagado', 12, 2).defaultTo(0);
    t.text('notas').nullable();
    t.integer('usuario_id').unsigned().notNullable();
    t.integer('recibido_por').unsigned().nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'estado', 'fecha_orden'], 'idx_oc_estado');
    t.index(['tenant_id', 'proveedor_id'], 'idx_oc_prov');
  });

  // 6. Items de orden
  await knex.schema.createTable('orden_compra_items', t => {
    t.increments('id');
    t.integer('orden_id').unsigned().notNullable().references('id').inTable('ordenes_compra').onDelete('CASCADE');
    t.integer('ingrediente_id').unsigned().notNullable().references('id').inTable('almacen_ingredientes');
    t.decimal('cantidad_pedida', 12, 3).notNullable();
    t.decimal('cantidad_recibida', 12, 3).nullable();
    t.decimal('costo_unitario', 10, 4).notNullable();
    t.decimal('subtotal', 12, 2).notNullable();
    t.enum('estado', ['pendiente', 'recibido', 'parcial', 'rechazado']).defaultTo('pendiente');
    t.integer('lote_id').unsigned().nullable();
    t.string('notas', 200).nullable();
  });

  // 7. Inspeccion de recepcion
  await knex.schema.createTable('inspeccion_recepcion', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('orden_compra_id').unsigned().nullable();
    t.integer('ingrediente_id').unsigned().notNullable().references('id').inTable('almacen_ingredientes');
    t.decimal('temperatura_recibida', 4, 1).nullable();
    t.enum('estado_visual', ['excelente', 'bueno', 'aceptable', 'rechazado']).notNullable();
    t.decimal('peso_declarado', 12, 3).nullable();
    t.decimal('peso_verificado', 12, 3).nullable();
    t.string('foto_url', 500).nullable();
    t.text('notas_inspeccion').nullable();
    t.boolean('aprobado').defaultTo(true);
    t.integer('inspector_id').unsigned().notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 8. Movimientos
  await knex.schema.createTable('almacen_movimientos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('ingrediente_id').unsigned().notNullable().references('id').inTable('almacen_ingredientes');
    t.integer('lote_id').unsigned().nullable().references('id').inTable('almacen_lotes');
    t.enum('tipo', ['entrada', 'salida', 'ajuste', 'merma', 'devolucion', 'transferencia']).notNullable();
    t.decimal('cantidad', 12, 3).notNullable();
    t.decimal('stock_anterior', 12, 3).notNullable();
    t.decimal('stock_posterior', 12, 3).notNullable();
    t.decimal('costo_unitario', 10, 4).nullable();
    t.decimal('costo_total', 12, 2).nullable();
    t.enum('motivo', [
      'compra_proveedor', 'venta_platillo', 'merma_vencimiento',
      'merma_dano', 'merma_preparacion', 'consumo_interno',
      'ajuste_inventario', 'devolucion_proveedor', 'regalo',
      'robo_perdida', 'transferencia_sucursal'
    ]).notNullable();
    t.string('referencia_tipo', 50).nullable();
    t.integer('referencia_id').nullable();
    t.string('comprobante', 100).nullable();
    t.text('notas').nullable();
    t.boolean('requiere_aprobacion').defaultTo(false);
    t.integer('aprobado_por').unsigned().nullable();
    t.timestamp('aprobado_at').nullable();
    t.integer('usuario_id').unsigned().notNullable();
    t.integer('turno_id').unsigned().nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'ingrediente_id', 'created_at'], 'idx_mov_ingr');
    t.index(['tenant_id', 'tipo', 'motivo', 'created_at'], 'idx_mov_tipo');
    t.index(['tenant_id', 'referencia_tipo', 'referencia_id'], 'idx_mov_ref');
  });

  // 9. Historial diario
  await knex.schema.createTable('almacen_historial_diario', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.date('fecha').notNullable();
    t.integer('ingrediente_id').unsigned().notNullable().references('id').inTable('almacen_ingredientes');
    t.decimal('stock_inicio_dia', 12, 3).notNullable();
    t.decimal('total_entradas', 12, 3).defaultTo(0);
    t.decimal('total_salidas_venta', 12, 3).defaultTo(0);
    t.decimal('total_salidas_merma', 12, 3).defaultTo(0);
    t.decimal('total_salidas_otros', 12, 3).defaultTo(0);
    t.decimal('stock_fin_dia', 12, 3).notNullable();
    t.decimal('costo_total_entradas', 12, 2).defaultTo(0);
    t.decimal('costo_total_salidas', 12, 2).defaultTo(0);
    t.integer('usuario_cierre').unsigned().nullable();
    t.unique(['tenant_id', 'fecha', 'ingrediente_id'], 'uq_hist_diario');
  });

  // 10. Conteo fisico
  await knex.schema.createTable('almacen_conteo_fisico', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.date('fecha').notNullable();
    t.integer('ingrediente_id').unsigned().notNullable().references('id').inTable('almacen_ingredientes');
    t.decimal('stock_sistema', 12, 3).notNullable();
    t.decimal('stock_contado', 12, 3).notNullable();
    t.decimal('diferencia', 12, 3).notNullable();
    t.boolean('ajustado').defaultTo(false);
    t.string('notas', 200).nullable();
    t.integer('usuario_id').unsigned().notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 11. Temperaturas
  await knex.schema.createTable('almacen_temperaturas', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('ubicacion', 100).notNullable();
    t.decimal('temperatura', 4, 1).notNullable();
    t.boolean('alerta').defaultTo(false);
    t.integer('registrado_por').unsigned().notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['tenant_id', 'ubicacion', 'created_at'], 'idx_temp_ubic');
  });

  // Pre-cargar categorias
  await knex('almacen_categorias').insert([
    { tenant_id: 1, nombre: 'Pescados y mariscos', icono: 'bi-water', color: '#3b82f6', orden: 1 },
    { tenant_id: 1, nombre: 'Carnes', icono: 'bi-egg-fried', color: '#ef4444', orden: 2 },
    { tenant_id: 1, nombre: 'Vegetales', icono: 'bi-flower1', color: '#10b981', orden: 3 },
    { tenant_id: 1, nombre: 'Tuberculos', icono: 'bi-circle-fill', color: '#a16207', orden: 4 },
    { tenant_id: 1, nombre: 'Legumbres', icono: 'bi-circle', color: '#65a30d', orden: 5 },
    { tenant_id: 1, nombre: 'Frutas', icono: 'bi-apple', color: '#f59e0b', orden: 6 },
    { tenant_id: 1, nombre: 'Condimentos y especias', icono: 'bi-fire', color: '#dc2626', orden: 7 },
    { tenant_id: 1, nombre: 'Cremas, salsas y vinagres', icono: 'bi-droplet-fill', color: '#f97316', orden: 8 },
    { tenant_id: 1, nombre: 'Lacteos y huevos', icono: 'bi-cup-straw', color: '#fbbf24', orden: 9 },
    { tenant_id: 1, nombre: 'Granos, harinas y pastas', icono: 'bi-grain', color: '#d4a017', orden: 10 },
    { tenant_id: 1, nombre: 'Aceites, grasas y azucar', icono: 'bi-droplet', color: '#eab308', orden: 11 },
    { tenant_id: 1, nombre: 'Bebidas', icono: 'bi-cup-hot', color: '#6366f1', orden: 12 },
    { tenant_id: 1, nombre: 'Descartables', icono: 'bi-box', color: '#9ca3af', orden: 13 },
    { tenant_id: 1, nombre: 'Limpieza', icono: 'bi-stars', color: '#06b6d4', orden: 14 },
  ]);
};

exports.down = async function(knex) {
  const tables = [
    'almacen_temperaturas', 'almacen_conteo_fisico', 'almacen_historial_diario',
    'almacen_movimientos', 'inspeccion_recepcion', 'orden_compra_items',
    'ordenes_compra', 'almacen_lotes', 'almacen_ingredientes',
    'proveedores', 'almacen_categorias'
  ];
  for (const t of tables) {
    await knex.schema.dropTableIfExists(t);
  }
};
