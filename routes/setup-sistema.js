'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const CATEGORIAS_VALIDAS = [
  'Entradas', 'Fondos', 'Bebidas', 'Postres',
  'Bebidas calientes', 'Ensaladas', 'Otros'
];

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.redirect('/login');

    const [[tenant]] = await db.query(
      'SELECT setup_completado FROM tenants WHERE id = ?',
      [tenantId]
    );
    if (!tenant) return res.redirect('/login');
    if (tenant.setup_completado) return res.redirect('/');

    // Detect done state per step from real tables (best-effort)
    async function tableQuery(sql, params, fallback) {
      try {
        const [[row]] = await db.query(sql, params);
        return row;
      } catch (_) { return fallback; }
    }

    const dalliaRow = await tableQuery(
      'SELECT 1 AS ok FROM tenant_dallia_config WHERE tenant_id = ? LIMIT 1',
      [tenantId], null
    );
    const alertasRow = await tableQuery(
      'SELECT 1 AS ok FROM tenant_alertas_config WHERE tenant_id = ? LIMIT 1',
      [tenantId], null
    );
    const modulosRow = await tableQuery(
      'SELECT 1 AS ok FROM tenant_modulos_config WHERE tenant_id = ? LIMIT 1',
      [tenantId], null
    );
    const horariosRow = await tableQuery(
      'SELECT 1 AS ok FROM tenant_horarios_config WHERE tenant_id = ? LIMIT 1',
      [tenantId], null
    );

    const steps = [
      {
        key: 'dallia',
        title: 'Personalizar DalIA',
        sub: 'Nombre, tono, personalidad y capacidades',
        icon: '🤖', ic: 'ic-orange',
        href: '/config/dallia',
        done: !!dalliaRow
      },
      {
        key: 'alertas',
        title: 'Alertas y notificaciones',
        sub: 'Qué te avisa DalIA y por qué canal',
        icon: '🔔', ic: 'ic-yellow',
        href: '/config/alertas',
        done: !!alertasRow
      },
      {
        key: 'modulos',
        title: 'Módulos del sistema',
        sub: 'Activa solo los que usarás',
        icon: '🧩', ic: 'ic-blue',
        href: '/config/modulos',
        done: !!modulosRow
      },
      {
        key: 'horarios',
        title: 'Horarios de operación',
        sub: 'Apertura, cierre y días laborales',
        icon: '🕐', ic: 'ic-green',
        href: '/config/horarios',
        done: !!horariosRow
      },
      {
        key: 'tour',
        title: 'Onboarding tour',
        sub: 'Conoce el sistema en 2 minutos',
        icon: '🎓', ic: 'ic-purple',
        href: '/config/tour',
        done: false
      }
    ];

    const done = steps.filter(s => s.done).length;
    const total = steps.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    return res.render('setup-sistema', {
      user: req.session.user,
      steps,
      progress: { done, total, pct }
    });
  } catch (err) {
    console.error('[setup-sistema GET /]', err);
    return res.status(500).send('Error cargando el setup');
  }
});

// ─── POST /api/completar ─────────────────────────────────────────────────────
// Marks setup as completed (whether user finished all 5 steps or chose to skip).
router.post('/api/completar', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.status(401).json({ error: 'No autenticado' });
    await db.query('UPDATE tenants SET setup_completado = true WHERE id = ?', [tenantId]);
    return res.json({ ok: true, redirect: '/' });
  } catch (err) {
    console.error('[setup-sistema POST /api/completar]', err);
    return res.status(500).json({ error: 'Error completando setup' });
  }
});

// ─── POST /api/agregar-categoria ─────────────────────────────────────────────

router.post('/api/agregar-categoria', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.status(401).json({ error: 'No autenticado' });

    const { categoria } = req.body || {};
    if (!categoria || !CATEGORIAS_VALIDAS.includes(categoria)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }

    // Check if products already exist for this category
    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM productos WHERE tenant_id = ? AND categoria = ?',
      [tenantId, categoria]
    );

    if (parseInt(cnt) === 0) {
      // Insert placeholder product so the category is represented
      await db.query(
        `INSERT INTO productos (nombre, descripcion, precio, categoria, activo, tenant_id, emoji)
         VALUES (?, ?, ?, ?, false, ?, ?)`,
        [`Ejemplo ${categoria}`, `Producto de ejemplo en ${categoria}`, 0, categoria, tenantId, '🍽️']
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[setup-sistema POST /api/agregar-categoria]', err);
    return res.status(500).json({ error: 'Error agregando categoría' });
  }
});

