'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── helper: find or create "Para Llevar" virtual mesa ──────────────────────

async function getOrCreateParaLlevarMesa(connection, tenantId) {
  const [[existing]] = await connection.query(
    "SELECT id FROM mesas WHERE tenant_id = ? AND descripcion = 'para_llevar_virtual' LIMIT 1",
    [tenantId]
  );
  if (existing) return existing.id;

  const [[inserted]] = await connection.query(
    `INSERT INTO mesas (tenant_id, numero, descripcion, estado, capacidad)
     VALUES (?, 0, 'para_llevar_virtual', 'libre', 0)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [tenantId]
  );
  if (inserted) return inserted.id;

  // If ON CONFLICT fired, fetch again
  const [[row]] = await connection.query(
    "SELECT id FROM mesas WHERE tenant_id = ? AND descripcion = 'para_llevar_virtual' LIMIT 1",
    [tenantId]
  );
  return row ? row.id : null;
}

// ─── GET / ── Para Llevar form (AGTA5) ──────────────────────────────────────

router.get('/', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  try {
    const [productos] = await db.query(
      'SELECT id, nombre, descripcion, precio, categoria, emoji FROM productos WHERE tenant_id = ? AND activo = true ORDER BY categoria, nombre',
      [tenantId]
    );
    res.render('para-llevar-nuevo', {
      user:      req.session.user,
      productos: productos || []
    });
  } catch (e) {
    console.error('[para-llevar GET /]', e);
    res.status(500).send('Error cargando para llevar');
  }
});

// ─── POST /confirmar ─────────────────────────────────────────────────────────

router.post('/confirmar', async (req, res) => {
  const tenantId      = req.session?.user?.tenant_id;
  const meseroNombre  = req.session?.user?.nombre || '';
  const { nombre_cliente, items } = req.body || {};

  if (!items?.length) return res.status(400).json({ error: 'Sin items' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const mesaId = await getOrCreateParaLlevarMesa(connection, tenantId);
    if (!mesaId) throw new Error('No se pudo crear mesa para llevar');

    // Create new pedido for this order (each para-llevar is independent)
    const clienteNombre = (nombre_cliente || '').trim() || 'Cliente';
    const [[newPedido]] = await connection.query(
      `INSERT INTO pedidos (mesa_id, mesero_nombre, estado, total, notas, tenant_id)
       VALUES (?, ?, 'abierto', 0, ?, ?)
       RETURNING id`,
      [mesaId, meseroNombre, `Para llevar: ${clienteNombre}`, tenantId]
    );
    const pedidoId = newPedido.id;

    const prodIds = items.map(i => i.producto_id);
    const [prods] = await connection.query(
      `SELECT id, nombre, precio FROM productos WHERE id IN (${prodIds.map(() => '?').join(',')}) AND tenant_id = ?`,
      [...prodIds, tenantId]
    );
    const prodMap = Object.fromEntries(prods.map(p => [p.id, p]));

    let total = 0;
    for (const item of items) {
      const prod = prodMap[item.producto_id];
      if (!prod) continue;
      const cantidad = Number(item.cantidad) || 1;
      const precio   = Number(prod.precio);
      const subtotal = cantidad * precio;
      total         += subtotal;

      await connection.query(
        `INSERT INTO pedido_items
           (pedido_id, producto_id, cantidad, precio_unitario, subtotal, estado, ronda_num, enviado_at, preparado_at, tenant_id)
         VALUES (?, ?, ?, ?, ?, 'preparando', 1, NOW(), NOW(), ?)`,
        [pedidoId, item.producto_id, cantidad, precio, subtotal, tenantId]
      );
    }

    await connection.query(
      'UPDATE pedidos SET total = ? WHERE id = ?',
      [total, pedidoId]
    );

    // Create pedidos_delivery record for para_llevar
    try {
      await connection.query(
        `INSERT INTO delivery_pedidos
           (tenant_id, plataforma, pedido_interno_id, estado_interno, cliente_nombre, subtotal, total)
         VALUES (?, 'para_llevar', ?, 'recibido', ?, ?, ?)`,
        [tenantId, pedidoId, clienteNombre, total, total]
      );
    } catch (_) {
      // delivery_pedidos table may not have para_llevar check constraint — ignore gracefully
    }

    await connection.commit();
    connection.release();
    res.json({ ok: true, pedido_id: pedidoId });
  } catch (e) {
    await connection.rollback();
    connection.release();
    console.error('[para-llevar POST /confirmar]', e);
    res.status(500).json({ error: 'Error al confirmar para llevar' });
  }
});

// ─── GET /lista ── Active para llevar orders (JSON) ─────────────────────────

router.get('/lista', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  try {
    const [pedidos] = await db.query(`
      SELECT p.id, p.notas, p.total, p.estado, p.created_at,
             COUNT(i.id) AS items_count
      FROM pedidos p
      JOIN mesas m ON m.id = p.mesa_id
      LEFT JOIN pedido_items i ON i.pedido_id = p.id AND i.estado NOT IN ('cancelado','rechazado')
      WHERE p.tenant_id = ?
        AND m.descripcion = 'para_llevar_virtual'
        AND p.estado NOT IN ('cerrado','cancelado')
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `, [tenantId]);
    res.json({ pedidos: pedidos || [] });
  } catch (e) {
    console.error('[para-llevar GET /lista]', e);
    res.status(500).json({ error: 'Error cargando lista' });
  }
});

module.exports = router;
