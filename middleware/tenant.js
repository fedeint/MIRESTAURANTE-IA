'use strict';
const db = require('../db');

// Cache de tenants (5 min)
const tenantCache = {};
const CACHE_TTL = 5 * 60 * 1000;

// Rutas reservadas que NUNCA son slugs de tenant
const RESERVED_PATHS = new Set([
  'api', 'auth', 'login', 'logout', 'home', 'landing',
  'superadmin', 'dashboard', 'mesas', 'cocina', 'caja',
  'almacen', 'pedidos', 'reportes', 'config', 'chat',
  'personal', 'recetas', 'productos', 'categorias',
  'cambiar-contrasena', 'vendor', 'css', 'js', 'logo',
  'public', 'uploads', 'favicon.ico', 'sw.js',
  'manifest.json', 'legal', 'privacidad', 'terminos',
  'libro-reclamaciones', 'restaurantes', 'solicitar-demo',
  'icon-192.png', 'icon-512.png',
  // Rutas adicionales del sistema
  'legal-pwa', 'firmar', 'onboarding', 'solicitud',
  'onboarding-dallia', 'setup-sistema', 'espera-verificacion',
  'trial-expirado', 'usuarios', 'clientes', 'configuracion',
  'ventas', 'canales', 'facturas', 'sunat', 'sunat-pwa',
  'sprint4', 'pedido-nuevo', 'cocina-display', 'mesa',
  'para-llevar', 'cortesias', 'soporte', 'administracion',
  'sostac', 'contratos', 'delivery', 'features', 'static',
  'recetas-standalone', 'backups', 'observabilidad', 'cotizador'
]);

async function resolveTenantBySlug(slug) {
  const cached = tenantCache[slug];
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.data;
  try {
    const [[tenant]] = await db.query(
      'SELECT id, nombre, subdominio, plan, activo, estado_trial, trial_inicio, trial_fin FROM tenants WHERE subdominio = ? AND activo = true LIMIT 1',
      [slug]
    );
    if (tenant) tenantCache[slug] = { data: tenant, ts: Date.now() };
    return tenant || null;
  } catch (e) { return null; }
}

async function resolveTenantById(id) {
  const cached = tenantCache['id_' + id];
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.data;
  try {
    const [[tenant]] = await db.query(
      'SELECT id, nombre, subdominio, plan, activo, estado_trial, trial_inicio, trial_fin FROM tenants WHERE id = ? LIMIT 1',
      [id]
    );
    if (tenant) tenantCache['id_' + id] = { data: tenant, ts: Date.now() };
    return tenant || null;
  } catch (e) { return null; }
}

// Limites por plan
const PLAN_LIMITS = {
  free: { usuarios: 1, mesas: 10, productos: 50, almacen: false, recetas: false, caja: false, reportes_pdf: false, ia_voz: false, canales: false },
  pro: { usuarios: -1, mesas: -1, productos: -1, almacen: true, recetas: true, caja: true, reportes_pdf: true, ia_voz: true, canales: true },
  enterprise: { usuarios: -1, mesas: -1, productos: -1, almacen: true, recetas: true, caja: true, reportes_pdf: true, ia_voz: true, canales: true }
};

function setTenantOnReq(req, res, tenant) {
  req.tenantId = tenant.id;
  req.tenant = tenant;
  req.planLimits = PLAN_LIMITS[tenant.plan] || PLAN_LIMITS.free;
  res.locals.tenantId = tenant.id;
  res.locals.tenant = tenant;
  res.locals.planLimits = req.planLimits;
}

/**
 * Extrae el slug del primer segmento del path.
 * Retorna null si es una ruta reservada o no hay segmento.
 */
function extractSlugFromPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0].toLowerCase();
  if (RESERVED_PATHS.has(first)) return null;
  return first;
}

/**
 * Middleware principal: resuelve tenant desde path slug o sesión.
 */
