# Login Personalizado, Seguridad y Biometría — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar login personalizado por subdominio con credenciales controladas, cambio de contraseña obligatorio, sesiones con expiración, biometría WebAuthn, loader robot, y bloqueo de rutas en subdominios.

**Architecture:** Se crean 3 middlewares nuevos (subdomainGuard, sessionTimeout, requirePasswordChange), rutas WebAuthn, migración DB para credenciales/webauthn, y se modifica login.ejs para detectar subdominios y renderizar la versión personalizada vs la normal con Google OAuth.

**Tech Stack:** Express.js, EJS, PostgreSQL, bcryptjs, crypto, @simplewebauthn/server, @simplewebauthn/browser (CDN), express-session

**Spec:** `docs/superpowers/specs/2026-04-02-login-seguridad-biometria-design.md`

**Verificación final:** Playwright (recorrido completo login subdominio, cambio contraseña, biometría)

---

## Archivos involucrados

| Archivo | Acción |
|---|---|
| `migrations/add_password_change.sql` | Crear: columnas must_change_password + password_expires_at |
| `migrations/add_webauthn_tables.sql` | Crear: tablas webauthn_credentials + webauthn_challenges |
| `middleware/subdomainGuard.js` | Crear: bloquea rutas en subdominios, solo /login accesible |
| `middleware/sessionTimeout.js` | Crear: idle timeout 8h server-side |
| `middleware/requirePasswordChange.js` | Crear: redirige a /cambiar-contrasena si must_change_password |
| `routes/webauthn.js` | Crear: register/login options + verify |
| `views/cambiar-contrasena.ejs` | Crear: form cambio de contraseña |
| `views/loader.ejs` | Crear: loader robot con ondas naranjas |
| `views/login.ejs` | Modificar: versión subdomain (personalizada) vs normal (Google OAuth) |
| `services/notificaciones-trial.js` | Modificar: agregar credenciales al email de bienvenida |
| `routes/superadmin.js` | Modificar: crear usuario admin al crear/aprobar tenant |
| `routes/auth.js` | Modificar: check must_change_password en login, ruta cambiar-contrasena |
| `server.js` | Modificar: session maxAge 24h, rolling, montar middlewares y rutas webauthn |
| `package.json` | Modificar: agregar @simplewebauthn/server |

## Orden de ejecución

| # | Task | Dependencia |
|---|---|---|
| 1 | Migración DB (password + webauthn) | Ninguna |
| 2 | Middleware subdomainGuard | Ninguna |
| 3 | Middleware sessionTimeout + config sesión | Ninguna |
| 4 | Crear usuario admin al crear tenant + email con credenciales | Task 1 |
| 5 | Middleware requirePasswordChange + vista cambiar-contrasena | Task 1 |
| 6 | Login personalizado por subdominio (login.ejs) | Task 2 |
| 7 | Loader robot con ondas naranjas | Ninguna |
| 8 | WebAuthn (biometría) | Task 1 |
| 9 | Montar todo en server.js | Tasks 2,3,5,8 |
| 10 | Verificación Playwright | Tasks 1-9 |

**Tasks parallelizables:** 1, 2, 3 y 7 son independientes.

---

## Task 1: Migración DB — columnas password + tablas WebAuthn

**Files:**
- Create: `migrations/add_password_change.sql`
- Create: `migrations/add_webauthn_tables.sql`

- [ ] **Step 1: Crear migración de password change**

Crear `migrations/add_password_change.sql`:

```sql
-- migrations/add_password_change.sql
-- Adds must_change_password flag and password expiry to usuarios

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMP;
```

- [ ] **Step 2: Crear migración WebAuthn**

Crear `migrations/add_webauthn_tables.sql`:

```sql
-- migrations/add_webauthn_tables.sql
-- WebAuthn/FIDO2 credential storage for biometric login

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id        INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credential_id    TEXT NOT NULL UNIQUE,
  public_key       BYTEA NOT NULL,
  sign_count       INTEGER NOT NULL DEFAULT 0,
  device_name      VARCHAR(100),
  created_at       TIMESTAMP DEFAULT NOW(),
  last_used_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webauthn_cred_tenant_user ON webauthn_credentials(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_cred_id ON webauthn_credentials(credential_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  user_id    INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);
```

- [ ] **Step 3: Ejecutar migraciones**

```bash
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes"
node -e "
const db = require('./db');
const fs = require('fs');
(async () => {
  const sql1 = fs.readFileSync('migrations/add_password_change.sql', 'utf8');
  const sql2 = fs.readFileSync('migrations/add_webauthn_tables.sql', 'utf8');
  for (const stmt of sql1.split(';').filter(s => s.trim())) await db.query(stmt);
  for (const stmt of sql2.split(';').filter(s => s.trim())) await db.query(stmt);
  console.log('Migrations done');
  process.exit(0);
})();
"
```

- [ ] **Step 4: Commit**

```bash
git add migrations/add_password_change.sql migrations/add_webauthn_tables.sql
git commit -m "feat(auth): add password change columns and webauthn tables migration"
```

---

