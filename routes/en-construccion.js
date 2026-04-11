const express = require('express');
const router = express.Router();

// GET /proximamente?feature=Nombre&icon=🚚&eta=Q2+2026
router.get('/', (req, res) => {
  const feature = req.query.feature || 'Módulo';
  const icon    = req.query.icon    || '🚧';
  const eta     = req.query.eta     || null;
  const backUrl = req.query.back    || '/mas';

  res.render('en-construccion', { feature, icon, eta, backUrl });
});

module.exports = router;
