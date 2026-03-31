'use strict';

/**
 * routes/legal-pwa.js
 * Admin-side PWA views for Permisos Legales + Libro de Reclamaciones.
 * Mounted at /legal-pwa (requireAuth + requireRole administrador)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Returns semáforo state for a permit:
 *   'rojo'    — vencido
 *   'naranja' — vence en ≤30 días
 *   'verde'   — vigente (>30 días)
 *   'sin_fecha' — sin fecha de vencimiento
 */
function estadoPermiso(fechaVenc) {
  if (!fechaVenc) return 'sin_fecha';
  const hoy  = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVenc);
  venc.setHours(0, 0, 0, 0);
  const diff = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return 'rojo';
  if (diff <= 30) return 'naranja';
  return 'verde';
}

function diasParaVencer(fechaVenc) {
  if (!fechaVenc) return null;
  const hoy  = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVenc);
  venc.setHours(0, 0, 0, 0);
  return Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
}

function formatFecha(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── GET /legal-pwa/permisos ─────────────────────────────────────────────────

router.get('/permisos', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [rawPermisos] = await db.query(
      `SELECT id, nombre, categoria, empleado_nombre, fecha_vencimiento, proveedor, archivo_url
       FROM permisos_legales
       WHERE tenant_id = ? AND activo = true
       ORDER BY fecha_vencimiento ASC NULLS LAST`,
      [tid]
    );

    const permisos = rawPermisos.map(p => ({
      ...p,
      estado:      estadoPermiso(p.fecha_vencimiento),
      dias:        diasParaVencer(p.fecha_vencimiento),
      fechaFmt:    formatFecha(p.fecha_vencimiento)
    }));

    const vigentes   = permisos.filter(p => p.estado === 'verde' || p.estado === 'sin_fecha').length;
    const porVencer  = permisos.filter(p => p.estado === 'naranja').length;
    const vencidos   = permisos.filter(p => p.estado === 'rojo').length;

    res.render('legal-permisos', {
      user: req.session.user,
      permisos,
      vigentes,
      porVencer,
      vencidos
    });
  } catch (err) {
    console.error('[legal-pwa GET /permisos]', err);
    res.status(500).send('Error cargando permisos');
  }
});

// ─── POST /legal-pwa/permisos — Agregar permiso ──────────────────────────────

router.post('/permisos', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });

    const {
      nombre, descripcion, categoria, empleado_nombre,
      proveedor, fecha_emision, fecha_vencimiento, notas
    } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'Nombre del permiso requerido' });
    }

    await db.query(
      `INSERT INTO permisos_legales
         (tenant_id, nombre, descripcion, categoria, empleado_nombre, proveedor,
          fecha_emision, fecha_vencimiento, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tid,
        nombre.trim(),
        descripcion?.trim() || null,
        categoria || 'general',
        empleado_nombre?.trim() || null,
        proveedor?.trim() || null,
        fecha_emision || null,
        fecha_vencimiento || null,
        notas?.trim() || null
      ]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[legal-pwa POST /permisos]', err);
    return res.status(500).json({ error: 'Error guardando permiso' });
  }
});

// ─── DELETE /legal-pwa/permisos/:id ──────────────────────────────────────────

router.delete('/permisos/:id', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });

    await db.query(
      'UPDATE permisos_legales SET activo = false WHERE id = ? AND tenant_id = ?',
      [req.params.id, tid]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[legal-pwa DELETE /permisos/:id]', err);
    return res.status(500).json({ error: 'Error eliminando permiso' });
  }
});

// ─── GET /legal-pwa/reclamaciones — Admin view ───────────────────────────────

router.get('/reclamaciones', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [reclamaciones] = await db.query(
      `SELECT id, numero, tipo, nombre, detalle, estado, created_at, fecha_respuesta, respuesta
       FROM libro_reclamaciones
       WHERE (tenant_id = ? OR tenant_id IS NULL)
       ORDER BY created_at DESC
       LIMIT 100`,
      [tid]
    );

    const recs = reclamaciones.map(r => {
      const dias = Math.ceil((new Date() - new Date(r.created_at)) / (1000 * 60 * 60 * 24));
      const plazo = 30 - dias;
      return {
        ...r,
        dias_transcurridos: dias,
        plazo_restante: plazo,
        vence_pronto: plazo <= 5 && r.estado !== 'resuelto',
        fechaFmt: formatFecha(r.created_at)
      };
    });

    const pendientes = recs.filter(r => r.estado === 'recibido' || r.estado === 'en_proceso').length;
    const resueltos  = recs.filter(r => r.estado === 'resuelto').length;

    // Promedio de días en resolver
    const resueltosArr = recs.filter(r => r.estado === 'resuelto' && r.fecha_respuesta);
    let promResp = 0;
    if (resueltosArr.length > 0) {
      const suma = resueltosArr.reduce((s, r) => {
        const d = Math.ceil((new Date(r.fecha_respuesta) - new Date(r.created_at)) / (1000 * 60 * 60 * 24));
        return s + d;
      }, 0);
      promResp = Math.round(suma / resueltosArr.length);
    }

    res.render('libro-reclamaciones-admin', {
      user: req.session.user,
      reclamaciones: recs,
      pendientes,
      resueltos,
      promResp
    });
  } catch (err) {
    console.error('[legal-pwa GET /reclamaciones]', err);
    res.status(500).send('Error cargando reclamaciones');
  }
});

// ─── POST /legal-pwa/reclamaciones/:id/responder ─────────────────────────────

router.post('/reclamaciones/:id/responder', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });

    const { respuesta, estado } = req.body;
    if (!respuesta?.trim()) {
      return res.status(400).json({ error: 'Respuesta requerida' });
    }

    const nuevoEstado = ['resuelto', 'en_proceso', 'rechazado'].includes(estado) ? estado : 'resuelto';

    await db.query(
      `UPDATE libro_reclamaciones
       SET respuesta = ?, estado = ?, fecha_respuesta = NOW(),
           atendido_por = ?, tenant_id = COALESCE(tenant_id, ?)
       WHERE id = ?`,
      [respuesta.trim(), nuevoEstado, req.session.user.id, tid, req.params.id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[legal-pwa POST /reclamaciones/:id/responder]', err);
    return res.status(500).json({ error: 'Error guardando respuesta' });
  }
});

module.exports = router;
