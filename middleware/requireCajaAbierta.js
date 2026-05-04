module.exports = function(req, res, next) {
  if (!req.session || !req.session.cajaAbierta) {
    // Para rutas API/AJAX
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json')) || String(req.path || '').startsWith('/api/')) {
        return res.status(403).json({ error: 'Debes abrir caja para operar.' });
    }
    return res.redirect('/caja');
  }
  next();
};
