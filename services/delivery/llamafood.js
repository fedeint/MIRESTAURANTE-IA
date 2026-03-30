'use strict';
const { procesarPedidoEntrante, actualizarEstado } = require('./delivery-core');

async function crearPedidoManual(tenantId, data) {
  return procesarPedidoEntrante(tenantId, 'llamafood', {
    pedido_externo_id: `LF-${Date.now()}`,
    ...data,
    estado_externo: 'manual',
    payload_original: { source: 'manual_entry' }
  });
}

async function actualizarEstadoPedido(tenantId, pedidoId, estado) {
  return actualizarEstado(tenantId, pedidoId, estado);
}

async function obtenerHistorial(tenantId, desde, hasta) {
  const db = require('../../db');
  const [rows] = await db.query(
    `SELECT * FROM delivery_pedidos WHERE tenant_id=? AND plataforma='llamafood'
     AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC`,
    [tenantId, desde, hasta]
  );
  return rows;
}

module.exports = { crearPedidoManual, actualizarEstadoPedido, obtenerHistorial };
