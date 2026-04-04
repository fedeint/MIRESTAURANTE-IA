// services/notificaciones-trial.js
'use strict';

const nodemailer = require('nodemailer');
const logger = require('../lib/logger');

// ── SMTP transporter (lazy init) ─────────────────────────────────────────────
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: (Number(process.env.SMTP_PORT) || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return _transporter;
}

const FROM = () => process.env.SMTP_FROM || process.env.SMTP_USER || 'hola@mirestconia.com';

// ── Helpers ──────────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const transport = getTransporter();
  if (!transport) {
    logger.info('email_skip', { to, subject, reason: 'SMTP not configured' });
    return false;
  }
  try {
    await transport.sendMail({ from: `"MiRestcon IA" <${FROM()}>`, to, subject, html });
    logger.info('email_sent', { to, subject });
    return true;
  } catch (err) {
    logger.error('email_error', { to, subject, error: err.message });
    return false;
  }
}

// ── Email: Solicitud recibida (al usuario) ───────────────────────────────────
async function enviarEmailSolicitudRecibida(email, nombre) {
  const html = `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:linear-gradient(135deg,#10152f 0%,#0a0f24 100%);padding:32px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">🎉</div>
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">¡Excelente, ${nombre}!</h1>
      <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0;">Tu solicitud ha sido recibida</p>
    </div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#0a0f24;line-height:1.6;margin:0 0 16px;">
        <strong>Tu restaurante está a un paso de tener su propio sistema con inteligencia artificial.</strong>
      </p>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px;">
        Estamos revisando tu información para asegurarnos de darte la mejor experiencia.
        En menos de <strong>24 horas</strong> recibirás la confirmación de acceso.
      </p>
      <div style="background:#FFF8F5;border-left:4px solid #ef520f;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="font-size:14px;color:#0a0f24;margin:0 0 8px;font-weight:600;">Mientras tanto, prepárate:</p>
        <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.6;">
          ✅ Tu carta de productos (nombres + precios)<br>
          ✅ La distribución de tus mesas<br>
          ✅ Datos de tu personal (si tienes)
        </p>
      </div>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px;">
        Con MiRestcon IA vas a poder gestionar pedidos, controlar tu cocina en tiempo real,
        y tener un asistente de IA (<strong>DallIA</strong>) que te ayuda a tomar decisiones de negocio.
        <strong>Todo desde tu celular.</strong>
      </p>
      <div style="text-align:center;padding:8px 0;">
        <p style="font-size:13px;color:#8B8FAD;margin:0;">Equipo MiRestcon IA 🤖🍽️</p>
      </div>
    </div>
  </div>`;

  return sendEmail(email, '🎉 ¡Recibimos tu solicitud! — MiRestcon IA', html);
}

// ── Email: Solicitud aprobada ────────────────────────────────────────────────
async function enviarEmailAprobacion(email, nombre) {
  const appUrl = process.env.APP_URL || 'https://www.mirestconia.com';
  const html = `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:linear-gradient(135deg,#10152f 0%,#0a0f24 100%);padding:32px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">🚀</div>
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">¡Bienvenido, ${nombre}!</h1>
      <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0;">Tu acceso ha sido aprobado</p>
    </div>
    <div style="padding:28px 24px;">
      <p style="font-size:15px;color:#0a0f24;line-height:1.6;margin:0 0 16px;">
        <strong>¡Tu restaurante ya tiene su sistema con inteligencia artificial!</strong>
      </p>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px;">
        Tienes <strong>15 días de prueba gratuita</strong> con acceso completo.
        Tu asistente DallIA te guiará paso a paso para configurar todo.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${appUrl}/login" style="display:inline-block;background:linear-gradient(135deg,#ef520f,#df2c05);color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700;">
          Ingresar a MiRestcon IA
        </a>
      </div>
      <div style="background:#DCFCE7;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="font-size:14px;color:#166534;margin:0 0 8px;font-weight:600;">Tu trial incluye:</p>
        <p style="font-size:13px;color:#166534;margin:0;line-height:1.6;">
          🤖 DallIA — tu asistente de IA personal<br>
          📱 Gestión de pedidos, cocina y caja<br>
          📊 Reportes y KPIs en tiempo real<br>
          💰 Control de costos e inventario
        </p>
      </div>
      <p style="font-size:13px;color:#8B8FAD;text-align:center;margin:0;">
        ¿Dudas? Responde este email o escríbenos por WhatsApp
      </p>
    </div>
  </div>`;

  return sendEmail(email, '🚀 ¡Acceso aprobado! Ingresa a MiRestcon IA', html);
}

