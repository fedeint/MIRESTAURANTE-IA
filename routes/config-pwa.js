const express = require('express');
const router = express.Router();
const db = require('../db');

// JSONB columns return objects in PG, strings in MySQL — handle both
function parseJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch (_) { return fallback; }
}

// ─── GET /config/dallia ─────────────────────────────────────────────────────
router.get('/dallia', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [[row]] = await db.query(
      'SELECT config_json FROM tenant_dallia_config WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
    const config = parseJson(row?.config_json, {
      nombre: 'DallIA', trato: 'tu', personalidad: 'amigable',
      cap_alertas: true, cap_pregunta: true, cap_rutina: true, cap_voz: true, cap_fab: true,
    });
    res.render('config/dallia', { config });
  } catch (e) {
    console.error(e);
    const config = {
      nombre: 'DallIA', trato: 'tu', personalidad: 'amigable',
      cap_alertas: true, cap_pregunta: true, cap_rutina: true, cap_voz: true, cap_fab: true,
    };
    res.render('config/dallia', { config });
  }
});

// ─── POST /config/dallia ─────────────────────────────────────────────────────
router.post('/dallia', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const allowed = ['nombre','trato','personalidad','cap_alertas','cap_pregunta','cap_rutina','cap_voz','cap_fab'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    const json = JSON.stringify(data);
    await db.query(
      `INSERT INTO tenant_dallia_config (tenant_id, config_json, updated_at)
       VALUES (?, ?::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
      [tenantId, json]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

// ─── GET /config/alertas ─────────────────────────────────────────────────────
router.get('/alertas', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [[row]] = await db.query(
      'SELECT config_json FROM tenant_alertas_config WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
    const alertas = parseJson(row?.config_json, {
      push: true, whatsapp: false, email: true,
      stock: true, retraso: true, cierre: true,
      dnd_activo: false, dnd_inicio: '22:00', dnd_fin: '07:00',
    });
    res.render('config/alertas', { alertas });
  } catch (e) {
    console.error(e);
    const alertas = {
      push: true, whatsapp: false, email: true,
      stock: true, retraso: true, cierre: true,
      dnd_activo: false, dnd_inicio: '22:00', dnd_fin: '07:00',
    };
    res.render('config/alertas', { alertas });
  }
});

// ─── POST /config/alertas ─────────────────────────────────────────────────────
router.post('/alertas', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const allowed = ['push','whatsapp','email','stock','retraso','cierre','dnd_activo','dnd_inicio','dnd_fin'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    const json = JSON.stringify(data);
    await db.query(
      `INSERT INTO tenant_alertas_config (tenant_id, config_json, updated_at)
       VALUES (?, ?::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
      [tenantId, json]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

// ─── GET /config/modulos ──────────────────────────────────────────────────────
router.get('/modulos', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [[row]] = await db.query(
      'SELECT config_json FROM tenant_modulos WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
    const modulos = parseJson(row?.config_json, {});
    res.render('config/modulos', { modulos });
  } catch (e) {
    console.error(e);
    res.render('config/modulos', { modulos: {} });
  }
});

// ─── POST /config/modulos ─────────────────────────────────────────────────────
router.post('/modulos', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    // Only accept boolean values, strip core modules that can't be disabled
    const locked = new Set(['pedidos','caja_ventas','configuracion','soporte']);
    const data = {};
    Object.keys(req.body).forEach(k => {
      if (!locked.has(k)) data[k] = !!req.body[k];
    });
    const json = JSON.stringify(data);
    await db.query(
      `INSERT INTO tenant_modulos (tenant_id, config_json, updated_at)
       VALUES (?, ?::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
      [tenantId, json]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

// ─── GET /config/horarios ────────────────────────────────────────────────────
router.get('/horarios', async (req, res) => {
  const defaultHorarios = {
    lunes:     { abierto: true,  apertura: '08:00', cierre: '22:00' },
    martes:    { abierto: true,  apertura: '08:00', cierre: '22:00' },
    miercoles: { abierto: true,  apertura: '08:00', cierre: '22:00' },
    jueves:    { abierto: true,  apertura: '08:00', cierre: '22:00' },
    viernes:   { abierto: true,  apertura: '08:00', cierre: '23:00' },
    sabado:    { abierto: true,  apertura: '08:00', cierre: '23:00' },
    domingo:   { abierto: false, apertura: '10:00', cierre: '18:00' },
  };
  try {
    const tenantId = req.tenantId;
    const [[row]] = await db.query(
      'SELECT config_json FROM tenant_horarios WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
    const horarios = row ? { ...defaultHorarios, ...parseJson(row.config_json, {}) } : defaultHorarios;
    res.render('config/horarios', { horarios });
  } catch (e) {
    console.error(e);
    res.render('config/horarios', { horarios: defaultHorarios });
  }
});

// ─── POST /config/horarios ────────────────────────────────────────────────────
router.post('/horarios', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const dias = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
    const data = {};
    dias.forEach(d => {
      const dData = req.body[d];
      if (dData && typeof dData === 'object') {
        data[d] = {
          abierto: !!dData.abierto,
          apertura: (dData.apertura || '08:00').slice(0, 5),
          cierre:   (dData.cierre   || '22:00').slice(0, 5),
        };
      }
    });
    const json = JSON.stringify(data);
    await db.query(
      `INSERT INTO tenant_horarios (tenant_id, config_json, updated_at)
       VALUES (?, ?::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()`,
      [tenantId, json]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar' });
  }
});

// ─── GET /config/tour ────────────────────────────────────────────────────────
router.get('/tour', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [[row]] = await db.query(
      'SELECT completados FROM tenant_tour_estado WHERE tenant_id = ? LIMIT 1',
      [tenantId]
    );
    const tour = { completados: row ? row.completados : 0, total: 10 };
    res.render('config/tour', { tour });
  } catch (e) {
    console.error(e);
    res.render('config/tour', { tour: { completados: 0, total: 10 } });
  }
});

// ─── POST /config/tour/avanzar ───────────────────────────────────────────────
router.post('/tour/avanzar', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    await db.query(
      `INSERT INTO tenant_tour_estado (tenant_id, completados, updated_at)
       VALUES (?, 1, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         completados = LEAST(tenant_tour_estado.completados + 1, 10),
         updated_at = NOW()`,
      [tenantId]
    );
    const [[row]] = await db.query(
      'SELECT completados FROM tenant_tour_estado WHERE tenant_id = ?',
      [tenantId]
    );
    res.json({ ok: true, completados: row ? row.completados : 1 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DalIA — Estadísticas de consumo de tokens
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /config/dallia/stats ───────────────────────────────────────────────
// Cuota + desglose por fuente + ahorro por cache. Todo filtrado por tenant.
router.get('/dallia/stats', async (req, res) => {
  const tid = req.tenantId;
  try {
    const [[cuota]] = await db.query(
      `SELECT tokens_total, tokens_consumidos, tokens_reset_fecha
       FROM tenant_suscripciones WHERE tenant_id = ? LIMIT 1`,
      [tid]
    );
    const total = Number(cuota?.tokens_total || 2000000);
    const usado = Number(cuota?.tokens_consumidos || 0);

    // Desglose por tipo (últimos 30 días)
    let desglose = [];
    try {
      const [rows] = await db.query(
        `SELECT tipo, COUNT(*) AS llamadas, COALESCE(SUM(tokens_usados),0) AS tokens,
                COALESCE(SUM(costo_estimado_usd),0) AS costo
         FROM token_consumo
         WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY tipo ORDER BY tokens DESC`,
        [tid]
      );
      desglose = rows || [];
    } catch (_) { desglose = []; }

    // Ahorro por FAQ cache (últimos 30 días)
    let ahorro = { tokens: 0, llamadas: 0, costo: 0 };
    try {
      const [[row]] = await db.query(
        `SELECT COALESCE(SUM(tokens_ahorrados),0) AS tokens,
                COUNT(*) FILTER (WHERE cache_hit = TRUE) AS llamadas
         FROM token_consumo
         WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL '30 days'`,
        [tid]
      );
      ahorro.tokens = Number(row?.tokens || 0);
      ahorro.llamadas = Number(row?.llamadas || 0);
      ahorro.costo = (ahorro.tokens * 0.70) / 1_000_000;
    } catch (_) {}

    res.json({
      cuota: {
        total,
        usado,
        restante: total - usado,
        porcentaje: total > 0 ? Math.round((usado / total) * 100) : 0,
        reset_fecha: cuota?.tokens_reset_fecha || null
      },
      desglose,
      ahorro
    });
  } catch (e) {
    console.error('[dallia/stats]', e);
    res.json({
      cuota: { total: 2000000, usado: 0, restante: 2000000, porcentaje: 0, reset_fecha: null },
      desglose: [],
      ahorro: { tokens: 0, llamadas: 0, costo: 0 }
    });
  }
});

// ─── GET /config/dallia/top-preguntas ───────────────────────────────────────
router.get('/dallia/top-preguntas', async (req, res) => {
  const tid = req.tenantId;
  try {
    const [rows] = await db.query(
      `SELECT pregunta_texto, categoria,
              COUNT(*) AS veces,
              COALESCE(SUM(tokens_usados),0) AS tokens_total,
              COALESCE(AVG(tokens_usados),0) AS tokens_promedio,
              MAX(created_at) AS ultima
       FROM token_consumo
       WHERE tenant_id = ?
         AND pregunta_texto IS NOT NULL
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY pregunta_texto, categoria
       ORDER BY veces DESC, tokens_total DESC
       LIMIT 20`,
      [tid]
    );
    res.json({ preguntas: rows || [] });
  } catch (e) {
    console.error('[dallia/top-preguntas]', e);
    res.json({ preguntas: [] });
  }
});

// ─── GET /config/dallia/historico ───────────────────────────────────────────
router.get('/dallia/historico', async (req, res) => {
  const tid = req.tenantId;
  try {
    const [rows] = await db.query(
      `SELECT DATE(created_at) AS dia,
              COALESCE(SUM(tokens_usados),0) AS tokens,
              COUNT(*) AS llamadas,
              COALESCE(SUM(costo_estimado_usd),0) AS costo
       FROM token_consumo
       WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY dia ASC`,
      [tid]
    );
    res.json({ historico: rows || [] });
  } catch (e) {
    console.error('[dallia/historico]', e);
    res.json({ historico: [] });
  }
});

// ─── POST /config/dallia/faq-cache/limpiar ──────────────────────────────────
router.post('/dallia/faq-cache/limpiar', async (req, res) => {
  const tid = req.tenantId;
  try {
    const [result] = await db.query(
      `DELETE FROM dallia_faq_cache WHERE tenant_id = ?`,
      [tid]
    );
    res.json({ ok: true, eliminados: result?.rowCount ?? result?.affectedRows ?? 0 });
  } catch (e) {
    console.error('[dallia/faq-cache/limpiar]', e);
    res.status(500).json({ error: 'Error al limpiar cache' });
  }
});

// ─── GET /config/dallia/automatizaciones ────────────────────────────────────
router.get('/dallia/automatizaciones', async (req, res) => {
  const tid = req.tenantId;
  try {
    const [[row]] = await db.query(
      `SELECT * FROM tenant_dallia_automatizaciones WHERE tenant_id = ? LIMIT 1`,
      [tid]
    );
    res.json({
      automatizaciones: row || {
        resumen_diario_activo: false,
        resumen_diario_hora: '23:00',
        vencimiento_activo: true,
        recordatorio_caja_activo: true,
        meta_alcanzada_activo: true,
        enviar_pedido_auto: false,
        notificaciones_whatsapp: false
      }
    });
  } catch (e) {
    console.error('[dallia/automatizaciones]', e);
    res.json({ automatizaciones: {} });
  }
});

// ─── POST /config/dallia/automatizaciones ───────────────────────────────────
router.post('/dallia/automatizaciones', async (req, res) => {
  const tid = req.tenantId;
  const allowed = [
    'resumen_diario_activo','resumen_diario_hora',
    'vencimiento_activo','recordatorio_caja_activo','meta_alcanzada_activo',
    'enviar_pedido_auto','notificaciones_whatsapp'
  ];
  const data = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

  try {
    const cols = Object.keys(data);
    if (cols.length === 0) return res.json({ ok: true });

    const colList = cols.join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const updateSet = cols.map(c => `${c} = EXCLUDED.${c}`).join(', ');

    await db.query(
      `INSERT INTO tenant_dallia_automatizaciones (tenant_id, ${colList}, updated_at)
       VALUES (?, ${placeholders}, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         ${updateSet}, updated_at = NOW()`,
      [tid, ...cols.map(c => data[c])]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[dallia/automatizaciones POST]', e);
    res.status(500).json({ error: 'Error al guardar automatizaciones' });
  }
});

module.exports = router;
