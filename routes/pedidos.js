/**
 * Pedidos consolidated route (Mesa + Delivery + Para Llevar).
 *
 * Iter 1.6: GET /pedidos renders the consolidated view with empty arrays.
 * Iter 1.6.1 (demo readiness): minimal data fetching against the existing
 * pedidos / pedidos_delivery / mesas tables. POST endpoints still stub
 * until iter 1.7.
 *
 * Spec: docs/superpowers/specs/2026-04-08-pedidos-consolidation-design.md
 * Plan: docs/superpowers/plans/2026-04-08-pedidos-consolidation.md
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { renderForDevice } = require('../lib/deviceRouter');

// GET /pedidos — consolidated view with 3 tabs
router.get('/', requireAuth, async (req, res) => {
    const tab = (req.query.tab === 'delivery' || req.query.tab === 'para_llevar')
        ? req.query.tab
        : 'mesa';
    const tenantId = req.session?.user?.tenant_id || req.tenantId || 1;

    let mesaPedidos = [];
    let deliveryPedidos = [];
    let paraLlevarPedidos = [];

    try {
        // Mesa tab: list of mesas (the consolidated view shows mesa cards, not pedido rows)
        const [mesasRows] = await db.query(
            `SELECT id, numero, estado FROM mesas WHERE tenant_id=? ORDER BY numero`,
            [tenantId]
        );
        mesaPedidos = mesasRows || [];

        // Delivery tab: pedidos joined with pedidos_delivery where tipo='delivery'
        const [delivRows] = await db.query(
            `SELECT p.id, p.total, p.estado, p.created_at,
                    pd.nombre_cliente   AS cliente_nombre,
                    pd.direccion        AS direccion_entrega,
                    pd.telefono         AS cliente_telefono,
                    pd.tiempo_estimado_min,
                    pd.plataforma,
                    pd.estado_entrega,
                    TO_CHAR(p.created_at + (pd.tiempo_estimado_min || ' minutes')::interval, 'HH24:MI') AS hora_estimada_entrega
               FROM pedidos p
               JOIN pedidos_delivery pd ON pd.pedido_id = p.id
              WHERE p.tenant_id = ?
                AND pd.tipo = 'delivery'
                AND p.estado NOT IN ('cerrado','cancelado','rechazado')
              ORDER BY p.created_at DESC
              LIMIT 50`,
            [tenantId]
        );
        deliveryPedidos = delivRows || [];

        // Para llevar tab: pedidos joined with pedidos_delivery where tipo='para_llevar'
        const [llevarRows] = await db.query(
            `SELECT p.id, p.total, p.estado, p.created_at,
                    pd.nombre_cliente   AS cliente_nombre_recojo,
                    pd.telefono         AS cliente_telefono,
                    pd.tiempo_estimado_min,
                    pd.estado_entrega,
                    TO_CHAR(p.created_at + (pd.tiempo_estimado_min || ' minutes')::interval, 'HH24:MI') AS hora_recojo,
                    (pd.estado_entrega = 'en_camino' OR pd.estado_entrega = 'entregado') AS listo_para_recojo
               FROM pedidos p
               JOIN pedidos_delivery pd ON pd.pedido_id = p.id
              WHERE p.tenant_id = ?
                AND pd.tipo = 'para_llevar'
                AND p.estado NOT IN ('cerrado','cancelado','rechazado')
              ORDER BY p.created_at DESC
              LIMIT 50`,
            [tenantId]
        );
        paraLlevarPedidos = llevarRows || [];
    } catch (e) {
        console.error('[pedidos GET /] fetch failed:', e.message);
        // Render with empty arrays if any query fails — view degrades gracefully
    }

    const counts = {
        mesa: mesaPedidos.filter(m => m.estado === 'ocupada').length,
        delivery: deliveryPedidos.length,
        para_llevar: paraLlevarPedidos.length,
    };

    const data = {
        tab,
        counts,
        mesaPedidos,
        deliveryPedidos,
        paraLlevarPedidos,
        user: req.session?.user || null,
        reqPath: '/pedidos',
        csrfToken: res.locals.csrfToken || '',
    };

    return renderForDevice(req, res, 'pedidos', data);
});

// POST /api/pedidos/delivery — stubbed until iter 1.7
router.post('/delivery', requireAuth, (req, res) => {
    return res.status(501).json({
        error: 'Not implemented',
        message: 'Creacion de pedidos delivery llega en iter 1.7 (pendiente de correr migration y endpoints POST).'
    });
});

// POST /api/pedidos/para-llevar — stubbed until iter 1.7
router.post('/para-llevar', requireAuth, (req, res) => {
    return res.status(501).json({
        error: 'Not implemented',
        message: 'Creacion de pedidos para llevar llega en iter 1.7.'
    });
});

// PATCH /api/pedidos/:id/listo — stubbed
router.patch('/:id/listo', requireAuth, (req, res) => {
    return res.status(501).json({ error: 'Not implemented', message: 'Llega en iter 1.7.' });
});

// PATCH /api/pedidos/:id/asignar-motorizado — stubbed
router.patch('/:id/asignar-motorizado', requireAuth, (req, res) => {
    return res.status(501).json({ error: 'Not implemented', message: 'Llega en iter 1.7.' });
});

module.exports = router;
