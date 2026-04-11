'use strict';
const express = require('express');
const router  = express.Router();

// GET /setup-pwa — renders the first-time PWA onboarding wizard
router.get('/', (req, res) => {
  const user = req.session?.user || {};
  res.render('pwa-setup-wizard', {
    user,
    userName: user.nombre || user.usuario || 'Usuario',
    restaurantName: req.session?.tenant?.nombre || 'tu restaurante'
  });
});

module.exports = router;
