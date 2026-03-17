# PRD: Fase 11 - SaaS Multi-Tenant
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Tablas (migracion 009)
- `tenants` - nombre, subdominio (unique), plan (free/pro/enterprise), RUC, email, config JSON
- `tenant_suscripciones` - plan, precio, fechas, estado, metodo pago

## Middleware tenant.js
- Resuelve tenant desde subdominio: `subdominio.dignita.tech`
- Cache de 5 minutos para no consultar BD en cada request
- Desarrollo local: tenant_id = 1 (sin subdominio)
- `req.tenantId`, `req.tenant`, `req.planLimits` disponibles en toda la app

## Limites por plan
```
FREE:  1 usuario, 10 mesas, 50 productos
       Sin: almacen, recetas, caja, reportes, IA voz, canales
PRO:   Todo ilimitado + todos los modulos
ENTERPRISE: Todo + multi-sucursal + API propia
```

## requirePlan() middleware
- Verifica que el feature esta disponible en el plan del tenant
- Retorna 403 si no esta habilitado

## Tenant actual
- ID: 1, subdominio: mirestaurante, plan: pro
- Suscripcion activa precargada

## Archivos
- `migrations/009_multitenant.js`
- `middleware/tenant.js` (reescrito completo)
