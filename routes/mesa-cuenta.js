'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── helpers ────────────────────────────────────────────────────────────────

function groupByRonda(items) {
  const map = {};
  for (const item of items) {
    const n = item.ronda_num || 1;
    if (!map[n]) {
      map[n] = {
        num: n,
        created_at: item.created_at,
        items: [],
        total: 0,
        // overall ronda estado: 'en_cocina' if ANY item still cooking, else 'servido'
        estado_display: 'servido'
      };
    }
    map[n].items.push(item);
    map[n].total += Number(item.subtotal || 0);
    if (item.estado_display === 'en_cocina') {
      map[n].estado_display = 'en_cocina';
    }
  }
  return Object.values(map).sort((a, b) => a.num - b.num);
}

async function getMesaData(tenantId, mesaId) {
  const [[mesa]] = await db.query(
    'SELECT * FROM mesas WHERE id = ? AND tenant_id = ?',
    [mesaId, tenantId]
  );
  if (!mesa) return null;

  const [[pedido]] = await db.query(
    "SELECT * FROM pedidos WHERE mesa_id = ? AND tenant_id = ? AND estado NOT IN ('cerrado','cancelado') ORDER BY created_at DESC LIMIT 1",
    [mesaId, tenantId]
  );

  let rondas = [];
  let totalAcumulado = 0;
  let items = [];

  if (pedido) {
    const [rows] = await db.query(`
      SELECT i.*,
             COALESCE(i.ronda_num, 1) AS ronda_num,
             pr.nombre AS producto_nombre,
             CASE
               WHEN i.estado IN ('preparando') THEN 'en_cocina'
               WHEN i.estado IN ('listo','entregado','servido') THEN 'servido'
               ELSE i.estado
             END AS estado_display
      FROM pedido_items i
      JOIN pedidos p  ON p.id = i.pedido_id
      JOIN productos pr ON pr.id = i.producto_id
      WHERE p.mesa_id = ? AND p.tenant_id = ?
        AND p.estado NOT IN ('cerrado','cancelado')
        AND i.estado NOT IN ('cancelado','rechazado')
      ORDER BY COALESCE(i.ronda_num,1) ASC, i.created_at ASC
    `, [mesaId, tenantId]);

    items = rows;
    rondas = groupByRonda(rows);
    totalAcumulado = rondas.reduce((s, r) => s + r.total, 0);
  }

  return { mesa, pedido, rondas, items, totalAcumulado };
}

// ─── GET /mesa/:mesaId ── Mesa Abierta (Vjm11) ──────────────────────────────

router.get('/:mesaId', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  const mesaId   = Number(req.params.mesaId);
  try {
    const data = await getMesaData(tenantId, mesaId);
    if (!data || !data.mesa) return res.status(404).send('Mesa no encontrada');
    res.render('mesa-cuenta', {
      user:            req.session.user,
      mesa:            data.mesa,
      pedido:          data.pedido,
      rondas:          data.rondas,
      total_acumulado: data.totalAcumulado
    });
  } catch (e) {
    console.error('[mesa-cuenta GET /:mesaId]', e);
    res.status(500).send('Error cargando mesa');
  }
});

// ─── GET /mesa/:mesaId/cuenta ── Cuenta Parcial (zOLSq) ─────────────────────

router.get('/:mesaId/cuenta', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  const mesaId   = Number(req.params.mesaId);
  try {
    const data = await getMesaData(tenantId, mesaId);
    if (!data || !data.mesa) return res.status(404).send('Mesa no encontrada');
    const subtotal = data.totalAcumulado;
    const igv      = Math.round(subtotal * 0.18 * 100) / 100;
    const total    = Math.round((subtotal + igv) * 100) / 100;
    res.render('mesa-cobrar', {
      user:     req.session.user,
      mesa:     data.mesa,
      pedido:   data.pedido,
      rondas:   data.rondas,
      items:    data.items,
      subtotal,
      igv,
      total,
      step:     'cuenta'
    });
  } catch (e) {
    console.error('[mesa-cuenta GET /:mesaId/cuenta]', e);
    res.status(500).send('Error cargando cuenta');
  }
});