// ── Email: Solicitud rechazada ───────────────────────────────────────────────
async function enviarEmailRechazo(email, nombre, motivo) {
  const html = `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:linear-gradient(135deg,#10152f 0%,#0a0f24 100%);padding:32px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">📋</div>
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">Hola, ${nombre}</h1>
      <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0;">Actualización sobre tu solicitud</p>
    </div>
    <div style="padding:28px 24px;">
      <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 16px;">
        Revisamos tu solicitud y necesitamos que hagas algunos ajustes:
      </p>
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="font-size:14px;color:#991B1B;margin:0;">${motivo || 'Por favor, completa la información faltante.'}</p>
      </div>
      <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0;">
        Puedes enviar una nueva solicitud cuando estés listo. ¡Te esperamos!
      </p>
    </div>
  </div>`;

  return sendEmail(email, '📋 Tu solicitud necesita ajustes — MiRestcon IA', html);
}

// ── Email: Trial expirado ────────────────────────────────────────────────────
async function enviarEmailTrialExpirado(email, nombre) {
  const html = `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:linear-gradient(135deg,#10152f 0%,#0a0f24 100%);padding:32px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">⏰</div>
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">${nombre}, tu trial terminó</h1>
    </div>
    <div style="padding:28px 24px;">
      <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 16px;">
        Tu período de prueba ha finalizado. Para seguir usando MiRestcon IA,
        elige un plan que se adapte a tu restaurante.
      </p>
      <p style="font-size:13px;color:#8B8FAD;text-align:center;margin:0;">Contáctanos para activar tu plan</p>
    </div>
  </div>`;

  return sendEmail(email, '⏰ Tu trial terminó — MiRestcon IA', html);
}

