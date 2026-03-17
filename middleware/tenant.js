// Middleware de tenant - inyecta tenant_id en cada request
// Por ahora tenant_id = 1 (single tenant)
// Cuando sea multi-tenant, se resuelve desde el subdominio

function attachTenant(req, res, next) {
    // TODO: resolver desde subdominio cuando sea multi-tenant
    // const subdomain = req.hostname.split('.')[0];
    // const tenant = await getTenantBySubdomain(subdomain);
    req.tenantId = 1;
    res.locals.tenantId = 1;
    next();
}

module.exports = { attachTenant };
