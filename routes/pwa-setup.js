'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /setup-pwa — renders the first-time PWA onboarding wizard.
// Shows a "ya completado" redirect if tenant already finished setup.
router.get('/', async (req, res) => {
  const user = req.session?.user || {};
  const tid  = req.tenantId || 1;

  try {
    const [[tenant]] = await db.query(
      `SELECT setup_pwa_completado FROM tenants WHERE id = $1 LIMIT 1`,
      [tid]
    );
    if (tenant?.setup_pwa_completado) return res.redirect('/');
  } catch (_) {
    // Column may not exist yet — show wizard anyway
  }

  res.render('pwa-setup-wizard', {
    user,
    userName:       user.nombre || user.usuario || 'Usuario',
    restaurantName: req.session?.tenant?.nombre || 'tu restaurante'
  });
});

// POST /setup-pwa/completar — marks wizard as done in DB + session.
router.post('/completar', async (req, res) => {
  const tid = req.tenantId || 1;
  try {
    await db.query(
      `UPDATE tenants SET setup_pwa_completado = true WHERE id = $1`,
      [tid]
    );
    // Persist in session so next request doesn't hit DB
    if (req.session?.tenant) req.session.tenant.setup_pwa_completado = true;
  } catch (_) {
    // Column may not exist yet — fail silently
  }
  res.json({ ok: true });
});

module.exports = router;
