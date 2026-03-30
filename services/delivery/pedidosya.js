'use strict';
const db = require('../../db');
const { procesarPedidoEntrante } = require('./delivery-core');

const PEDIDOSYA_BASE_URL = 'https://pedidosya.partner.deliveryhero.io';

async function autenticar(tenantId) {
  const [[config]] = await db.query(
    'SELECT * FROM delivery_config WHERE tenant_id=? AND plataforma=? AND activo=true',
    [tenantId, 'pedidosya']
  );
  if (!config || !config.client_id || !config.client_secret) {
    throw new Error('PedidosYa no configurado para este tenant');
  }

  if (config.access_token && config.token_expira_at && new Date(config.token_expira_at) > new Date(Date.now() + 300000)) {
    return { token: config.access_token, chainId: config.chain_id };
  }

  const resp = await fetch(`${PEDIDOSYA_BASE_URL}/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.client_id,
      client_secret: config.client_secret
    })
  });
  if (!resp.ok) throw new Error(`PedidosYa auth failed: ${resp.status}`);
  const data = await resp.json();

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await db.query(
    'UPDATE delivery_config SET access_token=?, token_expira_at=?, updated_at=NOW() WHERE id=?',
    [data.access_token, expiresAt, config.id]
  );

  return { token: data.access_token, chainId: config.chain_id };
}

async function recibirPedido(tenantId, webhookPayload) {
  const order = webhookPayload;
  return procesarPedidoEntrante(tenantId, 'pedidosya', {
    pedido_externo_id: String(order.order_id || order.id),
    cliente_nombre: order.customer?.name || '',
    cliente_telefono: order.customer?.phone || '',
    cliente_direccion: order.delivery_address?.formatted || order.address || '',
    cliente_notas: order.special_instructions || order.notes || '',
    items: (order.items || order.products || []).map(i => ({
      nombre: i.name || i.product_name,
      producto_externo_id: String(i.id || i.sku || ''),
      cantidad: i.quantity || 1,
      precio: Number(i.unit_price || i.price || 0),
      notas: i.comment || ''
    })),
    subtotal: Number(order.subtotal || 0),
    descuento: Number(order.discount || 0),
    comision_plataforma: null,
    costo_envio: Number(order.delivery_fee || 0),
    propina: Number(order.tip || 0),
    total: Number(order.total || 0),
    metodo_pago: order.payment_method || 'tarjeta',
    estado_externo: 'RECEIVED',
    payload_original: webhookPayload
  });
}

async function aceptarPedido(tenantId, orderId) {
  const { token, chainId } = await autenticar(tenantId);
  const resp = await fetch(
    `${PEDIDOSYA_BASE_URL}/v2/chains/${chainId}/orders/${orderId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACCEPTED' })
    }
  );
  return resp.ok;
}

async function marcarListo(tenantId, orderId) {
  const { token, chainId } = await autenticar(tenantId);
  const resp = await fetch(
    `${PEDIDOSYA_BASE_URL}/v2/chains/${chainId}/orders/${orderId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY_FOR_PICKUP' })
    }
  );
  return resp.ok;
}

async function sincronizarMenu(tenantId) {
  const [productos] = await db.query(
    `SELECT p.id, p.nombre, p.precio_unidad, dms.producto_externo_id, dms.precio_plataforma
     FROM productos p
     LEFT JOIN delivery_menu_sync dms ON dms.producto_id=p.id AND dms.plataforma='pedidosya' AND dms.tenant_id=?
     WHERE p.tenant_id=?`,
    [tenantId, tenantId]
  );

  for (const prod of productos) {
    await db.query(`
      INSERT INTO delivery_menu_sync (tenant_id, plataforma, producto_id, precio_plataforma, disponible, ultimo_sync_at, estado_sync)
      VALUES (?, 'pedidosya', ?, ?, true, NOW(), 'pendiente')
      ON CONFLICT (tenant_id, plataforma, producto_id) DO UPDATE SET
        precio_plataforma = EXCLUDED.precio_plataforma, ultimo_sync_at = NOW(), estado_sync = 'pendiente'
    `, [tenantId, prod.id, prod.precio_plataforma || prod.precio_unidad]);
  }

  return { synced: productos.length };
}

async function obtenerHistorial(tenantId, desde, hasta) {
  const { token, chainId } = await autenticar(tenantId);
  const [[config]] = await db.query(
    'SELECT store_id FROM delivery_config WHERE tenant_id=? AND plataforma=?',
    [tenantId, 'pedidosya']
  );
  const resp = await fetch(
    `${PEDIDOSYA_BASE_URL}/v2/chains/${chainId}/vendors/${config.store_id}/orders?start_date=${desde}&end_date=${hasta}&page_size=500`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.orders || data.data || [];
}

module.exports = { autenticar, recibirPedido, aceptarPedido, marcarListo, sincronizarMenu, obtenerHistorial };
