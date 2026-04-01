const db = require('../db');

// Cache de tenants (5 min)
const tenantCache = {};
const CACHE_TTL = 5 * 60 * 1000;

async function resolveTenant(subdominio) {
    const cached = tenantCache[subdominio];
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.data;

    try {
        const [[tenant]] = await db.query(
            'SELECT id, nombre, subdominio, plan, activo, estado_trial, trial_inicio, trial_fin FROM tenants WHERE subdominio = ? AND activo = true LIMIT 1',
            [subdominio]
        );
        if (tenant) {
            tenantCache[subdominio] = { data: tenant, ts: Date.now() };
        }
        return tenant || null;
    } catch (e) {
        return null;
    }
}

// Limites por plan
const PLAN_LIMITS = {
    free: { usuarios: 1, mesas: 10, productos: 50, almacen: false, recetas: false, caja: false, reportes_pdf: false, ia_voz: false, canales: false },
    pro: { usuarios: -1, mesas: -1, productos: -1, almacen: true, recetas: true, caja: true, reportes_pdf: true, ia_voz: true, canales: true },
    enterprise: { usuarios: -1, mesas: -1, productos: -1, almacen: true, recetas: true, caja: true, reportes_pdf: true, ia_voz: true, canales: true }
};

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

function setTenantOnReq(req, res, tenant) {
    req.tenantId = tenant.id;
    req.tenant = tenant;
    req.planLimits = PLAN_LIMITS[tenant.plan] || PLAN_LIMITS.free;
    res.locals.tenantId = tenant.id;
    res.locals.tenant = tenant;
    res.locals.planLimits = req.planLimits;
}

function attachTenant(req, res, next) {
    const hostname = req.hostname || '';
    const parts = hostname.split('.');
    const userTenantId = req.session?.user?.tenant_id;
    const userRole = req.session?.user?.rol;

    // Superadmin: always tenant 1 with pro limits, no trial restriction
    if (userRole === 'superadmin') {
        req.tenantId = 1;
        req.tenant = { id: 1, plan: 'enterprise', estado_trial: 'activo', activo: true };
        req.planLimits = PLAN_LIMITS.enterprise;
        res.locals.tenantId = 1;
        res.locals.tenant = req.tenant;
        res.locals.planLimits = req.planLimits;
        return next();
    }

    // Check if accessing via subdomain (tenant-slug.mirestconia.com)
    const isSubdomain = parts.length >= 3 && parts[1] === 'mirestconia' && parts[2] === 'com' && parts[0] !== 'www';

    if (isSubdomain) {
        resolveTenant(parts[0]).then(tenant => {
            if (tenant) { setTenantOnReq(req, res, tenant); }
            else { req.tenantId = userTenantId || 1; req.planLimits = PLAN_LIMITS.free; res.locals.tenantId = req.tenantId; res.locals.planLimits = req.planLimits; }
            next();
        }).catch(() => { req.tenantId = userTenantId || 1; req.planLimits = PLAN_LIMITS.free; res.locals.tenantId = req.tenantId; next(); });
    } else if (userTenantId) {
        // Main domain (www.mirestconia.com) — resolve from logged-in user's tenant
        resolveTenantById(userTenantId).then(tenant => {
            if (tenant) { setTenantOnReq(req, res, tenant); }
            else { req.tenantId = userTenantId; req.planLimits = PLAN_LIMITS.free; res.locals.tenantId = userTenantId; res.locals.planLimits = req.planLimits; }
            next();
        }).catch(() => { req.tenantId = userTenantId; req.planLimits = PLAN_LIMITS.free; res.locals.tenantId = userTenantId; next(); });
    } else {
        // No user logged in — default tenant 1 for public pages
        req.tenantId = 1;
        req.planLimits = PLAN_LIMITS.free;
        res.locals.tenantId = 1;
        res.locals.planLimits = req.planLimits;
        next();
    }
}

// Middleware para verificar feature del plan
function requirePlan(feature) {
    return (req, res, next) => {
        const limits = req.planLimits || PLAN_LIMITS.free;
        if (limits[feature] === false) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(403).json({ error: `Esta funcion requiere plan Pro. Actualiza en configuracion.` });
            }
            return res.status(403).render('error', { error: { message: 'Esta funcion requiere plan Pro', stack: '' } });
        }
        next();
    };
}

module.exports = { attachTenant, requirePlan, PLAN_LIMITS };
