exports.up = async function(knex) {
  // 1. Recetas versionadas
  await knex.schema.createTable('recetas', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.integer('producto_id').unsigned().notNullable();
    t.integer('version').notNullable().defaultTo(1);
    t.string('nombre_version', 100).nullable();
    t.decimal('rendimiento_porciones', 6, 2).defaultTo(1);
    t.integer('tiempo_preparacion_min').nullable();
    t.decimal('food_cost_objetivo_pct', 5, 2).nullable();
    t.boolean('activa').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'producto_id', 'version'], 'uq_receta_ver');
    t.index(['tenant_id', 'producto_id', 'activa'], 'idx_receta_prod');
  });

  // 2. Items de receta (ingrediente o sub-receta)
  await knex.schema.createTable('receta_items', t => {
    t.increments('id');
    t.integer('receta_id').unsigned().notNullable().references('id').inTable('recetas').onDelete('CASCADE');
    t.integer('ingrediente_id').unsigned().nullable();
    t.integer('sub_receta_id').unsigned().nullable();
    t.decimal('cantidad', 10, 3).notNullable();
    t.enum('unidad_medida', ['kg', 'g', 'lt', 'ml', 'und']).defaultTo('g');
    t.boolean('es_opcional').defaultTo(false);
    t.string('notas', 200).nullable();
  });

  // 3. Combos / Menu del dia
  await knex.schema.createTable('combos', t => {
    t.increments('id');
    t.integer('tenant_id').notNullable().defaultTo(1);
    t.string('nombre', 100).notNullable();
    t.decimal('precio', 10, 2).notNullable();
    t.boolean('activo').defaultTo(true);
    t.date('fecha_inicio').nullable();
    t.date('fecha_fin').nullable();
    t.time('hora_inicio').nullable();
    t.time('hora_fin').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 4. Items de combo
  await knex.schema.createTable('combo_items', t => {
    t.increments('id');
    t.integer('combo_id').unsigned().notNullable().references('id').inTable('combos').onDelete('CASCADE');
    t.integer('producto_id').unsigned().notNullable();
    t.integer('cantidad').defaultTo(1);
  });

  // 5. Agregar costo_receta a detalle_factura
  const hasCol = await knex.schema.hasColumn('detalle_factura', 'costo_receta');
  if (!hasCol) {
    await knex.schema.alterTable('detalle_factura', t => {
      t.decimal('costo_receta', 10, 4).nullable();
      t.integer('receta_version').nullable();
    });
  }

  // 6. Agregar categoria a productos
  const hasCat = await knex.schema.hasColumn('productos', 'categoria');
  if (!hasCat) {
    await knex.schema.alterTable('productos', t => {
      t.string('categoria', 100).nullable();
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('combo_items');
  await knex.schema.dropTableIfExists('combos');
  await knex.schema.dropTableIfExists('receta_items');
  await knex.schema.dropTableIfExists('recetas');
};
