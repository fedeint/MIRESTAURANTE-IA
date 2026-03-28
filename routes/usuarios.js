const express = require('express');
const router = express.Router();
const db = require('../db');

// CRUD de usuarios (solo administrador; protección se aplica en server.js con requireRole('administrador'))
// Relacionado con:
// - views/usuarios.ejs (panel)
// - public/js/usuarios.js (acciones fetch)
// - database.sql (tabla usuarios)

let bcrypt;
function getBcrypt() {
  if (!bcrypt) {
    try { bcrypt = require('bcryptjs'); } catch (e) { bcrypt = null; }
  }
  return bcrypt;
}

const ROLES = ['administrador', 'mesero', 'cocinero', 'cajero'];

const ALL_MODULES = [
  { key: 'caja', label: 'Caja', icon: 'bi-wallet2', color: '#F59E0B' },
  { key: 'facturacion', label: 'Facturacion', icon: 'bi-receipt-cutoff', color: '#6366F1' },
  { key: 'mesas', label: 'Mesas', icon: 'bi-grid-3x3-gap-fill', color: '#3B82F6' },
  { key: 'cocina', label: 'Cocina', icon: 'bi-fire', color: '#EF4444' },
  { key: 'ventas', label: 'Ventas', icon: 'bi-graph-up-arrow', color: '#22C55E' },
  { key: 'almacen', label: 'Almacen', icon: 'bi-box-seam', color: '#8B5CF6' },
  { key: 'productos', label: 'Productos', icon: 'bi-egg-fried', color: '#EC4899' },
  { key: 'clientes', label: 'Clientes', icon: 'bi-people-fill', color: '#14B8A6' },
  { key: 'administracion', label: 'Admin', icon: 'bi-bar-chart-line-fill', color: '#F97316' },
  { key: 'canales', label: 'Canales', icon: 'bi-chat-dots-fill', color: '#06B6D4' },
  { key: 'usuarios', label: 'Usuarios', icon: 'bi-person-gear', color: '#78716C' },
  { key: 'configuracion', label: 'Config', icon: 'bi-gear-fill', color: '#6B7280' }
];

const DEFAULT_PERMISOS = {
  administrador: ['caja','facturacion','mesas','cocina','ventas','almacen','productos','clientes','administracion','canales','usuarios','configuracion'],
  mesero: ['mesas','cocina'],
  cocinero: ['cocina'],
  cajero: ['caja','facturacion','ventas']
};

function resolvePermisos(u) {
  if (u.permisos) {
    try {
      const parsed = JSON.parse(u.permisos);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) { /* fall through */ }
  }
  return DEFAULT_PERMISOS[String(u.rol)] || [];
}

function sanitizePermisos(arr) {
  if (!Array.isArray(arr)) return null;
  const valid = ALL_MODULES.map(m => m.key);
  const filtered = arr.filter(k => valid.includes(String(k)));
  return JSON.stringify(filtered);
}

async function countAdminsExcept(userIdToExclude = null) {
  const params = [];
  let where = `WHERE rol = 'administrador' AND activo = true`;
  if (userIdToExclude != null) {
    where += ' AND id <> ?';
    params.push(userIdToExclude);
  }
  const [rows] = await db.query(`SELECT COUNT(*) AS cnt FROM usuarios ${where}`, params);
  return Number(rows?.[0]?.cnt || 0);
}

// Ensure permisos column exists
let _permisosColumnReady = false;
async function ensurePermisosColumn() {
  if (_permisosColumnReady) return;
  try {
    const [cols] = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='usuarios' AND column_name='permisos' LIMIT 1"
    );
    if (cols.length === 0) {
      await db.query('ALTER TABLE usuarios ADD COLUMN permisos TEXT DEFAULT NULL');
      console.log('Columna permisos agregada a usuarios');
    }
    _permisosColumnReady = true;
  } catch (e) {
    if (e && (e.code === 'ER_DUP_FIELDNAME' || String(e.message || '').includes('already exists'))) {
      _permisosColumnReady = true;
    } else {
      console.error('Error ensuring permisos column:', e.message);
    }
  }
}

