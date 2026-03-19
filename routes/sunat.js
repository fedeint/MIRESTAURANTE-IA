const express = require('express');
const router = express.Router();
const db = require('../db');
const { calcularIGV, validarRUC, validarDNI, emitirComprobante } = require('../services/sunat');
const {
    enviarComprobantePorWhatsApp,
    enviarFacturaPorWhatsApp,
    enviarMensajePrueba,
    ensureWhatsAppSchema
} = require('../services/whatsapp');

// Bootstrap WhatsApp schema on first load (non-blocking)
ensureWhatsAppSchema().catch(err =>
    console.error('[sunat router] WhatsApp schema init failed:', err.message)
);

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

// POST /api/sunat/config - Guardar configuracion SUNAT (incluye WhatsApp)
router.post('/config', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const {
            ruc_emisor, razon_social_emisor, direccion_emisor,
            proveedor_ose, ose_token, ose_ruta, produccion, igv_porcentaje,
            // WhatsApp fields
            whatsapp_provider, whatsapp_token, whatsapp_phone_id,
            whatsapp_twilio_sid, whatsapp_twilio_token, whatsapp_twilio_from,
            whatsapp_activo
        } = req.body;

        if (ruc_emisor && !validarRUC(ruc_emisor)) {
            return res.status(400).json({ error: 'RUC invalido (11 digitos, algoritmo modulo 11)' });
        }

        await db.query(
            `UPDATE config_sunat
             SET ruc_emisor=?, razon_social_emisor=?, direccion_emisor=?,
                 proveedor_ose=?, ose_token=?, ose_ruta=?, produccion=?, igv_porcentaje=?,
                 whatsapp_provider=?, whatsapp_token=?, whatsapp_phone_id=?,
                 whatsapp_twilio_sid=?, whatsapp_twilio_token=?, whatsapp_twilio_from=?,
                 whatsapp_activo=?
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
                // WhatsApp
                whatsapp_provider || 'meta',
                whatsapp_token || null,
                whatsapp_phone_id || null,
                whatsapp_twilio_sid || null,
                whatsapp_twilio_token || null,
                whatsapp_twilio_from || null,
                whatsapp_activo ? true : false,
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

// ---------------------------------------------------------------------------
// WhatsApp endpoints
// ---------------------------------------------------------------------------

/**
 * POST /api/sunat/whatsapp/:comprobanteId
 * Send a comprobante PDF to a customer via WhatsApp.
 * Body: { telefono }
 */
router.post('/whatsapp/:comprobanteId', async (req, res) => {
    try {
        const comprobanteId = Number(req.params.comprobanteId);
        if (!comprobanteId || !Number.isFinite(comprobanteId) || comprobanteId <= 0) {
            return res.status(400).json({ error: 'comprobanteId invalido' });
        }

        const { telefono } = req.body;
        if (!telefono || String(telefono).replace(/\D/g, '').length < 7) {
            return res.status(400).json({ error: 'Numero de telefono invalido' });
        }

        const tid = req.tenantId || 1;
        const resultado = await enviarComprobantePorWhatsApp(comprobanteId, telefono, tid);

        if (resultado.ok) {
            return res.json({ ok: true, message: 'Comprobante enviado por WhatsApp', messageId: resultado.messageId });
        } else {
            return res.status(422).json({ ok: false, error: resultado.error });
        }
    } catch (e) {
        console.error('[POST /api/sunat/whatsapp/:comprobanteId]', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/sunat/whatsapp-factura/:facturaId
 * Send the electronic comprobante linked to a factura via WhatsApp.
 * Body: { telefono }
 */
router.post('/whatsapp-factura/:facturaId', async (req, res) => {
    try {
        const facturaId = Number(req.params.facturaId);
        if (!facturaId || !Number.isFinite(facturaId) || facturaId <= 0) {
            return res.status(400).json({ error: 'facturaId invalido' });
        }

        const { telefono } = req.body;
        if (!telefono || String(telefono).replace(/\D/g, '').length < 7) {
            return res.status(400).json({ error: 'Numero de telefono invalido' });
        }

        const tid = req.tenantId || 1;
        const resultado = await enviarFacturaPorWhatsApp(facturaId, telefono, tid);

        if (resultado.ok) {
            return res.json({ ok: true, message: 'Comprobante enviado por WhatsApp', messageId: resultado.messageId });
        } else {
            return res.status(422).json({ ok: false, error: resultado.error });
        }
    } catch (e) {
        console.error('[POST /api/sunat/whatsapp-factura/:facturaId]', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/sunat/whatsapp-prueba
 * Send a test WhatsApp text message to verify credentials.
 * Body: { telefono }
 */
router.post('/whatsapp-prueba', async (req, res) => {
    try {
        const { telefono } = req.body;
        if (!telefono || String(telefono).replace(/\D/g, '').length < 7) {
            return res.status(400).json({ error: 'Numero de telefono invalido para prueba' });
        }

        const tid = req.tenantId || 1;
        const [[config]] = await db.query('SELECT * FROM config_sunat WHERE tenant_id=?', [tid]);
        if (!config) {
            return res.status(404).json({ error: 'Configuracion SUNAT no encontrada' });
        }

        const resultado = await enviarMensajePrueba({
            provider: config.whatsapp_provider || 'meta',
            telefono,
            config
        });

        if (resultado.ok) {
            return res.json({ ok: true, message: 'Mensaje de prueba enviado', messageId: resultado.messageId });
        } else {
            return res.status(422).json({ ok: false, error: resultado.error });
        }
    } catch (e) {
        console.error('[POST /api/sunat/whatsapp-prueba]', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/sunat/whatsapp-envios - Historial de envios WhatsApp
 */
router.get('/whatsapp-envios', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [rows] = await db.query(
            `SELECT we.*, ce.serie, ce.correlativo, ce.tipo AS comprobante_tipo
             FROM whatsapp_envios we
             LEFT JOIN comprobantes_electronicos ce ON ce.id = we.comprobante_id
             WHERE we.tenant_id = ?
             ORDER BY we.created_at DESC
             LIMIT 100`,
            [tid]
        );
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
