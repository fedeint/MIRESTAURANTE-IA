// lib/posthog-events.js
// PostHog event tracking helper for DallIA analytics

const { PostHog } = require('posthog-node');

// Initialize PostHog (only if API key is configured)
let posthog = null;

function initPostHog() {
  if (posthog) return;

  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return;

  posthog = new PostHog(apiKey, {
    host: process.env.POSTHOG_API_HOST || 'https://us.i.posthog.com',
    flushAt: 10,
    flushInterval: 5000
  });
}

function capturarEventoDallIA(evento, req, propiedades = {}) {
  if (!posthog) initPostHog();
  if (!posthog) return;

  const tenantId = String(req.tenantId || req.session?.tenant_id || 1);
  const userId = String(req.session?.user?.id || 'anonymous');

  try {
    posthog.capture({
      distinctId: `tenant_${tenantId}_user_${userId}`,
      event: evento,
      properties: {
        ...propiedades,
        tenant_id: tenantId,
        user_id: userId,
        usuario: req.session?.user?.nombre || req.session?.user?.usuario || 'unknown',
        rol: req.session?.user?.rol || 'unknown'
      }
    });
  } catch (error) {
    console.warn(`[PostHog] capture failed ${evento}:`, error.message);
  }
}

function capturarPreguntaEnviada(req, { categoria, preguntaTexto, fuente = 'chat' }) {
  capturarEventoDallIA('dallia_question_sent', req, {
    categoria,
    pregunta_texto: preguntaTexto?.substring(0, 200),
    fuente,
    longitud_pregunta: preguntaTexto?.length || 0
  });
}

function capturarRespuestaGenerada(req, { categoria, tokensUsados, tiempoMs, modelo = 'claude' }) {
  capturarEventoDallIA('dallia_response_generated', req, {
    categoria,
    tokens_usados: tokensUsados,
    tiempo_respuesta_ms: tiempoMs,
    modelo
  });
}

function capturarRespuestaCalificada(req, { categoria, util, comentario = null }) {
  capturarEventoDallIA('dallia_response_rated', req, {
    categoria,
    util: util === true || util === 'si' || util === '1',
    comentario_longitud: comentario?.length || 0
  });
}

function capturarChatAbierto(req, { seccion = 'dashboard' }) {
  capturarEventoDallIA('dallia_chat_opened', req, { seccion });
}

function capturarErrorDallIA(req, { tipoError, mensaje, categoria = null }) {
  capturarEventoDallIA('dallia_error', req, {
    error_tipo: tipoError,
    error_mensaje: mensaje?.substring(0, 200),
    categoria
  });
}

function capturarPreguntaDiaria(req, { pregunta, respuesta }) {
  capturarEventoDallIA('dallia_daily_question', req, { pregunta, respuesta });
}

function capturarModuloSugerido(req, { modulo, razon, click }) {
  capturarEventoDallIA('dallia_module_suggested', req, { modulo, razon, click: click === true });
}

function capturarAlertaTokens(req, { porcentajeRestante, tokensRestantes, tokalesTotal }) {
  capturarEventoDallIA('dallia_tokens_warning', req, {
    porcentaje_restante: porcentajeRestante,
    tokens_restantes: tokensRestantes,
    tokens_total: tokalesTotal
  });
}

module.exports = {
  initPostHog,
  capturarEventoDallIA,
  capturarPreguntaEnviada,
  capturarRespuestaGenerada,
  capturarRespuestaCalificada,
  capturarChatAbierto,
  capturarErrorDallIA,
  capturarPreguntaDiaria,
  capturarModuloSugerido,
  capturarAlertaTokens
};
