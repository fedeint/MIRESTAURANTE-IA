'use strict';

/**
 * services/whatsapp.js
 * WhatsApp document/receipt sending service.
 *
 * Supports two providers:
 *   - meta   : Meta Cloud API (graph.facebook.com)
 *   - twilio : Twilio WhatsApp Sandbox / Business
 *
 * All API calls use native fetch() (Node 18+). No new dependencies required.
 */

const db = require('../db');

// ---------------------------------------------------------------------------
// Internal provider helpers
// ---------------------------------------------------------------------------

/**
 * Send a PDF document via Meta Cloud API.
 * @param {object} opts
 * @param {string} opts.telefono       - 9-digit Peruvian mobile number (without country code)
 * @param {string} opts.pdfUrl         - Publicly accessible URL for the PDF
 * @param {string} opts.nombreArchivo  - Filename to display in WhatsApp (e.g. "B001-00042.pdf")
 * @param {string} opts.mensaje        - Caption shown under the document
 * @param {string} opts.phoneId        - Meta WhatsApp Phone Number ID
 * @param {string} opts.token          - Meta permanent access token
 * @returns {Promise<{messageId: string}>}
 */
async function enviarPorMeta({ telefono, pdfUrl, nombreArchivo, mensaje, phoneId, token }) {
    if (!phoneId) throw new Error('WhatsApp Meta: phone_id no configurado');
    if (!token)   throw new Error('WhatsApp Meta: token no configurado');

    const destinatario = '51' + String(telefono).replace(/\D/g, '').slice(-9);
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(phoneId)}/messages`;

    const body = {
        messaging_product: 'whatsapp',
        to: destinatario,
        type: 'document',
        document: {
            link: pdfUrl,
            caption: mensaje || '',
            filename: nombreArchivo || 'comprobante.pdf'
        }
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const data = await resp.json();

    if (!resp.ok) {
        const errMsg = data?.error?.message || data?.error?.type || JSON.stringify(data);
        throw new Error(`Meta API ${resp.status}: ${errMsg}`);
    }

    // Successful response shape: { messages: [{ id: "wamid.xxx" }] }
    const messageId = data?.messages?.[0]?.id || data?.messages?.[0]?.message_id || null;
    return { messageId };
}

/**
 * Send a PDF document via Twilio WhatsApp.
 * Uses fetch with Basic Auth — no Twilio SDK needed.
 * @param {object} opts
 * @param {string} opts.telefono      - 9-digit Peruvian mobile number
 * @param {string} opts.pdfUrl        - Publicly accessible URL for the PDF
 * @param {string} opts.mensaje       - Body text of the WhatsApp message
 * @param {string} opts.twilioSid     - Twilio Account SID
 * @param {string} opts.twilioToken   - Twilio Auth Token
 * @param {string} opts.twilioFrom    - Twilio WhatsApp-enabled number (digits only, no "+")
 * @returns {Promise<{messageId: string}>}
 */
async function enviarPorTwilio({ telefono, pdfUrl, mensaje, twilioSid, twilioToken, twilioFrom }) {
    if (!twilioSid)   throw new Error('WhatsApp Twilio: Account SID no configurado');
    if (!twilioToken) throw new Error('WhatsApp Twilio: Auth Token no configurado');
    if (!twilioFrom)  throw new Error('WhatsApp Twilio: numero From no configurado');

    const destinatario = '51' + String(telefono).replace(/\D/g, '').slice(-9);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Messages.json`;

    // Twilio expects application/x-www-form-urlencoded
    const formBody = new URLSearchParams({
        From: `whatsapp:+${String(twilioFrom).replace(/\D/g, '')}`,
        To: `whatsapp:+${destinatario}`,
        Body: mensaje || '',
        MediaUrl: pdfUrl
    });

    const credentials = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
        },
        body: formBody.toString()
    });

    const data = await resp.json();

    if (!resp.ok) {
        const errMsg = data?.message || data?.code || JSON.stringify(data);
        throw new Error(`Twilio API ${resp.status}: ${errMsg}`);
    }

    return { messageId: data?.sid || null };
}

// ---------------------------------------------------------------------------
// PDF fallback generator (used when comprobante has no pdf_url from NubeFact)
// ---------------------------------------------------------------------------

/**
 * Generate a simple receipt PDF in memory using pdfkit.
 * Returns the PDF as a Buffer.
 */