## Task 2: Middleware subdomainGuard

**Files:**
- Create: `middleware/subdomainGuard.js`

- [ ] **Step 1: Crear el middleware**

Crear `middleware/subdomainGuard.js`:

```javascript
'use strict';

/**
 * Middleware that restricts access on tenant subdomains.
 * On subdomains (e.g. chuleta.mirestconia.com), only /login and
 * static/auth routes are accessible without an active session.
 * All other routes redirect to /login.
 */
function subdomainGuard(req, res, next) {
  const parts = (req.hostname || '').split('.');
  const isSubdomain = parts.length >= 3
    && parts[1] === 'mirestconia'
    && parts[2] === 'com'
    && parts[0] !== 'www';

  // Not a subdomain — normal flow (www.mirestconia.com)
  if (!isSubdomain) {
    res.locals.isSubdomain = false;
    return next();
  }

  res.locals.isSubdomain = true;
  res.locals.subdomainSlug = parts[0];

  // Allow these routes without session
  const allowed = [
    '/login', '/auth/', '/api/auth/',
    '/cambiar-contrasena',
    '/vendor/', '/css/', '/js/', '/logo/',
    '/favicon', '/sw.js', '/manifest.json',
    '/icon-', '/api/health'
  ];

  if (allowed.some(p => req.path.startsWith(p))) return next();

  // POST /logout always allowed
  if (req.path === '/logout' && req.method === 'POST') return next();

  // No session → redirect to login
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  next();
}

module.exports = { subdomainGuard };
```

- [ ] **Step 2: Commit**

```bash
git add middleware/subdomainGuard.js
git commit -m "feat(auth): add subdomainGuard middleware to restrict subdomain routes"
```

---

## Task 3: Middleware sessionTimeout + configuración de sesión

**Files:**
- Create: `middleware/sessionTimeout.js`
- Modify: `server.js:113-126` (session config)

- [ ] **Step 1: Crear middleware sessionTimeout**

Crear `middleware/sessionTimeout.js`:

```javascript
'use strict';

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Tracks last activity timestamp in session.
 * Destroys session if idle for more than 8 hours.
 * The absolute 24h max is enforced by cookie.maxAge in session config.
 */
function sessionTimeout(req, res, next) {
  if (!req.session || !req.session.user) return next();

  const now = Date.now();
  const lastActivity = req.session.lastActivity || now;

  if (now - lastActivity > IDLE_TIMEOUT_MS) {
    // Session idle too long — destroy it
    return req.session.destroy(() => {
      if (req.xhr || (req.headers.accept || '').includes('json') || req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Sesión expirada por inactividad' });
      }
      res.redirect('/login?expired=1');
    });
  }

  // Update last activity
  req.session.lastActivity = now;
  next();
}

module.exports = { sessionTimeout };
```

- [ ] **Step 2: Actualizar configuración de sesión en server.js**

En `server.js`, buscar el bloque de `app.use(session({...}))` (línea ~113). Reemplazar:

```javascript
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // In local mode we run plain HTTP on the LAN — never set secure=true there
        secure: process.env.NODE_ENV === 'production' && !IS_LOCAL_MODE,
        maxAge: 1000 * 60 * 60 * 2 // 2 horas
    }
```

Con:

```javascript
    rolling: true, // Renew cookie on each request
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // In local mode we run plain HTTP on the LAN — never set secure=true there
        secure: process.env.NODE_ENV === 'production' && !IS_LOCAL_MODE,
        maxAge: 1000 * 60 * 60 * 24 // 24h absolute max
    }
```

- [ ] **Step 3: Commit**

```bash
git add middleware/sessionTimeout.js server.js
git commit -m "feat(auth): add session timeout middleware (8h idle, 24h absolute)"
```

---

## Task 4: Crear usuario admin al crear tenant + email con credenciales

**Files:**
- Modify: `routes/superadmin.js` (POST /tenants y POST /solicitudes/:id/aprobar)
- Modify: `services/notificaciones-trial.js` (actualizar email bienvenida)

- [ ] **Step 1: Actualizar email de bienvenida para incluir credenciales**

En `services/notificaciones-trial.js`, reemplazar la función `enviarEmailBienvenidaSubdominio` completa. La nueva versión acepta un parámetro adicional `credenciales`:

Buscar la función `async function enviarEmailBienvenidaSubdominio(email, nombre, subdominio, esTrial)` y reemplazar la firma y el HTML.

Nueva firma: `async function enviarEmailBienvenidaSubdominio(email, nombre, subdominio, esTrial, credenciales)`

Donde `credenciales` es `{ usuario, pin }` o `null`.

Agregar después del bloque `${trialTexto}` y antes del bloque de "Próximos pasos", este bloque condicional de credenciales:

