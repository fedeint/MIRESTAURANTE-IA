'use strict';

/**
 * Middleware that restricts access on tenant path routes.
 * On paths like /chuleta/mesas, only /slug/login and
 * static/auth routes are accessible without an active session.
 */
function tenantGuard(req, res, next) {
  const isTenantPath = res.locals.isTenantPath;

  if (!isTenantPath) {
    res.locals.isSubdomain = false;
    return next();
  }

  const slug = res.locals.tenantSlug;
  res.locals.isSubdomain = true;
  res.locals.subdomainSlug = slug;

  // Strip slug prefix to get the "inner" path
  const innerPath = req.path.replace(new RegExp(`^/${slug}`), '') || '/';

  // Allow these inner routes without session
  const allowed = [
    '/login', '/auth/', '/api/auth/',
    '/cambiar-contrasena',
    '/vendor/', '/css/', '/js/', '/logo/',
    '/favicon', '/sw.js', '/manifest.json',
    '/icon-', '/api/health'
  ];

  if (allowed.some(p => innerPath.startsWith(p))) return next();

  // POST /slug/logout always allowed
  if (innerPath === '/logout' && req.method === 'POST') return next();

  // No session → redirect to tenant login
  if (!req.session || !req.session.user) {
    return res.redirect(`/${slug}/login`);
  }

  next();
}

module.exports = { tenantGuard };