// GET /usuarios - render panel
router.get('/', async (req, res) => {
  try {
    await ensurePermisosColumn();
    const [usuarios] = await db.query(
      "SELECT id, usuario, nombre, rol, activo, last_login, created_at, permisos FROM usuarios WHERE rol != 'superadmin' ORDER BY created_at DESC, id DESC"
    );
    // Traer mesas asignadas a cada mesero
    let mesasAsignadas = [];
    try {
      const [rows] = await db.query(
        'SELECT id, numero, mesero_asignado_id FROM mesas WHERE mesero_asignado_id IS NOT NULL'
      );
      mesasAsignadas = rows || [];
    } catch (_) { /* tabla puede no existir aún */ }

    const mesasPorUsuario = {};
    mesasAsignadas.forEach(m => {
      if (!mesasPorUsuario[m.mesero_asignado_id]) mesasPorUsuario[m.mesero_asignado_id] = [];
      mesasPorUsuario[m.mesero_asignado_id].push(m.numero);
    });

    const usuariosConPermisos = (usuarios || []).map(u => ({
      ...u,
      permisosArr: resolvePermisos(u),
      mesasAsignadas: mesasPorUsuario[u.id] || []
    }));
    res.render('usuarios', { usuarios: usuariosConPermisos, roles: ROLES, allModules: ALL_MODULES });
  } catch (e) {
    console.error('Error usuarios panel:', e);
    if (e && e.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).render('error', {
        error: { message: 'Falta migracion: cree la tabla usuarios (ver database.sql)', stack: '' }
      });
    }
    res.status(500).render('error', { error: { message: 'No se pudo cargar el panel de usuarios', stack: '' } });
  }
});

// GET /usuarios/listar - API listar
router.get('/listar', async (req, res) => {
  try {
    await ensurePermisosColumn();
    const [usuarios] = await db.query(
      "SELECT id, usuario, nombre, rol, activo, last_login, created_at, permisos FROM usuarios WHERE rol != 'superadmin' ORDER BY created_at DESC, id DESC"
    );
    const result = (usuarios || []).map(u => ({
      ...u,
      permisosArr: resolvePermisos(u)
    }));
    res.json(result);
  } catch (e) {
    console.error('Error listar usuarios:', e);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

// GET /:id/permisos - obtener permisos de un usuario
router.get('/:id(\\d+)/permisos', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [rows] = await db.query('SELECT id, rol, permisos FROM usuarios WHERE id = ? LIMIT 1', [id]);
    const u = rows?.[0];
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ id: u.id, permisos: resolvePermisos(u) });
  } catch (e) {
    console.error('Error obtener permisos:', e);
    res.status(500).json({ error: 'Error al obtener permisos' });
  }
});

