exports.up = async function(knex) {
  // 1. Comprobantes electronicos SUNAT
  await knex.schema.createTable('comprobantes_electronicos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('factura_id').unsigned().notNullable();
    t.enum('tipo', ['boleta', 'factura', 'nota_credito', 'nota_debito']).notNullable();
    t.string('serie', 10).notNullable();
    t.integer('correlativo').notNullable();
    t.datetime('fecha_emision').notNullable();
    t.string('cliente_tipo_doc', 5).notNullable();
    t.string('cliente_num_doc', 20).notNullable();
    t.string('cliente_razon_social', 200).notNullable();
    t.decimal('subtotal_sin_igv', 12, 2).notNullable();
    t.decimal('igv', 12, 2).notNullable();
    t.decimal('total_con_igv', 12, 2).notNullable();
    t.text('xml_firmado', 'longtext').nullable();
    t.string('hash_cpe', 100).nullable();
    t.text('qr_data').nullable();
    t.string('codigo_sunat', 10).nullable();
    t.text('mensaje_sunat').nullable();
    t.string('pdf_url', 300).nullable();
    t.enum('estado', ['pendiente', 'aceptado', 'rechazado', 'anulado']).defaultTo('pendiente');
    t.timestamp('enviado_sunat_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'tipo', 'serie', 'correlativo'], 'uq_comprobante');
    t.index(['tenant_id', 'fecha_emision'], 'idx_cpe_fecha');
  });

  // 2. Notas de credito
  await knex.schema.createTable('notas_credito', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('factura_id').unsigned().notNullable();
    t.integer('comprobante_id').unsigned().nullable();
    t.enum('motivo', ['devolucion', 'error_facturacion', 'descuento_posterior', 'anulacion']).notNullable();
    t.decimal('monto', 10, 2).notNullable();
    t.json('items').nullable();
    t.enum('estado', ['emitida', 'anulada']).defaultTo('emitida');
    t.integer('usuario_id').unsigned().notNullable();
    t.text('notas').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 3. Agregar campos IGV y SUNAT a facturas
  const cols = {
    subtotal_sin_igv: 'decimal',
    igv: 'decimal',
    total_con_igv: 'decimal',
    tipo_comprobante: 'string',
    serie: 'string',
    correlativo: 'integer',
    sunat_estado: 'string'
  };
  for (const [col, tipo] of Object.entries(cols)) {
    const exists = await knex.schema.hasColumn('facturas', col);
    if (!exists) {
      await knex.schema.alterTable('facturas', t => {
        if (tipo === 'decimal') t.decimal(col, 12, 2).nullable();
        else if (tipo === 'integer') t.integer(col).nullable();
        else t.string(col, 50).nullable();
      });
    }
  }

  // 4. Agregar campos documento a clientes
  const clienteCols = ['tipo_documento', 'numero_documento', 'email', 'razon_social'];
  for (const col of clienteCols) {
    const exists = await knex.schema.hasColumn('clientes', col);
    if (!exists) {
      await knex.schema.alterTable('clientes', t => {
        if (col === 'tipo_documento') t.string(col, 20).nullable();
        else if (col === 'email') t.string(col, 150).nullable();
        else if (col === 'razon_social') t.string(col, 200).nullable();
        else t.string(col, 20).nullable();
      });
    }
  }

  // 5. Config SUNAT por tenant
  await knex.schema.createTable('config_sunat', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('ruc_emisor', 11).nullable();
    t.string('razon_social_emisor', 200).nullable();
    t.string('direccion_emisor', 300).nullable();
    t.string('serie_boleta', 10).defaultTo('B001');
    t.integer('correlativo_boleta').defaultTo(0);
    t.string('serie_factura', 10).defaultTo('F001');
    t.integer('correlativo_factura').defaultTo(0);
    t.string('serie_nota_credito', 10).defaultTo('BC01');
    t.integer('correlativo_nota_credito').defaultTo(0);
    t.enum('proveedor_ose', ['nubefact', 'sunat_directo', 'efact', 'bizlinks']).defaultTo('nubefact');
    t.string('ose_token', 500).nullable();
    t.string('ose_ruta', 300).nullable();
    t.boolean('produccion').defaultTo(false);
    t.decimal('igv_porcentaje', 5, 2).defaultTo(18.00);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['tenant_id']);
  });

  // Pre-cargar config
  await knex('config_sunat').insert({
    tenant_id: 1,
    igv_porcentaje: 18.00,
    serie_boleta: 'B001',
    serie_factura: 'F001'
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('config_sunat');
  await knex.schema.dropTableIfExists('notas_credito');
  await knex.schema.dropTableIfExists('comprobantes_electronicos');
};
