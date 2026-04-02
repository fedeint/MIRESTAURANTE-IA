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

module.exports = router;
