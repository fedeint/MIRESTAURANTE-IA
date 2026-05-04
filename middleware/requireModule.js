const { canAccess } = require('../lib/permissions');

module.exports = function requireModule(moduleName) {
  return (req, res, next) => {
    const user = req.session && req.session.user ? req.session.user : null;
    
    if (!user || !canAccess(user.rol, moduleName)) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('json')) || String(req.path || '').startsWith('/api/')) {
        return res.status(403).json({ error: `No tienes permisos para acceder al módulo "${moduleName}"` });
      }
      return res.redirect('/login'); // Or a generic '/no-access' view
    }

    next();
  };
};
