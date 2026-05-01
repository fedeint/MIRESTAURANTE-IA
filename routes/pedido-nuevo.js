'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET / — Step 1: Seleccionar mesa
router.get('/', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  try {
    const [mesas] = await db.query(`
      SELECT m.*,
        CASE WHEN COALESCE(stats.items_activos,0) > 0 THEN 'ocupada' ELSE 'libre' END AS estado
      FROM mesas m
      LEFT JOIN (
        SELECT p.mesa_id, COUNT(i.id) AS items_activos
        FROM pedidos p
        JOIN pedido_items i ON i.pedido_id = p.id
        WHERE p.estado NOT IN ('cerrado','cancelado','rechazado')
          AND i.estado NOT IN ('cancelado','rechazado')
        GROUP BY p.mesa_id
      ) stats ON stats.mesa_id = m.id
      WHERE m.tenant_id = ?
      ORDER BY m.numero
    `, [tenantId]);
    res.render('pedido-nuevo', { user: req.session.user, mesas: mesas || [], step: 1 });
  } catch (e) {
    console.error('[pedido-nuevo GET /]', e);
    res.status(500).send('Error cargando mesas');
  }
});

// GET /mesa/:mesaId/productos — Step 2: Menu (returns JSON for the SPA)
router.get('/mesa/:mesaId/productos', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  const mesaId = Number(req.params.mesaId);
  try {
    const [[mesa]] = await db.query('SELECT * FROM mesas WHERE id = ? AND tenant_id = ?', [mesaId, tenantId]);
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    const [productos] = await db.query(
      'SELECT id, nombre, descripcion, precio, categoria, emoji FROM productos WHERE tenant_id = ? AND activo = true ORDER BY categoria, nombre',
      [tenantId]
    );
    res.json({ mesa, productos });
  } catch (e) {
    console.error('[pedido-nuevo GET /mesa/:id/productos]', e);
    res.status(500).json({ error: 'Error cargando productos' });
  }
});

// POST /confirmar — Step 3 -> Enviar a cocina
// Body: { mesa_id, items: [{ producto_id, cantidad, nota }] }
router.post('/confirmar', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  const meseroNombre = req.session?.user?.nombre || '';
  const { mesa_id, items } = req.body || {};

  if (!mesa_id || !items?.length) return res.status(400).json({ error: 'Datos incompletos' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Find or create open pedido for this mesa
    let pedidoId;
    const [[existingPedido]] = await connection.query(
      "SELECT id FROM pedidos WHERE mesa_id = ? AND estado = 'abierto' AND tenant_id = ? LIMIT 1",
      [mesa_id, tenantId]
    );

    if (existingPedido) {
      pedidoId = existingPedido.id;
    } else {
      const [[newPedido]] = await connection.query(
        "INSERT INTO pedidos (mesa_id, mesero_nombre, estado, total, tenant_id) VALUES (?, ?, 'abierto', 0, ?) RETURNING id",
        [mesa_id, meseroNombre, tenantId]
      );
      pedidoId = newPedido.id;
    }

    // Get product prices
    const prodIds = items.map(i => i.producto_id);
    const [productos] = await connection.query(
      `SELECT id, nombre, precio FROM productos WHERE id IN (${prodIds.map(() => '?').join(',')}) AND tenant_id = ?`,
      [...prodIds, tenantId]
    );
    const prodMap = Object.fromEntries(productos.map(p => [p.id, p]));

    // Insert items + set to preparando immediately
    const insertedItems = [];
    let totalPedido = 0;
    for (const item of items) {
      const prod = prodMap[item.producto_id];
      if (!prod) continue;
      const cantidad = Number(item.cantidad) || 1;
      const precio = Number(prod.precio);
      const subtotal = cantidad * precio;
      totalPedido += subtotal;

      const [[newItem]] = await connection.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, estado, nota, enviado_at, preparado_at, tenant_id)
         VALUES (?, ?, ?, ?, ?, 'preparando', ?, NOW(), NOW(), ?) RETURNING id`,
        [pedidoId, item.producto_id, cantidad, precio, subtotal, item.nota || null, tenantId]
      );
      insertedItems.push({ id: newItem.id, nombre: prod.nombre, cantidad });
    }

    // Update pedido total
    await connection.query(
      'UPDATE pedidos SET total = total + ? WHERE id = ?',
      [totalPedido, pedidoId]
    );

    // Update mesa to ocupada
    await connection.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ?", [mesa_id]);

    await connection.commit();
    connection.release();

    res.json({ ok: true, pedido_id: pedidoId, items: insertedItems });
  } catch (e) {
    await connection.rollback();
    connection.release();
    console.error('[pedido-nuevo POST /confirmar]', e);
    res.status(500).json({ error: 'Error al confirmar pedido' });
  }
});

module.exports = router;
