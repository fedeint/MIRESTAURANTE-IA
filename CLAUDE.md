# MiRestcon IA — Instrucciones para Claude

## Proyecto
Sistema de gestión de restaurantes peruano con IA conversacional (DallIA).
PWA mobile-first, multi-tenant, para micro-restaurantes hasta cadenas.

## Antes de escribir código
1. Lee `/UI GPT/HANDOFF-SONNET.md` para entender el proyecto completo
2. Lee `/UI GPT/PROMPT-SONNET.md` para ver el paso actual y los nodeIds de diseño
3. Para CADA pantalla que implementes, usa `mcp__pencil__get_screenshot` para ver el diseño exacto:
   - Archivo: `UI.DELSISTEMA.pen`
   - Usa `mcp__pencil__batch_get(filePath, nodeIds, readDepth:3)` para leer colores, fonts, spacing
4. NO borres código existente. Extiende lo que hay.

## Design tokens
- Font: DM Sans (primary), Inter (status bar)
- Dark: gradient #10152f → #0a0f24 → #090d1d
- Orange: gradient 8-stop #ef520f → #df2c05
- Background: #F0F2F8
- Cards: #FFFFFF, cornerRadius 16
- Headers: cornerRadius [0,0,20,20]
- Text primary: #0a0f24, secondary: #8B8FAD
- Success: #22C55E, Warning: #F97316, Error: #EF4444, Info: #6366F1

## Stack existente
- Backend: Express.js (server.js)
- DB: MySQL/PostgreSQL (db.js, migrations/)
- Views: EJS (views/)
- Frontend: public/
- Auth: Google OAuth 2.0 (routes/google-auth.js)
- Panel admin: routes/superadmin.js

## Documentación clave
- `/UI GPT/HANDOFF-SONNET.md` — Mapa completo del proyecto
- `/UI GPT/PROMPT-SONNET.md` — 9 pasos con nodeIds de diseño
- `/UI GPT/ROADMAP-VERSIONES.md` — Features V1 + V2
- `/UI GPT/tenant-template/` — Onboarding, rutinas, knowledge base, config
- `UI.DELSISTEMA.pen` — 64+ pantallas diseñadas (usar get_screenshot)

## Regla crítica
Antes de implementar una pantalla, SIEMPRE haz get_screenshot del .pen para ver el diseño exacto y replicarlo en código.

## Credenciales
NUNCA leer ni mostrar valores del .env. Solo verificar que las variables existen.

## Seguridad

Este proyecto DEBE seguir estas reglas de seguridad en cada archivo, endpoint y función que se genere o modifique. No son opcionales.

### 1. Rate Limiting (YA IMPLEMENTADO — mantener y extender)
- Todo endpoint nuevo DEBE tener rate limiting. Usar `express-rate-limit`.
- Límites por tipo:
  - API general: 120 req/min por IP
  - Auth (login/registro): 10 intentos/15min por IP
  - Endpoints sensibles (pagos, admin, firma): 15 req/15min por IP
  - Chat/IA: 60 req/hora por IP
  - Trial tenants: 30 req/min por tenant
- Devolver 429 con mensaje claro cuando se exceda.
- Si creas un endpoint nuevo, agrega su limiter en `server.js` junto a los existentes.

### 2. Variables de Entorno y Secretos
- NUNCA escribir API keys, tokens, contraseñas o connection strings en código fuente.
- SIEMPRE usar `process.env.VARIABLE` para cualquier credencial.
- Si necesitas una variable nueva, agregarla a `.env.example` (sin valor real).
- Validar al arrancar que las variables críticas existen. Si falta alguna en producción, la app NO debe iniciar (ver patrón en server.js línea 116-119 con SESSION_SECRET).
- Los endpoints protegidos por secret (como cron) DEBEN fallar cerrados: si el secret no está configurado, DENEGAR acceso (nunca permitir por defecto).

