'use strict';

/**
 * Middleware that restricts access on tenant subdomains.
 * On subdomains (e.g. chuleta.mirestconia.com), only /login and
 * static/auth routes are accessible without an active session.
 * All other routes redirect to /login.
 */
function subdomainGuard(req, res, next) {
  const parts = (req.hostname || '').split('.');
  const isSubdomain = parts.length >= 3
    && parts[1] === 'mirestconia'
    && parts[2] === 'com'
    && parts[0] !== 'www';

  // Not a subdomain — normal flow (www.mirestconia.com)
  if (!isSubdomain) {
    res.locals.isSubdomain = false;
    return next();
  }

  res.locals.isSubdomain = true;
  res.locals.subdomainSlug = parts[0];

  // Allow these routes without session
  const allowed = [
    '/login', '/auth/', '/api/auth/',
    '/cambiar-contrasena',
    '/vendor/', '/css/', '/js/', '/logo/',
    '/favicon', '/sw.js', '/manifest.json',
    '/icon-', '/api/health'
  ];

  if (allowed.some(p => req.path.startsWith(p))) return next();

  // POST /logout always allowed
  if (req.path === '/logout' && req.method === 'POST') return next();

  // No session → redirect to login
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  next();
}

module.exports = { subdomainGuard };
