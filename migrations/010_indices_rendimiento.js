// Migración: Índices para mejorar rendimiento de queries frecuentes
// Las queries del dashboard, cocina, mesas y reportes hacen WHERE por
// tenant_id, fecha, estado y JOINs por factura_id/producto_id/pedido_id.
// Sin índices, MySQL hace full table scan en cada una.

exports.up = function(knex) {
  return knex.schema

    // === FACTURAS ===
    // Dashboard: WHERE tenant_id=? AND DATE(fecha)=CURDATE()
    // Ranking:   WHERE tenant_id=? AND fecha >= DATE_SUB(...)
    .alterTable('facturas', t => {
      t.index(['tenant_id', 'fecha'], 'idx_facturas_tenant_fecha');
    })

    // === DETALLE_FACTURA ===
    // Top productos: JOIN facturas + GROUP BY producto_id
    .alterTable('detalle_factura', t => {
      t.index('factura_id', 'idx_detfact_factura');
      t.index('producto_id', 'idx_detfact_producto');
      t.index('created_at', 'idx_detfact_created');
    })

    // === FACTURA_PAGOS ===
    // Consulta de pagos por factura
    .alterTable('factura_pagos', t => {
      t.index('factura_id', 'idx_factpagos_factura');
    })

    // === MESAS ===
    // Dashboard: WHERE tenant_id=? AND estado='ocupada'
    .alterTable('mesas', t => {
      t.index(['tenant_id', 'estado'], 'idx_mesas_tenant_estado');
    })

    // === PEDIDOS ===
    // Cocina/Mesas: WHERE mesa_id=? AND estado IN (...)
    .alterTable('pedidos', t => {
      t.index(['mesa_id', 'estado'], 'idx_pedidos_mesa_estado');
      t.index('estado', 'idx_pedidos_estado');
    })

    // === PEDIDO_ITEMS ===
    // Cocina: WHERE pedido_id=? AND estado IN (...)
    // Mesas: JOIN pedidos + filtro por estado
    .alterTable('pedido_items', t => {
      t.index(['pedido_id', 'estado'], 'idx_peditems_pedido_estado');
      t.index('producto_id', 'idx_peditems_producto');
      t.index('estado', 'idx_peditems_estado');
    })

    // === CLIENTES ===
    // Búsqueda: WHERE nombre LIKE ? OR telefono LIKE ?
    // Dashboard: COUNT con tenant_id
    .alterTable('clientes', t => {
      t.index('tenant_id', 'idx_clientes_tenant');
    })

    // === ALMACEN_INGREDIENTES ===
    // Dashboard alertas: WHERE tenant_id=? AND activo=1 AND stock_actual <= stock_minimo
    .alterTable('almacen_ingredientes', t => {
      t.index(['tenant_id', 'activo'], 'idx_alming_tenant_activo');
    })

    // === ALMACEN_MOVIMIENTOS ===
    // Historial: WHERE tenant_id=? ORDER BY created_at DESC
    .alterTable('almacen_movimientos', t => {
      t.index(['tenant_id', 'created_at'], 'idx_almmov_tenant_created');
      t.index('ingrediente_id', 'idx_almmov_ingrediente');
    })

    // === USUARIOS ===
    // Login: WHERE usuario=? (ya tiene UNIQUE, pero agregar activo)
    .alterTable('usuarios', t => {
      t.index(['rol', 'activo'], 'idx_usuarios_rol_activo');
    })

    // === CAJAS ===
    // requireCajaAbierta: WHERE tenant_id=? AND estado='abierta'
    .alterTable('cajas', t => {
      t.index(['tenant_id', 'estado'], 'idx_cajas_tenant_estado');
    })

    // === PRODUCTOS ===
    // Búsqueda: WHERE nombre LIKE ? OR codigo LIKE ?
    // Listado: ORDER BY nombre
    .alterTable('productos', t => {
      t.index('nombre', 'idx_productos_nombre');
    })

    // === PRODUCTO_HIJOS_ITEMS ===
    // Consulta items por padre: WHERE producto_padre_id=? ORDER BY orden
    // (producto_padre_id ya tiene UK compuesto, pero orden no está indexado)
    .alterTable('producto_hijos_items', t => {
      t.index(['producto_padre_id', 'orden'], 'idx_phitems_padre_orden');
    })

    // === GASTOS (Administración) ===
    // P&L: WHERE tenant_id=? AND MONTH(fecha)=? AND YEAR(fecha)=?
    // Listado: WHERE tenant_id=? AND fecha BETWEEN ? AND ? ORDER BY fecha DESC
    .alterTable('gastos', t => {
      t.index(['tenant_id', 'fecha'], 'idx_gastos_tenant_fecha');
      t.index('categoria_id', 'idx_gastos_categoria');
    })

    // === GASTOS_CATEGORIAS ===
    // JOIN + GROUP BY: WHERE tenant_id=? ORDER BY grupo, nombre
    .alterTable('gastos_categorias', t => {
      t.index(['tenant_id', 'grupo'], 'idx_gastoscat_tenant_grupo');
    })

    // === PLANILLA_PAGOS (Administración) ===
    // WHERE tenant_id=? AND MONTH(fecha)=? AND YEAR(fecha)=?
    .alterTable('planilla_pagos', t => {
      t.index(['tenant_id', 'fecha'], 'idx_planilla_tenant_fecha');
      t.index('personal_id', 'idx_planilla_personal');
    })

    // === PERSONAL (Administración) ===
    // WHERE tenant_id=? AND activo=1 ORDER BY nombre
    .alterTable('personal', t => {
      t.index(['tenant_id', 'activo'], 'idx_personal_tenant_activo');
    })

    // === PRESUPUESTOS (Administración) ===
    // WHERE tenant_id=? AND mes=? AND anio=?
    .alterTable('presupuestos', t => {
      t.index(['tenant_id', 'anio', 'mes'], 'idx_presup_tenant_periodo');
    })

    // === ORDENES_COMPRA (Administración) ===
    // WHERE tenant_id=? AND MONTH(fecha_orden)=? AND estado IN (...)
    .alterTable('ordenes_compra', t => {
      t.index(['tenant_id', 'fecha_orden', 'estado'], 'idx_ordcompra_tenant_fecha');
    })

    // === CAJA_MOVIMIENTOS (Cajero) ===
    // WHERE caja_id=? AND anulado=0 ORDER BY created_at DESC
    // SUM por tipo para totales de caja
    .alterTable('caja_movimientos', t => {
      t.index(['caja_id', 'anulado'], 'idx_cajamov_caja_anulado');
      t.index(['tenant_id', 'created_at'], 'idx_cajamov_tenant_created');
    })

    // === PEDIDO_ITEMS timestamps (Cocinero) ===
    // Cocina ordena por enviado_at ASC (FIFO)
    // Entregados filtra por servido_at
    .alterTable('pedido_items', t => {
      t.index('enviado_at', 'idx_peditems_enviado_at');
      t.index('servido_at', 'idx_peditems_servido_at');
    })

    // === RECETAS (Mozo → enviar a cocina descuenta stock) ===
    // WHERE producto_id=? AND activa=1
    .alterTable('recetas', t => {
      t.index(['producto_id', 'activa'], 'idx_recetas_producto_activa');
      t.index(['tenant_id', 'producto_id'], 'idx_recetas_tenant_producto');
    })

    // === RECETA_ITEMS (Descuento de stock por ingrediente) ===
    // WHERE receta_id=? → JOIN almacen_ingredientes
    .alterTable('receta_items', t => {
      t.index('receta_id', 'idx_recitems_receta');
      t.index('ingrediente_id', 'idx_recitems_ingrediente');
    })

    // === FACTURAS cliente_id (Ventas → JOIN clientes) ===
    // Ventas: JOIN clientes c ON f.cliente_id = c.id
    .alterTable('facturas', t => {
      t.index('cliente_id', 'idx_facturas_cliente');
      t.index('forma_pago', 'idx_facturas_formapago');
    })

    // === RESERVAS (Features) ===
    // WHERE tenant_id=? AND fecha=? ORDER BY hora
    .alterTable('reservas', t => {
      t.index(['tenant_id', 'fecha'], 'idx_reservas_tenant_fecha');
    })

    // === PEDIDOS_DELIVERY (Features) ===
    // WHERE tenant_id=? ORDER BY created_at DESC
    .alterTable('pedidos_delivery', t => {
      t.index(['tenant_id', 'created_at'], 'idx_delivery_tenant_created');
    })

    // === PROMOCIONES (Features) ===
    // WHERE tenant_id=? ORDER BY activa DESC
    .alterTable('promociones', t => {
      t.index(['tenant_id', 'activa'], 'idx_promos_tenant_activa');
    })

    // === FIDELIDAD_PUNTOS (Features) ===
    // WHERE tenant_id=? AND cliente_id=?
    .alterTable('fidelidad_puntos', t => {
      t.index(['tenant_id', 'cliente_id'], 'idx_fidelidad_tenant_cliente');
    })

    // === AUDIT_LOG (Superadmin) ===
    // Historial de auditoría por tenant y fecha
    .alterTable('audit_log', t => {
      t.index(['tenant_id', 'created_at'], 'idx_audit_tenant_created');
      t.index('usuario_id', 'idx_audit_usuario');
    })

    // === PROVEEDORES (Almacén) ===
    // WHERE tenant_id=? AND deleted_at IS NULL ORDER BY nombre
    .alterTable('proveedores', t => {
      t.index(['tenant_id', 'deleted_at'], 'idx_proveedores_tenant_deleted');
    });
};

