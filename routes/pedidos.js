/**
 * Pedidos consolidated route (Mesa + Delivery + Para Llevar).
 *
 * Iter 1.6: GET /pedidos renders the consolidated view with empty arrays.
 * Data fetching and POST endpoints are stubs here — the real implementation
 * lands in iter 1.7 after the migration runs and the full data flow is in
 * place.
 *
 * Spec: docs/superpowers/specs/2026-04-08-pedidos-consolidation-design.md
 * Plan: docs/superpowers/plans/2026-04-08-pedidos-consolidation.md
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { renderForDevice } = require('../lib/deviceRouter');

// GET /pedidos — consolidated view with 3 tabs
router.get('/', requireAuth, async (req, res) => {
    const tab = (req.query.tab === 'delivery' || req.query.tab === 'para_llevar')
        ? req.query.tab
        : 'mesa';

    // TODO iter 1.7: fetch real data from pedidos table after migration runs.
    // For now we render the empty state so the view is accessible immediately
    // after iter 1.6 merges.
    const data = {
        tab,
        counts: { mesa: 0, delivery: 0, para_llevar: 0 },
        mesaPedidos: [],
        deliveryPedidos: [],
        paraLlevarPedidos: [],
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
