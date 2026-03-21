// lib/alertas.js
const nodemailer = require('nodemailer')
const db = require('../db')
const logger = require('./logger')

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  const host = process.env.ALERT_SMTP_HOST
  const key = process.env.ALERT_SMTP_KEY
  if (!host || !key) return null
  transporter = nodemailer.createTransport({
    host, port: 465, secure: true,
    auth: { user: 'resend', pass: key }
  })
  return transporter
}

async function enviarEmail(asunto, html) {
  const t = getTransporter()
  const to = process.env.ALERT_EMAIL_TO
  if (!t || !to) { logger.warn('ALERT_EMAIL_NOT_CONFIGURED'); return false }
  try {
    await t.sendMail({ from: 'Observabilidad <alertas@tusaas.com>', to, subject: asunto, html })
    return true
  } catch (err) {
    logger.error('ALERT_EMAIL_FAILED', { error: err.message })
    return false
  }
}

async function enviarWhatsApp(mensaje) {
  const telefono = process.env.ALERT_WHATSAPP_TO
  if (!telefono) { logger.warn('ALERT_WHATSAPP_NOT_CONFIGURED'); return false }
  try {
    const whatsapp = require('../services/whatsapp')
    if (whatsapp.enviarMensajePrueba) {
      await whatsapp.enviarMensajePrueba({
        provider: 'meta', telefono,
        config: { whatsapp_token: process.env.WHATSAPP_TOKEN, whatsapp_phone_id: process.env.WHATSAPP_PHONE_ID },
        mensaje
      })
    }
    return true
  } catch (err) {
    logger.error('ALERT_WHATSAPP_FAILED', { error: err.message })
    return false
  }
}

async function puedeEnviar(regla) {
  try {
    const [[estado]] = await db.query(
      'SELECT ultimo_envio, silenciado_hasta FROM alertas_estado WHERE regla = ?', [regla]
    )
    if (!estado) return true
    const ahora = new Date()
    if (estado.silenciado_hasta && new Date(estado.silenciado_hasta) > ahora) return false
    if (estado.ultimo_envio) {
      const diff = ahora - new Date(estado.ultimo_envio)
      if (diff < 30 * 60 * 1000) return false
    }
    return true
  } catch { return true }
}

async function registrarEnvio(regla) {
  try {
    await db.query(
      `INSERT INTO alertas_estado (regla, ultimo_envio, conteo)
       VALUES (?, NOW(), 1)
       ON CONFLICT (regla) DO UPDATE SET ultimo_envio = NOW(), conteo = alertas_estado.conteo + 1`,
      [regla]
    )
  } catch (err) { logger.warn('ALERT_REGISTRO_FAILED', { error: err.message }) }
}

function dentroDeHorario(severidad) {
  if (severidad === 'critical') return true
  const hora = new Date().getHours()
  return hora >= 8 && hora < 22
}

async function disparar(regla, severidad, datos = {}) {
  try {
    const [[config]] = await db.query(
      'SELECT canal, activa FROM alertas_configuracion WHERE regla = ?', [regla]
    )
    if (config && !config.activa) return
    if (!dentroDeHorario(severidad)) return
    if (!(await puedeEnviar(regla))) return

    const canal = config?.canal || 'email'
    const asunto = `[${severidad.toUpperCase()}] ${regla.replace(/_/g, ' ')}`
    const html = `<h2>${asunto}</h2><p><strong>Regla:</strong> ${regla}</p><p><strong>Severidad:</strong> ${severidad}</p><p><strong>Hora:</strong> ${new Date().toISOString()}</p><pre>${JSON.stringify(datos, null, 2)}</pre>`
    const mensaje = `${asunto}\n${JSON.stringify(datos)}`

    await enviarEmail(asunto, html)
    if (canal === 'email_whatsapp' && severidad === 'critical') {
      await enviarWhatsApp(mensaje)
    }
    await registrarEnvio(regla)
    logger.info('ALERT_SENT', { regla, severidad, canal })
  } catch (err) {
    logger.error('ALERT_DISPATCH_FAILED', { regla, error: err.message })
  }
}

async function silenciar(regla, minutos) {
  const mins = Math.max(1, Math.min(parseInt(minutos) || 30, 10080))
  await db.query(
    `INSERT INTO alertas_estado (regla, silenciado_hasta)
     VALUES (?, NOW() + make_interval(mins => ?))
     ON CONFLICT (regla) DO UPDATE SET silenciado_hasta = NOW() + make_interval(mins => ?)`,
    [regla, mins, mins]
  )
}

module.exports = { disparar, silenciar, enviarEmail, enviarWhatsApp }
