const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { PDFDocument, rgb } = require('pdf-lib');
const db = require('../db');
const { sendSignedContract, sendSignedNda } = require('../lib/mailer');

const PENDING_CONTRACT_QUERY = `SELECT *, 'contrato' as doc_tipo FROM contratos WHERE token = ? AND estado = 'pendiente' AND token_expires_at > NOW()`;
const PENDING_NDA_QUERY = `SELECT *, 'nda' as doc_tipo FROM nda_equipo WHERE token = ? AND estado = 'pendiente' AND token_expires_at > NOW()`;

async function findPendingDoc(token) {
    let [rows] = await db.query(PENDING_CONTRACT_QUERY, [token]);
    if (rows && rows.length) return rows[0];
    [rows] = await db.query(PENDING_NDA_QUERY, [token]);
    if (rows && rows.length) return rows[0];
    return null;
}

const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos. Intenta en 15 minutos.' }
});

// GET /:token — Public signing page
router.get('/:token', async (req, res) => {
    try {
        const doc = await findPendingDoc(req.params.token);
        if (!doc) {
            return res.render('firmar', {
                contrato: null,
                error: 'Este documento no existe, ya fue firmado o el enlace ha expirado.',
                docTipo: null
            });
        }
        res.render('firmar', { contrato: doc, error: null, docTipo: doc.doc_tipo });
    } catch (err) {
        console.error('Error loading document for signing:', err);
        res.render('firmar', {
            contrato: null,
            error: 'Este documento no existe, ya fue firmado o el enlace ha expirado.',
            docTipo: null
        });
    }
});

// GET /:token/pdf — Serve PDF for iframe
router.get('/:token/pdf', async (req, res) => {
    try {
        const doc = await findPendingDoc(req.params.token);
        if (!doc) {
            return res.status(404).send('No encontrado');
        }
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', 'inline');
        res.send(doc.pdf_original);
    } catch (err) {
        console.error('Error serving PDF:', err);
        res.status(404).send('No encontrado');
    }
});

// POST /:token/submit — Process signature
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

        // Find document in either table
        const documento = await findPendingDoc(req.params.token);
        if (!documento) {
            return res.status(404).json({ error: 'Este documento no existe, ya fue firmado o el enlace ha expirado.' });
        }
        const isNda = documento.doc_tipo === 'nda';

        // Verify PDF integrity
        const pdfHash = crypto.createHash('sha256').update(documento.pdf_original).digest('hex');
        if (pdfHash !== documento.pdf_hash) {
            return res.status(400).json({ error: 'La integridad del PDF no pudo ser verificada.' });
        }

        // Load existing PDF and embed signature using pdf-lib
        const pdfDoc = await PDFDocument.load(documento.pdf_original);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width } = lastPage.getSize();

        // Embed the signature PNG
        const sigImage = await pdfDoc.embedPng(sigBuffer);
        const sigDims = sigImage.scaleToFit(120, 50);

        const { height } = lastPage.getSize();
        const sigX = width / 2 + 40;

        // Calculate signature Y position
        // If firma_y is stored in DB (PDFKit Y from top), convert to pdf-lib (Y from bottom)
        // pdf-lib Y = pageHeight - pdfKitY
        let sigY;
        if (documento.firma_y) {
            // Convert PDFKit (top-down) to pdf-lib (bottom-up) and place signature ABOVE the line
            sigY = height - documento.firma_y + sigDims.height;
        } else {
            // Fallback for old contracts without firma_y
            sigY = height - 230;
        }

        // Use firma_page if available, otherwise use last page
        const sigPageIdx = documento.firma_page ? documento.firma_page - 1 : pages.length - 1;
        const sigPage = pages[sigPageIdx] || lastPage;

        sigPage.drawImage(sigImage, {
            x: sigX,
            y: sigY,
            width: sigDims.width,
            height: sigDims.height
        });

        // Audit text below signature
        const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        sigPage.drawText(`Firmado electronicamente el ${fecha} — IP: ${ip}`, {
            x: sigX,
            y: sigY - 15,
            size: 6,
            color: rgb(0.5, 0.5, 0.5)
        });

        // Legal acceptance text at page bottom
        const legalText = isNda
            ? 'El firmante declara haber leido y aceptado todos los terminos del Acuerdo de Confidencialidad (NDA).'
            : 'El firmante declara haber leido y aceptado todos los terminos del Contrato de Licencia de Software y Servicios Tecnologicos.';
        sigPage.drawText(legalText, {
            x: 55,
            y: 30,
            size: 6,
            color: rgb(0.5, 0.5, 0.5)
        });

        const pdfFirmado = Buffer.from(await pdfDoc.save());

        // Update correct table
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const userAgent = req.headers['user-agent'] || '';
        const tabla = isNda ? 'nda_equipo' : 'contratos';
        await db.query(
            `UPDATE ${tabla} SET pdf_firmado=?, firma_png=?, estado='firmado',
                    firmado_ip=?, firmado_user_agent=?, firmado_at=NOW() WHERE id=?`,
            [pdfFirmado, sigBuffer, clientIp, userAgent, documento.id]
        );

        // Send signed PDF by email
        try {
            if (isNda) {
                await sendSignedNda({
                    to: documento.email,
                    nombreCompleto: documento.nombre_completo,
                    nroNda: documento.nro_nda,
                    pdfBuffer: pdfFirmado
                });
            } else {
                await sendSignedContract({
                    to: documento.email,
                    nombreCliente: documento.nombre_cliente,
                    nroContrato: documento.nro_contrato,
                    pdfBuffer: pdfFirmado
                });
            }
            await db.query(`UPDATE ${tabla} SET email_enviado_at=NOW() WHERE id=?`, [documento.id]);
        } catch (emailErr) {
            console.error('Error sending signed document email:', emailErr);
        }

        const msg = isNda ? 'NDA firmado exitosamente' : 'Contrato firmado exitosamente';
        res.json({ ok: true, message: msg });
    } catch (err) {
        console.error('Error processing signature:', err);
        res.status(500).json({ error: 'Error al procesar la firma. Intenta nuevamente.' });
    }
});

module.exports = router;
