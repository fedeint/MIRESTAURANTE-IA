// services/whatsapp-api.js
'use strict';

const logger = require('../lib/logger');

const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Send a WhatsApp template message.
 * Returns true if sent, false if WhatsApp not configured or failed.
 */
async function sendTemplate(toPhone, templateName, params = []) {
  if (!PHONE_ID || !TOKEN) {
    logger.info('whatsapp_skip', { reason: 'WHATSAPP not configured', template: templateName });
    return false;
  }

  // Normalize Peru phone: remove +, spaces, ensure starts with 51
  let phone = String(toPhone).replace(/[\s+\-()]/g, '');
  if (phone.startsWith('9') && phone.length === 9) phone = '51' + phone;
  if (!phone.startsWith('51')) phone = '51' + phone;

  try {
    const res = await fetch(`${API_URL}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'es' },
          components: params.length > 0 ? [{
            type: 'body',
            parameters: params.map(p => ({ type: 'text', text: String(p) })),
          }] : [],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('whatsapp_error', { template: templateName, to: phone, status: res.status, error: err });
      return false;
    }

    logger.info('whatsapp_sent', { template: templateName, to: phone });
    return true;
  } catch (err) {
    logger.error('whatsapp_failed', { template: templateName, error: err.message });
    return false;
  }
}

/**
 * Send a simple text message (only within 24h conversation window).
 */
async function sendText(toPhone, message) {
  if (!PHONE_ID || !TOKEN) return false;

  let phone = String(toPhone).replace(/[\s+\-()]/g, '');
  if (phone.startsWith('9') && phone.length === 9) phone = '51' + phone;

  try {
    const res = await fetch(`${API_URL}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    });

    return res.ok;
  } catch (err) {
    logger.error('whatsapp_text_failed', { error: err.message });
    return false;
  }
}

module.exports = { sendTemplate, sendText };
