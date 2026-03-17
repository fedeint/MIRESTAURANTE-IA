const express = require('express');
const router = express.Router();
const db = require('../db');
const { calcularIGV, validarRUC, validarDNI, emitirComprobante } = require('../services/sunat');

// GET /sunat - Config SUNAT
router.get('/', async (req, res) => {
    const tid = req.tenantId || 1;
    const [[config]] = await db.query('SELECT * FROM config_sunat WHERE tenant_id=?', [tid]);
    const [comprobantes] = await db.query(
        'SELECT * FROM comprobantes_electronicos WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50', [tid]
    );
    res.render('sunat', { config: config || {}, comprobantes });
});

// POST /api/sunat/config - Guardar config
router.post('/config', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { ruc_emisor, razon_social_emisor, direccion_emisor, proveedor_ose, ose_token, ose_ruta, produccion, igv_porcentaje } = req.body;

        if (ruc_emisor && !validarRUC(ruc_emisor)) {
            return res.status(400).json({ error: 'RUC invalido (11 digitos, algoritmo modulo 11)' });
        }

        await db.query(
            `UPDATE config_sunat SET ruc_emisor=?, razon_social_emisor=?, direccion_emisor=?, proveedor_ose=?, ose_token=?, ose_ruta=?, produccion=?, igv_porcentaje=? WHERE tenant_id=?`,
            [ruc_emisor||null, razon_social_emisor||null, direccion_emisor||null, proveedor_ose||'nubefact', ose_token||null, ose_ruta||null, produccion ? 1 : 0, igv_porcentaje||18, tid]
        );
        res.json({ message: 'Configuracion SUNAT guardada' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/sunat/emitir/:facturaId - Emitir comprobante
router.post('/emitir/:facturaId', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const result = await emitirComprobante(tid, req.params.facturaId, req.body.tipo);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/sunat/calcular-igv?total=35 - Calcular IGV
router.get('/calcular-igv', async (req, res) => {
    const tid = req.tenantId || 1;
    const [[config]] = await db.query('SELECT igv_porcentaje FROM config_sunat WHERE tenant_id=?', [tid]);
    const igvPct = Number(config?.igv_porcentaje) || 18;
    const result = calcularIGV(Number(req.query.total) || 0, igvPct);
    res.json(result);
});

// GET /api/sunat/validar-ruc/:ruc
router.get('/validar-ruc/:ruc', (req, res) => {
    const valido = validarRUC(req.params.ruc);
    res.json({ valido, ruc: req.params.ruc });
});

// GET /api/sunat/validar-dni/:dni
router.get('/validar-dni/:dni', (req, res) => {
    const valido = validarDNI(req.params.dni);
    res.json({ valido, dni: req.params.dni });
});

// GET /api/sunat/comprobantes - Historial
router.get('/comprobantes', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { desde, hasta, tipo, estado } = req.query;
        let sql = 'SELECT ce.*, f.total FROM comprobantes_electronicos ce LEFT JOIN facturas f ON f.id=ce.factura_id WHERE ce.tenant_id=?';
        const params = [tid];
        if (desde) { sql += ' AND DATE(ce.fecha_emision) >= ?'; params.push(desde); }
        if (hasta) { sql += ' AND DATE(ce.fecha_emision) <= ?'; params.push(hasta); }
        if (tipo) { sql += ' AND ce.tipo = ?'; params.push(tipo); }
        if (estado) { sql += ' AND ce.estado = ?'; params.push(estado); }
        sql += ' ORDER BY ce.created_at DESC LIMIT 100';
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
