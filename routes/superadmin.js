'use strict';

/**
 * routes/superadmin.js
 * All superadmin panel routes: dashboard, tenant management, billing.
 * Mounted at /superadmin and /api/superadmin by server.js
 * Protected by requireAuth + requireRole('superadmin') at mount point.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNum(v, decimals = 2) {
  const n = Number(v);
  return isNaN(n) ? 0 : decimals > 0 ? Number(n.toFixed(decimals)) : Math.round(n);
}

function defaultModules() {
  return {
    mesas: true,
    cocina: true,
    almacen: true,
    sunat: false,
    delivery: false,
    reservas: false,
    facturacion: true,
    caja: true,
    reportes: true,
    chat_ia: false,
  };
}

// ---------------------------------------------------------------------------
// GET /superadmin  (Dashboard)
// ---------------------------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    // MRR
    const [[mrrRow]] = await db.query(
      `SELECT COALESCE(SUM(precio_mensual), 0) AS mrr
       FROM tenant_suscripciones
       WHERE estado = 'activa'`
    );
    const mrr = safeNum(mrrRow.mrr);

    // Total tenants activos
    const [[tenantsActivos]] = await db.query(
      `SELECT COUNT(*) AS total FROM tenants WHERE activo = true`
    );

    // Total tenants (todos)
    const [[tenantsTotal]] = await db.query(
      `SELECT COUNT(*) AS total FROM tenants`
    );

    // Total usuarios across all tenants
    const [[usuariosRow]] = await db.query(
      `SELECT COUNT(*) AS total FROM usuarios WHERE rol != 'superadmin'`
    );

    // Total facturas emitidas (all tenants)
    const [[facturasRow]] = await db.query(
      `SELECT COUNT(*) AS total FROM facturas`
    );

    // Tenants list with subscription info and user count
    const [tenants] = await db.query(
      `SELECT
         t.id, t.nombre, t.subdominio, t.plan, t.activo,
         t.email_admin, t.created_at, t.modulos_habilitados,
         (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id AND u.rol != 'superadmin') AS usuarios_count,
         ts.plan AS sub_plan, ts.precio_mensual, ts.estado AS suscripcion_estado,
         ts.fecha_inicio AS sub_inicio, ts.fecha_fin AS sub_fin
       FROM tenants t
       LEFT JOIN tenant_suscripciones ts ON ts.tenant_id = t.id
       ORDER BY t.created_at DESC`
    );

    // Suscripciones por plan (for chart)
    const [suscripcionesPorPlan] = await db.query(
      `SELECT plan, COUNT(*) AS total, COALESCE(SUM(precio_mensual),0) AS revenue
       FROM tenant_suscripciones
       WHERE estado IN ('activa','prueba')
       GROUP BY plan`
    );

    // ARR = MRR * 12
    const arr = safeNum(mrr * 12);

    // Tenants nuevos este mes
    const [[nuevosEsteMes]] = await db.query(
      `SELECT COUNT(*) AS total FROM tenants
       WHERE created_at >= date_trunc('month', CURRENT_DATE)`
    );

    const stats = {
      mrr,
      arr,
      tenantsActivos: safeNum(tenantsActivos.total, 0),
      tenantsTotal: safeNum(tenantsTotal.total, 0),
      usuariosTotal: safeNum(usuariosRow.total, 0),
      facturasTotal: safeNum(facturasRow.total, 0),
      nuevosEsteMes: safeNum(nuevosEsteMes.total, 0),
      suscripcionesPorPlan: suscripcionesPorPlan || [],
    };

    res.render('superadmin/dashboard', {
      stats,
      tenants: tenants || [],
      pageTitle: 'Superadmin Dashboard',
    });
  } catch (err) {
    console.error('Superadmin dashboard error:', err.message);
    res.status(500).render('error', { error: { message: 'Error al cargar el dashboard de superadmin', stack: process.env.NODE_ENV === 'development' ? err.stack : '' } });
  }
});

// ---------------------------------------------------------------------------
// GET /superadmin/tenants  (Tenant management page)
// ---------------------------------------------------------------------------

router.get('/tenants', async (req, res) => {
  try {
    const [tenants] = await db.query(
      `SELECT
         t.id, t.nombre, t.subdominio, t.plan, t.activo,
         t.email_admin, t.telefono, t.ruc, t.created_at, t.updated_at,
         t.modulos_habilitados,
         (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id AND u.rol != 'superadmin') AS usuarios_count,
         ts.plan AS sub_plan, ts.precio_mensual, ts.estado AS suscripcion_estado,
         ts.fecha_inicio AS sub_inicio, ts.fecha_fin AS sub_fin, ts.metodo_pago
       FROM tenants t
       LEFT JOIN tenant_suscripciones ts ON ts.tenant_id = t.id
       ORDER BY t.created_at DESC`
    );

    // Load available plans
    let planes = [];
    try {
      const [p] = await db.query('SELECT * FROM planes_saas WHERE activo = true ORDER BY precio_anual ASC');
      planes = p || [];
    } catch (_) {}

    res.render('superadmin/tenants', {
      tenants: tenants || [],
      planes,
      pageTitle: 'Gestión de Tenants',
      defaultModules: defaultModules(),
    });
  } catch (err) {
    console.error('Superadmin tenants error:', err.message);
    res.status(500).render('error', { error: { message: 'Error al cargar la lista de tenants', stack: process.env.NODE_ENV === 'development' ? err.stack : '' } });
  }
});

// ---------------------------------------------------------------------------
// GET /superadmin/billing  (Billing / P&L page)
// ---------------------------------------------------------------------------

router.get('/billing', async (req, res) => {
  try {
    // Ingresos por tenant (suscripciones activas)
    const [ingresosPorTenant] = await db.query(
      `SELECT
         t.nombre, t.subdominio,
         ts.plan, ts.precio_mensual, ts.estado, ts.fecha_inicio
       FROM tenant_suscripciones ts
       JOIN tenants t ON t.id = ts.tenant_id
       ORDER BY ts.precio_mensual DESC`
    );

    // Totales
    const [[totales]] = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN estado = 'activa' THEN precio_mensual ELSE 0 END), 0) AS mrr_activo,
         COALESCE(SUM(CASE WHEN estado = 'prueba' THEN precio_mensual ELSE 0 END), 0) AS mrr_prueba,
         COUNT(CASE WHEN estado = 'activa' THEN 1 END) AS subs_activas,
         COUNT(CASE WHEN estado = 'prueba' THEN 1 END) AS subs_prueba,
         COUNT(CASE WHEN estado = 'vencida' THEN 1 END) AS subs_vencidas
       FROM tenant_suscripciones`
    );

    // Gastos del SaaS owner (hardcoded defaults - the superadmin can see these)
    const gastosSaas = [
      { concepto: 'Supabase (PostgreSQL)', tipo: 'fijo', monto: 25.00, moneda: 'USD', frecuencia: 'mensual' },
      { concepto: 'Vercel (Hosting)', tipo: 'fijo', monto: 20.00, moneda: 'USD', frecuencia: 'mensual' },
      { concepto: 'OpenAI API (DalIA)', tipo: 'variable', monto: 15.00, moneda: 'USD', frecuencia: 'mensual' },
      { concepto: 'Nubefact (OSE SUNAT)', tipo: 'variable', monto: 10.00, moneda: 'USD', frecuencia: 'mensual' },
      { concepto: 'Dominio mirestconia.com', tipo: 'fijo', monto: 1.00, moneda: 'USD', frecuencia: 'mensual' },
    ];

    const totalGastoUSD = gastosSaas.reduce((s, g) => s + g.monto, 0);
    const mrr = safeNum(totales.mrr_activo);
    const ebitda = safeNum(mrr - (totalGastoUSD * 3.8)); // approx PEN conversion

    // Load plans
    let planes = [];
    try {
      const [p] = await db.query('SELECT * FROM planes_saas WHERE activo = true ORDER BY precio_anual ASC');
      planes = p || [];
    } catch (_) {}

    res.render('superadmin/billing', {
      ingresosPorTenant: ingresosPorTenant || [],
      totales,
      gastosSaas,
      totalGastoUSD: safeNum(totalGastoUSD),
      mrr,
      ebitda,
      planes,
      pageTitle: 'Billing & Contabilidad',
    });
  } catch (err) {
    console.error('Superadmin billing error:', err.message);
    res.status(500).render('error', { error: { message: 'Error al cargar la vista de billing', stack: process.env.NODE_ENV === 'development' ? err.stack : '' } });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/tenants  (Create tenant)
// ---------------------------------------------------------------------------

router.post('/tenants', async (req, res) => {
  try {
    const { nombre, subdominio, email_admin, plan, precio_mensual, telefono, ruc } = req.body;

    if (!nombre || !subdominio || !email_admin) {
      return res.status(400).json({ error: 'nombre, subdominio y email_admin son requeridos' });
    }

    const planValue = plan || 'free';
    const precioValue = Number(precio_mensual) || 0;

    // Insert tenant
    const [result] = await db.query(
      `INSERT INTO tenants (nombre, subdominio, plan, email_admin, telefono, ruc, activo, fecha_inicio, modulos_habilitados)
       VALUES (?, ?, ?, ?, ?, ?, true, CURRENT_DATE, ?)
       RETURNING id`,
      [nombre, subdominio.toLowerCase().replace(/\s+/g, ''), planValue, email_admin, telefono || null, ruc || null, JSON.stringify(defaultModules())]
    );

    const tenantId = result.insertId;

    // Insert subscription
    await db.query(
      `INSERT INTO tenant_suscripciones (tenant_id, plan, precio_mensual, fecha_inicio, estado)
       VALUES (?, ?, ?, CURRENT_DATE, ?)`,
      [tenantId, planValue, precioValue, precioValue > 0 ? 'activa' : 'prueba']
    );

    res.status(201).json({ ok: true, id: tenantId, message: 'Tenant creado exitosamente' });
  } catch (err) {
    console.error('Create tenant error:', err.message);
    if (err.message.includes('unique') || err.message.includes('duplicate')) {
      return res.status(409).json({ error: 'El subdominio ya existe' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/superadmin/tenants/:id  (Update tenant)
// ---------------------------------------------------------------------------

router.put('/tenants/:id', async (req, res) => {
  try {
    const tenantId = Number(req.params.id);
    const { nombre, email_admin, plan, precio_mensual, telefono, ruc } = req.body;

    await db.query(
      `UPDATE tenants SET
         nombre = COALESCE(?, nombre),
         email_admin = COALESCE(?, email_admin),
         plan = COALESCE(?, plan),
         telefono = COALESCE(?, telefono),
         ruc = COALESCE(?, ruc),
         updated_at = NOW()
       WHERE id = ?`,
      [nombre || null, email_admin || null, plan || null, telefono || null, ruc || null, tenantId]
    );

    // Update subscription price if provided
    if (precio_mensual !== undefined && precio_mensual !== '') {
      const precio = Number(precio_mensual);
      const [subCheck] = await db.query('SELECT id FROM tenant_suscripciones WHERE tenant_id = ?', [tenantId]);
      if (subCheck.length > 0) {
        await db.query(
          `UPDATE tenant_suscripciones SET precio_mensual = ?, plan = COALESCE(?, plan), updated_at = NOW()
           WHERE tenant_id = ?`,
          [precio, plan || null, tenantId]
        );
      } else {
        await db.query(
          `INSERT INTO tenant_suscripciones (tenant_id, plan, precio_mensual, fecha_inicio, estado)
           VALUES (?, ?, ?, CURRENT_DATE, ?)`,
          [tenantId, plan || 'free', precio, precio > 0 ? 'activa' : 'prueba']
        );
      }
    }

    res.json({ ok: true, message: 'Tenant actualizado' });
  } catch (err) {
    console.error('Update tenant error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/tenants/:id/toggle  (Enable / disable tenant)
// ---------------------------------------------------------------------------

router.post('/tenants/:id/toggle', async (req, res) => {
  try {
    const tenantId = Number(req.params.id);
    const [[tenant]] = await db.query('SELECT id, activo FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const nuevoEstado = !tenant.activo;
    await db.query('UPDATE tenants SET activo = ?, updated_at = NOW() WHERE id = ?', [nuevoEstado, tenantId]);

    res.json({ ok: true, activo: nuevoEstado, message: nuevoEstado ? 'Tenant activado' : 'Tenant desactivado' });
  } catch (err) {
    console.error('Toggle tenant error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/tenants/:id/modules  (Update enabled modules)
// ---------------------------------------------------------------------------

router.post('/tenants/:id/modules', async (req, res) => {
  try {
    const tenantId = Number(req.params.id);
    const modulos = req.body.modulos;

    if (!modulos || typeof modulos !== 'object') {
      return res.status(400).json({ error: 'modulos debe ser un objeto JSON' });
    }

    // Merge with defaults to ensure all keys exist
    const merged = { ...defaultModules(), ...modulos };

    await db.query(
      'UPDATE tenants SET modulos_habilitados = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(merged), tenantId]
    );

    res.json({ ok: true, modulos: merged });
  } catch (err) {
    console.error('Update modules error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/superadmin/tenants/:id  (Get single tenant detail — for edit modal)
// ---------------------------------------------------------------------------

router.get('/tenants/:id', async (req, res) => {
  try {
    const tenantId = Number(req.params.id);
    const [[tenant]] = await db.query(
      `SELECT t.*, ts.plan AS sub_plan, ts.precio_mensual, ts.estado AS suscripcion_estado
       FROM tenants t
       LEFT JOIN tenant_suscripciones ts ON ts.tenant_id = t.id
       WHERE t.id = ?`,
      [tenantId]
    );
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Subscriptions Management
// ---------------------------------------------------------------------------

// GET /api/superadmin/suscripciones - all subscriptions with tenant info
router.get('/suscripciones', async (req, res) => {
  try {
    const [subs] = await db.query(`
      SELECT ts.*, t.nombre as tenant_nombre, t.email_admin, t.activo as tenant_activo
      FROM tenant_suscripciones ts
      JOIN tenants t ON t.id = ts.tenant_id
      ORDER BY ts.created_at DESC
      LIMIT 200
    `);
    res.json(subs || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/suscripciones/alertas - expiring + exhausted tenants
router.get('/suscripciones/alertas', async (req, res) => {
  try {
    const alertas = [];

    // Tenants expiring in 7 days
    const [porVencer] = await db.query(`
      SELECT ts.*, t.nombre as tenant_nombre, t.email_admin
      FROM tenant_suscripciones ts
      JOIN tenants t ON t.id = ts.tenant_id
      WHERE ts.estado = 'activa'
        AND ts.fecha_fin <= NOW() + INTERVAL '7 days'
        AND ts.fecha_fin > NOW()
      ORDER BY ts.fecha_fin ASC
    `);
    (porVencer || []).forEach(s => {
      const dias = Math.ceil((new Date(s.fecha_fin) - Date.now()) / (1000 * 60 * 60 * 24));
      alertas.push({
        tipo: 'por_vencer',
        nivel: dias <= 2 ? 'critico' : 'warning',
        tenant: s.tenant_nombre,
        email: s.email_admin,
        mensaje: `Suscripcion vence en ${dias} dia${dias !== 1 ? 's' : ''}`,
        fecha_fin: s.fecha_fin,
        tenant_id: s.tenant_id
      });
    });

    // Tenants with >90% token usage
    const [tokenAltas] = await db.query(`
      SELECT ts.tenant_id, ts.tokens_total, ts.tokens_consumidos, t.nombre as tenant_nombre, t.email_admin
      FROM tenant_suscripciones ts
      JOIN tenants t ON t.id = ts.tenant_id
      WHERE ts.estado IN ('activa', 'prueba')
        AND ts.tokens_total > 0
        AND ts.tokens_consumidos >= ts.tokens_total * 0.9
    `);
    (tokenAltas || []).forEach(s => {
      const pct = Math.round((s.tokens_consumidos / s.tokens_total) * 100);
      alertas.push({
        tipo: 'tokens_agotandose',
        nivel: pct >= 100 ? 'critico' : 'warning',
        tenant: s.tenant_nombre,
        email: s.email_admin,
        mensaje: `Tokens IA al ${pct}% (${s.tokens_consumidos}/${s.tokens_total})`,
        tenant_id: s.tenant_id
      });
    });

    // Already expired
    const [vencidas] = await db.query(`
      SELECT ts.*, t.nombre as tenant_nombre, t.email_admin
      FROM tenant_suscripciones ts
      JOIN tenants t ON t.id = ts.tenant_id
      WHERE ts.estado = 'activa' AND ts.fecha_fin < NOW()
    `);
    (vencidas || []).forEach(s => {
      alertas.push({
        tipo: 'vencida',
        nivel: 'critico',
        tenant: s.tenant_nombre,
        email: s.email_admin,
        mensaje: 'Suscripcion vencida — acceso deberia desactivarse',
        fecha_fin: s.fecha_fin,
        tenant_id: s.tenant_id
      });
    });

    res.json(alertas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/superadmin/suscripciones/:id/extender - extend subscription
router.put('/suscripciones/:id/extender', async (req, res) => {
  try {
    const { dias } = req.body;
    const d = parseInt(dias) || 30;
    await db.query(
      `UPDATE tenant_suscripciones SET fecha_fin = fecha_fin + INTERVAL '1 day' * ? WHERE id = ?`,
      [d, req.params.id]
    );
    res.json({ ok: true, dias_extendidos: d });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/superadmin/suscripciones/:id/cancelar - cancel subscription
router.put('/suscripciones/:id/cancelar', async (req, res) => {
  try {
    await db.query(
      `UPDATE tenant_suscripciones SET estado = 'cancelada' WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Login History & Security (superadmin view)
// ---------------------------------------------------------------------------

// GET /api/superadmin/login-history - recent logins across all tenants
router.get('/login-history', async (req, res) => {
  try {
    const [logins] = await db.query(`
      SELECT lh.*, u.usuario, u.rol, t.nombre as tenant_nombre
      FROM login_history lh
      LEFT JOIN usuarios u ON u.id = lh.user_id
      LEFT JOIN tenants t ON t.id = lh.tenant_id
      ORDER BY lh.created_at DESC
      LIMIT 100
    `);
    res.json(logins || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/login-history/suspicious - failed + new country logins
router.get('/login-history/suspicious', async (req, res) => {
  try {
    const [suspicious] = await db.query(`
      SELECT lh.*, u.usuario, t.nombre as tenant_nombre
      FROM login_history lh
      LEFT JOIN usuarios u ON u.id = lh.user_id
      LEFT JOIN tenants t ON t.id = lh.tenant_id
      WHERE lh.success = false
        AND lh.created_at > NOW() - INTERVAL '7 days'
      ORDER BY lh.created_at DESC
      LIMIT 50
    `);
    res.json(suspicious || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/audit-log - recent audit entries
router.get('/audit-log', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id;
    const where = tenantId ? 'WHERE al.tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];
    const [logs] = await db.query(`
      SELECT al.*, u.usuario, t.nombre as tenant_nombre
      FROM audit_log al
      LEFT JOIN usuarios u ON u.id = al.user_id
      LEFT JOIN tenants t ON t.id = al.tenant_id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT 100
    `, params);
    res.json(logs || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Solicitudes de registro (onboarding trial)
// ---------------------------------------------------------------------------
const { getSolicitudesPendientes, aprobarSolicitud, rechazarSolicitud } = require('../services/verificacion');
const { enviarEmailAprobacion, enviarEmailRechazo, notificarSuperadminWhatsApp } = require('../services/notificaciones-trial');

// GET /superadmin/solicitudes — List pending verification requests
router.get('/solicitudes', async (req, res) => {
  try {
    const pendientes = await getSolicitudesPendientes();
    res.json({ solicitudes: pendientes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /superadmin/solicitudes/:id/aprobar
router.post('/solicitudes/:id/aprobar', async (req, res) => {
  try {
    const result = await aprobarSolicitud(Number(req.params.id), req.session.user.id);
    if (result.error) return res.status(400).json(result);

    // Send approval notification
    if (result.email) {
      enviarEmailAprobacion(result.email, result.nombre).catch(() => {});
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /superadmin/solicitudes/:id/rechazar
router.post('/solicitudes/:id/rechazar', async (req, res) => {
  try {
    const { motivo } = req.body;
    const result = await rechazarSolicitud(Number(req.params.id), req.session.user.id, motivo);
    if (result.error) return res.status(400).json(result);

    // Send rejection notification
    if (result.email) {
      enviarEmailRechazo(result.email, result.nombre, motivo).catch(() => {});
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
