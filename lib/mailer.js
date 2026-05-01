'use strict';

const nodemailer = require('nodemailer');

/* ─── SMTP transporter (lazy, created once) ─── */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn('[mailer] SMTP_USER o SMTP_PASS no configurados — emails deshabilitados');
    return null;
  }

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    pool: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return _transporter;
}

const from = () => process.env.SMTP_FROM || process.env.SMTP_USER;

/* ─── HTML helpers ─── */

function wrapHtml(headerBg, headerTitle, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <!-- Header -->
      <tr><td style="background:${headerBg};padding:32px 24px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;">mirestconia.com</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,.9);font-size:15px;">${headerTitle}</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px 28px;color:#333;font-size:15px;line-height:1.6;">
        ${bodyHtml}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:16px 28px;text-align:center;font-size:12px;color:#999;border-top:1px solid #eee;">
        &copy; ${new Date().getFullYear()} mirestconia.com &mdash; Todos los derechos reservados.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/* ─── Public API ─── */

/**
 * Send an email with a link so the client can review and sign a contract.
 */
async function sendSigningLink({ to, nombreCliente, nroContrato, link }) {
  console.log('[mailer] SMTP_USER:', process.env.SMTP_USER || 'EMPTY', 'SMTP_PASS:', process.env.SMTP_PASS ? `SET(${process.env.SMTP_PASS.length}chars)` : 'EMPTY');
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: 'SMTP no configurado (SMTP_USER o SMTP_PASS vacíos)' };

  const headerBg = 'linear-gradient(135deg,#f57c00,#ff9800)';
  const body = `
    <p>Hola <strong>${nombreCliente}</strong>,</p>
    <p>Se ha generado el contrato <strong>N.° ${nroContrato}</strong> para su revisión y firma electrónica.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${link}"
         style="display:inline-block;padding:14px 32px;background:#f57c00;color:#fff;
                text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;">
        Revisar y Firmar Contrato
      </a>
    </p>
    <p style="font-size:13px;color:#777;">
      Este enlace tiene una validez de <strong>30 días</strong> a partir de la fecha de envío.
      Si no solicitó este contrato, puede ignorar este mensaje.
    </p>`;

  const html = wrapHtml(headerBg, 'Firma de Contrato', body);

  try {
    await transporter.sendMail({
      from: from(),
      to,
      subject: `Contrato N.° ${nroContrato} — Revisión y Firma`,
      html,
    });
    console.log(`[mailer] Enlace de firma enviado a ${to} (contrato ${nroContrato})`);
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Error enviando enlace de firma:', err.message);
    return { sent: false, reason: 'Error SMTP: ' + err.message };
  }
}

/**
 * Send the signed PDF to the client AND to mirestconia.com.
 */
async function sendSignedContract({ to, nombreCliente, nroContrato, pdfBuffer }) {
  const transporter = getTransporter();
  if (!transporter) return false;

  const headerBg = 'linear-gradient(135deg,#2e7d32,#43a047)';
  const body = `
    <p>Hola <strong>${nombreCliente}</strong>,</p>
    <p>El contrato <strong>N.° ${nroContrato}</strong> ha sido firmado exitosamente.</p>
    <p>Adjuntamos una copia del contrato firmado en formato PDF para sus archivos.</p>
    <p style="font-size:13px;color:#777;">
      Este documento tiene validez legal conforme a la
      <strong>Ley N.° 27269 — Ley de Firmas y Certificados Digitales</strong> del Perú.
    </p>`;

  const html = wrapHtml(headerBg, 'Contrato Firmado', body);
  const filename = `Contrato_${nroContrato}_FIRMADO.pdf`;
  const adminEmail = process.env.SMTP_USER;

  const mailOpts = {
    from: from(),
    to: adminEmail ? [to, adminEmail] : to,
    subject: `Contrato N.° ${nroContrato} — Firmado`,
    html,
    attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
  };

  try {
    await transporter.sendMail(mailOpts);
    console.log(`[mailer] Contrato firmado enviado a ${to} y ${adminEmail} (contrato ${nroContrato})`);
    return true;
  } catch (err) {
    console.error('[mailer] Error enviando contrato firmado:', err.message);
    return false;
  }
}

/* ─── NDA Team ─── */

const NDA_FROM = 'legal@miresconia.com';

/**
 * Send an email with a link so the team member can review and sign the NDA.
 */
async function sendNdaSigningLink({ to, nombreCompleto, nroNda, link }) {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: 'SMTP no configurado (SMTP_USER o SMTP_PASS vacíos)' };

  const headerBg = 'linear-gradient(135deg,#6366F1,#4F46E5)';
  const body = `
    <p>Hola <strong>${nombreCompleto}</strong>,</p>
    <p>Como parte de tu incorporación al equipo de <strong>DIGNITA.TECH</strong>, necesitamos que revises y firmes el Acuerdo de Confidencialidad (NDA) <strong>N.° ${nroNda}</strong>.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${link}"
         style="display:inline-block;padding:14px 32px;background:#6366F1;color:#fff;
                text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;">
        Revisar y Firmar NDA
      </a>
    </p>
    <p style="font-size:13px;color:#777;">
      Este enlace tiene una validez de <strong>30 días</strong> a partir de la fecha de envío.
      Si tienes alguna duda, contacta al equipo legal.
    </p>`;

  const html = wrapHtml(headerBg, 'Acuerdo de Confidencialidad (NDA)', body);

  try {
    await transporter.sendMail({
      from: NDA_FROM,
      to,
      subject: `NDA N.° ${nroNda} — Revisión y Firma`,
      html,
    });
    console.log(`[mailer] Enlace de firma NDA enviado a ${to} (NDA ${nroNda})`);
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Error enviando enlace de firma NDA:', err.message);
    return { sent: false, reason: 'Error SMTP: ' + err.message };
  }
}

/**
 * Send the signed NDA PDF to the team member AND to admin.
 */
async function sendSignedNda({ to, nombreCompleto, nroNda, pdfBuffer }) {
  const transporter = getTransporter();
  if (!transporter) return false;

  const headerBg = 'linear-gradient(135deg,#2e7d32,#43a047)';
  const body = `
    <p>Hola <strong>${nombreCompleto}</strong>,</p>
    <p>El Acuerdo de Confidencialidad (NDA) <strong>N.° ${nroNda}</strong> ha sido firmado exitosamente.</p>
    <p>Adjuntamos una copia del NDA firmado en formato PDF para tus archivos.</p>
    <p style="font-size:13px;color:#777;">
      Este documento tiene validez legal conforme a la legislación peruana vigente.
    </p>`;

  const html = wrapHtml(headerBg, 'NDA Firmado', body);
  const filename = `NDA_${nroNda}_FIRMADO.pdf`;
  const adminEmail = process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from: NDA_FROM,
      to: adminEmail ? [to, adminEmail] : to,
      subject: `NDA N.° ${nroNda} — Firmado`,
      html,
      attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
    });
    console.log(`[mailer] NDA firmado enviado a ${to} y ${adminEmail} (NDA ${nroNda})`);
    return true;
  } catch (err) {
    console.error('[mailer] Error enviando NDA firmado:', err.message);
    return false;
  }
}

module.exports = { sendSigningLink, sendSignedContract, sendNdaSigningLink, sendSignedNda };