### 3. Validación de Inputs (Anti-Inyección)
- Validar y sanitizar TODOS los inputs del usuario: body, params, query, headers.
- Usar `zod` como librería estándar de validación para la V2. Definir schemas estrictos por endpoint.
- NUNCA construir queries SQL concatenando strings con input del usuario. Usar SIEMPRE queries parametrizadas via `db.query('SELECT ... WHERE id = ?', [valor])`.
- Escapar output renderizado en HTML/EJS para prevenir XSS. Usar `<%- %>` solo cuando sea absolutamente necesario y el contenido esté sanitizado.
- Rechazar y loguear inputs que no pasen validación (posibles intentos de inyección).
- Validar tipos de archivo en uploads: MIME type + magic bytes (ver patrón existente con `validateMagicBytes()`).

### 4. Headers de Seguridad
- Helmet está instalado. Para la V2, HABILITAR las protecciones actualmente desactivadas:
  - `contentSecurityPolicy`: Configurar política específica que permita los recursos necesarios (scripts propios, CDNs usados, etc.) en vez de `false`.
  - `frameguard`: Activar en producción. Solo desactivar en desarrollo para Device Preview.
  - `crossOriginEmbedderPolicy`, `crossOriginOpenerPolicy`, `crossOriginResourcePolicy`: Evaluar activación.
- Usar `NODE_ENV` para toggle entre configuración permisiva (dev) y estricta (prod).
- Los headers manuales existentes (HSTS, Referrer-Policy, Permissions-Policy, X-Content-Type-Options) están bien — mantenerlos.

### 5. Autenticación y Sesiones
- Cookies de sesión: `httpOnly: true`, `secure: true` (prod), `sameSite: 'lax'`. Ya implementado — no cambiar.
- CSRF: Reemplazar `csurf` (deprecated, tiene vuln de prototype pollution) por `csrf-csrf` o double-submit cookie. Aplicar a TODAS las rutas POST de formularios.
- Contraseñas: bcrypt con cost factor >= 10. NUNCA almacenar en texto plano.
- Mantener el sistema de lockout por brute force existente (routes/auth.js). Para producción migrar de in-memory map a Redis.
- Mantener WebAuthn biométrico y Google OAuth existentes.

### 6. Logging de Seguridad (YA IMPLEMENTADO — mantener)
- Loguear intentos fallidos de auth → `login_history` table.
- Loguear ataques detectados → `ataques_log` table + Grafana Loki.
- Loguear inputs rechazados por validación.
- Loguear accesos a honeypots (`/wp-admin`, `/.env`, etc.).
- NUNCA loguear datos sensibles: contraseñas, tokens, datos personales, connection strings.
- Usar `lib/logger.js` con nivel `SECURITY` para eventos de seguridad.
- Usar `services/audit.js` para audit trail de acciones de negocio.

### 7. Protección contra Inyección y Ejecución de Código
- NUNCA usar `eval()`, `Function()`, `child_process.exec()` con input del usuario.
- NUNCA usar `dangerouslySetInnerHTML` (React) o `<%-` (EJS) con datos no sanitizados.
- Cuidado con deserialización: no usar `JSON.parse()` en datos no validados sin try/catch.
- No usar `pickle`, `yaml.load()` (unsafe) ni equivalentes inseguros.
- Path traversal: validar que rutas de archivos no contengan `../` antes de acceder al filesystem.

### 8. Dependencias y Supply Chain
- No instalar paquetes innecesarios. Eliminar dependencias no usadas (ej: `mysql2` si solo se usa PostgreSQL).
- Reemplazar paquetes deprecated con vulnerabilidades conocidas (ej: `csurf` → `csrf-csrf`).
- Antes de agregar una dependencia nueva, verificar que no tiene CVEs críticos abiertos.
- Mantener `body-parser` limits razonables: usar `express.json({ limit: '1mb' })` para API general, solo aumentar para endpoints de upload específicos.

