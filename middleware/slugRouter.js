'use strict';

/**
 * Middleware que reescribe la URL para rutas de tenant.
 * Si el request es para un tenant path (e.g., /chuleta/mesas),
 * reescribe req.url a /mesas para que las rutas existentes funcionen sin cambios.
 *
 * Debe usarse DESPUÉS de attachTenant y tenantGuard.
 * Se aplica solo cuando res.locals.isTenantPath === true.
 */
function slugRewrite(req, res, next) {
  if (!res.locals.isTenantPath || !res.locals.tenantSlug) {
    return next();
  }

  const slug = res.locals.tenantSlug;
  // Guardar el basePath para generar URLs en las vistas
  res.locals.basePath = `/${slug}`;
  // Reescribir: /chuleta/mesas → /mesas
  req.url = req.url.replace(new RegExp(`^/${slug}`), '') || '/';
  next();
}

module.exports = { slugRewrite };
