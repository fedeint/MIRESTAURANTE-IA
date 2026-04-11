// routes/proveedores-hub.js
// Proveedores Hub: directory of suppliers with purchase history and quick-contact.
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { renderForDevice } = require('../lib/deviceRouter');

// GET /proveedores-hub — list
router.get('/', async (req, res) => {
  const tid = req.tenantId || 1;
  try {
    const [proveedores] = await db.query(`
      SELECT
        p.id, p.nombre, p.ruc, p.telefono, p.email, p.tipo, p.calificacion,
        p.dias_credito, p.contacto_nombre, p.direccion,
        COUNT(DISTINCT oc.id) AS total_ordenes,
        COALESCE(SUM(oc.total), 0) AS total_comprado,
        MAX(oc.fecha_orden) AS ultima_orden
      FROM proveedores p
      LEFT JOIN ordenes_compra oc ON oc.proveedor_id = p.id AND oc.estado != 'cancelada'
      WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
      GROUP BY p.id, p.nombre, p.ruc, p.telefono, p.email, p.tipo, p.calificacion,
               p.dias_credito, p.contacto_nombre, p.direccion
      ORDER BY total_comprado DESC, p.nombre ASC
    `, [tid]);

    renderForDevice(req, res, 'proveedores-hub', { proveedores, detalleId: null, detalle: null });
  } catch (e) {
    console.error('Proveedores Hub GET error:', e.message);
    renderForDevice(req, res, 'proveedores-hub', { proveedores: [], detalleId: null, detalle: null });
  }
});

// GET /proveedores-hub/:id — detail view
router.get('/:id', async (req, res) => {
  const tid = req.tenantId || 1;
  const pid = parseInt(req.params.id);
  try {
    const [[prov]] = await db.query(`
      SELECT * FROM proveedores WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `, [pid, tid]);

    if (!prov) return res.status(404).redirect('/proveedores-hub');

    // Last 20 purchase orders
    const [ordenes] = await db.query(`
      SELECT id, numero_orden, fecha_orden, fecha_entrega_esperada, estado, total
      FROM ordenes_compra
      WHERE proveedor_id = $1 AND tenant_id = $2
      ORDER BY fecha_orden DESC
      LIMIT 20
    `, [pid, tid]);

    // Ingredients supplied by this vendor
    const [ingredientes] = await db.query(`
      SELECT id, nombre, unidad_medida, costo_unitario, stock_actual
      FROM almacen_ingredientes
      WHERE proveedor_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      ORDER BY nombre
    `, [pid, tid]);

    // Stats
    const [[stats]] = await db.query(`
      SELECT
        COUNT(DISTINCT oc.id) AS total_ordenes,
        COALESCE(SUM(oc.total), 0) AS total_comprado,
        MAX(oc.fecha_orden) AS ultima_orden
      FROM ordenes_compra oc
      WHERE oc.proveedor_id = $1 AND oc.tenant_id = $2 AND oc.estado != 'cancelada'
    `, [pid, tid]);

    renderForDevice(req, res, 'proveedores-hub', {
      proveedores: [],
      detalleId: pid,
      detalle: { ...prov, ordenes, ingredientes, stats }
    });
  } catch (e) {
    console.error('Proveedores Hub detail error:', e.message);
    res.redirect('/proveedores-hub');
  }
});

// POST /api/proveedores-hub — create supplier
router.post('/', async (req, res) => {
  const tid = req.tenantId || 1;
  const { nombre, ruc, telefono, email, direccion, contacto_nombre, tipo, dias_credito } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const [result] = await db.query(`
      INSERT INTO proveedores (tenant_id, nombre, ruc, telefono, email, direccion, contacto_nombre, tipo, dias_credito)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, [tid, nombre, ruc||null, telefono||null, email||null, direccion||null, contacto_nombre||null, tipo||'mayorista', dias_credito||0]);
    res.status(201).json({ ok: true, id: result?.[0]?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/proveedores-hub/:id — update
router.patch('/:id', async (req, res) => {
  const tid = req.tenantId || 1;
  const pid = parseInt(req.params.id);
  const { nombre, ruc, telefono, email, direccion, contacto_nombre, tipo, dias_credito, calificacion } = req.body;
  try {
    await db.query(`
      UPDATE proveedores
      SET nombre=$1, ruc=$2, telefono=$3, email=$4, direccion=$5, contacto_nombre=$6,
          tipo=$7, dias_credito=$8, calificacion=$9, updated_at=NOW()
      WHERE id=$10 AND tenant_id=$11
    `, [nombre, ruc||null, telefono||null, email||null, direccion||null, contacto_nombre||null, tipo||'mayorista', dias_credito||0, calificacion||null, pid, tid]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/proveedores-hub/:id — soft delete
router.delete('/:id', async (req, res) => {
  const tid = req.tenantId || 1;
  const pid = parseInt(req.params.id);
  try {
    await db.query(`UPDATE proveedores SET deleted_at=NOW() WHERE id=$1 AND tenant_id=$2`, [pid, tid]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