async function generarPdfRecibo({ factura, detalles, config, comprobante }) {
    const PDFDocument = require('pdfkit');

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: [226, 600] }); // ~80mm thermal width
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const nombreRestaurante = config?.razon_social_emisor || config?.nombre_negocio || 'Restaurante';
        const tipoLabel = comprobante?.tipo === 'factura' ? 'FACTURA' : 'BOLETA';
        const serie = comprobante?.serie || factura?.serie || 'B001';
        const correlativo = comprobante?.correlativo || factura?.correlativo || String(factura?.id || '').padStart(8, '0');
        const total = parseFloat(comprobante?.total_con_igv || factura?.total || 0).toFixed(2);

        doc.fontSize(11).font('Helvetica-Bold').text(nombreRestaurante, { align: 'center' });
        doc.fontSize(9).font('Helvetica').text(config?.direccion_emisor || '', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica-Bold').text(`${tipoLabel} ELECTRONICA`, { align: 'center' });
        doc.fontSize(9).font('Helvetica').text(`${serie}-${String(correlativo).padStart(8, '0')}`, { align: 'center' });
        doc.moveDown(0.5);

        const fechaStr = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        doc.text(`Fecha: ${fechaStr}`);
        doc.text(`Cliente: ${comprobante?.cliente_razon_social || factura?.cliente_nombre || 'VARIOS'}`);
        doc.moveDown(0.5);

        doc.moveTo(40, doc.y).lineTo(186, doc.y).stroke();
        doc.moveDown(0.3);

        // Detail lines
        if (Array.isArray(detalles) && detalles.length > 0) {
            detalles.forEach(det => {
                const nombre = det.producto_nombre || det.descripcion || 'Producto';
                const qty = Number(det.cantidad || 1);
                const precio = parseFloat(det.precio_unitario || 0).toFixed(2);
                const subtotal = parseFloat(det.subtotal || 0).toFixed(2);
                doc.fontSize(8).text(`${nombre}`);
                doc.text(`  ${qty} x S/ ${precio}  =  S/ ${subtotal}`);
            });
        }

        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(186, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica-Bold').text(`TOTAL: S/ ${total}`, { align: 'right' });
        doc.moveDown(0.5);

        if (comprobante?.subtotal_sin_igv) {
            doc.fontSize(8).font('Helvetica')
                .text(`Subtotal: S/ ${parseFloat(comprobante.subtotal_sin_igv).toFixed(2)}`)
                .text(`IGV (18%): S/ ${parseFloat(comprobante.igv || 0).toFixed(2)}`);
        }

        doc.moveDown(1);
        doc.fontSize(8).font('Helvetica').text('Gracias por su preferencia', { align: 'center' });

        doc.end();
    });
}

// ---------------------------------------------------------------------------
// Main public function
// ---------------------------------------------------------------------------

/**
 * Send an electronic comprobante PDF to a customer via WhatsApp.
 *
 * Flow:
 *  1. Load comprobante from DB (pdf_url, serie, numero, tipo, tenant_id)
 *  2. Load WhatsApp config from config_sunat
 *  3. If no pdf_url, generate a fallback PDF via pdfkit and upload it
 *     (NOTE: pdfkit generates an in-memory buffer; since WhatsApp requires a
 *      public URL, the fallback path logs a clear error — operators must ensure
 *      NubeFact integration returns a pdf_url for actual delivery.)
 *  4. Build a professional message string
 *  5. Dispatch via Meta or Twilio depending on config
 *  6. Log the attempt in whatsapp_envios
 *  7. Return { ok, messageId } or { ok: false, error }
 *
 * @param {number} comprobanteId
 * @param {string} telefonoCliente    - Raw phone number from the request
 * @param {number} tenantId
 * @returns {Promise<{ok: boolean, messageId?: string, error?: string}>}
 */
