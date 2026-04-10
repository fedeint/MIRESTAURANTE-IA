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
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates an admin user for a new tenant.
 * Returns { usuario, pin } for inclusion in welcome email.
 */
async function crearUsuarioAdmin(tenantId, emailAdmin, nombreRestaurante) {
  // Generate username from email (part before @)
  const usuario = emailAdmin.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');

  // Generate 6-digit PIN
  const pinBuffer = crypto.randomBytes(4);
  const pin = String(pinBuffer.readUInt32BE(0) % 1000000).padStart(6, '0');

  const passwordHash = await bcrypt.hash(pin, 10);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

  // Check if user already exists for this tenant
  const [existing] = await db.query(
    'SELECT id, usuario FROM usuarios WHERE tenant_id = ? AND (usuario = ? OR google_email = ?)',
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
// GET /superadmin/analytics/dallia (DallIA Analytics - PostHog)
// ---------------------------------------------------------------------------

router.get('/analytics/dallia', async (req, res) => {
  try {
    const posthogProjectId = process.env.POSTHOG_PROJECT_ID || '';
    const posthogHost = process.env.POSTHOG_API_HOST || 'https://us.i.posthog.com';

    res.render('superadmin/analytics-dallia', {
      pageTitle: '📊 DallIA Analytics',
      posthogHost,
      posthogProjectId,
      dateRange: req.query.date || '7d',
      tenantId: req.query.tenant || 'all'
    });
  } catch (err) {
    console.error('Analytics DallIA error:', err.message);
    res.status(500).render('error', {
      error: { message: 'Error al cargar DallIA analytics', stack: process.env.NODE_ENV === 'development' ? err.stack : '' }
    });
  }
});

// ---------------------------------------------------------------------------
// GET /superadmin/analytics/infrastructure (Grafana Dashboards)
// ---------------------------------------------------------------------------

router.get('/analytics/infrastructure', async (req, res) => {
  try {
    const grafanaUrl = process.env.GRAFANA_INSTANCE_URL || '';
    const grafanaOrgSlug = process.env.GRAFANA_ORG_SLUG || 'mirestconia';

    // Dashboard IDs (creados en Grafana)
    const dashboards = {
      http: process.env.GRAFANA_DASHBOARD_HTTP_ID || 'abc123',
      database: process.env.GRAFANA_DASHBOARD_DB_ID || 'def456',
      openai: process.env.GRAFANA_DASHBOARD_OPENAI_ID || 'ghi789',
      vercel: process.env.GRAFANA_DASHBOARD_VERCEL_ID || 'jkl012'
    };

    res.render('superadmin/analytics-infrastructure', {
      pageTitle: '🔧 Infrastructure & System Health',
      grafanaUrl,
      grafanaOrgSlug,
      dashboards
    });
  } catch (err) {
    console.error('Analytics Infrastructure error:', err.message);
    res.status(500).render('error', {
      error: { message: 'Error al cargar infrastructure analytics', stack: process.env.NODE_ENV === 'development' ? err.stack : '' }
    });
  }
});

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
         t.estado_trial, t.trial_inicio, t.trial_fin,
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
    const { nombre, subdominio, email_admin, plan, precio_mensual, telefono, ruc, tipo } = req.body;

    if (!nombre || !subdominio || !email_admin) {
      return res.status(400).json({ error: 'nombre, subdominio y email_admin son requeridos' });
    }

    const esTrial = tipo !== 'produccion';
    const planValue = plan || (esTrial ? 'free' : 'pro');
    const precioValue = Number(precio_mensual) || 0;
    const subdominionLimpio = subdominio.toLowerCase().replace(/[^a-z0-9-]/g, '');

    // Validar que el slug no colisione con rutas reservadas
    const { RESERVED_PATHS } = require('../middleware/tenant');
    if (RESERVED_PATHS.has(subdominionLimpio)) {
        return res.status(400).json({ error: `El nombre "${subdominionLimpio}" está reservado. Elige otro.` });
    }

    const ahora = new Date();
    const trialFin = esTrial ? new Date(ahora.getTime() + 15 * 24 * 60 * 60 * 1000) : null;

    // Insert tenant
    const [result] = await db.query(
      `INSERT INTO tenants (nombre, subdominio, plan, email_admin, telefono, ruc, activo, fecha_inicio, modulos_habilitados, estado_trial, trial_inicio, trial_fin)
       VALUES (?, ?, ?, ?, ?, ?, true, CURRENT_DATE, ?, 'activo', ?, ?)
       RETURNING id`,
      [nombre, subdominionLimpio, planValue, email_admin, telefono || null, ruc || null, JSON.stringify(defaultModules()), ahora.toISOString(), trialFin ? trialFin.toISOString() : null]
    );

    const tenantId = result.insertId;

    // Insert subscription
    await db.query(
      `INSERT INTO tenant_suscripciones (tenant_id, plan, precio_mensual, fecha_inicio, estado)
       VALUES (?, ?, ?, CURRENT_DATE, ?)`,
      [tenantId, planValue, precioValue, esTrial ? 'prueba' : 'activa']
    );

    // Create admin user for the tenant
    let credenciales = null;
    try {
      credenciales = await crearUsuarioAdmin(tenantId, email_admin, nombre);
    } catch (userErr) {
      console.error('[Superadmin] Create admin user failed:', userErr.message);
    }

    // Send welcome email with subdomain + credentials
    try {
      const { enviarEmailBienvenidaSubdominio } = require('../services/notificaciones-trial');
      await enviarEmailBienvenidaSubdominio(email_admin, nombre, subdominionLimpio, esTrial, credenciales);
    } catch (emailErr) {
      console.error('[Superadmin] Welcome email failed:', emailErr.message);
    }

    // Sync to CRM
    try {
      const crmSync = require('../services/crm-sync');
      await crmSync.onTenantCreado({ email_admin, nombre, subdominio: subdominionLimpio, precio: precioValue });
    } catch (_) {}

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
// DELETE /api/superadmin/tenants/:id  (Soft-delete: deactivate tenant)
// ---------------------------------------------------------------------------

router.delete('/tenants/:id', async (req, res) => {
  try {
    const tenantId = Number(req.params.id);
    const [[tenant]] = await db.query('SELECT id, nombre, activo FROM tenants WHERE id = ?', [tenantId]);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    // Soft-delete: deactivate and mark as expirado
    await db.query(
      `UPDATE tenants SET activo = false, estado_trial = 'expirado', updated_at = NOW() WHERE id = ?`,
      [tenantId]
    );

    // Deactivate subscription
    await db.query(
      `UPDATE tenant_suscripciones SET estado = 'cancelada' WHERE tenant_id = ? AND estado IN ('activa', 'prueba')`,
      [tenantId]
    );

    res.json({ ok: true, message: 'Tenant desactivado exitosamente' });
  } catch (err) {
    console.error('Delete tenant error:', err.message);
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
const { enviarEmailAprobacion, enviarEmailRechazo, notificarSuperadminWhatsApp } = require('../services/notificaciones-trial');

// GET /superadmin/solicitudes — HTML panel (replaced from JSON stub)
// POST routes below handle approve/reject/info for both /superadmin and /api/superadmin mounts

// === MÓDULOS POR TENANT ===

// PUT /api/superadmin/tenant/:id/modulos — Toggle modules for a tenant
router.put('/tenant/:id/modulos', async (req, res) => {
  try {
    const { modulos } = req.body;
    if (!modulos || typeof modulos !== 'object') {
      return res.status(400).json({ error: 'modulos debe ser un objeto JSON' });
    }
    const [[sub]] = await db.query(
      'SELECT modulos_habilitados FROM tenant_suscripciones WHERE tenant_id=? ORDER BY id DESC LIMIT 1',
      [req.params.id]
    );
    const current = sub?.modulos_habilitados || {};
    const merged = { ...current, ...modulos };
    await db.query(
      'UPDATE tenant_suscripciones SET modulos_habilitados=?::jsonb WHERE tenant_id=?',
      [JSON.stringify(merged), req.params.id]
    );
    res.json({ message: 'Modulos actualizados', modulos: merged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/superadmin/tenant/:id/modulos — Get modules for a tenant
router.get('/tenant/:id/modulos', async (req, res) => {
  try {
    const [[sub]] = await db.query(
      'SELECT modulos_habilitados FROM tenant_suscripciones WHERE tenant_id=? ORDER BY id DESC LIMIT 1',
      [req.params.id]
    );
    res.json(sub?.modulos_habilitados || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// GET /superadmin/solicitudes
// ---------------------------------------------------------------------------
router.get('/solicitudes', async (req, res) => {
  try {
    const [solicitudes] = await db.query(
      `SELECT
         sr.id, sr.estado, sr.nombre_restaurante, sr.nombre_representante, sr.tipo_negocio,
         sr.direccion, sr.dni, sr.cargo, sr.ruc, sr.latitud, sr.longitud,
         sr.foto_local_url, sr.fotos, sr.video_local_url, sr.notas_superman, sr.plan_asignado,
         sr.telefono_solicitante, sr.created_at, sr.intento,
         sr.motivo_rechazo,
         t.nombre AS tenant_nombre, t.subdominio,
         u.nombre AS usuario_nombre, u.google_email, u.google_avatar
       FROM solicitudes_registro sr
       JOIN tenants t ON t.id = sr.tenant_id
       JOIN usuarios u ON u.id = sr.usuario_id
       ORDER BY
         CASE sr.estado WHEN 'pendiente' THEN 0 WHEN 'revision' THEN 1 ELSE 2 END,
         sr.created_at DESC`
    );

    const pendientes = (solicitudes || []).filter(s => s.estado === 'pendiente' || s.estado === 'revision');
    const procesadas = (solicitudes || []).filter(s => s.estado !== 'pendiente' && s.estado !== 'revision');

    res.render('superadmin/solicitudes', {
      pendientes,
      procesadas,
      pageTitle: 'Solicitudes de Registro',
    });
  } catch (err) {
    console.error('Superadmin solicitudes error:', err.message);
    res.status(500).render('error', { error: { message: 'Error al cargar solicitudes', stack: process.env.NODE_ENV === 'development' ? err.stack : '' } });
  }
});

// ---------------------------------------------------------------------------
// POST /superadmin/solicitudes/:id/aprobar
// ---------------------------------------------------------------------------
router.post('/solicitudes/:id/aprobar', async (req, res) => {
  try {
    const solicitudId = Number(req.params.id);
    const { plan_asignado, notas } = req.body;
    const plan = plan_asignado || 'free';

    const [[solicitud]] = await db.query(
      `SELECT sr.*, t.id AS tid, u.google_email, u.nombre AS unom
       FROM solicitudes_registro sr
       JOIN tenants t ON t.id = sr.tenant_id
       JOIN usuarios u ON u.id = sr.usuario_id
       WHERE sr.id = ?`, [solicitudId]
    );

    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

    const ahora = new Date();
    const trialFin = new Date(ahora);
    trialFin.setDate(trialFin.getDate() + 15); // 15 días de trial

    const modulosFromBody = req.body.modulos || {};
    const modulosDefault = JSON.stringify({
      mesas: modulosFromBody.mesas !== undefined ? !!modulosFromBody.mesas : true,
      cocina: modulosFromBody.cocina !== undefined ? !!modulosFromBody.cocina : true,
      almacen: modulosFromBody.almacen !== undefined ? !!modulosFromBody.almacen : true,
      sunat: modulosFromBody.sunat !== undefined ? !!modulosFromBody.sunat : false,
      delivery: modulosFromBody.delivery !== undefined ? !!modulosFromBody.delivery : false,
      reservas: false,
      facturacion: modulosFromBody.facturacion !== undefined ? !!modulosFromBody.facturacion : true,
      caja: modulosFromBody.caja !== undefined ? !!modulosFromBody.caja : true,
      reportes: modulosFromBody.reportes !== undefined ? !!modulosFromBody.reportes : true,
      chat_ia: modulosFromBody.chat_ia !== undefined ? !!modulosFromBody.chat_ia : true,
    });

    await db.query(
      `UPDATE tenants SET
         estado_trial = 'activo', plan = ?,
         trial_inicio = ?, trial_fin = ?,
         modulos_habilitados = COALESCE(modulos_habilitados, ?)
       WHERE id = ?`,
      [plan, ahora.toISOString(), trialFin.toISOString(), modulosDefault, solicitud.tid]
    );

    const revisadoPor = req.session?.user?.id || null;
    await db.query(
      `UPDATE solicitudes_registro SET
         estado = 'aprobado', plan_asignado = ?, notas_superman = ?,
         revisado_por = ?, revisado_at = NOW()
       WHERE id = ?`,
      [plan, notas || null, revisadoPor, solicitudId]
    );

    // Create admin user for the tenant
    let credenciales = null;
    try {
      credenciales = await crearUsuarioAdmin(solicitud.tid, solicitud.google_email, solicitud.nombre_restaurante || solicitud.unom);
    } catch (userErr) {
      console.error('[Superadmin] Create admin user failed:', userErr.message);
    }

    // Send welcome email with subdomain + credentials
    try {
      const { enviarEmailBienvenidaSubdominio } = require('../services/notificaciones-trial');
      const [[tenantData]] = await db.query('SELECT subdominio FROM tenants WHERE id = ?', [solicitud.tid]);
      const subdominio = tenantData?.subdominio || '';
      await enviarEmailBienvenidaSubdominio(
        solicitud.google_email,
        solicitud.unom || solicitud.nombre_restaurante,
        subdominio,
        true, // siempre trial desde solicitud
        credenciales
      );
      console.log('[Superadmin] Welcome email sent to', solicitud.google_email);
    } catch (emailErr) {
      console.error('[Superadmin] Welcome email failed:', emailErr.message);
    }

    // Sync to CRM
    try {
      const crmSync = require('../services/crm-sync');
      await crmSync.onTrialAprobado({
        email: solicitud.google_email,
        nombre: solicitud.unom || solicitud.nombre_restaurante,
        restaurante: solicitud.nombre_restaurante,
        telefono: solicitud.telefono_solicitante,
      });
    } catch (_) {}

    res.json({ ok: true, message: 'Solicitud aprobada. Trial activo por 15 días.' });
  } catch (err) {
    console.error('Aprobar solicitud error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /superadmin/solicitudes/:id/rechazar
// ---------------------------------------------------------------------------
router.post('/solicitudes/:id/rechazar', async (req, res) => {
  try {
    const solicitudId = Number(req.params.id);
    const { motivo } = req.body;

    const [[solicitud]] = await db.query(
      'SELECT sr.*, u.google_email, u.nombre AS unom FROM solicitudes_registro sr JOIN usuarios u ON u.id = sr.usuario_id WHERE sr.id = ?',
      [solicitudId]
    );
    if (!solicitud) return res.status(404).json({ error: 'No encontrado' });

    const revisadoPor = req.session?.user?.id || null;
    await db.query(
      `UPDATE solicitudes_registro SET
         estado = 'rechazado', motivo_rechazo = ?, revisado_por = ?, revisado_at = NOW()
       WHERE id = ?`,
      [motivo || 'Sin motivo especificado', revisadoPor, solicitudId]
    );

    try {
      const { enviarEmailRechazo } = require('../services/notificaciones-trial');
      await enviarEmailRechazo(solicitud.google_email, solicitud.unom, motivo);
    } catch (_) {}

    res.json({ ok: true, message: 'Solicitud rechazada.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /superadmin/solicitudes/:id/info
// ---------------------------------------------------------------------------
router.post('/solicitudes/:id/info', async (req, res) => {
  try {
    const solicitudId = Number(req.params.id);
    const { mensaje } = req.body;

    await db.query(
      `UPDATE solicitudes_registro SET
         estado = 'revision', notas_superman = ?, revisado_at = NOW()
       WHERE id = ?`,
      [mensaje || null, solicitudId]
    );

    res.json({ ok: true, message: 'Solicitud marcada en revisión.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================================
// BÓVEDA DE CONTRASEÑAS — /superadmin/boveda
// Cifrado AES-256-GCM server-side. Acceso protegido por biometría WebAuthn.
// ===========================================================================

const {
  generateAuthenticationOptions: genAuthOpts,
  verifyAuthenticationResponse: verifyAuthResp,
} = require('@simplewebauthn/server');

const VAULT_RP_ID     = process.env.WEBAUTHN_RP_ID  || 'mirestconia.com';
const VAULT_ORIGIN    = process.env.WEBAUTHN_ORIGIN  || 'https://mirestconia.com';
const VAULT_TOKEN_TTL = 30 * 60 * 1000; // 30 min

// In-memory short-lived tokens: token → { userId, expiresAt }
const vaultSessions = new Map();

// Purge expired tokens every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [t, v] of vaultSessions) {
    if (v.expiresAt < now) vaultSessions.delete(t);
  }
}, 5 * 60 * 1000);

// AES-256-GCM helpers -------------------------------------------------------
function vaultKey() {
  const secret = process.env.VAULT_SECRET;
  if (!secret) throw new Error('VAULT_SECRET no configurado');
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

function encryptVault(plaintext) {
  const iv  = crypto.randomBytes(12);
  const key = vaultKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data   = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return JSON.stringify({
    iv:   iv.toString('base64'),
    tag:  tag.toString('base64'),
    data: data.toString('base64'),
  });
}

function decryptVault(encrypted) {
  const { iv, tag, data } = JSON.parse(encrypted);
  const key = vaultKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', key, Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return decipher.update(Buffer.from(data, 'base64')) + decipher.final('utf8');
}

// Middleware: validate x-vault-token header
function requireVaultToken(req, res, next) {
  const token = req.headers['x-vault-token'];
  if (!token) return res.status(401).json({ error: 'Vault token requerido' });
  const session = vaultSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    vaultSessions.delete(token);
    return res.status(401).json({ error: 'Vault token expirado' });
  }
  req.vaultUserId = session.userId;
  next();
}

// GET /superadmin/boveda — render view
const { renderForDevice } = require('../lib/deviceRouter');
router.get('/boveda', (req, res) => {
  renderForDevice(req, res, 'superadmin/boveda', {});
});

// GET /superadmin/boveda/auth/options — WebAuthn challenge for vault unlock
router.get('/boveda/auth/options', async (req, res) => {
  try {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const [creds] = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = ?',
      [user.id]
    );

    if (!creds || creds.length === 0) {
      return res.status(404).json({ error: 'Sin biometría registrada. Ve a Perfil → Seguridad para activarla.' });
    }

    const allowCredentials = creds.map(c => ({
      id: c.credential_id,
      type: 'public-key',
    }));

    const options = await genAuthOpts({
      rpID: VAULT_RP_ID,
      allowCredentials,
      userVerification: 'required',
    });

    // Store challenge scoped with prefix so it doesn't collide with login challenges
    await db.query(
      `INSERT INTO webauthn_challenges (user_id, challenge, expires_at)
       VALUES (?, ?, NOW() + INTERVAL '5 minutes')
       ON CONFLICT (user_id) DO UPDATE SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at`,
      [user.id, 'vault::' + options.challenge]
    );

    options._userId = user.id;
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /superadmin/boveda/auth/verify — verify biometric → vault token
router.post('/boveda/auth/verify', async (req, res) => {
  try {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const [[challengeRow]] = await db.query(
      `SELECT challenge FROM webauthn_challenges WHERE user_id = ? AND expires_at > NOW()`,
      [user.id]
    );
    if (!challengeRow) return res.status(400).json({ error: 'Challenge expirado' });

    const rawChallenge = challengeRow.challenge.replace(/^vault::/, '');

    const [[cred]] = await db.query(
      `SELECT credential_id, public_key, sign_count
       FROM webauthn_credentials WHERE user_id = ? LIMIT 1`,
      [user.id]
    );
    if (!cred) return res.status(404).json({ error: 'Sin credencial biométrica' });

    const verification = await verifyAuthResp({
      response: req.body,
      expectedChallenge: rawChallenge,
      expectedOrigin: VAULT_ORIGIN,
      expectedRPID: VAULT_RP_ID,
      credential: {
        id: cred.credential_id,
        publicKey: cred.public_key instanceof Buffer
          ? cred.public_key
          : Buffer.from(cred.public_key),
        counter: cred.sign_count || 0,
      },
    });

    if (!verification.verified) {
      return res.status(401).json({ error: 'Biometría no verificada' });
    }

    // Update sign count
    await db.query(
      'UPDATE webauthn_credentials SET sign_count = ? WHERE user_id = ?',
      [verification.authenticationInfo?.newCounter ?? 0, user.id]
    );
    await db.query('DELETE FROM webauthn_challenges WHERE user_id = ?', [user.id]);

    // Issue vault session token
    const token = crypto.randomBytes(32).toString('hex');
    vaultSessions.set(token, { userId: user.id, expiresAt: Date.now() + VAULT_TOKEN_TTL });

    res.json({ ok: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /superadmin/boveda/items — list all items (decrypted metadata, NOT password)
router.get('/boveda/items', requireVaultToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, categoria, titulo, usuario, url, notas, created_at, updated_at
       FROM vault_items ORDER BY categoria, titulo`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /superadmin/boveda/items/:id — full item with decrypted password
router.get('/boveda/items/:id', requireVaultToken, async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT * FROM vault_items WHERE id = ?',
      [Number(req.params.id)]
    );
    if (!row) return res.status(404).json({ error: 'Item no encontrado' });

    const plaintext = decryptVault(row.encrypted);
    const { password } = JSON.parse(plaintext);
    res.json({ ...row, encrypted: undefined, password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /superadmin/boveda/items — create item
router.post('/boveda/items', requireVaultToken, async (req, res) => {
  try {
    const { categoria, titulo, usuario, url, notas, password } = req.body;
    if (!titulo) return res.status(400).json({ error: 'titulo requerido' });

    const encrypted = encryptVault(JSON.stringify({ password: password || '' }));

    const [rows] = await db.query(
      `INSERT INTO vault_items (categoria, titulo, usuario, encrypted, url, notas)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [categoria || 'otros', titulo, usuario || null, encrypted, url || null, notas || null]
    );
    res.json({ ok: true, id: rows.insertId || rows[0]?.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /superadmin/boveda/items/:id — update item
router.put('/boveda/items/:id', requireVaultToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { categoria, titulo, usuario, url, notas, password } = req.body;
    if (!titulo) return res.status(400).json({ error: 'titulo requerido' });

    const encrypted = encryptVault(JSON.stringify({ password: password || '' }));

    await db.query(
      `UPDATE vault_items SET categoria = ?, titulo = ?, usuario = ?,
       encrypted = ?, url = ?, notas = ?, updated_at = NOW()
       WHERE id = ?`,
      [categoria || 'otros', titulo, usuario || null, encrypted, url || null, notas || null, id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /superadmin/boveda/items/:id — delete item
router.delete('/boveda/items/:id', requireVaultToken, async (req, res) => {
  try {
    await db.query('DELETE FROM vault_items WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