// ─── GET /mesa/:mesaId/ronda ── Agregar Ronda (9keqS) ───────────────────────

router.get('/:mesaId/ronda', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  const mesaId   = Number(req.params.mesaId);
  try {
    const [[mesa]] = await db.query(
      'SELECT * FROM mesas WHERE id = ? AND tenant_id = ?',
      [mesaId, tenantId]
    );
    if (!mesa) return res.status(404).send('Mesa no encontrada');

    const [[pedido]] = await db.query(
      "SELECT * FROM pedidos WHERE mesa_id = ? AND tenant_id = ? AND estado NOT IN ('cerrado','cancelado') ORDER BY created_at DESC LIMIT 1",
      [mesaId, tenantId]
    );

    let rondaNum = 1;
    if (pedido) {
      const [[maxRow]] = await db.query(
        'SELECT MAX(COALESCE(ronda_num,1)) AS max_ronda FROM pedido_items WHERE pedido_id = ?',
        [pedido.id]
      );
      rondaNum = ((maxRow && maxRow.max_ronda) ? Number(maxRow.max_ronda) : 0) + 1;
    }

    const [productos] = await db.query(
      'SELECT id, nombre, descripcion, precio, categoria, emoji FROM productos WHERE tenant_id = ? AND activo = true ORDER BY categoria, nombre',
      [tenantId]
    );

    const subtotal = pedido ? Number(pedido.total || 0) : 0;

    res.render('mesa-ronda', {
      user:            req.session.user,
      mesa,
      pedido,
      productos:       productos || [],
      ronda_num:       rondaNum,
      total_acumulado: subtotal
    });
  } catch (e) {
    console.error('[mesa-cuenta GET /:mesaId/ronda]', e);
    res.status(500).send('Error cargando ronda');
  }
});

// ─── POST /mesa/:mesaId/ronda ── Confirm new round ──────────────────────────

router.post('/:mesaId/ronda', async (req, res) => {
  const tenantId     = req.session?.user?.tenant_id;
  const mesaId       = Number(req.params.mesaId);
  const { items }    = req.body || {};

  if (!items?.length) return res.status(400).json({ error: 'Sin items' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[pedido]] = await connection.query(
      "SELECT * FROM pedidos WHERE mesa_id = ? AND tenant_id = ? AND estado NOT IN ('cerrado','cancelado') ORDER BY created_at DESC LIMIT 1",
      [mesaId, tenantId]
    );
    if (!pedido) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const [[maxRow]] = await connection.query(
      'SELECT MAX(COALESCE(ronda_num,1)) AS max_ronda FROM pedido_items WHERE pedido_id = ?',
      [pedido.id]
    );
    const nextRonda = ((maxRow && maxRow.max_ronda) ? Number(maxRow.max_ronda) : 0) + 1;

    const prodIds  = items.map(i => i.producto_id);
    const [prods]  = await connection.query(
      `SELECT id, nombre, precio FROM productos WHERE id IN (${prodIds.map(() => '?').join(',')}) AND tenant_id = ?`,
      [...prodIds, tenantId]
    );
    const prodMap  = Object.fromEntries(prods.map(p => [p.id, p]));

    let roundTotal = 0;
    for (const item of items) {
      const prod = prodMap[item.producto_id];
      if (!prod) continue;
      const cantidad  = Number(item.cantidad) || 1;
      const precio    = Number(prod.precio);
      const subtotal  = cantidad * precio;
      roundTotal     += subtotal;

      await connection.query(
        `INSERT INTO pedido_items
           (pedido_id, producto_id, cantidad, precio_unitario, subtotal, estado, nota, ronda_num, enviado_at, preparado_at, tenant_id)
         VALUES (?, ?, ?, ?, ?, 'preparando', ?, ?, NOW(), NOW(), ?)`,
        [pedido.id, item.producto_id, cantidad, precio, subtotal, item.nota || null, nextRonda, tenantId]
      );
    }

    await connection.query(
      'UPDATE pedidos SET total = total + ? WHERE id = ?',
      [roundTotal, pedido.id]
    );

    await connection.commit();
    connection.release();
    res.json({ ok: true });
  } catch (e) {
    await connection.rollback();
    connection.release();
    console.error('[mesa-cuenta POST /:mesaId/ronda]', e);
    res.status(500).json({ error: 'Error al agregar ronda' });
  }
});

