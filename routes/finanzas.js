// routes/finanzas.js
// Finanzas Pro: cash-flow overview, category breakdown, and end-of-month projection.
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { renderForDevice } = require('../lib/deviceRouter');

async function getFinanzasData(tid) {
  const TZ = 'America/Lima';

  // --- Periodos: hoy, esta semana, este mes ---
  const [[hoyRow]] = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN cm.tipo='ingreso' THEN cm.monto ELSE 0 END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN cm.tipo='egreso'  THEN cm.monto ELSE 0 END), 0) AS egresos
    FROM caja_movimientos cm
    JOIN cajas c ON c.id = cm.caja_id
    WHERE c.tenant_id = $1
      AND cm.anulado = false
      AND (cm.created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
  `, [tid, TZ]);

  const [[semanaRow]] = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN cm.tipo='ingreso' THEN cm.monto ELSE 0 END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN cm.tipo='egreso'  THEN cm.monto ELSE 0 END), 0) AS egresos
    FROM caja_movimientos cm
    JOIN cajas c ON c.id = cm.caja_id
    WHERE c.tenant_id = $1
      AND cm.anulado = false
      AND (cm.created_at AT TIME ZONE $2) >= date_trunc('week', NOW() AT TIME ZONE $2)
  `, [tid, TZ]);

  const [[mesRow]] = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN cm.tipo='ingreso' THEN cm.monto ELSE 0 END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN cm.tipo='egreso'  THEN cm.monto ELSE 0 END), 0) AS egresos
    FROM caja_movimientos cm
    JOIN cajas c ON c.id = cm.caja_id
    WHERE c.tenant_id = $1
      AND cm.anulado = false
      AND date_trunc('month', cm.created_at AT TIME ZONE $2) = date_trunc('month', NOW() AT TIME ZONE $2)
  `, [tid, TZ]);

  // --- Desglose por concepto (mes actual) ---
  const [conceptos] = await db.query(`
    SELECT
      cm.concepto,
      cm.tipo,
      COALESCE(SUM(cm.monto), 0) AS total,
      COUNT(*) AS cantidad
    FROM caja_movimientos cm
    JOIN cajas c ON c.id = cm.caja_id
    WHERE c.tenant_id = $1
      AND cm.anulado = false
      AND date_trunc('month', cm.created_at AT TIME ZONE $2) = date_trunc('month', NOW() AT TIME ZONE $2)
    GROUP BY cm.concepto, cm.tipo
    ORDER BY total DESC
  `, [tid, TZ]);

  // --- Histórico de cajas (últimas 30 cerradas) ---
  const [histCajas] = await db.query(`
    SELECT
      id,
      fecha_apertura,
      fecha_cierre,
      monto_apertura,
      monto_cierre_real,
      monto_cierre_sistema,
      diferencia,
      nombre_caja
    FROM cajas
    WHERE tenant_id = $1
      AND estado = 'cerrada'
    ORDER BY fecha_cierre DESC
    LIMIT 30
  `, [tid]);

  // --- Flujo diario últimos 14 días (para mini chart) ---
  const [flujoDiario] = await db.query(`
    SELECT
      (cm.created_at AT TIME ZONE $2)::date AS dia,
      COALESCE(SUM(CASE WHEN cm.tipo='ingreso' THEN cm.monto ELSE 0 END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN cm.tipo='egreso'  THEN cm.monto ELSE 0 END), 0) AS egresos
    FROM caja_movimientos cm
    JOIN cajas c ON c.id = cm.caja_id
    WHERE c.tenant_id = $1
      AND cm.anulado = false
      AND cm.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY dia
    ORDER BY dia ASC
  `, [tid, TZ]);

  // --- Proyección fin de mes (promedio diario * días restantes) ---
  const diasEnMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const diaActual = new Date().getDate();
  const diasRestantes = diasEnMes - diaActual;

  const ingresosHoy = Number(hoyRow?.ingresos || 0);
  // Average daily ingresos this month
  const ingMes = Number(mesRow?.ingresos || 0);
  const promDiario = diaActual > 0 ? ingMes / diaActual : 0;
  const proyeccion = ingMes + (promDiario * diasRestantes);

  return {
    hoy: {
      ingresos: Number(hoyRow?.ingresos || 0),
      egresos:  Number(hoyRow?.egresos || 0),
      neto:     Number(hoyRow?.ingresos || 0) - Number(hoyRow?.egresos || 0)
    },
    semana: {
      ingresos: Number(semanaRow?.ingresos || 0),
      egresos:  Number(semanaRow?.egresos || 0),
      neto:     Number(semanaRow?.ingresos || 0) - Number(semanaRow?.egresos || 0)
    },
    mes: {
      ingresos: Number(mesRow?.ingresos || 0),
      egresos:  Number(mesRow?.egresos || 0),
      neto:     Number(mesRow?.ingresos || 0) - Number(mesRow?.egresos || 0)
    },
    conceptos,
    histCajas,
    flujoDiario,
    proyeccion: {
      fin_de_mes: proyeccion,
      promedio_diario: promDiario,
      dias_restantes: diasRestantes
    }
  };
}

// GET /finanzas
router.get('/', async (req, res) => {
  const tid = req.tenantId || 1;
  try {
    const data = await getFinanzasData(tid);
    renderForDevice(req, res, 'finanzas', data);
  } catch (e) {
    console.error('Finanzas GET error:', e.message);
    const empty = { hoy:{ingresos:0,egresos:0,neto:0}, semana:{ingresos:0,egresos:0,neto:0}, mes:{ingresos:0,egresos:0,neto:0}, conceptos:[], histCajas:[], flujoDiario:[], proyeccion:{fin_de_mes:0,promedio_diario:0,dias_restantes:0} };
    renderForDevice(req, res, 'finanzas', empty);
  }
});

// GET /api/finanzas — JSON for AJAX refresh
router.get('/data', async (req, res) => {
  const tid = req.tenantId || 1;
  try {
    const data = await getFinanzasData(tid);
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
