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
      `SELECT nombre, setup_dia1_ok, setup_dia2_ok, setup_dia3_ok,
              setup_completado, num_personal, regimen_tributario,
              tiene_mesas, num_mesas, perfil_operativo
       FROM tenants WHERE id = ?`,
      [tenantId]
    );

    if (!tenant) return res.redirect('/login');

    if (tenant.setup_completado) return res.redirect('/');

    const perfil = typeof tenant.perfil_operativo === 'string'
      ? JSON.parse(tenant.perfil_operativo || '{}')
      : (tenant.perfil_operativo || {});

    // productos count
    const [[{ productos_count }]] = await db.query(
      'SELECT COUNT(*) AS productos_count FROM productos WHERE tenant_id = ? AND activo = true',
      [tenantId]
    );

    // distinct categorias
    const [catRows] = await db.query(
      'SELECT DISTINCT categoria FROM productos WHERE tenant_id = ? AND categoria IS NOT NULL',
      [tenantId]
    );
    const categorias = catRows.map(r => r.categoria);

    // insumos count
    let insumos_count = 0;
    try {
      const [[{ cnt }]] = await db.query(
        'SELECT COUNT(*) AS cnt FROM almacen_ingredientes WHERE tenant_id = ?',
        [tenantId]
      );
      insumos_count = cnt || 0;
    } catch (_) {
      // table may not exist yet
    }

    return res.render('setup-sistema', {
      user:    req.session.user,
      tenant:  {
        nombre:              tenant.nombre,
        setup_dia1_ok:       !!tenant.setup_dia1_ok,
        setup_dia2_ok:       !!tenant.setup_dia2_ok,
        setup_dia3_ok:       !!tenant.setup_dia3_ok,
        num_personal:        tenant.num_personal,
        regimen_tributario:  tenant.regimen_tributario,
        tiene_mesas:         !!tenant.tiene_mesas,
        num_mesas:           tenant.num_mesas || 0,
        perfil_operativo:    perfil
      },
      productos_count: parseInt(productos_count) || 0,
      categorias,
      insumos_count
    });
  } catch (err) {
    console.error('[setup-sistema GET /]', err);
    return res.status(500).send('Error cargando el setup');
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
