const express = require('express');
const router = express.Router();
const db = require('../db');
const { calcularIGV, validarRUC, validarDNI, emitirComprobante } = require('../services/sunat');

// GET /sunat - Panel SUNAT con config y historial de comprobantes
router.get('/', async (req, res) => {
    const tid = req.tenantId || 1;
    const [[config]] = await db.query('SELECT * FROM config_sunat WHERE tenant_id=?', [tid]);
    const [comprobantes] = await db.query(
        'SELECT * FROM comprobantes_electronicos WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50',
        [tid]
    );
    res.render('sunat', { config: config || {}, comprobantes });
});

// POST /api/sunat/config - Guardar configuracion SUNAT
router.post('/config', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const {
            ruc_emisor, razon_social_emisor, direccion_emisor,
            proveedor_ose, ose_token, ose_ruta, produccion, igv_porcentaje
        } = req.body;

        if (ruc_emisor && !validarRUC(ruc_emisor)) {
            return res.status(400).json({ error: 'RUC invalido (11 digitos, algoritmo modulo 11)' });
        }

        await db.query(
            `UPDATE config_sunat
             SET ruc_emisor=?, razon_social_emisor=?, direccion_emisor=?,
                 proveedor_ose=?, ose_token=?, ose_ruta=?, produccion=?, igv_porcentaje=?
             WHERE tenant_id=?`,
            [
                ruc_emisor || null,
                razon_social_emisor || null,
                direccion_emisor || null,
                proveedor_ose || 'nubefact',
                ose_token || null,
                ose_ruta || null,
                produccion ? true : false,
                igv_porcentaje || 18,
                tid
            ]
        );
        res.json({ message: 'Configuracion SUNAT guardada' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/sunat/emitir/:facturaId - Emitir comprobante electronico
router.post('/emitir/:facturaId', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const facturaId = req.params.facturaId;

        if (!facturaId || isNaN(Number(facturaId))) {
            return res.status(400).json({ error: 'facturaId invalido' });
        }

        const result = await emitirComprobante(tid, Number(facturaId), req.body.tipo);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/sunat/calcular-igv?total=35 - Calcular desglose IGV
router.get('/calcular-igv', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [[config]] = await db.query(
            'SELECT igv_porcentaje FROM config_sunat WHERE tenant_id=?',
            [tid]
        );
        const igvPct = Number(config?.igv_porcentaje) || 18;
        const total = Number(req.query.total);
        if (isNaN(total) || total < 0) {
            return res.status(400).json({ error: 'Parametro total invalido' });
        }
        const result = calcularIGV(total, igvPct);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

// GET /api/sunat/comprobantes - Historial con filtros
router.get('/comprobantes', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { desde, hasta, tipo, estado } = req.query;

        let sql = `
            SELECT ce.*, f.total AS factura_total
            FROM comprobantes_electronicos ce
            LEFT JOIN facturas f ON f.id = ce.factura_id
            WHERE ce.tenant_id = ?
        `;
        const params = [tid];

        if (desde) { sql += ' AND ce.fecha_emision::date >= ?'; params.push(desde); }
        if (hasta) { sql += ' AND ce.fecha_emision::date <= ?';  params.push(hasta); }
        if (tipo)  { sql += ' AND ce.tipo = ?';                  params.push(tipo); }
        if (estado){ sql += ' AND ce.estado = ?';                params.push(estado); }

        sql += ' ORDER BY ce.created_at DESC LIMIT 100';

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/sunat/comprobantes/:id - Detalle de un comprobante
router.get('/comprobantes/:id', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [[comprobante]] = await db.query(
            `SELECT ce.*, f.total AS factura_total, f.fecha AS factura_fecha
             FROM comprobantes_electronicos ce
             LEFT JOIN facturas f ON f.id = ce.factura_id
             WHERE ce.id = ? AND ce.tenant_id = ?`,
            [req.params.id, tid]
        );
        if (!comprobante) {
            return res.status(404).json({ error: 'Comprobante no encontrado' });
        }
        res.json(comprobante);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/sunat/comprobantes/:id/pdf - Redirige al PDF del comprobante en NubeFact
router.get('/comprobantes/:id/pdf', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [[comprobante]] = await db.query(
            'SELECT id, pdf_url, estado FROM comprobantes_electronicos WHERE id = ? AND tenant_id = ?',
            [req.params.id, tid]
        );

        if (!comprobante) {
            return res.status(404).json({ error: 'Comprobante no encontrado' });
        }

        if (!comprobante.pdf_url) {
            return res.status(404).json({
                error: 'PDF no disponible',
                motivo: comprobante.estado === 'rechazado'
                    ? 'El comprobante fue rechazado por SUNAT'
                    : comprobante.estado === 'pendiente'
                        ? 'El comprobante aun no fue enviado al OSE'
                        : 'No se genero PDF para este comprobante'
            });
        }

        // Redireccion permanente al PDF almacenado en NubeFact
        res.redirect(302, comprobante.pdf_url);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