function attachTenant(req, res, next) {
  const userTenantId = req.session?.user?.tenant_id;
  const userRole = req.session?.user?.rol;

  const slug = extractSlugFromPath(req.path);

  // Superadmin: si abre una URL con slug de tenant, procesarla como tenant path.
  // Si no hay slug (ej. /superadmin/*, /home, /login), default a tenant 1 enterprise.
  if (userRole === 'superadmin') {
    if (slug) {
      // Intentar resolver slug como tenant — si existe, el superadmin opera en ese tenant
      return resolveTenantBySlug(slug).then(tenant => {
        if (tenant) {
          setTenantOnReq(req, res, tenant);
          res.locals.tenantSlug = slug;
          res.locals.isTenantPath = true;
        } else {
          // Slug no existe: caer al default superadmin (tenant 1)
          req.tenantId = 1;
          req.tenant = { id: 1, plan: 'enterprise', estado_trial: 'activo', activo: true };
          req.planLimits = PLAN_LIMITS.enterprise;
          res.locals.tenantId = 1;
          res.locals.tenant = req.tenant;
          res.locals.planLimits = req.planLimits;
          res.locals.tenantSlug = null;
          res.locals.isTenantPath = false;
        }
        next();
      }).catch(() => {
        req.tenantId = 1;
        req.tenant = { id: 1, plan: 'enterprise', estado_trial: 'activo', activo: true };
        req.planLimits = PLAN_LIMITS.enterprise;
        res.locals.tenantId = 1;
        res.locals.tenant = req.tenant;
        res.locals.planLimits = req.planLimits;
        res.locals.tenantSlug = null;
        res.locals.isTenantPath = false;
        next();
      });
    }
    req.tenantId = 1;
    req.tenant = { id: 1, plan: 'enterprise', estado_trial: 'activo', activo: true };
    req.planLimits = PLAN_LIMITS.enterprise;
    res.locals.tenantId = 1;
    res.locals.tenant = req.tenant;
    res.locals.planLimits = req.planLimits;
    res.locals.tenantSlug = null;
    res.locals.isTenantPath = false;
    return next();
  }

  if (slug) {
    // Path-based tenant: mirestconia.com/:slug/...
    resolveTenantBySlug(slug).then(tenant => {
      if (tenant) {
        setTenantOnReq(req, res, tenant);
        res.locals.tenantSlug = slug;
        res.locals.isTenantPath = true;
      } else {
        // No es un tenant válido — tratar como ruta normal
        req.tenantId = userTenantId || 1;
        req.planLimits = PLAN_LIMITS.free;
        res.locals.tenantId = req.tenantId;
        res.locals.planLimits = req.planLimits;
        res.locals.tenantSlug = null;
        res.locals.isTenantPath = false;
      }
      next();
    }).catch(() => {
      req.tenantId = userTenantId || 1;
      req.planLimits = PLAN_LIMITS.free;
      res.locals.tenantId = req.tenantId;
      res.locals.tenantSlug = null;
      res.locals.isTenantPath = false;
      next();
    });
  } else if (userTenantId) {
    // Ruta sin slug pero user logueado — resolver desde sesión
    resolveTenantById(userTenantId).then(tenant => {
      if (tenant) { setTenantOnReq(req, res, tenant); }
      else {
        req.tenantId = userTenantId;
        req.planLimits = PLAN_LIMITS.free;
        res.locals.tenantId = userTenantId;
        res.locals.planLimits = req.planLimits;
      }
      res.locals.tenantSlug = null;
      res.locals.isTenantPath = false;
      next();
    }).catch(() => {
      req.tenantId = userTenantId;
      req.planLimits = PLAN_LIMITS.free;
      res.locals.tenantId = userTenantId;
      res.locals.tenantSlug = null;
      res.locals.isTenantPath = false;
      next();
    });
  } else {
    // Sin slug, sin sesión — público
    req.tenantId = 1;
    req.planLimits = PLAN_LIMITS.free;
    res.locals.tenantId = 1;
    res.locals.planLimits = req.planLimits;
    res.locals.tenantSlug = null;
    res.locals.isTenantPath = false;
    next();
  }
}

function requirePlan(feature) {
  return (req, res, next) => {
    const limits = req.planLimits || PLAN_LIMITS.free;
    if (limits[feature] === false) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(403).json({ error: 'Esta funcion requiere plan Pro. Actualiza en configuracion.' });
      }
      return res.status(403).render('error', { error: { message: 'Esta funcion requiere plan Pro', stack: '' } });
    }
    next();
  };
}

module.exports = { attachTenant, requirePlan, PLAN_LIMITS, extractSlugFromPath, RESERVED_PATHS };