// ─── GET /mesa/:mesaId/cobrar ── Cobrar (nAMZP) ──────────────────────────────

router.get('/:mesaId/cobrar', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  const mesaId   = Number(req.params.mesaId);
  try {
    const data = await getMesaData(tenantId, mesaId);
    if (!data || !data.mesa) return res.status(404).send('Mesa no encontrada');
    const subtotal = data.totalAcumulado;
    const igv      = Math.round(subtotal * 0.18 * 100) / 100;
    const total    = Math.round((subtotal + igv) * 100) / 100;
    res.render('mesa-cobrar', {
      user:     req.session.user,
      mesa:     data.mesa,
      pedido:   data.pedido,
      rondas:   data.rondas,
      items:    data.items,
      subtotal,
      igv,
      total,
      step:     'cobrar'
    });
  } catch (e) {
    console.error('[mesa-cuenta GET /:mesaId/cobrar]', e);
    res.status(500).send('Error cargando cobrar');
  }
});

// ─── POST /mesa/:mesaId/cobrar ── Process payment ───────────────────────────

router.post('/:mesaId/cobrar', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  const mesaId   = Number(req.params.mesaId);
  const { propina_pct, metodo_pago, tipo_comprobante } = req.body || {};

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [[pedido]] = await connection.query(
      "SELECT * FROM pedidos WHERE mesa_id = ? AND tenant_id = ? AND estado NOT IN ('cerrado','cancelado') ORDER BY created_at DESC LIMIT 1",
      [mesaId, tenantId]
    );
    if (!pedido) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const subtotal  = Number(pedido.total || 0);
    const igv       = Math.round(subtotal * 0.18 * 100) / 100;
    const baseTotal = Math.round((subtotal + igv) * 100) / 100;
    const propinaPct = Number(propina_pct || 0);
    const propinaMonto = Math.round(baseTotal * (propinaPct / 100) * 100) / 100;
    const totalFinal = Math.round((baseTotal + propinaMonto) * 100) / 100;

    // Mark all items as servido
    await connection.query(
      "UPDATE pedido_items SET estado = 'servido' WHERE pedido_id = ?",
      [pedido.id]
    );

    // Close pedido
    await connection.query(
      "UPDATE pedidos SET estado = 'cerrado', updated_at = NOW() WHERE id = ?",
      [pedido.id]
    );

    // Free mesa
    await connection.query(
      "UPDATE mesas SET estado = 'libre' WHERE id = ?",
      [mesaId]
    );

    // Insert factura record
    await connection.query(
      `INSERT INTO facturas
         (pedido_id, tenant_id, subtotal, igv, propina, propina_pct, total, metodo_pago, tipo_comprobante, estado, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitida', NOW())`,
      [pedido.id, tenantId, subtotal, igv, propinaMonto, propinaPct, totalFinal,
       metodo_pago || 'efectivo', tipo_comprobante || 'boleta']
    );

    await connection.commit();
    connection.release();
    res.json({ ok: true, redirect: '/pedidos' });
  } catch (e) {
    await connection.rollback();
    connection.release();
    console.error('[mesa-cuenta POST /:mesaId/cobrar]', e);
    res.status(500).json({ error: 'Error al cobrar' });
  }
});

module.exports = router;
