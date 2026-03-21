const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { PDFDocument, rgb } = require('pdf-lib');
const db = require('../db');
const { sendSignedContract } = require('../lib/mailer');

const PENDING_CONTRACT_QUERY = `SELECT * FROM contratos WHERE token = ? AND estado = 'pendiente' AND token_expires_at > NOW()`;

const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos. Intenta en 15 minutos.' }
});

// GET /:token — Public signing page
router.get('/:token', async (req, res) => {
    try {
        const [rows] = await db.query(PENDING_CONTRACT_QUERY, [req.params.token]);
        if (!rows || rows.length === 0) {
            return res.render('firmar', {
                contrato: null,
                error: 'Este contrato no existe, ya fue firmado o el enlace ha expirado.'
            });
        }
        res.render('firmar', { contrato: rows[0], error: null });
    } catch (err) {
        console.error('Error loading contract for signing:', err);
        res.render('firmar', {
            contrato: null,
            error: 'Este contrato no existe, ya fue firmado o el enlace ha expirado.'
        });
    }
});

// GET /:token/pdf — Serve PDF for iframe
router.get('/:token/pdf', async (req, res) => {
    try {
        const [rows] = await db.query(PENDING_CONTRACT_QUERY, [req.params.token]);
        if (!rows || rows.length === 0) {
            return res.status(404).send('No encontrado');
        }
        const contrato = rows[0];
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', 'inline');
        res.send(contrato.pdf_original);
    } catch (err) {
        console.error('Error serving PDF:', err);
        res.status(404).send('No encontrado');
    }
});

// POST /:token/submit — Process client signature
router.post('/:token/submit', submitLimiter, async (req, res) => {
    try {
        const { signature } = req.body;

        // Validate signature exists and format
        if (!signature || !signature.startsWith('data:image/png;base64,')) {
            return res.status(400).json({ error: 'Firma invalida o formato incorrecto.' });
        }

        // Validate base64 decoded size < 500KB
        const base64Data = signature.replace(/^data:image\/png;base64,/, '');
        const sigBuffer = Buffer.from(base64Data, 'base64');
        if (sigBuffer.length > 500 * 1024) {
            return res.status(400).json({ error: 'La firma excede el tamano maximo permitido.' });
        }

        // Validate contract exists, is pending, and not expired
        const [rows] = await db.query(PENDING_CONTRACT_QUERY, [req.params.token]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Este contrato no existe, ya fue firmado o el enlace ha expirado.' });
        }
        const contrato = rows[0];

        // Verify PDF integrity
        const pdfHash = crypto.createHash('sha256').update(contrato.pdf_original).digest('hex');
        if (pdfHash !== contrato.pdf_hash) {
            return res.status(400).json({ error: 'La integridad del PDF no pudo ser verificada.' });
        }

        // Load existing PDF and embed signature using pdf-lib
        const pdfDoc = await PDFDocument.load(contrato.pdf_original);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width } = lastPage.getSize();

        // Embed the signature PNG
        const sigImage = await pdfDoc.embedPng(sigBuffer);
        const sigDims = sigImage.scaleToFit(120, 50);

        // Position on the RIGHT side (client section), aligned with signature line area
        // pdf-lib Y=0 is bottom of page. The signature lines are roughly in the upper third of the last page.
        const { height } = lastPage.getSize();
        const sigX = width / 2 + 40;
        const sigY = height - 230;

        lastPage.drawImage(sigImage, {
            x: sigX,
            y: sigY,
            width: sigDims.width,
            height: sigDims.height
        });

        // Audit text below signature
        const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        lastPage.drawText(`Firmado electronicamente el ${fecha} — IP: ${ip}`, {
            x: sigX,
            y: sigY - 15,
            size: 6,
            color: rgb(0.5, 0.5, 0.5)
        });

        // Legal acceptance text at page bottom
        lastPage.drawText(
            'El firmante declara haber leido y aceptado todos los terminos del Contrato de Licencia de Software y Servicios Tecnologicos.',
            {
                x: 55,
                y: 30,
                size: 6,
                color: rgb(0.5, 0.5, 0.5)
            }
        );

        const pdfFirmado = Buffer.from(await pdfDoc.save());

        // Update DB
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const userAgent = req.headers['user-agent'] || '';
        await db.query(
            `UPDATE contratos SET pdf_firmado=?, firma_png=?, estado='firmado',
                    firmado_ip=?, firmado_user_agent=?, firmado_at=NOW() WHERE id=?`,
            [pdfFirmado, sigBuffer, clientIp, userAgent, contrato.id]
        );

        // Send signed PDF by email
        try {
            await sendSignedContract({
                to: contrato.email,
                nombreCliente: contrato.nombre_cliente,
                nroContrato: contrato.nro_contrato,
                pdfBuffer: pdfFirmado
            });
            await db.query('UPDATE contratos SET email_enviado_at=NOW() WHERE id=?', [contrato.id]);
        } catch (emailErr) {
            console.error('Error sending signed contract email:', emailErr);
            // Continue — signing succeeded even if email fails
        }

        res.json({ ok: true, message: 'Contrato firmado exitosamente' });
    } catch (err) {
        console.error('Error processing signature:', err);
        res.status(500).json({ error: 'Error al procesar la firma. Intenta nuevamente.' });
    }
});

module.exports = router;
