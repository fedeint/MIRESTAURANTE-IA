# Política de Seguridad — MiRest con IA

## Reportar una vulnerabilidad

**NO abras un issue público** para reportar vulnerabilidades de seguridad.

Contacta directamente a `@Leonidasx8` por un canal privado:

1. WhatsApp directo (preferido — respuesta en horas)
2. Email: el que tenga configurado en su perfil de GitHub
3. Mensaje privado en el canal interno del equipo

**Incluye en tu reporte:**
- Descripción clara del problema
- Pasos para reproducir (o proof-of-concept)
- Impacto estimado (¿quién puede aprovecharlo? ¿qué datos están en riesgo?)
- Cualquier mitigación temporal que conozcas

**Qué esperar:**
- Acuse de recibo en <24 h
- Evaluación inicial en <72 h
- Fix o plan de acción en <7 días (según severidad)

## Clasificación de severidad

| Severidad | Ejemplos | SLA de fix |
|-----------|----------|------------|
| **Crítica** | RCE, auth bypass, SQL injection con acceso a datos reales, leak masivo de credenciales | <24 h |
| **Alta** | XSS, CSRF sin protección, leak parcial de PII, bypass de tenant isolation | <72 h |
| **Media** | Rate limiting bypass, info leak en errores, deps con CVE alto sin explotación directa | <7 días |
| **Baja** | Headers de seguridad faltantes, config debug en producción, warnings de lint de seguridad | <30 días |

---

## Reglas de seguridad obligatorias para todo el código

Estas reglas **SE ENFORCAN EN CODE REVIEW**. Si tu PR las rompe, se cierra sin merge.

### 1. Secrets

- ❌ **Nunca** un API key, password, token, connection string o secret hardcodeado en el código.
- ❌ **Nunca** commitees `.env`, `.env.local`, `.env.production`, `credentials.json`, `*.pem`, `*.key`.
- ✅ **Siempre** `process.env.NOMBRE_VAR` para leer secretos.
- ✅ **Siempre** agregar el nombre (sin valor) a `.env.example` si agregas una variable nueva.
- ✅ **Siempre** validar al arrancar que las variables críticas existen (patrón en `server.js`: `if (!process.env.SESSION_SECRET) throw new Error(...)`).

**Si pegaste un secret en el chat por error:**
1. Avisa inmediatamente a Leonidas
2. Rota el secret (pídele el nuevo)
3. NO lo edites del chat tú mismo — GitHub y los servicios MCP pueden indexarlo

### 2. Inputs del usuario (anti-inyección)

- ✅ **Siempre** valida con `zod` antes de usar input del usuario:
  ```js
  const { z } = require('zod');
  const schema = z.object({
    email: z.string().email(),
    cantidad: z.number().int().min(1).max(9999),
  });
  const data = schema.parse(req.body); // lanza error si no cumple
  ```
- ✅ **Siempre** queries parametrizadas:
  ```js
  db.query('SELECT * FROM pedidos WHERE id = ? AND tenant_id = ?', [id, tenantId])
  ```
- ❌ **Nunca** concat strings:
  ```js
  db.query('SELECT * FROM pedidos WHERE id = ' + id) // ❌ SQL injection
  ```
- ❌ **Nunca** `eval()`, `Function()`, `child_process.exec()` con input del usuario.
- ❌ **Nunca** `<%- userInput %>` en EJS sin sanitizar. Usa `<%= %>` (escapado) salvo que estés 100% seguro del contenido.
- ✅ **Siempre** valida tipos de archivo en uploads: MIME type + magic bytes (mira `validateMagicBytes()`).
- ❌ **Nunca** accedas al filesystem con paths que incluyen input del usuario sin validar `../`.

### 3. Autenticación y autorización

- Contraseñas: **siempre** `bcrypt` con cost ≥10. **Nunca** texto plano.
- Sesiones: `httpOnly: true, secure: true (prod), sameSite: 'lax'`. Ya configurado — no cambiar.
- Cookies CSRF: `csrf-csrf` (double submit). Ya configurado — agregar `_csrf` hidden input en forms nuevos.
- Endpoints sensibles: `requireAuth` + `requireRole(['rol'])`.
- Endpoints multi-tenant: **siempre** filtrar por `req.session.tenantId` en todas las queries.
- **Nunca** confíes en `req.body.tenant_id` — siempre usa el de la sesión del usuario autenticado.

### 4. Rate limiting

Todo endpoint nuevo debe tener rate limiting. Mira los existentes en `server.js`:

| Tipo de endpoint | Límite |
|---|---|
| API general | 120 req/min por IP |
| Auth (login, registro) | 10 intentos / 15 min por IP |
| Endpoints sensibles (pagos, admin, firma) | 15 req / 15 min por IP |
| Chat / IA | 60 req / hora por IP |
| Trial tenants | 30 req / min por tenant |

