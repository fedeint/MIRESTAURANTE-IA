# Diseño: Login Personalizado, Seguridad y Biometría

**Fecha:** 2026-04-02
**Estado:** Aprobado

---

## Contexto

El login actual en subdominios muestra la pantalla genérica de MiRestcon IA con Google OAuth. Se necesita:
- Login personalizado por subdominio con branding del tenant
- Creación automática de usuario admin con PIN temporal
- Cambio de contraseña obligatorio en primer login
- Sesiones con expiración (8h idle, 24h absoluto)
- Login biométrico (FaceID/huella) via WebAuthn
- Bloqueo de rutas en subdominios (solo /login accesible sin sesión)
- Loader con robot chef y ondas naranjas

**Regla de UI:** PWA es solo mobile. Desktop/tablet usa versión desktop. Cada cambio de interfaz debe considerar ambas versiones.

---

## 1. Login personalizado por subdominio

### Dos flujos de login:
- `www.mirestconia.com/login` → Google OAuth → para solicitudes de trial
- `subdominio.mirestconia.com/login` → Usuario/PIN + biometría → tenants creados

### Diseño PWA Mobile (390x844) — Light mode
- Fondo: `#F0F2F8`
- Hero section dark (`#0a0f24`): isotipo robot chef + "MiRestcon IA" + nombre tenant blanco + "es un restaurante con IA"
- Inputs blancos `#FFFFFF` con borde `#e5e7eb`
- Labels: `#64748b`
- Botón "Entrar": gradiente 6-stop (`#fefbf5 → #fdb75e → #fd9931 → #ef520f → #df2c05 → #e13809`)
- Botón biométrico: fondo blanco, ícono fingerprint `#FF6B35`
- Footer: "Potenciado por MiRestcon IA" en `#94a3b8`
- Sin Google OAuth

### Diseño Desktop (1440x900)
- Panel izquierdo dark (`#0a0f24`): isotipo robot grande (80x80) + nombre tenant + "Potenciado con Inteligencia Artificial"
- Panel derecho claro (`#F0F2F8`): badge con isotipo + nombre tenant + "es un restaurante con IA"
- Formulario: inputs blancos, labels `#64748b`, placeholder "Tu PIN temporal"
- Mismo gradiente en botón Entrar
- Botón biométrico outline
- Sin Google OAuth

### Diseño en .pen
- Frame `Login PWA Mobile - Subdominio Tenant` (390x844)
- Frame `Login Desktop - Subdominio Tenant` (1440x900)

### Técnico
- La vista `login.ejs` recibe `tenant` y `isSubdomain` desde el middleware
- Si `isSubdomain`: renderiza login personalizado sin Google OAuth
- Si no: renderiza login normal con Google OAuth
- Datos del tenant (nombre, subdominio) se pasan via `res.locals`

---

## 2. Crear usuario admin al crear tenant + credenciales por email

### Al crear tenant (manual o aprobación de solicitud):
1. Generar PIN de 6 dígitos con `crypto.randomBytes`
2. Crear usuario `administrador` vinculado al tenant:
   - `usuario` = parte antes del @ del email_admin
   - `password_hash` = bcrypt del PIN
   - `must_change_password` = true
   - `password_expires_at` = NOW() + 48 horas
   - `rol` = 'administrador'
   - `tenant_id` = el nuevo tenant
3. Email de bienvenida incluye:
   - URL del subdominio
   - Usuario asignado
   - PIN temporal
   - Advertencia: "Este PIN expira en 48 horas. Cámbialo en tu primer ingreso."
   - Los 5 pasos de onboarding

### Columnas nuevas en `usuarios`:
```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMP;
```

### Middleware `requirePasswordChange`:
- Si `must_change_password = true` → redirige a `/cambiar-contrasena`
- Excluye rutas: `/cambiar-contrasena`, `/logout`, `/vendor/`, `/css/`, `/js/`
- Página `/cambiar-contrasena`: un solo campo (nueva contraseña) con toggle mostrar/ocultar
- Al cambiar: `must_change_password = false`, destruye sesión, re-login con nueva contraseña