// PUT /:id/permisos - actualizar permisos de un usuario
router.put('/:id(\\d+)/permisos', async (req, res) => {
  const id = Number(req.params.id);
  const permisos = req.body?.permisos;
  try {
    const [rows] = await db.query('SELECT id FROM usuarios WHERE id = ? LIMIT 1', [id]);
    if (!rows?.[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    const permisosJson = sanitizePermisos(permisos);
    await db.query('UPDATE usuarios SET permisos = ? WHERE id = ?', [permisosJson, id]);
    res.json({ message: 'Permisos actualizados' });
  } catch (e) {
    console.error('Error actualizar permisos:', e);
    res.status(500).json({ error: 'Error al actualizar permisos' });
  }
});

// POST /usuarios - crear usuario
router.post('/', async (req, res) => {
  const usuario = String(req.body?.usuario || '').trim();
  const nombre = String(req.body?.nombre || '').trim();
  const rol = String(req.body?.rol || '').trim().toLowerCase();
  const activo = Number(req.body?.activo ?? 1) ? 1 : 0;
  const password = String(req.body?.password || '');
  const permisosRaw = req.body?.permisos;

  if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
  if (!password) return res.status(400).json({ error: 'password requerido' });
  if (!ROLES.includes(rol)) return res.status(400).json({ error: 'rol invalido' });

  const bc = getBcrypt();
  if (!bc) return res.status(500).json({ error: 'Falta dependencia bcryptjs (npm i bcryptjs)' });

  try {
    const hash = await bc.hash(password, 10);
    const permisosJson = permisosRaw ? sanitizePermisos(permisosRaw) : null;
    const [result] = await db.query(
      'INSERT INTO usuarios (usuario, nombre, password_hash, rol, activo, permisos) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [usuario, nombre || null, hash, rol, activo, permisosJson]
    );
    // Audit log: user created
    try {
      const { auditLog } = require('../lib/audit');
      await auditLog(req, 'CREATE', 'usuario', result.insertId, null, { usuario, rol });
    } catch (_) {}
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error('Error crear usuario:', e);
    if (e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').includes('unique') || String(e.message || '').includes('duplicate'))) return res.status(409).json({ error: 'Ese usuario ya existe' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /usuarios/:id - actualizar datos (sin password)
router.put('/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  const usuario = String(req.body?.usuario || '').trim();
  const nombre = String(req.body?.nombre || '').trim();
  const rol = String(req.body?.rol || '').trim().toLowerCase();
  const activo = Number(req.body?.activo ?? 1) ? 1 : 0;
  const permisosRaw = req.body?.permisos;

  if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
  if (!ROLES.includes(rol)) return res.status(400).json({ error: 'rol invalido' });

  try {
    // No permitir dejar el sistema sin admin activo
    const [rows] = await db.query('SELECT id, rol, activo FROM usuarios WHERE id = ? LIMIT 1', [id]);
    const current = rows?.[0];
    if (!current) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (String(current.rol) === 'superadmin') return res.status(403).json({ error: 'No se puede modificar un usuario superadmin' });

    const wasAdminActive = String(current.rol) === 'administrador' && Number(current.activo) === 1;
    const willBeAdminActive = rol === 'administrador' && activo === 1;
    if (wasAdminActive && !willBeAdminActive) {
      const others = await countAdminsExcept(id);
      if (others === 0) return res.status(400).json({ error: 'Debe existir al menos un administrador activo' });
    }

    const permisosJson = permisosRaw !== undefined ? sanitizePermisos(permisosRaw) : undefined;

    if (permisosJson !== undefined) {
      await db.query(
        'UPDATE usuarios SET usuario = ?, nombre = ?, rol = ?, activo = ?, permisos = ? WHERE id = ?',
        [usuario, nombre || null, rol, activo, permisosJson, id]
      );
    } else {
      await db.query(
        'UPDATE usuarios SET usuario = ?, nombre = ?, rol = ?, activo = ? WHERE id = ?',
        [usuario, nombre || null, rol, activo, id]
      );
    }
    // Audit log: user updated (includes status changes)
    try {
      const { auditLog } = require('../lib/audit');
      await auditLog(req, 'UPDATE', 'usuario_status', id, { activo: Number(current.activo), rol: current.rol }, { activo, rol, usuario });
    } catch (_) {}
    res.json({ message: 'Usuario actualizado' });
  } catch (e) {
    console.error('Error actualizar usuario:', e);
    if (e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').includes('unique') || String(e.message || '').includes('duplicate'))) return res.status(409).json({ error: 'Ese usuario ya existe' });
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// PUT /usuarios/:id/password - cambiar contrasena
router.put('/:id(\\d+)/password', async (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password || '');
  if (!password) return res.status(400).json({ error: 'password requerido' });

  const bc = getBcrypt();
  if (!bc) return res.status(500).json({ error: 'Falta dependencia bcryptjs (npm i bcryptjs)' });

  try {
    const hash = await bc.hash(password, 10);
    const [result] = await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, id]);
    if ((result?.affectedRows || 0) === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Audit log: password changed
    try {
      const { auditLog } = require('../lib/audit');
      await auditLog(req, 'UPDATE', 'usuario_password', id, null, { changed_by: req.session?.user?.usuario });
    } catch (_) {}
    res.json({ message: 'Contrasena actualizada' });
  } catch (e) {
    console.error('Error cambiar password:', e);
    res.status(500).json({ error: 'Error al cambiar contrasena' });
  }
});

// DELETE /usuarios/:id - eliminar usuario
router.delete('/:id(\\d+)', async (req, res) => {
  const id = Number(req.params.id);
  const currentUserId = Number(req.session?.user?.id || 0);
  if (id === currentUserId) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });

  try {
    const [rows] = await db.query('SELECT id, rol, activo FROM usuarios WHERE id = ? LIMIT 1', [id]);
    const u = rows?.[0];
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (String(u.rol) === 'superadmin') return res.status(403).json({ error: 'No se puede eliminar un usuario superadmin' });

    const isAdminActive = String(u.rol) === 'administrador' && Number(u.activo) === 1;
    if (isAdminActive) {
      const others = await countAdminsExcept(id);
      if (others === 0) return res.status(400).json({ error: 'No puedes eliminar el ultimo administrador activo' });
    }

    const [result] = await db.query('DELETE FROM usuarios WHERE id = ?', [id]);
    if ((result?.affectedRows || 0) === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario eliminado' });
  } catch (e) {
    console.error('Error eliminar usuario:', e);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

module.exports = router;
