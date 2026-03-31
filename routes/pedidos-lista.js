'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  try {
    // Get all active mesa orders (excluding delivery)
    const [pedidosMesa] = await db.query(`
      SELECT p.*, m.numero AS mesa_numero,
        COUNT(i.id) FILTER (WHERE i.estado IN ('preparando','listo')) AS items_cocina,
        COUNT(i.id) FILTER (WHERE i.estado = 'pendiente') AS items_pendientes,
        SUM(i.subtotal) AS total_real
      FROM pedidos p
      JOIN mesas m ON m.id = p.mesa_id
      LEFT JOIN pedido_items i ON i.pedido_id = p.id
      WHERE p.estado NOT IN ('cerrado','cancelado','rechazado')
        AND p.tenant_id = ?
        AND NOT EXISTS (SELECT 1 FROM pedidos_delivery pd WHERE pd.pedido_id = p.id)
      GROUP BY p.id, m.numero
      ORDER BY p.created_at DESC
    `, [tenantId]);

    // Get all active delivery orders
    const [pedidosDelivery] = await db.query(`
      SELECT p.*, pd.tipo AS delivery_tipo, pd.nombre_cliente, pd.direccion,
        COUNT(i.id) FILTER (WHERE i.estado IN ('preparando','listo')) AS items_cocina,
        SUM(i.subtotal) AS total_real
      FROM pedidos p
      JOIN pedidos_delivery pd ON pd.pedido_id = p.id
      LEFT JOIN pedido_items i ON i.pedido_id = p.id
      WHERE p.estado NOT IN ('cerrado','cancelado','rechazado')
        AND p.tenant_id = ?
      GROUP BY p.id, pd.tipo, pd.nombre_cliente, pd.direccion
      ORDER BY p.created_at DESC
    `, [tenantId]);

    res.render('pedidos-lista', {
      user: req.session.user,
      pedidosMesa: pedidosMesa || [],
      pedidosDelivery: pedidosDelivery || []
    });
  } catch (e) {
    console.error('[pedidos-lista GET /]', e);
    res.status(500).send('Error cargando pedidos');
  }
});

module.exports = router;