```javascript
  const credencialesHtml = credenciales ? `
      <div style="background:#0f172a;border-radius:12px;padding:20px;margin-bottom:20px;">
        <p style="font-size:12px;color:#64748b;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Tus credenciales de acceso</p>
        <table style="width:100%;font-size:14px;">
          <tr><td style="color:#94a3b8;padding:4px 0;">Usuario:</td><td style="color:#ffffff;font-weight:700;padding:4px 0;">${credenciales.usuario}</td></tr>
          <tr><td style="color:#94a3b8;padding:4px 0;">PIN temporal:</td><td style="color:#f97316;font-weight:700;font-size:18px;letter-spacing:2px;padding:4px 0;">${credenciales.pin}</td></tr>
        </table>
        <p style="font-size:12px;color:#ef4444;margin:12px 0 0;">⚠️ Este PIN expira en 48 horas. Cámbialo en tu primer ingreso.</p>
      </div>` : '';
```

Y en el template HTML, insertar `${credencialesHtml}` después de `${trialTexto}`.

- [ ] **Step 2: Crear función helper para generar usuario admin en superadmin.js**

En `routes/superadmin.js`, agregar después de la función `defaultModules()` (línea ~37):

```javascript
const crypto = require('crypto');

/**
 * Creates an admin user for a new tenant.
 * Returns { usuario, pin } for inclusion in welcome email.
 */
async function crearUsuarioAdmin(tenantId, emailAdmin, nombreRestaurante) {
  const bcrypt = require('bcryptjs');

  // Generate username from email (part before @)
  const usuario = emailAdmin.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');

  // Generate 6-digit PIN
  const pinBuffer = crypto.randomBytes(4);
  const pin = String(pinBuffer.readUInt32BE(0) % 1000000).padStart(6, '0');

  const passwordHash = await bcrypt.hash(pin, 10);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

  // Check if user already exists for this tenant
  const [existing] = await db.query(
    'SELECT id FROM usuarios WHERE tenant_id = ? AND (usuario = ? OR google_email = ?)',
    [tenantId, usuario, emailAdmin]
  );

  if (existing && existing.length > 0) {
    // Update existing user with new PIN
    await db.query(
      `UPDATE usuarios SET password_hash = ?, must_change_password = true,
       password_expires_at = ?, updated_at = NOW() WHERE id = ?`,
      [passwordHash, expiresAt.toISOString(), existing[0].id]
    );
    return { usuario: existing[0].usuario || usuario, pin };
  }

  // Create new admin user
  await db.query(
    `INSERT INTO usuarios (tenant_id, usuario, nombre, password_hash, rol, activo, must_change_password, password_expires_at)
     VALUES (?, ?, ?, ?, 'administrador', true, true, ?)`,
    [tenantId, usuario, nombreRestaurante, passwordHash, expiresAt.toISOString()]
  );

  return { usuario, pin };
}
```

- [ ] **Step 3: Llamar crearUsuarioAdmin en POST /tenants**

En `routes/superadmin.js`, dentro de `router.post('/tenants', ...)`, después de `// Insert subscription` y antes de `// Send welcome email`, agregar:

```javascript
    // Create admin user for the tenant
    let credenciales = null;
    try {
      credenciales = await crearUsuarioAdmin(tenantId, email_admin, nombre);
    } catch (userErr) {
      console.error('[Superadmin] Create admin user failed:', userErr.message);
    }
```

Y actualizar la llamada a `enviarEmailBienvenidaSubdominio` para pasar credenciales:

```javascript
      await enviarEmailBienvenidaSubdominio(email_admin, nombre, subdominionLimpio, esTrial, credenciales);
```

- [ ] **Step 4: Llamar crearUsuarioAdmin en POST /solicitudes/:id/aprobar**

En `routes/superadmin.js`, dentro de `router.post('/solicitudes/:id/aprobar', ...)`, antes del bloque de `// Send welcome email with subdomain`, agregar:

```javascript
    // Create admin user for the tenant
    let credenciales = null;
    try {
      credenciales = await crearUsuarioAdmin(solicitud.tid, solicitud.google_email, solicitud.nombre_restaurante || solicitud.unom);
    } catch (userErr) {
      console.error('[Superadmin] Create admin user failed:', userErr.message);
    }
```

Y actualizar la llamada:

```javascript
      await enviarEmailBienvenidaSubdominio(
        solicitud.google_email,
        solicitud.unom || solicitud.nombre_restaurante,
        subdominio,
        true,
        credenciales
      );
```

- [ ] **Step 5: Commit**

```bash
git add routes/superadmin.js services/notificaciones-trial.js
git commit -m "feat(auth): create admin user with PIN on tenant creation + include credentials in welcome email"
```

---

## Task 5: Middleware requirePasswordChange + vista cambiar-contrasena

**Files:**
- Create: `middleware/requirePasswordChange.js`
- Create: `views/cambiar-contrasena.ejs`
- Modify: `routes/auth.js` (agregar rutas GET/POST /cambiar-contrasena)

- [ ] **Step 1: Crear middleware requirePasswordChange**

Crear `middleware/requirePasswordChange.js`:

