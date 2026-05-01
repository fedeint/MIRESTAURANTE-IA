'use strict';
const db = require('../../db');

/**
 * Process an incoming delivery order from any platform.
 */
async function procesarPedidoEntrante(tenantId, plataforma, data) {
  const [result] = await db.query(`
    INSERT INTO delivery_pedidos (tenant_id, plataforma, pedido_externo_id, estado_externo, estado_interno,
      cliente_nombre, cliente_telefono, cliente_direccion, cliente_notas, items,
      subtotal, descuento, comision_plataforma, costo_envio, propina, total, metodo_pago, payload_original)
    VALUES (?,?,?,?,  'recibido', ?,?,?,?, ?::jsonb, ?,?,?,?,?,?,?,?::jsonb)
    ON CONFLICT (tenant_id, plataforma, pedido_externo_id) DO NOTHING
    RETURNING id
  `, [
    tenantId, plataforma, data.pedido_externo_id, data.estado_externo || 'new',
    data.cliente_nombre || '', data.cliente_telefono || null, data.cliente_direccion || null,
    data.cliente_notas || null, JSON.stringify(data.items || []),
    data.subtotal || 0, data.descuento || 0, data.comision_plataforma || null,
    data.costo_envio || 0, data.propina || 0, data.total || 0,
    data.metodo_pago || null, JSON.stringify(data.payload_original || {})
  ]);

  const deliveryId = result?.insertId || result?.[0]?.id;
  if (!deliveryId) return null;

  // Create internal pedido
  const [pedidoResult] = await db.query(`
    INSERT INTO pedidos (tenant_id, mesa_id, estado, mesero_nombre)
    VALUES (?, NULL, 'abierto', ?)
    RETURNING id
  `, [tenantId, `Delivery ${plataforma}`]);
  const pedidoId = pedidoResult?.insertId || pedidoResult?.[0]?.id;

  if (pedidoId && Array.isArray(data.items)) {
    for (const item of data.items) {
      let productoId = item.producto_id || null;
      if (!productoId && item.producto_externo_id) {
        const [[sync]] = await db.query(
          `SELECT producto_id FROM delivery_menu_sync WHERE tenant_id=? AND plataforma=? AND producto_externo_id=?`,
          [tenantId, plataforma, item.producto_externo_id]
        );
        productoId = sync?.producto_id || null;
      }

      await db.query(`
        INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, estado, nota)
        VALUES (?, ?, ?, ?, ?, 'enviado', ?)
      `, [pedidoId, productoId, item.cantidad || 1, item.precio || 0,
          (item.cantidad || 1) * (item.precio || 0), item.notas || null]);
    }
  }

  await db.query('UPDATE delivery_pedidos SET pedido_interno_id=? WHERE id=?', [pedidoId, deliveryId]);
  return { deliveryId, pedidoId };
}

async function actualizarEstado(tenantId, deliveryPedidoId, estadoInterno) {
  await db.query(
    `UPDATE delivery_pedidos SET estado_interno=?, updated_at=NOW() WHERE id=? AND tenant_id=?`,
    [estadoInterno, deliveryPedidoId, tenantId]
  );
}

async function calcularAnalytics(tenantId, dias = 30) {
  const [porPlataforma] = await db.query(`
    SELECT plataforma,
      COUNT(*) as pedidos,
      COALESCE(SUM(total), 0) as venta_total,
      COALESCE(SUM(comision_plataforma), 0) as comisiones,
      COALESCE(SUM(total - COALESCE(comision_plataforma, 0)), 0) as ingreso_neto,
      COALESCE(AVG(tiempo_preparacion_min), 0) as tiempo_prep_promedio,
      COALESCE(AVG(tiempo_aceptacion_seg), 0) as aceptacion_promedio
    FROM delivery_pedidos
    WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL '1 day' * ?
    GROUP BY plataforma
  `, [tenantId, dias]);
  return porPlataforma;
}

module.exports = { procesarPedidoEntrante, actualizarEstado, calcularAnalytics };
