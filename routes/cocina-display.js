'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET / — Mobile kitchen display view
router.get('/', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  try {
    const [items] = await db.query(`
      SELECT
        i.id, i.pedido_id, i.estado, i.cantidad, i.nota,
        i.enviado_at, i.preparado_at, i.listo_at,
        p.id AS pid, p.mesa_id, p.mesero_nombre,
        m.numero AS mesa_numero, m.descripcion AS mesa_desc,
        pr.nombre AS producto_nombre,
        pd.tipo AS delivery_tipo
      FROM pedido_items i
      JOIN pedidos p ON p.id = i.pedido_id
      JOIN mesas m ON m.id = p.mesa_id
      JOIN productos pr ON pr.id = i.producto_id
      LEFT JOIN pedidos_delivery pd ON pd.pedido_id = p.id
      WHERE i.estado IN ('preparando','listo')
        AND p.tenant_id = ?
      ORDER BY COALESCE(i.enviado_at, i.created_at) ASC, i.id ASC
    `, [tenantId]);
    res.render('cocina-display', { user: req.session.user, items: items || [] });
  } catch (e) {
    console.error('[cocina-display GET /]', e);
    res.status(500).send('Error cargando cocina');
  }
});

// GET /api/cola — JSON for polling
router.get('/api/cola', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  try {
    const [items] = await db.query(`
      SELECT
        i.id, i.pedido_id, i.estado, i.cantidad, i.nota,
        i.enviado_at, i.preparado_at, i.listo_at,
        p.id AS pid, p.mesa_id, p.mesero_nombre,
        m.numero AS mesa_numero,
        pr.nombre AS producto_nombre,
        pd.tipo AS delivery_tipo
      FROM pedido_items i
      JOIN pedidos p ON p.id = i.pedido_id
      JOIN mesas m ON m.id = p.mesa_id
      JOIN productos pr ON pr.id = i.producto_id
      LEFT JOIN pedidos_delivery pd ON pd.pedido_id = p.id
      WHERE i.estado IN ('preparando','listo')
        AND p.tenant_id = ?
      ORDER BY COALESCE(i.enviado_at, i.created_at) ASC, i.id ASC
    `, [tenantId]);
    res.json(items || []);
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
