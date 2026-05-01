'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

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
