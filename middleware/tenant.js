const db = require('../db');

// Cache de tenants (5 min)
const tenantCache = {};
const CACHE_TTL = 5 * 60 * 1000;

async function resolveTenant(subdominio) {
    const cached = tenantCache[subdominio];
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.data;

    try {
        const [[tenant]] = await db.query(
            'SELECT id, nombre, subdominio, plan, activo FROM tenants WHERE subdominio = ? AND activo = true LIMIT 1',
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

function attachTenant(req, res, next) {
    // En desarrollo: tenant_id = 1
    // En produccion: resolver desde subdominio
    const hostname = req.hostname || '';
    const parts = hostname.split('.');

    if (parts.length >= 3 && parts[1] === 'dignita' && parts[2] === 'tech') {
        // subdominio.dignita.tech
        const subdominio = parts[0];
        resolveTenant(subdominio).then(tenant => {
            if (tenant) {
                req.tenantId = tenant.id;
                req.tenant = tenant;
                req.planLimits = PLAN_LIMITS[tenant.plan] || PLAN_LIMITS.free;
                res.locals.tenantId = tenant.id;
                res.locals.tenant = tenant;
                res.locals.planLimits = req.planLimits;
            } else {
                req.tenantId = 1;
                res.locals.tenantId = 1;
            }
            next();
        }).catch(() => {
            req.tenantId = 1;
            res.locals.tenantId = 1;
            next();
        });
    } else {
        // Desarrollo local: tenant_id = 1
        req.tenantId = 1;
        req.planLimits = PLAN_LIMITS.pro;
        res.locals.tenantId = 1;
        res.locals.planLimits = PLAN_LIMITS.pro;
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