async function enviarComprobantePorWhatsApp(comprobanteId, telefonoCliente, tenantId) {
    let logId = null;
    let provider = null;

    try {
        // 1. Fetch comprobante
        const [[comprobante]] = await db.query(
            `SELECT ce.*, f.cliente_id, f.total AS factura_total,
                    c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
             FROM comprobantes_electronicos ce
             LEFT JOIN facturas f ON f.id = ce.factura_id
             LEFT JOIN clientes c ON c.id = f.cliente_id
             WHERE ce.id = ? AND ce.tenant_id = ?`,
            [comprobanteId, tenantId]
        );

        if (!comprobante) {
            throw new Error(`Comprobante ${comprobanteId} no encontrado para tenant ${tenantId}`);
        }

        // 2. Fetch WhatsApp config
        const [[config]] = await db.query(
            `SELECT cs.*, ci.nombre_negocio
             FROM config_sunat cs
             LEFT JOIN configuracion_impresion ci ON true
             WHERE cs.tenant_id = ?
             LIMIT 1`,
            [tenantId]
        );

        if (!config) {
            throw new Error('Configuracion SUNAT/WhatsApp no encontrada');
        }

        if (!config.whatsapp_activo) {
            throw new Error('WhatsApp no esta habilitado en la configuracion');
        }

        provider = config.whatsapp_provider || 'meta';

        // Resolve phone: prefer request param, fallback to clientes.telefono
        const telefonoRaw = String(telefonoCliente || comprobante.cliente_telefono || '').replace(/\D/g, '');
        if (!telefonoRaw || telefonoRaw.length < 7) {
            throw new Error('Numero de telefono invalido o no disponible');
        }
        // Take last 9 digits as Peruvian mobile
        const telefono = telefonoRaw.slice(-9);

        // 3. Build message
        const tipoLabel = comprobante.tipo === 'factura' ? 'factura' : 'boleta';
        const serie = comprobante.serie || '';
        const correlativo = String(comprobante.correlativo || '').padStart(8, '0');
        const nombreCliente = comprobante.cliente_razon_social || comprobante.cliente_nombre || 'estimado cliente';
        const nombreRestaurante = config.razon_social_emisor || config.nombre_negocio || 'nuestro restaurante';

        const mensaje = `Estimado(a) ${nombreCliente}, adjuntamos su ${tipoLabel} ${serie}-${correlativo} de ${nombreRestaurante}. Gracias por su preferencia!`;
        const nombreArchivo = `${serie}-${correlativo}.pdf`;

        // 4. Obtain PDF URL
        let pdfUrl = comprobante.pdf_url || null;

        if (!pdfUrl) {
            // No PDF from NubeFact — log warning, cannot proceed without public URL
            throw new Error(
                'El comprobante no tiene PDF disponible de NubeFact. ' +
                'Asegurese de que el comprobante fue aceptado por el OSE antes de enviar por WhatsApp.'
            );
        }

        // 5. Insert log record (pending)
        const [logResult] = await db.query(
            `INSERT INTO whatsapp_envios
             (tenant_id, comprobante_id, factura_id, telefono, tipo, mensaje, pdf_url, estado, provider)
             VALUES (?, ?, ?, ?, 'comprobante', ?, ?, 'pendiente', ?)
             RETURNING id`,
            [tenantId, comprobanteId, comprobante.factura_id, telefono, mensaje, pdfUrl, provider]
        );
        logId = logResult.insertId;

        // 6. Dispatch
        let resultado;
        if (provider === 'twilio') {
            resultado = await enviarPorTwilio({
                telefono,
                pdfUrl,
                mensaje,
                twilioSid:   config.whatsapp_twilio_sid,
                twilioToken: config.whatsapp_twilio_token,
                twilioFrom:  config.whatsapp_twilio_from
            });
        } else {
            resultado = await enviarPorMeta({
                telefono,
                pdfUrl,
                nombreArchivo,
                mensaje,
                phoneId: config.whatsapp_phone_id,
                token:   config.whatsapp_token
            });
        }

        // 7. Update log to success
        if (logId) {
            await db.query(
                `UPDATE whatsapp_envios SET estado='enviado', error=NULL WHERE id=?`,
                [logId]
            );
        }

        return { ok: true, messageId: resultado.messageId };

    } catch (err) {
        console.error('[WhatsApp] Error al enviar comprobante:', err.message);

        // Update log to failed (best-effort)
        if (logId) {
            try {
                await db.query(
                    `UPDATE whatsapp_envios SET estado='error', error=? WHERE id=?`,
                    [String(err.message).slice(0, 500), logId]
                );
            } catch (_) {}
        }

        return { ok: false, error: err.message };
    }
}

/**
 * Send a factura receipt (not necessarily a comprobante electronico) via WhatsApp.
 * Looks up the comprobante linked to the factura, then delegates to enviarComprobantePorWhatsApp.
 * If no comprobante exists, throws a descriptive error.
 *
 * @param {number} facturaId
 * @param {string} telefonoCliente
 * @param {number} tenantId
 * @returns {Promise<{ok: boolean, messageId?: string, error?: string}>}
 */
