'use strict';
const db = require('../../db');

async function procesarWebhook(plataforma, req) {
  const payload = req.body;
  let tenantId = null;
  let signatureValida = null;

  if (plataforma === 'rappi') {
    const signature = req.headers['rappi-signature'] || '';
    const storeId = payload.store_id || payload.order?.store_id || payload.store?.id;
    if (storeId) {
      const [[config]] = await db.query(
        'SELECT tenant_id, webhook_secret FROM delivery_config WHERE store_id=? AND plataforma=?',
        [String(storeId), 'rappi']
      );
      tenantId = config?.tenant_id;
      if (config?.webhook_secret && signature) {
        try {
          const rappi = require('./rappi');
          signatureValida = rappi.validarWebhook(payload, signature, config.webhook_secret);
        } catch (_) { signatureValida = null; }
      }
    }
  } else if (plataforma === 'pedidosya') {
    const vendorId = payload.vendor_id || payload.store_id;
    if (vendorId) {
      const [[config]] = await db.query(
        'SELECT tenant_id FROM delivery_config WHERE store_id=? AND plataforma=?',
        [String(vendorId), 'pedidosya']
      );
      tenantId = config?.tenant_id;
    }
    signatureValida = true;
  }

  const evento = payload.event || payload.type || payload.status || 'unknown';
  await db.query(
    `INSERT INTO delivery_webhook_log (tenant_id, plataforma, evento, payload, signature_valida)
     VALUES (?, ?, ?, ?::jsonb, ?)`,
    [tenantId, plataforma, evento, JSON.stringify(payload), signatureValida]
  );

  if (!tenantId) {
    return { error: 'Tenant not found for webhook', processed: false };
  }

  let result = null;
  try {
    if (plataforma === 'rappi') {
      const rappi = require('./rappi');
      result = await rappi.recibirPedido(tenantId, payload);
    } else if (plataforma === 'pedidosya') {
      const pedidosya = require('./pedidosya');
      result = await pedidosya.recibirPedido(tenantId, payload);
    }

    await db.query(
      `UPDATE delivery_webhook_log SET procesado=true WHERE tenant_id=? AND plataforma=?
       AND created_at = (SELECT MAX(created_at) FROM delivery_webhook_log WHERE tenant_id=? AND plataforma=?)`,
      [tenantId, plataforma, tenantId, plataforma]
    );
  } catch (e) {
    await db.query(
      `UPDATE delivery_webhook_log SET error=? WHERE tenant_id=? AND plataforma=?
       AND created_at = (SELECT MAX(created_at) FROM delivery_webhook_log WHERE tenant_id=? AND plataforma=?)`,
      [e.message, tenantId, plataforma, tenantId, plataforma]
    );
  }

  return { tenantId, result, processed: true };
}

module.exports = { procesarWebhook };