exports.down = function(knex) {
  return knex.schema
    .alterTable('facturas', t => { t.dropIndex(null, 'idx_facturas_tenant_fecha'); })
    .alterTable('detalle_factura', t => {
      t.dropIndex(null, 'idx_detfact_factura');
      t.dropIndex(null, 'idx_detfact_producto');
      t.dropIndex(null, 'idx_detfact_created');
    })
    .alterTable('factura_pagos', t => { t.dropIndex(null, 'idx_factpagos_factura'); })
    .alterTable('mesas', t => { t.dropIndex(null, 'idx_mesas_tenant_estado'); })
    .alterTable('pedidos', t => {
      t.dropIndex(null, 'idx_pedidos_mesa_estado');
      t.dropIndex(null, 'idx_pedidos_estado');
    })
    .alterTable('pedido_items', t => {
      t.dropIndex(null, 'idx_peditems_pedido_estado');
      t.dropIndex(null, 'idx_peditems_producto');
      t.dropIndex(null, 'idx_peditems_estado');
    })
    .alterTable('clientes', t => { t.dropIndex(null, 'idx_clientes_tenant'); })
    .alterTable('almacen_ingredientes', t => { t.dropIndex(null, 'idx_alming_tenant_activo'); })
    .alterTable('almacen_movimientos', t => {
      t.dropIndex(null, 'idx_almmov_tenant_created');
      t.dropIndex(null, 'idx_almmov_ingrediente');
    })
    .alterTable('usuarios', t => { t.dropIndex(null, 'idx_usuarios_rol_activo'); })
    .alterTable('cajas', t => { t.dropIndex(null, 'idx_cajas_tenant_estado'); })
    .alterTable('productos', t => { t.dropIndex(null, 'idx_productos_nombre'); })
    .alterTable('producto_hijos_items', t => { t.dropIndex(null, 'idx_phitems_padre_orden'); })
    .alterTable('gastos', t => {
      t.dropIndex(null, 'idx_gastos_tenant_fecha');
      t.dropIndex(null, 'idx_gastos_categoria');
    })
    .alterTable('gastos_categorias', t => { t.dropIndex(null, 'idx_gastoscat_tenant_grupo'); })
    .alterTable('planilla_pagos', t => {
      t.dropIndex(null, 'idx_planilla_tenant_fecha');
      t.dropIndex(null, 'idx_planilla_personal');
    })
    .alterTable('personal', t => { t.dropIndex(null, 'idx_personal_tenant_activo'); })
    .alterTable('presupuestos', t => { t.dropIndex(null, 'idx_presup_tenant_periodo'); })
    .alterTable('ordenes_compra', t => { t.dropIndex(null, 'idx_ordcompra_tenant_fecha'); })
    .alterTable('caja_movimientos', t => {
      t.dropIndex(null, 'idx_cajamov_caja_anulado');
      t.dropIndex(null, 'idx_cajamov_tenant_created');
    })
    .alterTable('pedido_items', t => {
      t.dropIndex(null, 'idx_peditems_enviado_at');
      t.dropIndex(null, 'idx_peditems_servido_at');
    })
    .alterTable('recetas', t => {
      t.dropIndex(null, 'idx_recetas_producto_activa');
      t.dropIndex(null, 'idx_recetas_tenant_producto');
    })
    .alterTable('receta_items', t => {
      t.dropIndex(null, 'idx_recitems_receta');
      t.dropIndex(null, 'idx_recitems_ingrediente');
    })
    .alterTable('facturas', t => {
      t.dropIndex(null, 'idx_facturas_cliente');
      t.dropIndex(null, 'idx_facturas_formapago');
    })
    .alterTable('reservas', t => { t.dropIndex(null, 'idx_reservas_tenant_fecha'); })
    .alterTable('pedidos_delivery', t => { t.dropIndex(null, 'idx_delivery_tenant_created'); })
    .alterTable('promociones', t => { t.dropIndex(null, 'idx_promos_tenant_activa'); })
    .alterTable('fidelidad_puntos', t => { t.dropIndex(null, 'idx_fidelidad_tenant_cliente'); })
    .alterTable('audit_log', t => {
      t.dropIndex(null, 'idx_audit_tenant_created');
      t.dropIndex(null, 'idx_audit_usuario');
    })
    .alterTable('proveedores', t => { t.dropIndex(null, 'idx_proveedores_tenant_deleted'); });
};