async function enviarFacturaPorWhatsApp(facturaId, telefonoCliente, tenantId) {
    try {
        // Find the most recent accepted comprobante for this factura
        const [[comprobante]] = await db.query(
            `SELECT id FROM comprobantes_electronicos
             WHERE factura_id = ? AND tenant_id = ?
             ORDER BY id DESC LIMIT 1`,
            [facturaId, tenantId]
        );

        if (!comprobante) {
            return {
                ok: false,
                error: 'Esta factura no tiene un comprobante electronico generado. ' +
                       'Primero emita el comprobante desde el panel SUNAT.'
            };
        }

        return await enviarComprobantePorWhatsApp(comprobante.id, telefonoCliente, tenantId);

    } catch (err) {
        console.error('[WhatsApp] Error en enviarFacturaPorWhatsApp:', err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Send a WhatsApp test message (text, no document) to verify credentials.
 * @param {object} opts
 * @param {string} opts.provider
 * @param {string} opts.telefono
 * @param {object} opts.config  - Full config_sunat row
 * @returns {Promise<{ok: boolean, messageId?: string, error?: string}>}
 */
async function enviarMensajePrueba({ provider, telefono, config }) {
    try {
        const telefonoRaw = String(telefono || '').replace(/\D/g, '').slice(-9);
        if (!telefonoRaw || telefonoRaw.length < 7) {
            throw new Error('Numero de telefono invalido para prueba');
        }

        const mensaje = 'Mensaje de prueba desde el sistema de restaurante dignita.tech. WhatsApp configurado correctamente.';

        if (provider === 'twilio') {
            const resultado = await enviarPorTwilio({
                telefono:    telefonoRaw,
                pdfUrl:      null,                         // text-only test, no media
                mensaje,
                twilioSid:   config.whatsapp_twilio_sid,
                twilioToken: config.whatsapp_twilio_token,
                twilioFrom:  config.whatsapp_twilio_from
            });
            return { ok: true, messageId: resultado.messageId };
        } else {
            // Meta: send a simple text message for testing
            const destinatario = '51' + telefonoRaw;
            const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(config.whatsapp_phone_id)}/messages`;
            const body = {
                messaging_product: 'whatsapp',
                to: destinatario,
                type: 'text',
                text: { body: mensaje }
            };
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.whatsapp_token}`
                },
                body: JSON.stringify(body)
            });
            const data = await resp.json();
            if (!resp.ok) {
                const errMsg = data?.error?.message || JSON.stringify(data);
                throw new Error(`Meta API ${resp.status}: ${errMsg}`);
            }
            return { ok: true, messageId: data?.messages?.[0]?.id || null };
        }
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ---------------------------------------------------------------------------
// Schema bootstrap — called from db.js ensureSchema or lazily on first use
// ---------------------------------------------------------------------------

/**
 * Ensure the whatsapp_envios table and config_sunat columns exist.
 * Safe to call multiple times (uses IF NOT EXISTS / IF NOT EXISTS column checks).
 */
async function ensureWhatsAppSchema() {
    const alteraciones = [
        `ALTER TABLE config_sunat ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(20) DEFAULT 'meta'`,
        `ALTER TABLE config_sunat ADD COLUMN IF NOT EXISTS whatsapp_token TEXT`,
        `ALTER TABLE config_sunat ADD COLUMN IF NOT EXISTS whatsapp_phone_id VARCHAR(100)`,
        `ALTER TABLE config_sunat ADD COLUMN IF NOT EXISTS whatsapp_twilio_sid VARCHAR(100)`,
        `ALTER TABLE config_sunat ADD COLUMN IF NOT EXISTS whatsapp_twilio_token VARCHAR(200)`,
        `ALTER TABLE config_sunat ADD COLUMN IF NOT EXISTS whatsapp_twilio_from VARCHAR(30)`,
        `ALTER TABLE config_sunat ADD COLUMN IF NOT EXISTS whatsapp_activo BOOLEAN DEFAULT false`
    ];

    for (const sql of alteraciones) {
        try {
            await db.query(sql);
        } catch (err) {
            // Column likely already exists — ignore
            if (!err.message?.includes('already exists')) {
                console.warn('[WhatsApp] Schema alter warning:', err.message);
            }
        }
    }

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_envios (
                id          SERIAL PRIMARY KEY,
                tenant_id   INTEGER NOT NULL,
                comprobante_id INTEGER,
                factura_id  INTEGER,
                telefono    VARCHAR(20) NOT NULL,
                tipo        VARCHAR(20) DEFAULT 'comprobante',
                mensaje     TEXT,
                pdf_url     TEXT,
                estado      VARCHAR(20) DEFAULT 'pendiente',
                error       TEXT,
                provider    VARCHAR(20),
                created_at  TIMESTAMP DEFAULT NOW()
            )
        `);
    } catch (err) {
        console.warn('[WhatsApp] Table create warning:', err.message);
    }
}

module.exports = {
    enviarComprobantePorWhatsApp,
    enviarFacturaPorWhatsApp,
    enviarMensajePrueba,
    ensureWhatsAppSchema
};