### 9. Base de Datos
- `ssl: { rejectUnauthorized: false }` es aceptable para Supabase dev, pero para producción V2 configurar con certificado CA de Supabase.
- Retención de datos: `request_counts` 5min, `ataques_log` 90 días, `audit_log` 90 días (gestionado por cron/cleanup).
- Nunca exponer connection strings en logs, errores, o respuestas API.

### 10. Sistema de Detección de Ataques (YA IMPLEMENTADO — mantener)
- Detección automática cada 1 min via cron: DDoS, brute force, credential stuffing, scanner/probe, API abuse, ataques sostenidos.
- IP blacklist/whitelist con CRUD en `/superadmin/observabilidad` tab Ataques.
- Alertas Email + WhatsApp para eventos críticos via `lib/alertas.js`.
- Visualización en dashboard Observabilidad: tabs Seguridad, Ataques, Mapa.
- NO modificar este sistema sin entender el flujo completo: `ipGuard.js` → `request_counts` → `cron/attack-detection` → `ip-protection.js` → `ataques_log` + `ip_blacklist` + alertas + Grafana.

### Reglas para revisión de PRs (basado en anthropics/claude-code-security-review)
Al revisar código, verificar estas 5 categorías con confianza >= 0.8:
1. **Input Validation**: SQL injection, command injection, XXE, template injection, path traversal
2. **Auth/AuthZ**: bypass de autenticación, escalación de privilegios, IDOR
3. **Crypto/Secrets**: keys hardcodeadas, algoritmos débiles, certificados sin validar
4. **Code Execution**: deserialización insegura, eval injection, XSS
5. **Data Exposure**: datos sensibles en logs, PII sin protección, info de debug en producción

## Variantes de vistas (regla cero responsive)

Cada pagina tiene EXACTAMENTE dos archivos EJS exclusivos:

- `views/<page>.ejs` — variante PWA (phones + tablets). Marker: `<%# @variant: pwa %>`
- `views/<page>-desktop.ejs` — variante desktop. Marker: `<%# @variant: desktop %>`

**Reglas estrictas:**

1. **Cero responsive entre variantes.** Un template PWA no debe intentar verse bien en desktop, ni viceversa. Cada uno es exclusivo.
2. **Cero mezcla de contenido.** Si cambias la logica de datos compartida, tocalo en el controlador (`server.js` o `routes/`), NO dupliques en ambos templates.
3. **Cero duplicados.** `dashboard.ejs` y `dashboard-desktop.ejs` jamas deben ser byte-identical. El test `tests/view-variants.test.js` falla si lo son.
4. **Siempre usar `deviceRouter`.** Para renderizar una pagina con ambas variantes, usa `renderForDevice(req, res, 'nombre')` de `lib/deviceRouter.js`. No inventes tu propia deteccion de User-Agent.
5. **Markers obligatorios.** Cada variante debe declarar su marker `@variant` en las primeras lineas. El test los verifica.

**Como crear una vista nueva con ambas variantes:**

1. Crea `views/nueva.ejs` con `<%# @variant: pwa %>` en la primera linea (diseno PWA mobile-first)
2. Crea `views/nueva-desktop.ejs` con `<%# @variant: desktop %>` en la primera linea (diseno desktop del `.pen`)
3. En el route: `renderForDevice(req, res, 'nueva', { ...data })`
4. Agrega `{ pwa: 'nueva.ejs', desktop: 'nueva-desktop.ejs' }` a `REGISTERED_PAIRS` en `tests/view-variants.test.js`
5. Corre `npm test` — debe pasar

**Instalacion del pre-commit hook:**

```bash
npm run hooks:install
```

Esto setea `core.hooksPath=.githooks` en la config del repo local. A partir de ese momento, cualquier commit que toque `views/` o `lib/deviceRouter*` corre `npm test` antes de crear el commit.

**Excepciones autorizadas (solo-desktop o solo-PWA):**

Algunas vistas legitimamente viven solo en un dispositivo:

