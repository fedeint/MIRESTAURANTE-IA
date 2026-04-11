// routes/metas.js
// Daily sales goals: set targets and track real-time progress.
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { renderForDevice } = require('../lib/deviceRouter');

// Auto-create table if migration hasn't run yet
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS metas_diarias (
        id          SERIAL PRIMARY KEY,
        tenant_id   INTEGER      NOT NULL,
        tipo        VARCHAR(30)  NOT NULL CHECK (tipo IN ('ventas','pedidos','ticket_promedio')),
        meta_valor  NUMERIC(12,2) NOT NULL DEFAULT 0,
        activa      BOOLEAN      NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, tipo)
      )
    `);
  } catch (e) { /* table may already exist */ }
})();

async function getProgresoHoy(tid) {
  // Ventas (ingresos de caja_movimientos hoy)
  const [[ventasRow]] = await db.query(`
    SELECT COALESCE(SUM(cm.monto), 0) AS total
    FROM caja_movimientos cm
    JOIN cajas c ON c.id = cm.caja_id
    WHERE c.tenant_id = $1
      AND cm.tipo = 'ingreso'
      AND cm.anulado = false
      AND (cm.created_at AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
  `, [tid]);

  // Pedidos count hoy (estado != cancelado)
  const [[pedidosRow]] = await db.query(`
    SELECT COUNT(DISTINCT p.id) AS total
    FROM pedidos p
    WHERE p.tenant_id = $1
      AND p.estado NOT IN ('cancelado')
      AND (p.created_at AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
  `, [tid]);

  const ventas = Number(ventasRow?.total || 0);
  const pedidos = Number(pedidosRow?.total || 0);
  const ticketPromedio = pedidos > 0 ? ventas / pedidos : 0;

  return { ventas, pedidos, ticket_promedio: ticketPromedio };
}

// GET /metas
router.get('/', async (req, res) => {
  const tid = req.tenantId || 1;
  try {
    const [rows] = await db.query(
      `SELECT tipo, meta_valor FROM metas_diarias WHERE tenant_id = $1 AND activa = true`,
      [tid]
    );
    const metas = { ventas: 0, pedidos: 0, ticket_promedio: 0 };
    for (const r of rows) metas[r.tipo] = Number(r.meta_valor);

    const progreso = await getProgresoHoy(tid);

    renderForDevice(req, res, 'metas', { metas, progreso });
  } catch (e) {
    console.error('Metas GET error:', e.message);
    renderForDevice(req, res, 'metas', { metas: { ventas: 0, pedidos: 0, ticket_promedio: 0 }, progreso: { ventas: 0, pedidos: 0, ticket_promedio: 0 } });
  }
});

// GET /api/metas/progreso — JSON for live refresh
router.get('/progreso', async (req, res) => {
  const tid = req.tenantId || 1;
  try {
    const [rows] = await db.query(
      `SELECT tipo, meta_valor FROM metas_diarias WHERE tenant_id = $1 AND activa = true`,
      [tid]
    );
    const metas = { ventas: 0, pedidos: 0, ticket_promedio: 0 };
    for (const r of rows) metas[r.tipo] = Number(r.meta_valor);

    const progreso = await getProgresoHoy(tid);
    res.json({ ok: true, metas, progreso });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/metas — upsert a meta
router.post('/', async (req, res) => {
  const tid = req.tenantId || 1;
  const { tipo, meta_valor } = req.body;

  const VALID_TIPOS = ['ventas', 'pedidos', 'ticket_promedio'];
  if (!VALID_TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  const valor = parseFloat(meta_valor);
  if (isNaN(valor) || valor < 0) return res.status(400).json({ error: 'Valor inválido' });

  try {
    await db.query(`
      INSERT INTO metas_diarias (tenant_id, tipo, meta_valor, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (tenant_id, tipo) DO UPDATE
        SET meta_valor = EXCLUDED.meta_valor,
            activa     = true,
            updated_at = NOW()
    `, [tid, tipo, valor]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