// ── Email: Bienvenida con subdominio ─────────────────────────────────────────
async function enviarEmailBienvenidaSubdominio(email, nombre, subdominio, esTrial, credenciales) {
  const subdominioUrl = `https://mirestconia.com/${subdominio}`;
  const trialTexto = esTrial
    ? '<p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px;">Tienes <strong>15 días para probarlo todo, gratis.</strong> Después podrás elegir el plan que mejor se adapte a tu restaurante.</p>'
    : '<p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px;"><strong>Tu plan está activo.</strong> Ya puedes empezar a usar todas las funciones.</p>';

  const html = `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:linear-gradient(135deg,#10152f 0%,#0a0f24 100%);padding:32px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">🚀</div>
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">¡${nombre}, tu restaurante ya está en línea!</h1>
      <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0;">Tu sistema con inteligencia artificial está listo</p>
    </div>
    <div style="padding:28px 24px;">
      <div style="background:#0f172a;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
        <p style="font-size:12px;color:#64748b;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Tu dirección exclusiva</p>
        <a href="${subdominioUrl}" style="font-size:18px;color:#f97316;font-weight:700;text-decoration:none;">mirestconia.com/${subdominio}</a>
        <p style="font-size:12px;color:#94a3b8;margin:8px 0 0;">Abre este link desde tu celular y guárdalo en tu pantalla de inicio</p>
      </div>
      ${trialTexto}
      ${credenciales ? `
      <div style="background:#0f172a;border-radius:12px;padding:20px;margin-bottom:20px;">
        <p style="font-size:12px;color:#64748b;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Tus credenciales de acceso</p>
        <table style="width:100%;font-size:14px;">
          <tr><td style="color:#94a3b8;padding:4px 0;">Usuario:</td><td style="color:#ffffff;font-weight:700;padding:4px 0;">${credenciales.usuario}</td></tr>
          <tr><td style="color:#94a3b8;padding:4px 0;">PIN temporal:</td><td style="color:#f97316;font-weight:700;font-size:18px;letter-spacing:2px;padding:4px 0;">${credenciales.pin}</td></tr>
        </table>
        <p style="font-size:12px;color:#ef4444;margin:12px 0 0;">⚠️ Este PIN expira en 48 horas. Cámbialo en tu primer ingreso.</p>
      </div>` : ''}
      <div style="background:#FFF8F5;border-left:4px solid #ef520f;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="font-size:14px;color:#0a0f24;margin:0 0 10px;font-weight:600;">Próximos pasos:</p>
        <p style="font-size:13px;color:#6b7280;margin:0;line-height:1.8;">
          1️⃣ Configura tu agente DallIA<br>
          2️⃣ Sube tu carta de productos<br>
          3️⃣ Actualiza tu almacén<br>
          4️⃣ Registra tus mesas<br>
          5️⃣ Activa integraciones: WhatsApp, SUNAT, y más
        </p>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${subdominioUrl}" style="display:inline-block;background:linear-gradient(135deg,#ef520f,#df2c05);color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700;">
          Ingresar a mi restaurante
        </a>
      </div>
      <div style="text-align:center;padding:8px 0;">
        <p style="font-size:13px;color:#8B8FAD;margin:0;">¿Dudas? Responde este email o escríbenos por WhatsApp</p>
      </div>
    </div>
  </div>`;

  const asunto = esTrial
    ? `🚀 ${nombre}, tu restaurante ya está en línea — 15 días gratis`
    : `🚀 ${nombre}, tu restaurante ya está en línea`;

  return sendEmail(email, asunto, html);
}

// ── Notificar superadmin por WhatsApp ────────────────────────────────────────
async function notificarSuperadminWhatsApp(nombreNegocio, distrito, linkPanel) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  const toNumber = process.env.SUPERADMIN_WHATSAPP;

  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    logger.info('whatsapp_skip', { reason: 'Twilio not configured' });
    return;
  }

  try {
    const twilio = require('twilio')(accountSid, authToken);
    await twilio.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${toNumber}`,
      body: `Nueva solicitud de registro:\n${nombreNegocio} - ${distrito}\nRevisa en: ${linkPanel}`
    });
  } catch (err) {
    logger.error('whatsapp_error', { error: err.message });
  }
}

// ── Notificar superadmin por email ───────────────────────────────────────────
async function notificarSuperadminEmail(solicitud) {
  const superadminEmail = process.env.SUPERADMIN_EMAIL || process.env.SMTP_USER;
  if (!superadminEmail) {
    logger.info('email_superadmin_skip', { reason: 'SUPERADMIN_EMAIL not set' });
    return;
  }

  const html = `
  <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
    <h2 style="color:#0a0f24;">Nueva solicitud de registro</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#8B8FAD;">Restaurante:</td><td style="padding:8px 0;font-weight:600;">${solicitud.tenant_nombre || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#8B8FAD;">Email:</td><td style="padding:8px 0;">${solicitud.google_email || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#8B8FAD;">Ubicación:</td><td style="padding:8px 0;">${solicitud.distrito || '—'}</td></tr>
    </table>
    <div style="margin-top:16px;">
      <a href="${process.env.APP_URL || 'https://www.mirestconia.com'}/superadmin/solicitudes" style="display:inline-block;background:#ef520f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">
        Revisar solicitud
      </a>
    </div>
  </div>`;

  return sendEmail(superadminEmail, `Nueva solicitud: ${solicitud.tenant_nombre || 'Restaurante'}`, html);
}

module.exports = {
  enviarEmailSolicitudRecibida,
  enviarEmailAprobacion,
  enviarEmailRechazo,
  enviarEmailTrialExpirado,
  enviarEmailBienvenidaSubdominio,
  notificarSuperadminWhatsApp,
  notificarSuperadminEmail
};