Si creas un endpoint nuevo, agrega su limiter al lado de los existentes en `server.js`.

### 5. Logging

- ✅ **Siempre** loguea intentos fallidos de auth, inputs rechazados por validación, accesos a honeypots.
- ❌ **Nunca** loguees: passwords, tokens, connection strings, datos personales completos, tarjetas de crédito.
- Usa `lib/logger.js` con nivel `SECURITY` para eventos de seguridad.

### 6. Dependencias

- Antes de agregar una dep nueva, verifica que no tenga CVEs críticos abiertos: `npm audit`.
- Si tu PR agrega una dep, justifícalo en el cuerpo del PR (por qué, alternativas consideradas).
- Nunca agregues dev deps a `dependencies`.
- Dependabot corre semanalmente y abre PRs de update — no los mergees sin correr los tests.

### 7. Headers HTTP

Helmet ya está configurado. En producción están habilitados:
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- `Content-Security-Policy` (activarse en prod)

**No cambies la config de Helmet sin coordinarlo con Leonidas.**

### 8. Protección contra brute force

Ya implementado un sistema de lockout por intentos fallidos en `routes/auth.js`. No modificar.

Si detectas un ataque activo (muchos intentos fallidos de un IP), Leonidas tiene acceso al dashboard `/superadmin/observabilidad` tab "Ataques" para banearlo manualmente.

### 9. Multi-tenancy

Cada tenant (restaurante cliente) debe tener sus datos completamente aislados. Siempre:

- **Filtra por `tenant_id`** en toda query que lea datos del negocio:
  ```js
  db.query('SELECT * FROM productos WHERE tenant_id = ?', [req.session.tenantId])
  ```
- **Nunca** aceptes `tenant_id` del body/query — siempre de la sesión.
- **Verifica tenant ownership** antes de modificar: el usuario autenticado solo puede editar recursos de su propio tenant.

Si tu PR hace un `UPDATE` o `DELETE`, asegúrate de que tiene `WHERE tenant_id = ?` en la query.

### 10. Sistema de detección de ataques

Ya implementado:
- Detección automática cada 1 min via cron (DDoS, brute force, credential stuffing, scanner, API abuse)
- IP blacklist/whitelist CRUD en `/superadmin/observabilidad` tab "Ataques"
- Alertas Email + WhatsApp para eventos críticos via `lib/alertas.js`
- Visualización en dashboard Observabilidad

**No modificar este sistema sin entender el flujo completo:**
```
ipGuard.js → request_counts → cron/attack-detection → ip-protection.js → ataques_log + ip_blacklist + alertas + Grafana
```

---

## Rotación de credenciales

Las siguientes credenciales se rotan periódicamente:

| Credencial | Frecuencia | Responsable |
|-----------|-----------|-------------|
| `SESSION_SECRET` | Cada 90 días | Leonidas |
| `DATABASE_URL` | Cuando se detecta leak | Leonidas |
| `GOOGLE_CLIENT_SECRET` | Cada 180 días | Leonidas |
| API keys de terceros (Meta, Twilio, etc.) | Cada 180 días o al leak | Leonidas |
| Contraseñas de usuarios admin | Cada 90 días | Cada admin |

**Cuando rotes una credencial:**
1. Actualízala en Supabase/Vercel/el provider
2. Actualízala en Vercel env vars
3. Redeploy
4. Verifica que todo sigue funcionando
5. Invalida la credencial vieja
6. **NO** pegues la nueva credencial en ningún chat

---

## Incidentes pasados (lessons learned)

Esta sección se actualiza cuando pasa algo. Los workers deben leerla al hacer onboarding.

- **2026-04-07**: Contraseña de Supabase compartida en chat. Lesson: nunca pegar credenciales, siempre rotar si se comparten accidentalmente.
- **2026-04-08**: Dashboard desktop quedó byte-idéntico al mobile por error en commit `c28544e`. Lesson: implementamos tests de variant para que nunca se repita (ver `tests/view-variants.test.js`).

---

## Contacto de emergencia

Si detectas una brecha activa en producción (ejemplo: alguien accediendo sin autorización, defacement, datos exfiltrados):

1. **Llama a Leonidas inmediatamente** (WhatsApp o teléfono)
2. NO intentes "arreglarlo" tú mismo — documenta todo lo que ves primero
3. Preserva evidencia: screenshots, logs, IPs, timestamps
4. Espera instrucciones antes de hacer cualquier cambio

El objetivo es: **preservar evidencia** > **detener el ataque** > **restaurar operaciones** > **post-mortem**.

---

Última actualización: 2026-04-08
