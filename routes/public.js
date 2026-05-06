'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

const DEMO_RESTAURANTES = [
  { nombre: 'La Causa Peruana', subdominio: 'la-causa', distrito: 'Miraflores', departamento: 'Lima', latitud: -12.122, longitud: -77.03, plan: 'pro' },
  { nombre: 'Sabor Norteño', subdominio: 'sabor-norteno', distrito: 'Piura', departamento: 'Piura', latitud: -5.194, longitud: -80.632, plan: 'starter' },
  { nombre: 'Brasas del Sur', subdominio: 'brasas-sur', distrito: 'Arequipa', departamento: 'Arequipa', latitud: -16.409, longitud: -71.537, plan: 'pro' },
];

function isDbUnavailable(err) {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  return (
    code === 'enotfound' ||
    code === 'econnrefused' ||
    code === '57p01' ||
    msg.includes('getaddrinfo') ||
    msg.includes('connection terminated') ||
    msg.includes('connect') ||
    msg.includes('timeout')
  );
}

// ---------------------------------------------------------------------------
// API: GET /api/restaurantes — Public restaurant search
// ---------------------------------------------------------------------------
router.get('/api/restaurantes', async (req, res) => {
  try {
    const { buscar, tipo, ciudad } = req.query;
    let where = "WHERE t.activo = true AND t.estado_trial != 'pendiente'";
    const params = [];

    if (buscar) {
      params.push(`%${buscar}%`);
      where += ` AND (t.nombre ILIKE ? OR t.subdominio ILIKE ?)`;
      params.push(`%${buscar}%`);
    }
    // tipo_negocio column not yet available — filter reserved for future use
    if (ciudad) {
      params.push(`%${ciudad}%`);
      where += ` AND (t.distrito ILIKE ? OR t.departamento ILIKE ?)`;
      params.push(`%${ciudad}%`);
    }

    const [restaurantes] = await db.query(
      `SELECT t.nombre, t.subdominio, t.distrito, t.departamento,
              t.latitud, t.longitud, t.plan
       FROM tenants t ${where}
       ORDER BY t.created_at DESC
       LIMIT 50`,
      params
    );

    res.json(restaurantes || []);
  } catch (err) {
    console.error('Public restaurantes error:', err.message);
    if (isDbUnavailable(err)) {
      return res.json(DEMO_RESTAURANTES);
    }
    res.status(500).json({ error: 'Error al buscar restaurantes' });
  }
});

// ---------------------------------------------------------------------------
// API: POST /api/demos — Save demo appointment request
// ---------------------------------------------------------------------------
router.post('/api/demos', async (req, res) => {
  try {
    const { nombre, restaurante, whatsapp, paquete, fecha_preferida } = req.body;

    if (!nombre || !whatsapp) {
      return res.status(400).json({ error: 'Nombre y WhatsApp son requeridos' });
    }

    await db.query(
      `INSERT INTO demo_solicitudes (nombre, restaurante, whatsapp, paquete, fecha_preferida)
       VALUES (?, ?, ?, ?, ?)`,
      [nombre, restaurante || null, whatsapp, paquete || null, fecha_preferida || null]
    );

    // Sync to CRM
    try {
      const crmSync = require('../services/crm-sync');
      await crmSync.onDemoSolicitada({ nombre, restaurante, whatsapp, paquete, fecha_preferida });
    } catch (_) {}

    res.json({ ok: true, message: 'Demo agendada exitosamente. Te contactaremos por WhatsApp.' });
  } catch (err) {
    console.error('Demo solicitud error:', err.message);
    if (isDbUnavailable(err)) {
      // Fallback demo mode: keep UX flowing even if DB is temporarily unavailable.
      return res.json({
        ok: true,
        message: 'Demo recibida en modo maqueta. Te contactaremos por WhatsApp cuando el sistema esté conectado.'
      });
    }
    res.status(500).json({ error: 'Error al agendar demo' });
  }
});

// ---------------------------------------------------------------------------
// Page routes (public, no auth required)
// ---------------------------------------------------------------------------
router.get('/home', (req, res) => {
  // If user is logged in and not on subdomain, redirect to dashboard
  if (req.session?.user && !res.locals.isTenantPath) {
    const rol = req.session.user.rol;
    if (rol === 'superadmin') return res.redirect('/superadmin');
    return res.redirect('/dashboard');
  }
  res.render('public/homepage');
});

router.get('/paquetes', (req, res) => res.render('public/paquetes'));
router.get('/demo', (req, res) => res.render('public/demo'));
router.get('/restaurantes-ia', (req, res) => res.render('public/restaurantes'));
router.get('/beneficios', (req, res) => res.render('public/beneficios'));
router.get('/marketplace', (req, res) => res.render('public/marketplace'));

module.exports = router;