### Archivos a modificar:
- `services/notificaciones-trial.js` — actualizar `enviarEmailBienvenidaSubdominio` con credenciales
- `routes/superadmin.js` — POST /tenants y POST /solicitudes/:id/aprobar: crear usuario admin
- Nuevo middleware: `middleware/requirePasswordChange.js`
- Nueva vista: `views/cambiar-contrasena.ejs`

---

## 3. Sesión con expiración

### Configuración:
- Idle timeout: **8 horas** de inactividad
- Máximo absoluto: **24 horas** sin importar actividad
- Implementación server-side en `express-session`

### Técnico:
- `cookie.maxAge = 24 * 60 * 60 * 1000` (24h absoluto)
- `rolling: true` (renueva cookie en cada request)
- Middleware `sessionTimeout`: almacena `req.session.lastActivity = Date.now()` en cada request
- Si `Date.now() - lastActivity > 8h` → destruye sesión → redirect `/login?expired=1`
- En login: si `?expired=1` → mostrar banner "Tu sesión expiró, inicia sesión nuevamente"
- Si tiene WebAuthn → puede re-entrar rápido con huella/FaceID

### Archivos a modificar:
- `server.js` — configuración de session (maxAge, rolling)
- Nuevo middleware: `middleware/sessionTimeout.js`
- `views/login.ejs` — banner de sesión expirada

---

## 4. WebAuthn (Biometría)

### Paquetes:
- `@simplewebauthn/server` v13.x (backend)
- `@simplewebauthn/browser` v13.x (frontend, via CDN)

### Tabla nueva:
```sql
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

CREATE INDEX IF NOT EXISTS idx_webauthn_tenant_user ON webauthn_credentials(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  user_id    INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);
```

### Flujo de registro (durante configuración del tenant):
1. Usuario entra por primera vez → cambia PIN → login
2. Sistema detecta dispositivo (iPhone → FaceID, Android → huella/FaceID)
3. Popup: "Activa inicio rápido con huella / FaceID"
4. `GET /auth/webauthn/register/options` → genera challenge
5. Browser trigger biometría → guarda credential
6. Próximo login puede usar biometría

### Flujo de login con biometría:
1. Usuario toca "Iniciar con huella / FaceID"
2. `GET /auth/webauthn/login/options` → genera challenge
3. Browser trigger biometría → verifica
4. Sesión creada → dashboard

### Rutas nuevas:
```
GET  /auth/webauthn/register/options
POST /auth/webauthn/register/verify
GET  /auth/webauthn/login/options
POST /auth/webauthn/login/verify
```

### Limitaciones:
- Cambio de celular → re-registrar biometría
- Patrón de dibujo NO es posible con WebAuthn
- Desktop sin biometría (solo usuario/contraseña)

### Archivos nuevos:
- `routes/webauthn.js` — las 4 rutas
- `migrations/add_webauthn_tables.sql`

---

## 5. Bloqueo de rutas en subdominios

### Regla:
En subdominios, solo `/login` y rutas de autenticación son accesibles sin sesión.

### Middleware `subdomainGuard`:
```javascript
function subdomainGuard(req, res, next) {
  const parts = (req.hostname || '').split('.');
  const isSubdomain = parts.length >= 3 && parts[1] === 'mirestconia' && parts[0] !== 'www';
  
  if (!isSubdomain) return next();
  
  const allowed = ['/login', '/auth/', '/api/auth/', '/cambiar-contrasena', '/vendor/', '/css/', '/js/', '/logo/', '/favicon', '/sw.js', '/manifest.json'];
  if (allowed.some(p => req.path.startsWith(p))) return next();
  
  if (!req.session?.user) return res.redirect('/login');
  
  next();
}
```