// ─── POST /api/agregar-producto ──────────────────────────────────────────────

router.post('/api/agregar-producto', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.status(401).json({ error: 'No autenticado' });

    const { nombre, precio, categoria, descripcion, emoji } = req.body || {};
    if (!nombre || precio === undefined || precio === null || !categoria) {
      return res.status(400).json({ error: 'nombre, precio y categoria son obligatorios' });
    }

    const precioNum = parseFloat(precio);
    if (isNaN(precioNum) || precioNum < 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }

    const [result] = await db.query(
      `INSERT INTO productos (nombre, descripcion, precio, categoria, activo, tenant_id, emoji)
       VALUES (?, ?, ?, ?, true, ?, ?)`,
      [
        String(nombre).trim(),
        descripcion ? String(descripcion).trim() : null,
        precioNum,
        categoria,
        tenantId,
        emoji ? String(emoji).trim() : '🍽️'
      ]
    );

    return res.json({
      ok: true,
      producto: {
        id:        result.insertId,
        nombre:    String(nombre).trim(),
        precio:    precioNum,
        categoria
      }
    });
  } catch (err) {
    console.error('[setup-sistema POST /api/agregar-producto]', err);
    return res.status(500).json({ error: 'Error agregando producto' });
  }
});

// ─── POST /api/config-caja ────────────────────────────────────────────────────

router.post('/api/config-caja', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.status(401).json({ error: 'No autenticado' });

    const { monto_apertura, metodos_pago, comprobante_default } = req.body || {};

    const config = {
      monto_apertura:     parseFloat(monto_apertura) || 0,
      metodos_pago:       Array.isArray(metodos_pago) ? metodos_pago : (metodos_pago ? [metodos_pago] : ['efectivo']),
      comprobante_default: comprobante_default || 'boleta'
    };

    await db.query(
      'UPDATE tenants SET config_caja = ? WHERE id = ?',
      [JSON.stringify(config), tenantId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[setup-sistema POST /api/config-caja]', err);
    return res.status(500).json({ error: 'Error guardando config caja' });
  }
});

// ─── POST /api/marcar-dia ────────────────────────────────────────────────────

router.post('/api/marcar-dia', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.status(401).json({ error: 'No autenticado' });

    const dia = parseInt(req.body?.dia);
    if (![1, 2, 3].includes(dia)) {
      return res.status(400).json({ error: 'dia debe ser 1, 2 o 3' });
    }

    // Fetch current state
    const [[current]] = await db.query(
      'SELECT setup_dia1_ok, setup_dia2_ok, setup_dia3_ok FROM tenants WHERE id = ?',
      [tenantId]
    );
    if (!current) return res.status(404).json({ error: 'Tenant no encontrado' });

    const dia1 = dia === 1 ? true : !!current.setup_dia1_ok;
    const dia2 = dia === 2 ? true : !!current.setup_dia2_ok;
    const dia3 = dia === 3 ? true : !!current.setup_dia3_ok;

    // Setup is complete once día 1 is done (minimum) OR all 3 days done
    const completado = dia1 || (dia1 && dia2 && dia3);

    await db.query(
      `UPDATE tenants
       SET setup_dia${dia}_ok = true,
           setup_completado   = ?
       WHERE id = ?`,
      [completado, tenantId]
    );

    return res.json({ ok: true, redirect: '/' });
  } catch (err) {
    console.error('[setup-sistema POST /api/marcar-dia]', err);
    return res.status(500).json({ error: 'Error marcando día' });
  }
});

// ─── POST /api/config-sunat ──────────────────────────────────────────────────

router.post('/api/config-sunat', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.status(401).json({ error: 'No autenticado' });

    const { ruc, usuario_sol, clave_sol, serie_boleta, serie_factura } = req.body || {};

    if (!ruc || !usuario_sol || !clave_sol) {
      return res.status(400).json({ error: 'ruc, usuario_sol y clave_sol son obligatorios' });
    }

    const config = {
      ruc:            String(ruc).trim(),
      usuario_sol:    String(usuario_sol).trim(),
      clave_sol:      String(clave_sol).trim(),
      serie_boleta:   serie_boleta  ? String(serie_boleta).trim()  : 'B001',
      serie_factura:  serie_factura ? String(serie_factura).trim() : 'F001'
    };

    await db.query(
      'UPDATE tenants SET config_sunat = ? WHERE id = ?',
      [JSON.stringify(config), tenantId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[setup-sistema POST /api/config-sunat]', err);
    return res.status(500).json({ error: 'Error guardando config SUNAT' });
  }
});

module.exports = router;