```javascript
'use strict';

/**
 * Redirects users with must_change_password=true to /cambiar-contrasena.
 * Allows only the password change route, logout, and static assets.
 */
function requirePasswordChange(req, res, next) {
  if (!req.session || !req.session.user) return next();
  if (!req.session.user.must_change_password) return next();

  const allowed = [
    '/cambiar-contrasena', '/logout',
    '/vendor/', '/css/', '/js/', '/favicon', '/logo/'
  ];

  if (allowed.some(p => req.path.startsWith(p))) return next();
  if (req.method === 'POST' && req.path === '/logout') return next();

  if (req.xhr || (req.headers.accept || '').includes('json') || req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Debes cambiar tu contraseña primero', redirect: '/cambiar-contrasena' });
  }

  return res.redirect('/cambiar-contrasena');
}

module.exports = { requirePasswordChange };
```

- [ ] **Step 2: Crear vista cambiar-contrasena.ejs**

Crear `views/cambiar-contrasena.ejs`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0a0f24">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>Cambiar Contraseña - MiRestcon IA</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.css">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family:'DM Sans',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#F0F2F8; padding:20px; }
    .card-pwd { max-width:420px; width:100%; background:#fff; border-radius:20px; box-shadow:0 8px 32px rgba(0,0,0,0.08); overflow:hidden; }
    .card-header-dark { background:#0a0f24; padding:28px 24px; text-align:center; }
    .field-input { width:100%; padding:14px 16px; border-radius:12px; border:1px solid #e5e7eb; background:#fff; font-size:15px; outline:none; transition:border-color .15s; }
    .field-input:focus { border-color:#FF6B35; box-shadow:0 0 0 3px rgba(255,107,53,0.12); }
    .btn-save { width:100%; padding:14px; border-radius:12px; border:none; background:linear-gradient(135deg,#FF6B35,#F59E0B); color:#fff; font-size:16px; font-weight:700; cursor:pointer; }
    .btn-save:hover { opacity:0.9; }
    .toggle-pwd { position:absolute; right:14px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; font-size:18px; }
  </style>
</head>
<body>
  <div class="card-pwd">
    <div class="card-header-dark">
      <img src="/logo/Isotipo.png" alt="MiRestcon IA" style="width:56px;height:56px;border-radius:14px;margin-bottom:12px;">
      <h4 style="color:#fff;font-weight:700;font-size:20px;margin:0 0 4px;">Cambia tu contraseña</h4>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0;">Tu PIN temporal ha expirado o es tu primer ingreso</p>
    </div>
    <div style="padding:28px 24px;">
      <% if (typeof error !== 'undefined' && error) { %>
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px;margin-bottom:16px;">
          <p style="color:#991B1B;font-size:13px;margin:0;"><i class="bi bi-exclamation-triangle me-1"></i><%= error %></p>
        </div>
      <% } %>
      <form method="POST" action="/cambiar-contrasena" autocomplete="off">
        <div style="margin-bottom:16px;">
          <label style="font-size:13px;font-weight:600;color:#64748b;display:block;margin-bottom:6px;">Nueva contraseña</label>
          <div style="position:relative;">
            <input type="password" name="nueva_contrasena" id="pwd" class="field-input" placeholder="Mínimo 8 caracteres" required minlength="8" autofocus>
            <button type="button" class="toggle-pwd" onclick="togglePwd()"><i class="bi bi-eye" id="eyeIcon"></i></button>
          </div>
        </div>
        <button type="submit" class="btn-save"><i class="bi bi-shield-check me-2"></i>Guardar nueva contraseña</button>
      </form>
      <div style="text-align:center;margin-top:16px;">
        <a href="/logout" style="color:#94a3b8;font-size:13px;text-decoration:none;" onclick="event.preventDefault();fetch('/logout',{method:'POST'}).then(()=>location.href='/login')">Cerrar sesión</a>
      </div>
    </div>
  </div>
  <script>
    function togglePwd() {
      const f = document.getElementById('pwd');
      const icon = document.getElementById('eyeIcon');
      if (f.type === 'password') { f.type = 'text'; icon.className = 'bi bi-eye-slash'; }
      else { f.type = 'password'; icon.className = 'bi bi-eye'; }
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Agregar rutas GET/POST /cambiar-contrasena en auth.js**

En `routes/auth.js`, antes de `module.exports`, agregar:

```javascript
// GET /cambiar-contrasena
router.get('/cambiar-contrasena', (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/login');
  res.render('cambiar-contrasena', { error: null });
});

// POST /cambiar-contrasena
router.post('/cambiar-contrasena', async (req, res) => {
  if (!req.session || !req.session.user) return res.redirect('/login');

  const { nueva_contrasena } = req.body;
  if (!nueva_contrasena || nueva_contrasena.length < 8) {
    return res.render('cambiar-contrasena', { error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(nueva_contrasena, 10);

    await db.query(
      `UPDATE usuarios SET password_hash = ?, must_change_password = false,
       password_expires_at = NULL, updated_at = NOW() WHERE id = ?`,
      [hash, req.session.user.id]
    );

    // Destroy session — force re-login with new password
    req.session.destroy(() => {
      res.redirect('/login?changed=1');
    });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.render('cambiar-contrasena', { error: 'Error al cambiar la contraseña. Intenta de nuevo.' });
  }
});
```

- [ ] **Step 4: Actualizar login POST en auth.js para setear must_change_password en sesión**

En `routes/auth.js`, dentro de `router.post('/login', ...)`, después de donde se setea `req.session.user` (línea ~162), agregar la lectura de `must_change_password`:

Buscar el bloque que setea `req.session.user = {`:

```javascript
    req.session.user = {
      id: u.id,
      usuario: u.usuario,
      nombre: u.nombre || '',
      rol: u.rol,
      permisos: permisos
    };
```

Reemplazar con:

```javascript
    req.session.user = {
      id: u.id,
      usuario: u.usuario,
      nombre: u.nombre || '',
      rol: u.rol,
      permisos: permisos,
      must_change_password: !!u.must_change_password,
      tenant_id: u.tenant_id
    };
```

Y agregar antes de ese bloque, en la query SELECT de login, incluir `must_change_password, tenant_id`. Buscar la query:

```sql
SELECT id, usuario, nombre, password_hash, rol, activo FROM usuarios WHERE usuario = ? LIMIT 1
```

Reemplazar con:

```sql
SELECT id, usuario, nombre, password_hash, rol, activo, must_change_password, tenant_id FROM usuarios WHERE usuario = ? LIMIT 1
```

También verificar si password ha expirado — después del check de password correcto y antes de setear session, agregar:

```javascript
    // Check if temporary password has expired
    if (u.must_change_password && u.password_expires_at) {
      const expiresAt = new Date(u.password_expires_at);
      if (new Date() > expiresAt) {
        return res.render('login', { error: 'Tu PIN temporal expiró. Contacta al administrador.', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
      }
    }
```

- [ ] **Step 5: Commit**

```bash
git add middleware/requirePasswordChange.js views/cambiar-contrasena.ejs routes/auth.js
git commit -m "feat(auth): add forced password change flow with middleware and UI"
```

---

## Task 6: Login personalizado por subdominio (login.ejs)

**Files:**
- Modify: `views/login.ejs`
- Modify: `routes/auth.js` (GET /login — pasar tenant data)

- [ ] **Step 1: Actualizar GET /login en auth.js para pasar datos de tenant**

En `routes/auth.js`, buscar `router.get('/login', ...)`. Agregar la resolución del tenant para subdominios. Si no existe la ruta GET /login explícita, buscarla en `server.js`. La ruta actual probablemente renderiza `login` directamente. Modificar para pasar variables:

Buscar donde se renderiza el login y reemplazar/actualizar para pasar:

```javascript
res.render('login', {
  error: req.query.expired === '1' ? 'Tu sesión expiró. Inicia sesión nuevamente.' : (req.query.changed === '1' ? 'Contraseña cambiada exitosamente. Inicia sesión con tu nueva contraseña.' : null),
  isSubdomain: res.locals.isSubdomain || false,
  tenant: res.locals.tenant || null
});
```

- [ ] **Step 2: Modificar login.ejs — agregar versión subdomain**

En `views/login.ejs`, agregar al inicio del `<body>`, antes de todo el contenido actual, un condicional:

```html
<% if (typeof isSubdomain !== 'undefined' && isSubdomain && tenant) { %>
  <!-- ========== SUBDOMAIN LOGIN (no Google OAuth) ========== -->
  <div class="login-card" style="max-width:26rem;border-radius:20px;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
    <!-- Hero dark -->
    <div style="background:#0a0f24;padding:24px;border-radius:20px 20px 0 0;text-align:center;">
      <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:12px;">
        <img src="/logo/Isotipo.png" alt="MiRestcon IA" style="width:36px;height:36px;border-radius:8px;">
        <span style="color:#FF6B35;font-weight:700;font-size:14px;font-family:'DM Sans',sans-serif;">MiRestcon IA</span>
      </div>
      <h2 style="color:#fff;font-size:26px;font-weight:700;margin:0 0 4px;font-family:'DM Sans',sans-serif;"><%= tenant.nombre || 'Restaurante' %></h2>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0;">es un restaurante con IA</p>
    </div>

    <!-- Form -->
    <div style="padding:24px;">
      <% if (typeof error !== 'undefined' && error) { %>
        <div style="background:<%= error.includes('exitosamente') ? '#DCFCE7' : '#FEF2F2' %>;border-radius:10px;padding:10px 14px;margin-bottom:14px;">
          <p style="color:<%= error.includes('exitosamente') ? '#166534' : '#991B1B' %>;font-size:13px;margin:0;"><%= error %></p>
        </div>
      <% } %>
      <form method="POST" action="/login" autocomplete="off">
        <label style="font-size:13px;font-weight:600;color:#64748b;display:block;margin-bottom:6px;">Usuario</label>
        <input type="text" name="usuario" class="field-input" placeholder="Tu usuario" required autofocus style="margin-bottom:14px;">
        <label style="font-size:13px;font-weight:600;color:#64748b;display:block;margin-bottom:6px;">Contraseña</label>
        <input type="password" name="password" class="field-input" placeholder="Tu PIN temporal" required style="margin-bottom:16px;">
        <button type="submit" class="btn-signin" style="background:linear-gradient(135deg,#fefbf5,#fdb75e 4%,#fd9931 9%,#ef520f 38%,#df2c05 79%,#e13809 89%);border-radius:12px;padding:14px;font-size:16px;font-weight:700;">
          <i class="bi bi-lock me-2"></i>Entrar
        </button>
      </form>

      <div style="display:flex;align-items:center;gap:12px;margin:16px 0;">
        <div style="flex:1;height:1px;background:#e5e7eb;"></div>
        <span style="color:#94a3b8;font-size:12px;">o</span>
        <div style="flex:1;height:1px;background:#e5e7eb;"></div>
      </div>

      <button type="button" id="btnBiometric" style="width:100%;padding:14px;border-radius:12px;border:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;" onclick="startBiometricLogin()">
        <i class="bi bi-fingerprint" style="font-size:20px;color:#FF6B35;"></i>
        <span style="font-size:14px;font-weight:600;color:#64748b;">Iniciar con huella / FaceID</span>
      </button>

      <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px;">Potenciado por MiRestcon IA</p>
    </div>
  </div>
<% } else { %>
  <!-- ========== NORMAL LOGIN (www.mirestconia.com — with Google OAuth) ========== -->
  <!-- ... existing login code stays here unchanged ... -->
```

Y al final del archivo, antes de `</body>`, cerrar el else:

```html
<% } %>
```

- [ ] **Step 3: Agregar script biométrico placeholder al final de login.ejs**

Antes de `</body>`, agregar:

```html
<script>
  // Biometric login placeholder — implemented fully in Task 8 (WebAuthn)
  async function startBiometricLogin() {
    if (!window.PublicKeyCredential) {
      alert('Tu navegador no soporta inicio biométrico');
      return;
    }
    // WebAuthn flow will be implemented in Task 8
    alert('Biometría será activada próximamente');
  }
</script>
```

- [ ] **Step 4: Commit**

```bash
git add views/login.ejs routes/auth.js
git commit -m "feat(auth): add subdomain-branded login page without Google OAuth"
```

---

## Task 7: Loader robot con ondas naranjas

**Files:**
- Create: `views/loader.ejs`
- Modify: `public/css/theme.css` o inline en la vista

- [ ] **Step 1: Crear views/loader.ejs**

Crear `views/loader.ejs`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0a0f24">
  <title>Cargando... - MiRestcon IA</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      font-family: 'DM Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #0a0f24;
      gap: 24px;
    }
    .loader {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: url('/logo/Isotipo.png') center/contain no-repeat;
      animation: wave 1.2s ease-in infinite;
    }
    @keyframes wave {
      0% { box-shadow:
        0 0 0 0px rgba(232,98,44,1),
        0 0 0 20px rgba(232,98,44,0.2),
        0 0 0 40px rgba(232,98,44,0.6),
        0 0 0 60px rgba(232,98,44,0.4),
        0 0 0 80px rgba(232,98,44,0.2);
      }
      100% { box-shadow:
        0 0 0 80px rgba(232,98,44,0),
        0 0 0 60px rgba(232,98,44,0.2),
        0 0 0 40px rgba(232,98,44,0.4),
        0 0 0 20px rgba(232,98,44,0.6),
        0 0 0 0px rgba(232,98,44,1);
      }
    }
    .loader-text { color: #8B8FAD; font-size: 15px; font-weight: 500; }
    .loader-brand { color: #FF6B35; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="loader"></div>
  <p class="loader-text">Cargando...</p>
  <p class="loader-brand">MiRestcon IA</p>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add views/loader.ejs
git commit -m "feat(ui): add robot chef loader with orange wave animation"
```

---

## Task 8: WebAuthn (Biometría)

**Files:**
- Create: `routes/webauthn.js`
- Modify: `views/login.ejs` (reemplazar placeholder biométrico)
- Modify: `package.json` (agregar dependencia)

- [ ] **Step 1: Instalar @simplewebauthn/server**

```bash
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes"
npm install @simplewebauthn/server
```

- [ ] **Step 2: Crear routes/webauthn.js**

Crear `routes/webauthn.js`:

```javascript
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const RP_NAME = 'MiRestcon IA';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'mirestconia.com';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'https://mirestconia.com';

// ---------------------------------------------------------------------------
// GET /auth/webauthn/register/options
// ---------------------------------------------------------------------------
router.get('/register/options', async (req, res) => {
  try {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    // Get existing credentials for this user
    const [existing] = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = ?',
      [user.id]
    );

    const excludeCredentials = (existing || []).map(c => ({
      id: c.credential_id,
      type: 'public-key',
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.usuario,
      userDisplayName: user.nombre || user.usuario,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    });

    // Store challenge
    await db.query(
      `INSERT INTO webauthn_challenges (user_id, challenge, expires_at)
       VALUES (?, ?, NOW() + INTERVAL '5 minutes')
       ON CONFLICT (user_id) DO UPDATE SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at`,
      [user.id, options.challenge]
    );

    res.json(options);
  } catch (err) {
    console.error('WebAuthn register options error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/webauthn/register/verify
// ---------------------------------------------------------------------------
router.post('/register/verify', async (req, res) => {
  try {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    // Get stored challenge
    const [[challengeRow]] = await db.query(
      'SELECT challenge FROM webauthn_challenges WHERE user_id = ? AND expires_at > NOW()',
      [user.id]
    );
    if (!challengeRow) return res.status(400).json({ error: 'Challenge expirado' });

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verificación fallida' });
    }

    const { credential } = verification.registrationInfo;

    // Save credential
    await db.query(
      `INSERT INTO webauthn_credentials (user_id, tenant_id, credential_id, public_key, sign_count, device_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.tenant_id || req.tenantId || 1,
        credential.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        req.body.deviceName || 'Dispositivo'
      ]
    );

    // Clean up challenge
    await db.query('DELETE FROM webauthn_challenges WHERE user_id = ?', [user.id]);

    res.json({ ok: true, message: 'Biometría registrada exitosamente' });
  } catch (err) {
    console.error('WebAuthn register verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /auth/webauthn/login/options?usuario=X
// ---------------------------------------------------------------------------
router.get('/login/options', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const tenantId = req.tenantId || 1;

    // Find user
    const [[user]] = await db.query(
      'SELECT id FROM usuarios WHERE usuario = ? AND tenant_id = ? AND activo = true LIMIT 1',
      [usuario, tenantId]
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Get credentials
    const [creds] = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = ? AND tenant_id = ?',
      [user.id, tenantId]
    );

    if (!creds || creds.length === 0) {
      return res.status(404).json({ error: 'Sin biometría registrada' });
    }

    const allowCredentials = creds.map(c => ({
      id: c.credential_id,
      type: 'public-key',
    }));

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'required',
    });

    // Store challenge
    await db.query(
      `INSERT INTO webauthn_challenges (user_id, challenge, expires_at)
       VALUES (?, ?, NOW() + INTERVAL '5 minutes')
       ON CONFLICT (user_id) DO UPDATE SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at`,
      [user.id, options.challenge]
    );

    // Store user_id in temp for verify
    options._userId = user.id;
    res.json(options);
  } catch (err) {
    console.error('WebAuthn login options error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/webauthn/login/verify
// ---------------------------------------------------------------------------
router.post('/login/verify', async (req, res) => {
  try {
    const { usuario } = req.body;
    const tenantId = req.tenantId || 1;

    // Find user
    const [[user]] = await db.query(
      'SELECT id, usuario, nombre, rol, tenant_id, must_change_password FROM usuarios WHERE usuario = ? AND tenant_id = ? AND activo = true LIMIT 1',
      [usuario, tenantId]
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Get challenge
    const [[challengeRow]] = await db.query(
      'SELECT challenge FROM webauthn_challenges WHERE user_id = ? AND expires_at > NOW()',
      [user.id]
    );
    if (!challengeRow) return res.status(400).json({ error: 'Challenge expirado' });

    // Get credential
    const credentialId = req.body.id;
    const [[cred]] = await db.query(
      'SELECT credential_id, public_key, sign_count FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?',
      [credentialId, user.id]
    );
    if (!cred) return res.status(400).json({ error: 'Credential no encontrado' });

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: cred.credential_id,
        publicKey: cred.public_key,
        counter: cred.sign_count,
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Verificación fallida' });
    }

    // Update sign count
    await db.query(
      'UPDATE webauthn_credentials SET sign_count = ?, last_used_at = NOW() WHERE credential_id = ?',
      [verification.authenticationInfo.newCounter, credentialId]
    );

    // Clean up challenge
    await db.query('DELETE FROM webauthn_challenges WHERE user_id = ?', [user.id]);

    // Create session
    const [permisos] = await db.query(
      'SELECT permiso FROM usuario_permisos WHERE usuario_id = ?', [user.id]
    ).catch(() => [[]]);

    req.session.user = {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre || '',
      rol: user.rol,
      permisos: (permisos || []).map(p => p.permiso),
      must_change_password: !!user.must_change_password,
      tenant_id: user.tenant_id
    };
    req.session.lastActivity = Date.now();

    // Update last_login
    await db.query('UPDATE usuarios SET last_login = NOW() WHERE id = ?', [user.id]);

    res.json({ ok: true, redirect: user.must_change_password ? '/cambiar-contrasena' : '/' });
  } catch (err) {
    console.error('WebAuthn login verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 3: Actualizar biometric script en login.ejs**

En `views/login.ejs`, reemplazar el script placeholder de `startBiometricLogin()` con:

```html
<script src="https://unpkg.com/@simplewebauthn/browser@13/dist/bundle/index.umd.min.js"></script>
<script>
  const { startAuthentication } = SimpleWebAuthnBrowser;

  async function startBiometricLogin() {
    if (!window.PublicKeyCredential) {
      alert('Tu navegador no soporta inicio biométrico');
      return;
    }

    const usuarioInput = document.querySelector('input[name="usuario"]');
    const usuario = usuarioInput?.value?.trim();
    if (!usuario) {
      alert('Ingresa tu usuario primero');
      usuarioInput?.focus();
      return;
    }

    try {
      // Get authentication options
      const optRes = await fetch('/auth/webauthn/login/options?usuario=' + encodeURIComponent(usuario));
      if (!optRes.ok) {
        const err = await optRes.json();
        if (err.error === 'Sin biometría registrada') {
          alert('No tienes biometría registrada. Inicia con tu contraseña primero.');
        } else {
          alert(err.error || 'Error al obtener opciones');
        }
        return;
      }
      const options = await optRes.json();

      // Trigger biometric prompt
      const authResp = await startAuthentication({ optionsJSON: options });

      // Verify with server
      authResp.usuario = usuario;
      const verifyRes = await fetch('/auth/webauthn/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResp),
      });
      const result = await verifyRes.json();

      if (result.ok) {
        window.location.href = result.redirect || '/';
      } else {
        alert(result.error || 'Error de verificación');
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        // User cancelled biometric prompt
        return;
      }
      console.error('Biometric login error:', err);
      alert('Error al iniciar con biometría');
    }
  }
</script>
```

- [ ] **Step 4: Commit**

```bash
git add routes/webauthn.js views/login.ejs package.json package-lock.json
git commit -m "feat(auth): implement WebAuthn biometric login (FaceID/fingerprint)"
```

---

## Task 9: Montar todo en server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Agregar requires de los nuevos middlewares**

En `server.js`, después del require de `attachTenant` (línea ~10), agregar:

```javascript
const { subdomainGuard } = require('./middleware/subdomainGuard');
const { sessionTimeout } = require('./middleware/sessionTimeout');
const { requirePasswordChange } = require('./middleware/requirePasswordChange');
```

- [ ] **Step 2: Montar subdomainGuard después de attachTenant**

Buscar la línea donde se monta `attachTenant` (línea ~135):

```javascript
app.use(attachTenant);
```

Agregar justo después:

```javascript
app.use(subdomainGuard);
```

- [ ] **Step 3: Montar sessionTimeout después de session middleware**

Después del bloque `app.use(session({...}))` (línea ~126), agregar:

```javascript
app.use(sessionTimeout);
```

- [ ] **Step 4: Montar requirePasswordChange después de requireAuth en rutas protegidas**

Buscar donde se montan las rutas protegidas. Después del middleware de trial (`requireTrialActivo`), agregar:

```javascript
app.use(requirePasswordChange);
```

- [ ] **Step 5: Montar rutas WebAuthn**

Después de las rutas de auth, agregar:

```javascript
const webauthnRoutes = require('./routes/webauthn');
app.use('/auth/webauthn', webauthnRoutes);
```

- [ ] **Step 6: Agregar ruta GET /login con tenant data**

Buscar la ruta GET /login actual. Si está en `routes/auth.js`, modificarla ahí. Si está directamente en server.js, modificarla para pasar `isSubdomain` y `tenant`:

```javascript
app.get('/login', (req, res) => {
  if (req.session?.user) {
    return res.redirect('/');
  }
  res.render('login', {
    error: req.query.expired === '1' ? 'Tu sesión expiró. Inicia sesión nuevamente.'
         : req.query.changed === '1' ? 'Contraseña cambiada. Inicia sesión con tu nueva contraseña.'
         : null,
    isSubdomain: res.locals.isSubdomain || false,
    tenant: res.locals.tenant || null
  });
});
```

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "feat(auth): mount all security middlewares and webauthn routes in server.js"
```

---

## Task 10: Verificación con Playwright

**Files:**
- Sin archivos nuevos — verificación interactiva

- [ ] **Step 1: Iniciar servidor local**

```bash
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes"
node server.js
```

- [ ] **Step 2: Verificar login normal (www)**

Navegar a `http://localhost:1995/login`. Verificar:
1. Se muestra el login normal con Google OAuth
2. No hay login de subdominio

- [ ] **Step 3: Verificar login de subdominio**

Esto requiere acceder via subdominio. En local, simular pasando headers o testeando en producción después del deploy.
Verificar que:
1. Hero dark con nombre del tenant
2. Sin botón Google OAuth
3. Campos usuario y PIN temporal
4. Botón "Iniciar con huella / FaceID"

- [ ] **Step 4: Verificar creación de tenant con usuario admin**

1. Ir a `/superadmin/tenants`
2. Crear nuevo tenant trial
3. Verificar que el email de bienvenida incluye usuario + PIN

- [ ] **Step 5: Verificar cambio de contraseña obligatorio**

1. Login con el usuario/PIN creado
2. Verificar redirect a `/cambiar-contrasena`
3. Cambiar contraseña
4. Verificar redirect a `/login` con mensaje de éxito

- [ ] **Step 6: Verificar sesión expirada**

1. Verificar que `cookie.maxAge` es 24h
2. Verificar que `sessionTimeout` middleware está activo

- [ ] **Step 7: Verificar loader**

Navegar a la vista loader y verificar:
1. Robot circular centrado
2. Ondas naranjas
3. "Cargando..." + "MiRestcon IA"