### En login.ejs:
- `isSubdomain = true` → login personalizado sin Google OAuth
- `isSubdomain = false` → login normal con Google OAuth (para solicitudes de trial)

### Archivo a modificar:
- `server.js` — agregar middleware después de `attachTenant`
- `views/login.ejs` — condicional para renderizar versión subdomain vs normal

---

## 6. Loader con robot chef

### Diseño en .pen:
- Frame `Loader PWA - Robot Ondas Naranjas` (390x844)
- Fondo: `#0a0f24`
- Robot chef circular (56x56, cornerRadius 28) centrado
- 4 ondas concéntricas naranjas (`rgba(232,98,44, 0.15/0.25/0.45/0.7)`)
- "Cargando..." en `#8B8FAD`
- "MiRestcon IA" en `#FF6B35`

### CSS (reemplaza loader actual):
```css
.loader-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
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
    0 0 0 80px rgba(232,98,44,0.2)
  }
  100% { box-shadow:
    0 0 0 80px rgba(232,98,44,0),
    0 0 0 60px rgba(232,98,44,0.2),
    0 0 0 40px rgba(232,98,44,0.4),
    0 0 0 20px rgba(232,98,44,0.6),
    0 0 0 0px rgba(232,98,44,1)
  }
}
```

---

## Flujos completos

### Flujo A — Tenant nuevo (superadmin crea manualmente)
1. Superadmin crea tenant → sistema genera usuario + PIN 6 dígitos
2. Email de bienvenida con subdominio + usuario + PIN temporal
3. Usuario entra a `subdominio.mirestconia.com` → ve loader robot → login personalizado
4. Ingresa usuario + PIN → sistema lo redirige a `/cambiar-contrasena`
5. Cambia contraseña → re-login
6. Sistema detecta dispositivo → popup "Activa huella/FaceID"
7. Registra biometría → dashboard

### Flujo B — Trial aprobado
1. Superadmin aprueba solicitud → sistema genera usuario + PIN
2. Mismo flujo que A desde paso 2

### Flujo C — Re-login (sesión expirada)
1. Sesión expira (8h idle o 24h absoluto)
2. Redirect a `/login?expired=1` → banner "Tu sesión expiró"
3. Toca "Iniciar con huella" → biometría → dashboard (rápido)

### Flujo D — Acceso directo www (trial/solicitud)
1. Usuario entra a `www.mirestconia.com/login` → login normal con Google OAuth
2. Se registra → solicitud pendiente → espera aprobación
3. Al aprobar → Flujo B

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `middleware/requirePasswordChange.js` | Crear: redirige a /cambiar-contrasena si must_change_password |
| `middleware/sessionTimeout.js` | Crear: idle timeout 8h |
| `middleware/subdomainGuard.js` | Crear: bloquea rutas en subdominios |
| `routes/webauthn.js` | Crear: register/login options + verify |
| `views/cambiar-contrasena.ejs` | Crear: form cambio de contraseña (PWA + desktop) |
| `views/login.ejs` | Modificar: versión subdomain vs normal |
| `views/loader.ejs` | Crear: loader robot con ondas |
| `services/notificaciones-trial.js` | Modificar: agregar credenciales al email |
| `routes/superadmin.js` | Modificar: crear usuario admin al crear/aprobar tenant |
| `server.js` | Modificar: session config + middlewares + ruta /cambiar-contrasena |
| `migrations/add_webauthn_tables.sql` | Crear: tablas webauthn |
| `migrations/add_password_change.sql` | Crear: columnas must_change_password + password_expires_at |
| `package.json` | Modificar: agregar @simplewebauthn/server |

---

## Fuera de alcance

- Pasarela de pago (Culqi/Izipay) — fase posterior
- Patrón de dibujo — no soportado por WebAuthn
- Login biométrico en desktop — solo usuario/contraseña
- Personalización visual del login (foto local, logo custom) — se configura después en ajustes
