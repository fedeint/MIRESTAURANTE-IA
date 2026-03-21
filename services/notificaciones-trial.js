// services/notificaciones-trial.js
'use strict';

const logger = require('../lib/logger');

async function enviarEmailAprobacion(email, nombre) {
  // TODO: integrate with email service (nodemailer/SendGrid)
  logger.info('email_aprobacion', { to: email, nombre });
}

async function enviarEmailRechazo(email, nombre, motivo) {
  logger.info('email_rechazo', { to: email, nombre, motivo });
}

async function enviarEmailTrialExpirado(email, nombre) {
  logger.info('email_trial_expirado', { to: email, nombre });
}

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

async function notificarSuperadminEmail(solicitud) {
  logger.info('email_nueva_solicitud', {
    negocio: solicitud.tenant_nombre,
    email: solicitud.google_email,
    distrito: solicitud.distrito
  });
}

module.exports = {
  enviarEmailAprobacion,
  enviarEmailRechazo,
  enviarEmailTrialExpirado,
  notificarSuperadminWhatsApp,
  notificarSuperadminEmail
};