- **Solo-desktop**: herramientas administrativas (`superadmin/*`) — mobile muestra mensaje
- **Solo-PWA**: features mobile-exclusive (ej: scan QR de fidelidad)

Estas van al allowlist `ALLOWED_DESKTOP_ORPHANS` en `tests/view-variants.test.js` y se documentan en `docs/superpowers/audits/2026-04-08-views-pairing-audit.md`.

**Diseno desktop:** El sistema de diseno desktop nuevo esta basado en el frame `1920w default` (nodeId `9RPaz`) del archivo `UI.DELSISTEMA.pen`. Tokens CSS en `views/partials/desktop-layout.ejs`:
- Fondo: gradiente `#fff8f0` → `#fafaf7`
- Main container: `#ffffffc7` con backdrop-blur 20px, border-radius 12px
- Tipografia: Inter (no DM Sans, que es para PWA mobile)
- Naranja activo: gradiente 8-stop `#fefbf5` → `#fdb75e` → `#fd9931` → `#ef520f` → `#df2c05` → `#e13809` → `#fba251` → `#ee6d2d`

**Diseno PWA:** Los templates PWA usan DM Sans, max-width 480px centrado, bottom nav, safe-area insets. No tocar su logica cuando hagas cambios al desktop y viceversa.

## Multi-Tenant Isolation

### Regla 1 — Tenant nace vacío
Cuando se crea un tenant nuevo, lo único que se inserta automáticamente es la fila en `tenants`, el usuario admin y la suscripción. **Prohibido** auto-poblar productos, mesas, almacén, recetas, clientes, proveedores, ni ninguna tabla de negocio.

### Regla 2 — Toda query a tabla de negocio DEBE filtrar por tenant_id

**Tablas de negocio** (requieren `WHERE tenant_id = ?`):
```
productos, mesas, pedidos, pedido_items, pedido_envios,
caja_movimientos, caja_aperturas, caja_cierres, cajas,
almacen_ingredientes, almacen_lotes, almacen_movimientos,
recetas, receta_items,
usuarios (excepto rol='superadmin'),
clientes, proveedores, cortesias,
facturas, factura_items, descuentos_aplicados, promociones,
metas_diarias, gastos, deliveries,
reservas, eventos, personal_eventual,
configuracion_impresion, config_sunat, config_pwa,
sostac_briefs, solicitudes_registro,
mesero_asignaciones, firma_documentos,
dallia_actions_log, dallia_preferencias,
audit_log (filtrar por tenant_id cuando aplique)
```

**Tablas globales** (NO requieren filtro tenant):
```
tenants, tenant_suscripciones, planes,
ip_blacklist, ip_whitelist, ataques_log,
request_counts, login_attempts,
dallia_actions (catálogo), sessions, migrations_history
```

**Patrón obligatorio:**
```js
// ✅ Correcto
const tenantId = req.tenantId || req.session?.user?.tenant_id;
if (!tenantId) return res.status(403).json({ error: 'tenant no resuelto' });
const [rows] = await db.query('SELECT ... FROM productos WHERE tenant_id = ?', [tenantId]);

// ❌ Prohibido
const [rows] = await db.query('SELECT * FROM productos');
```

### Regla 3 — Todo INSERT a tabla de negocio DEBE incluir tenant_id
```js
// ✅
await db.query('INSERT INTO productos (tenant_id, nombre, precio) VALUES (?,?,?)', [tenantId, nombre, precio]);
// ❌
await db.query('INSERT INTO productos (nombre, precio) VALUES (?,?)', [nombre, precio]);
```

### Regla 4 — Scripts en `scripts/` no corren en producción
Todo script que haga INSERT/UPDATE/DELETE debe empezar con el guard:
```js
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force-prod')) {
  console.error('❌ Bloqueado en producción.'); process.exit(1);
}
```
Scripts destructivos (`load-demo-data.js`, `seed-*.js`) también deben llevar header `// ⚠️ SCRIPT DE DESARROLLO — NO EJECUTAR EN PRODUCCIÓN`.
