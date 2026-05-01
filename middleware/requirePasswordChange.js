'use strict';

/**
 * Redirects users with must_change_password=true to /cambiar-contrasena.
 * Allows only the password change route, logout, and static assets.
 */
function requirePasswordChange(req, res, next) {
  if (!req.session || !req.session.user) return next();
  if (!req.session.user.must_change_password) return next();

  const allowed = [
    '/cambiar-contrasena', '/logout',
    '/vendor/', '/css/', '/js/', '/favicon', '/logo/'
  ];

  if (allowed.some(p => req.path.startsWith(p))) return next();
  if (req.method === 'POST' && req.path === '/logout') return next();

  if (req.xhr || (req.headers.accept || '').includes('json') || req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Debes cambiar tu contraseña primero', redirect: '/cambiar-contrasena' });
  }

  return res.redirect('/cambiar-contrasena');
}

module.exports = { requirePasswordChange };
