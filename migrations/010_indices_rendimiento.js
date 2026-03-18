// Migración: Índices para mejorar rendimiento de queries frecuentes
// Usa CREATE INDEX IF NOT EXISTS (MySQL 8+) para ser idempotente

const indices = [
  // FACTURAS (sin tenant_id)
  { table: 'facturas', name: 'idx_facturas_fecha', cols: '(fecha)' },
  { table: 'facturas', name: 'idx_facturas_cliente', cols: '(cliente_id)' },
  { table: 'facturas', name: 'idx_facturas_formapago', cols: '(forma_pago)' },

  // DETALLE_FACTURA
  { table: 'detalle_factura', name: 'idx_detfact_factura', cols: '(factura_id)' },
  { table: 'detalle_factura', name: 'idx_detfact_producto', cols: '(producto_id)' },

  // FACTURA_PAGOS
  { table: 'factura_pagos', name: 'idx_factpagos_factura', cols: '(factura_id)' },

  // MESAS
  { table: 'mesas', name: 'idx_mesas_estado', cols: '(estado)' },

  // PEDIDOS
  { table: 'pedidos', name: 'idx_pedidos_mesa_estado', cols: '(mesa_id, estado)' },
  { table: 'pedidos', name: 'idx_pedidos_estado', cols: '(estado)' },

  // PEDIDO_ITEMS
  { table: 'pedido_items', name: 'idx_peditems_pedido_estado', cols: '(pedido_id, estado)' },
  { table: 'pedido_items', name: 'idx_peditems_producto', cols: '(producto_id)' },
  { table: 'pedido_items', name: 'idx_peditems_estado', cols: '(estado)' },
  { table: 'pedido_items', name: 'idx_peditems_enviado_at', cols: '(enviado_at)' },
  { table: 'pedido_items', name: 'idx_peditems_servido_at', cols: '(servido_at)' },

  // CLIENTES
  { table: 'clientes', name: 'idx_clientes_nombre', cols: '(nombre)' },

  // PRODUCTOS
  { table: 'productos', name: 'idx_productos_nombre', cols: '(nombre)' },

  // PRODUCTO_HIJOS_ITEMS
  { table: 'producto_hijos_items', name: 'idx_phitems_padre_orden', cols: '(producto_padre_id, orden)' },

  // USUARIOS
  { table: 'usuarios', name: 'idx_usuarios_rol_activo', cols: '(rol, activo)' },

  // ALMACEN_INGREDIENTES (con tenant_id)
  { table: 'almacen_ingredientes', name: 'idx_alming_tenant_activo', cols: '(tenant_id, activo)' },

  // ALMACEN_MOVIMIENTOS
  { table: 'almacen_movimientos', name: 'idx_almmov_tenant_created', cols: '(tenant_id, created_at)' },
  { table: 'almacen_movimientos', name: 'idx_almmov_ingrediente', cols: '(ingrediente_id)' },

  // CAJAS
  { table: 'cajas', name: 'idx_cajas_tenant_estado', cols: '(tenant_id, estado)' },

  // CAJA_MOVIMIENTOS
  { table: 'caja_movimientos', name: 'idx_cajamov_caja_anulado', cols: '(caja_id, anulado)' },
  { table: 'caja_movimientos', name: 'idx_cajamov_tenant_created', cols: '(tenant_id, created_at)' },

  // RECETAS
  { table: 'recetas', name: 'idx_recetas_producto_activa', cols: '(producto_id, activa)' },
  { table: 'recetas', name: 'idx_recetas_tenant_producto', cols: '(tenant_id, producto_id)' },

  // RECETA_ITEMS
  { table: 'receta_items', name: 'idx_recitems_receta', cols: '(receta_id)' },
  { table: 'receta_items', name: 'idx_recitems_ingrediente', cols: '(ingrediente_id)' },

  // GASTOS
  { table: 'gastos', name: 'idx_gastos_tenant_fecha', cols: '(tenant_id, fecha)' },
  { table: 'gastos', name: 'idx_gastos_categoria', cols: '(categoria_id)' },

  // GASTOS_CATEGORIAS
  { table: 'gastos_categorias', name: 'idx_gastoscat_tenant_grupo', cols: '(tenant_id, grupo)' },

  // PLANILLA_PAGOS
  { table: 'planilla_pagos', name: 'idx_planilla_tenant_fecha', cols: '(tenant_id, fecha)' },
  { table: 'planilla_pagos', name: 'idx_planilla_personal', cols: '(personal_id)' },

  // PERSONAL
  { table: 'personal', name: 'idx_personal_tenant_activo', cols: '(tenant_id, activo)' },

  // PRESUPUESTOS
  { table: 'presupuestos', name: 'idx_presup_tenant_periodo', cols: '(tenant_id, anio, mes)' },

  // ORDENES_COMPRA
  { table: 'ordenes_compra', name: 'idx_ordcompra_tenant_fecha', cols: '(tenant_id, fecha_orden, estado)' },

  // RESERVAS
  { table: 'reservas', name: 'idx_reservas_tenant_fecha', cols: '(tenant_id, fecha)' },

  // PEDIDOS_DELIVERY
  { table: 'pedidos_delivery', name: 'idx_delivery_tenant_created', cols: '(tenant_id, created_at)' },

  // PROMOCIONES
  { table: 'promociones', name: 'idx_promos_tenant_activa', cols: '(tenant_id, activa)' },

  // FIDELIDAD_PUNTOS
  { table: 'fidelidad_puntos', name: 'idx_fidelidad_tenant_cliente', cols: '(tenant_id, cliente_id)' },

  // AUDIT_LOG
  { table: 'audit_log', name: 'idx_audit_tenant_created', cols: '(tenant_id, created_at)' },
  { table: 'audit_log', name: 'idx_audit_usuario', cols: '(usuario_id)' },

  // PROVEEDORES
  { table: 'proveedores', name: 'idx_proveedores_tenant_deleted', cols: '(tenant_id, deleted_at)' },
];

exports.up = async function(knex) {
  for (const idx of indices) {
    try {
      await knex.raw(`CREATE INDEX \`${idx.name}\` ON \`${idx.table}\` ${idx.cols}`);
    } catch (e) {
      // Ignorar si el índice ya existe (código 1061)
      if (e.errno === 1061) continue;
      throw e;
    }
  }
};

exports.down = async function(knex) {
  for (const idx of indices) {
    try {
      await knex.raw(`DROP INDEX \`${idx.name}\` ON \`${idx.table}\``);
    } catch (e) {
      // Ignorar si el índice no existe
      if (e.errno === 1091) continue;
      throw e;
    }
  }
};
