'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');
const { registrarAudit } = require('../services/audit');

// GET /delivery — Dashboard
router.get('/', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const [activos] = await db.query(
      `SELECT * FROM delivery_pedidos WHERE tenant_id=? AND estado_interno NOT IN ('entregado','cancelado') ORDER BY created_at DESC`,
      [tid]
    );
    const [configs] = await db.query('SELECT * FROM delivery_config WHERE tenant_id=?', [tid]);
    let analytics = [];
    try {
      const { calcularAnalytics } = require('../services/delivery/delivery-core');
      analytics = await calcularAnalytics(tid, 30);
    } catch (_) {}
    res.render('delivery', { pedidos: activos, configs, analytics, user: req.session.user });
  } catch (e) {
    res.status(500).render('error', { error: { message: e.message, stack: '' } });
  }
});

// GET /delivery/config — Configuration page
router.get('/config', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const [configs] = await db.query('SELECT * FROM delivery_config WHERE tenant_id=?', [tid]);
    const configMap = {};
    for (const c of configs) configMap[c.plataforma] = c;
    res.render('delivery-config', { configs: configMap, user: req.session.user });
  } catch (e) {
    res.status(500).render('error', { error: { message: e.message, stack: '' } });
  }
});

// POST /delivery/config/:plataforma — Save platform credentials
router.post('/config/:plataforma', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const plat = req.params.plataforma;
    if (!['rappi', 'pedidosya', 'llamafood'].includes(plat)) {
      return res.status(400).json({ error: 'Plataforma invalida' });
    }
    const { client_id, client_secret, store_id, chain_id, webhook_secret, comision_pct, activo } = req.body;
    await db.query(`
      INSERT INTO delivery_config (tenant_id, plataforma, client_id, client_secret, store_id, chain_id, webhook_secret, comision_pct, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (tenant_id, plataforma) DO UPDATE SET
        client_id=EXCLUDED.client_id, client_secret=EXCLUDED.client_secret,
        store_id=EXCLUDED.store_id, chain_id=EXCLUDED.chain_id,
        webhook_secret=EXCLUDED.webhook_secret, comision_pct=EXCLUDED.comision_pct,
        activo=EXCLUDED.activo, updated_at=NOW()
    `, [tid, plat, client_id||null, client_secret||null, store_id||null, chain_id||null,
        webhook_secret||null, comision_pct||null, activo === 'true' || activo === true]);

    registrarAudit({ tenantId: tid, usuarioId: req.session?.user?.id||0, accion: 'UPSERT', modulo: 'delivery', tabla: 'delivery_config', ip: req.ip });
    res.json({ message: `Configuracion ${plat} guardada` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /delivery/manual — Manual order (LlamaFood or any)
router.post('/manual', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { plataforma, cliente_nombre, cliente_telefono, cliente_direccion, cliente_notas, items, total, metodo_pago } = req.body;
    const { crearPedidoManual } = require('../services/delivery/llamafood');
    const result = await crearPedidoManual(tid, {
      cliente_nombre, cliente_telefono, cliente_direccion, cliente_notas,
      items: items || [], total: total || 0, subtotal: total || 0,
      metodo_pago: metodo_pago || 'efectivo'
    });
    registrarAudit({ tenantId: tid, usuarioId: req.session?.user?.id||0, accion: 'INSERT', modulo: 'delivery', tabla: 'delivery_pedidos', ip: req.ip });
    res.status(201).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /delivery/historial — Order history
router.get('/historial', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { plataforma, desde, hasta } = req.query;
    let query = 'SELECT * FROM delivery_pedidos WHERE tenant_id=?';
    const params = [tid];
    if (plataforma) { query += ' AND plataforma=?'; params.push(plataforma); }
    if (desde) { query += ' AND created_at >= ?'; params.push(desde); }
    if (hasta) { query += ' AND created_at <= ?'; params.push(hasta); }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const [pedidos] = await db.query(query, params);
    res.json(pedidos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/delivery/:id/estado — Update order status
router.put('/:id/estado', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { estado } = req.body;
    const { actualizarEstado } = require('../services/delivery/delivery-core');
    await actualizarEstado(tid, req.params.id, estado);

    const [[pedido]] = await db.query('SELECT plataforma, pedido_externo_id FROM delivery_pedidos WHERE id=? AND tenant_id=?', [req.params.id, tid]);
    if (pedido && estado === 'listo') {
      try {
        if (pedido.plataforma === 'pedidosya') {
          const peya = require('../services/delivery/pedidosya');
          await peya.marcarListo(tid, pedido.pedido_externo_id);
        }
      } catch (_) {}
    }

    res.json({ message: 'Estado actualizado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /delivery/analytics — Analytics endpoint
router.get('/analytics', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const dias = Number(req.query.dias) || 30;
    const { calcularAnalytics } = require('../services/delivery/delivery-core');
    const data = await calcularAnalytics(tid, dias);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/delivery/webhook/rappi — Rappi webhook (no auth required)
router.post('/webhook/rappi', async (req, res) => {
  res.status(200).json({ status: 'ok' });
  try {
    const { procesarWebhook } = require('../services/delivery/webhook-handler');
    await procesarWebhook('rappi', req);
  } catch (e) {
    console.error('Rappi webhook error:', e.message);
  }
});

// POST /api/delivery/webhook/pedidosya — PedidosYa webhook (no auth required)
router.post('/webhook/pedidosya', async (req, res) => {
  res.status(200).json({ status: 'ok' });
  try {
    const { procesarWebhook } = require('../services/delivery/webhook-handler');
    await procesarWebhook('pedidosya', req);
  } catch (e) {
    console.error('PedidosYa webhook error:', e.message);
  }
});

// GET /api/delivery/sync-menu/:plataforma — Sync menu
router.get('/sync-menu/:plataforma', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const plat = req.params.plataforma;
    let result;
    if (plat === 'rappi') {
      const rappi = require('../services/delivery/rappi');
      result = await rappi.sincronizarMenu(tid);
    } else if (plat === 'pedidosya') {
      const peya = require('../services/delivery/pedidosya');
      result = await peya.sincronizarMenu(tid);
    } else {
      return res.status(400).json({ error: 'Plataforma no soporta sync de menu' });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
