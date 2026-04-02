const express = require('express');
const router = express.Router();
const db = require('../db');
const { registrarAudit } = require('../services/audit');

// Autenticación (login/logout) + Setup inicial (crear primer admin)
// Relacionado con:
// - middleware/auth.js (requireAuth/requireRole)
// - views/login.ejs (form login)
// - views/setup.ejs (crear primer admin si no existen usuarios)
// - database.sql (tabla usuarios)

let bcrypt;
function getBcrypt() {
  // bcryptjs (sin binarios) para facilitar despliegue en Windows / pkg
  // Si no está instalado, damos un error claro.
  if (!bcrypt) {
    try {
      bcrypt = require('bcryptjs');
    } catch (e) {
      bcrypt = null;
    }
  }
  return bcrypt;
}

async function countUsuarios() {
  const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM usuarios');
  return Number(rows?.[0]?.cnt || 0);
}

// Validar complejidad de contrasena (min 10, mayusc, minusc, numero, especial)
function validarPassword(pwd) {
  if (!pwd || pwd.length < 10) return 'La contrasena debe tener al menos 10 caracteres';
  if (!/[A-Z]/.test(pwd)) return 'La contrasena debe tener al menos 1 mayuscula';
  if (!/[a-z]/.test(pwd)) return 'La contrasena debe tener al menos 1 minuscula';
  if (!/[0-9]/.test(pwd)) return 'La contrasena debe tener al menos 1 numero';
  if (!/[!@#$%^&*._-]/.test(pwd)) return 'La contrasena debe tener al menos 1 caracter especial (!@#$%^&*._-)';
  return null;
}

// Intentos fallidos en memoria (se resetea al reiniciar - para produccion usar Redis)
const loginAttempts = {};
const MAX_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutos

function attemptKey(usuario, ip) {
  return `${usuario}::${ip || 'unknown'}`;
}

function checkLocked(usuario, ip) {
  const key = attemptKey(usuario, ip);
  const entry = loginAttempts[key];
  if (!entry) return false;
  if (entry.attempts >= MAX_ATTEMPTS && (Date.now() - entry.lastAttempt) < LOCK_TIME_MS) return true;
  if ((Date.now() - entry.lastAttempt) >= LOCK_TIME_MS) { delete loginAttempts[key]; return false; }
  return false;
}

function registerFailedAttempt(usuario, ip) {
  const key = attemptKey(usuario, ip);
  if (!loginAttempts[key]) loginAttempts[key] = { attempts: 0, lastAttempt: 0 };
  loginAttempts[key].attempts++;
  loginAttempts[key].lastAttempt = Date.now();
}

function clearAttempts(usuario, ip) { delete loginAttempts[attemptKey(usuario, ip)]; }

function defaultRedirectForRole(rol) {
  const r = String(rol || '').toLowerCase();
  if (r === 'superadmin') return '/superadmin';
  if (r === 'cocinero') return '/cocina';
  if (r === 'mesero') return '/mesas';
  if (r === 'cajero') return '/';
  if (r === 'almacenero') return '/almacen';
  return '/';
}

// GET /login
router.get('/login', async (req, res) => {
  try {
    // Si ya está logueado, redirigir según rol
    if (req.session?.user) return res.redirect(defaultRedirectForRole(req.session.user.rol));

    // Si no hay usuarios aún, guiar a setup
    let total = 1; // default: asumir que hay usuarios (mostrar login)
    try {
      total = await countUsuarios();
      console.log('countUsuarios:', total);
    } catch (e) {
      console.error('countUsuarios error:', e.message);
      // Si falla la conexión, mostrar login normal
    }

    if (total === 0) return res.redirect('/setup');

    const expired = req.query.expired === '1' ? 'Tu sesión expiró. Inicia sesión nuevamente.' : null;
    const changed = req.query.changed === '1' ? 'Contraseña cambiada. Inicia sesión con tu nueva contraseña.' : null;
    res.render('login', { error: expired || changed || null, isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
  } catch (e) {
    res.render('login', { error: 'No se pudo cargar el login.', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  const usuario = String(req.body?.usuario || '').trim();
  const password = String(req.body?.password || '');

  if (!usuario || !password) return res.status(400).render('login', { error: 'Usuario y contraseña son requeridos.', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });

  // Bloqueo por intentos fallidos (por usuario + IP)
  const clientIp = req.ip;
  if (checkLocked(usuario, clientIp)) {
    return res.status(429).render('login', { error: 'Cuenta bloqueada por multiples intentos fallidos. Intenta en 15 minutos.', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
  }

  const bc = getBcrypt();
  if (!bc) return res.status(500).render('login', { error: 'Falta dependencia bcryptjs. Instala con: npm i bcryptjs', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });

  try {
    const [rows] = await db.query(
      'SELECT id, usuario, nombre, password_hash, rol, activo, must_change_password, tenant_id, password_expires_at FROM usuarios WHERE usuario = ? LIMIT 1',
      [usuario]
    );
    const u = rows?.[0];
    if (!u || Number(u.activo) !== 1) {
      registerFailedAttempt(usuario, clientIp);
      // Log failed login attempt
      try {
        await db.query(
          `INSERT INTO login_history (tenant_id, user_id, ip_address, country, city, user_agent, success)
           VALUES (?, ?, ?, ?, ?, ?, false)`,
          [req.tenantId || 1, 0, req.geo?.ip || req.ip, req.geo?.country || 'unknown', req.geo?.city || 'unknown', String(req.headers['user-agent'] || '').substring(0, 300)]
        );
      } catch (_) {}
      return res.status(401).render('login', { error: 'Usuario o contraseña incorrectos.', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
    }

    const ok = await bc.compare(password, String(u.password_hash || ''));
    if (!ok) {
      registerFailedAttempt(usuario, clientIp);
      // Log failed login attempt
      try {
        await db.query(
          `INSERT INTO login_history (tenant_id, user_id, ip_address, country, city, user_agent, success)
           VALUES (?, ?, ?, ?, ?, ?, false)`,
          [req.tenantId || 1, 0, req.geo?.ip || req.ip, req.geo?.country || 'unknown', req.geo?.city || 'unknown', String(req.headers['user-agent'] || '').substring(0, 300)]
        );
      } catch (_) {}
      return res.status(401).render('login', { error: 'Usuario o contraseña incorrectos.', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
    }

    // Login exitoso - limpiar intentos
    clearAttempts(usuario, clientIp);

    // Cargar permisos del usuario
    let permisos = null;
    try {
      const [permRows] = await db.query('SELECT permisos FROM usuarios WHERE id = ? LIMIT 1', [u.id]);
      const raw = permRows?.[0]?.permisos;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) permisos = parsed;
      }
    } catch (_) {}

    // Check if temporary password has expired
    if (u.must_change_password && u.password_expires_at) {
      const expiresAt = new Date(u.password_expires_at);
      if (new Date() > expiresAt) {
        return res.render('login', { error: 'Tu PIN temporal expiró. Contacta al administrador.', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
      }
    }

    // Guardar sesión
    req.session.user = {
      id: u.id,
      usuario: u.usuario,
      nombre: u.nombre || '',
      rol: u.rol,
      permisos: permisos,
      must_change_password: !!u.must_change_password,
      tenant_id: u.tenant_id
    };

    // last_login
    try {
      await db.query('UPDATE usuarios SET last_login = NOW() WHERE id = ?', [u.id]);
    } catch (_) {}

    // Audit login
    registrarAudit({ tenantId: req.tenantId || 1, usuarioId: u.id, accion: 'LOGIN', modulo: 'auth', tabla: 'usuarios', registroId: u.id, ip: req.ip, userAgent: req.headers['user-agent'] });

    // Log successful login with geo data
    try {
      await db.query(
        `INSERT INTO login_history (tenant_id, user_id, ip_address, country, city, user_agent, success)
         VALUES (?, ?, ?, ?, ?, ?, true)`,
        [req.tenantId || 1, u.id, req.geo?.ip || req.ip, req.geo?.country || 'unknown', req.geo?.city || 'unknown', String(req.headers['user-agent'] || '').substring(0, 300)]
      );
    } catch (_) {}

    // Check for suspicious login (new country)
    try {
        const { checkSuspiciousLogin } = require('../lib/loginGuard');
        await checkSuspiciousLogin(req.tenantId || 1, u.id, u.usuario, req.geo?.country, req.geo?.ip);
    } catch (_) {}

    // Marcación de asistencia - entrada
    try {
      await db.query(
        `INSERT INTO asistencia_marcaciones (tenant_id, usuario_id, tipo, ip_address, user_agent, metodo)
         VALUES (?, ?, 'entrada', ?, ?, 'auto_session')`,
        [req.tenantId || 1, u.id, req.ip, String(req.headers['user-agent'] || '').substring(0, 300)]
      );
    } catch (_) {}

    res.redirect(defaultRedirectForRole(u.rol));
  } catch (e) {
    console.error('Error login:', e);
    // Si la tabla no existe aún, guiar a migración
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === '42P01')) {
      return res.status(500).render('login', { error: 'Falta migración: cree la tabla usuarios (ver database.sql).', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
    }
    res.status(500).render('login', { error: 'Error interno al iniciar sesión.', isSubdomain: res.locals.isSubdomain || false, tenant: res.locals.tenant || null });
  }
});

// POST /logout
router.post('/logout', async (req, res) => {
  try {
    const user = req.session?.user;
    if (user) {
      try {
        await db.query(
          `INSERT INTO asistencia_marcaciones (tenant_id, usuario_id, tipo, ip_address, user_agent, metodo)
           VALUES (?, ?, 'salida', ?, ?, 'auto_session')`,
          [req.tenantId || 1, user.id, req.ip, String(req.headers['user-agent'] || '').substring(0, 300)]
        );
      } catch (_) {}
    }
    req.session.destroy(() => {
      res.redirect('/login');
    });
  } catch (_) {
    res.redirect('/login');
  }
});

// GET /setup - solo disponible si NO existen usuarios
router.get('/setup', async (req, res) => {
  try {
    // Si ya hay usuarios, no mostramos setup
    const total = await countUsuarios();
    if (total > 0) return res.redirect('/login');
    res.render('setup', { error: null });
  } catch (e) {
    // Si falla por falta de tabla, mostramos instrucción igual
    res.render('setup', { error: null });
  }
});

// POST /setup - crea el primer admin
router.post('/setup', async (req, res) => {
  const usuario = String(req.body?.usuario || '').trim();
  const nombre = String(req.body?.nombre || '').trim();
  const password = String(req.body?.password || '');
  const password2 = String(req.body?.password2 || '');

  if (!usuario || !password) return res.status(400).render('setup', { error: 'Usuario y contraseña son requeridos.' });
  if (password !== password2) return res.status(400).render('setup', { error: 'Las contraseñas no coinciden.' });
  const pwdError = validarPassword(password);
  if (pwdError) return res.status(400).render('setup', { error: pwdError });

  const bc = getBcrypt();
  if (!bc) return res.status(500).render('setup', { error: 'Falta dependencia bcryptjs. Instala con: npm i bcryptjs' });

  try {
    const total = await countUsuarios();
    if (total > 0) return res.redirect('/login');

    const hash = await bc.hash(password, 10);
    await db.query(
      'INSERT INTO usuarios (usuario, nombre, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)',
      [usuario, nombre || null, hash, 'administrador']
    );

    res.redirect('/login');
  } catch (e) {
    console.error('Error setup:', e);
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === '42P01')) {
      return res.status(500).render('setup', { error: 'Falta migración: cree la tabla usuarios (ver database.sql).' });
    }
    if (e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').includes('unique') || String(e.message || '').includes('duplicate'))) {
      return res.status(400).render('setup', { error: 'Ya existe un usuario con ese nombre.' });
    }
    res.status(500).render('setup', { error: 'Error interno creando el usuario administrador.' });
  }
});

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

module.exports = router;

