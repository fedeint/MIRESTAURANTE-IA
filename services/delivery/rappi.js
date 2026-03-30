'use strict';
const db = require('../../db');
const crypto = require('crypto');
const { procesarPedidoEntrante } = require('./delivery-core');

const RAPPI_BASE_URL = 'https://dev-portal.rappi.com';

async function autenticar(tenantId) {
  const [[config]] = await db.query(
    'SELECT * FROM delivery_config WHERE tenant_id=? AND plataforma=? AND activo=true',
    [tenantId, 'rappi']
  );
  if (!config || !config.client_id || !config.client_secret) {
    throw new Error('Rappi no configurado para este tenant');
  }

  if (config.access_token && config.token_expira_at && new Date(config.token_expira_at) > new Date(Date.now() + 3600000)) {
    return config.access_token;
  }

  const resp = await fetch(`${RAPPI_BASE_URL}/restaurants/auth/v1/token/login/integrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.client_id, client_secret: config.client_secret })
  });
  if (!resp.ok) throw new Error(`Rappi auth failed: ${resp.status}`);
  const data = await resp.json();

  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await db.query(
    'UPDATE delivery_config SET access_token=?, token_expira_at=?, updated_at=NOW() WHERE id=?',
    [data.access_token || data.token, expiresAt, config.id]
  );
  return data.access_token || data.token;
}

function validarWebhook(payload, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

async function recibirPedido(tenantId, webhookPayload) {
  const order = webhookPayload.order || webhookPayload;
  return procesarPedidoEntrante(tenantId, 'rappi', {
    pedido_externo_id: String(order.id || order.order_id),
    cliente_nombre: order.client?.name || order.customer_name || '',
    cliente_telefono: order.client?.phone || '',
    cliente_direccion: order.delivery_address?.description || order.address || '',
    cliente_notas: order.instructions || order.notes || '',
    items: (order.items || order.products || []).map(i => ({
      nombre: i.name || i.product_name,
      producto_externo_id: String(i.id || i.sku || ''),
      cantidad: i.quantity || 1,
      precio: Number(i.price || i.unit_price || 0),
      notas: i.comments || i.special_instructions || ''
    })),
    subtotal: Number(order.total_products || order.subtotal || 0),
    descuento: Number(order.total_discounts || 0),
    comision_plataforma: null,
    costo_envio: Number(order.charges?.shipping || order.delivery_fee || 0),
    propina: Number(order.other_totals?.tip || order.tip || 0),
    total: Number(order.total_order || order.total || 0),
    metodo_pago: order.payment_method || 'tarjeta',
    estado_externo: 'SENT',
    payload_original: webhookPayload
  });
}

async function aceptarPedido(tenantId, orderId, cookingTimeMin = 20) {
  const token = await autenticar(tenantId);
  const [[config]] = await db.query(
    'SELECT store_id FROM delivery_config WHERE tenant_id=? AND plataforma=?',
    [tenantId, 'rappi']
  );
  const resp = await fetch(
    `${RAPPI_BASE_URL}/restaurants/orders/v1/stores/${config.store_id}/orders/${orderId}/cooking_time/${cookingTimeMin}/take`,
    { method: 'PUT', headers: { 'x-authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return resp.ok;
}

async function rechazarPedido(tenantId, orderId, cancelType = 'RESTAURANT_CANCEL') {
  const token = await autenticar(tenantId);
  const [[config]] = await db.query(
    'SELECT store_id FROM delivery_config WHERE tenant_id=? AND plataforma=?',
    [tenantId, 'rappi']
  );
  const resp = await fetch(
    `${RAPPI_BASE_URL}/restaurants/orders/v1/stores/${config.store_id}/orders/${orderId}/cancel_type/${cancelType}/reject`,
    { method: 'PUT', headers: { 'x-authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return resp.ok;
}

async function sincronizarMenu(tenantId) {
  const [productos] = await db.query(
    `SELECT p.id, p.nombre, p.precio_unidad, dms.producto_externo_id, dms.precio_plataforma
     FROM productos p
     LEFT JOIN delivery_menu_sync dms ON dms.producto_id = p.id AND dms.plataforma = 'rappi' AND dms.tenant_id = ?
     WHERE p.tenant_id = ?`,
    [tenantId, tenantId]
  );

  for (const prod of productos) {
    await db.query(`
      INSERT INTO delivery_menu_sync (tenant_id, plataforma, producto_id, precio_plataforma, disponible, ultimo_sync_at, estado_sync)
      VALUES (?, 'rappi', ?, ?, true, NOW(), 'pendiente')
      ON CONFLICT (tenant_id, plataforma, producto_id) DO UPDATE SET
        precio_plataforma = EXCLUDED.precio_plataforma, ultimo_sync_at = NOW(), estado_sync = 'pendiente'
    `, [tenantId, prod.id, prod.precio_plataforma || prod.precio_unidad]);
  }

  return { synced: productos.length };
}

module.exports = { autenticar, validarWebhook, recibirPedido, aceptarPedido, rechazarPedido, sincronizarMenu };
