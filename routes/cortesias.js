'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── helper: today's cortesias stats ────────────────────────────────────────

async function getCortesiasHoy(tenantId) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(costo_insumos),0) AS monto_total
     FROM cortesias
     WHERE tenant_id = ? AND DATE(created_at) = CURRENT_DATE`,
    [tenantId]
  );
  return { count: Number(row.count || 0), monto_total: Number(row.monto_total || 0) };
}

// ─── GET /nueva ── Cortesía form (TxXYE) ────────────────────────────────────

router.get('/nueva', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  try {
    const [productos] = await db.query(
      'SELECT id, nombre, precio, categoria, emoji FROM productos WHERE tenant_id = ? AND activo = true ORDER BY categoria, nombre',
      [tenantId]
    );

    const [[tenant]] = await db.query(
      'SELECT cortesias_limite_diario, cortesias_limite_monto FROM tenants WHERE id = ?',
      [tenantId]
    );
    const limite = {
      diario: (tenant && tenant.cortesias_limite_diario != null) ? Number(tenant.cortesias_limite_diario) : 5,
      monto:  (tenant && tenant.cortesias_limite_monto  != null) ? Number(tenant.cortesias_limite_monto)  : 50
    };

    const cortesiasHoy = await getCortesiasHoy(tenantId);

    res.render('cortesia-nueva', {
      user:          req.session.user,
      productos:     productos || [],
      cortesias_hoy: cortesiasHoy,
      limite
    });
  } catch (e) {
    console.error('[cortesias GET /nueva]', e);
    res.status(500).send('Error cargando cortesías');
  }
});

// ─── POST /registrar ─────────────────────────────────────────────────────────

router.post('/registrar', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  const userId   = req.session?.user?.id;
  const { tipo, motivo, producto_id, autorizado_por } = req.body || {};

  if (!motivo) return res.status(400).json({ error: 'Motivo requerido' });

  try {
    // Check daily limit
    const [[tenant]] = await db.query(
      'SELECT cortesias_limite_diario, cortesias_limite_monto FROM tenants WHERE id = ?',
      [tenantId]
    );
    const limiteDiario = (tenant && tenant.cortesias_limite_diario != null) ? Number(tenant.cortesias_limite_diario) : 5;

    const hoy = await getCortesiasHoy(tenantId);
    if (hoy.count >= limiteDiario) {
      return res.status(400).json({
        error: `Límite de cortesías diarias alcanzado (${limiteDiario}). Hoy llevas ${hoy.count}.`
      });
    }

    // Get product info + food cost from recetas
    let productoNombre = null;
    let costoInsumos   = 0;

    if (producto_id) {
      const [[prod]] = await db.query(
        'SELECT id, nombre FROM productos WHERE id = ? AND tenant_id = ?',
        [producto_id, tenantId]
      );
      if (prod) {
        productoNombre = prod.nombre;
        // Try to get cost from recetas
        try {
          const [[receta]] = await db.query(
            `SELECT COALESCE(SUM(ri.cantidad * i.costo_unitario),0) AS costo
             FROM receta_items ri
             JOIN recetas r ON r.id = ri.receta_id
             JOIN insumos i ON i.id = ri.insumo_id
             WHERE r.producto_id = ? AND r.tenant_id = ?`,
            [producto_id, tenantId]
          );
          if (receta) costoInsumos = Number(receta.costo || 0);
        } catch (_) {
          // recetas table may not exist yet — default to 0
        }
      }
    }

    await db.query(
      `INSERT INTO cortesias
         (tenant_id, tipo, motivo, producto_id, producto_nombre, costo_insumos, autorizado_por, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, tipo || 'cliente', motivo, producto_id || null,
       productoNombre, costoInsumos, autorizado_por || null, userId]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('[cortesias POST /registrar]', e);
    res.status(500).json({ error: 'Error al registrar cortesía' });
  }
});

// ─── GET /api/hoy ─────────────────────────────────────────────────────────────

router.get('/api/hoy', async (req, res) => {
  const tenantId = req.session?.user?.tenant_id;
  try {
    const [[tenant]] = await db.query(
      'SELECT cortesias_limite_diario FROM tenants WHERE id = ?',
      [tenantId]
    );
    const limite = (tenant && tenant.cortesias_limite_diario != null) ? Number(tenant.cortesias_limite_diario) : 5;
    const hoy    = await getCortesiasHoy(tenantId);
    res.json({ count: hoy.count, monto_total: hoy.monto_total, limite });
  } catch (e) {
    console.error('[cortesias GET /api/hoy]', e);
    res.status(500).json({ error: 'Error' });
  }
});

module.exports = router;
