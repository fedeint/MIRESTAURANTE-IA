# PRD: Fase 0 - Fundamentos de Seguridad y Arquitectura
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Tareas completadas

### 0.1 Seguridad
| Tarea | Descripcion | Archivo |
|-------|-------------|---------|
| 0.1.1 | Credenciales BD desde .env (no hardcode) | db.js |
| 0.1.2 | CORS restringido (configurable, no wildcard) | server.js |
| 0.1.3 | Session secret desde .env con advertencia | server.js |
| 0.1.4 | CSRF protection con csurf | server.js |
| 0.1.5 | HTTPS redirect en produccion | server.js |
| 0.1.6 | Validacion de complejidad de password (8+, mayusc, num) | routes/auth.js |
| 0.1.7 | Validacion aplicada en setup de primer admin | routes/auth.js |
| 0.1.8 | Bloqueo de cuenta tras 5 intentos fallidos (15 min) | routes/auth.js |
| 0.1.9 | Registro de intentos fallidos en memoria | routes/auth.js |

### 0.2 Arquitectura
| Tarea | Descripcion | Archivo |
|-------|-------------|---------|
| 0.2.1 | Sistema de migraciones con Knex.js | knexfile.js |
| 0.2.2 | Middleware de tenant (tenant_id=1, preparado para multi) | middleware/tenant.js |
| 0.2.3 | Capas separadas: services/, models/, migrations/ | directorios |
| 0.2.4 | Renombrar proyecto a dignita-restaurant v2.0.0 | package.json |

### 0.3 Auditoria
| Tarea | Descripcion | Archivo |
|-------|-------------|---------|
| 0.3.1 | Tabla audit_log creada via migracion Knex | migrations/001_audit_log.js |
| 0.3.2 | Servicio de auditoria reutilizable | services/audit.js |
| 0.3.3 | Login registrado en audit_log | routes/auth.js |

### 0.4 .gitignore
- .env, .env.local, .env.production agregados

---

## Archivos creados
- `knexfile.js` - Configuracion de migraciones
- `migrations/001_audit_log.js` - Tabla audit_log
- `middleware/tenant.js` - Middleware de tenant
- `services/audit.js` - Servicio de auditoria
- `docs/prd/FASE0-fundamentos.md` - Este documento

## Archivos modificados
- `db.js` - Credenciales desde env, pool size 50
- `server.js` - CORS, CSRF, HTTPS, tenant middleware
- `routes/auth.js` - Password validation, bloqueo, audit login
- `package.json` - Nombre y version corregidos
- `.gitignore` - .env agregado
