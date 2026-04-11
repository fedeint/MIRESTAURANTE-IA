// routes/alertas-salva.js
// GET /api/alertas/salva — returns proactive alert list for Agente Salva.
// Called by the client-side salva-alerts.js snippet every 5 minutes.
// Designed to be fast (<100ms): no AI calls, pure SQL aggregation.
'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const TZ = 'America/Lima';

router.get('/', async (req, res) => {
  const tid = req.tenantId || 1;
  const alerts = [];

  await Promise.all([
    checkCaja(tid, alerts),
    checkStock(tid, alerts),
    checkMetas(tid, alerts),
    checkVencimiento(tid, alerts),
  ]);

  // Sort by severity: error > warning > info
  const ORDER = { error: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (ORDER[a.tipo] ?? 9) - (ORDER[b.tipo] ?? 9));

  res.json({ ok: true, alerts });
});

async function checkCaja(tid, alerts) {
  try {
    const [[caja]] = await db.query(
      `SELECT id, umbral_efectivo,
              (SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE 0 END) -
                               SUM(CASE WHEN tipo='egreso'  THEN monto ELSE 0 END), 0)
               FROM caja_movimientos WHERE caja_id = cajas.id AND anulado = false) AS efectivo_actual
       FROM cajas WHERE tenant_id = $1 AND estado = 'abierta' LIMIT 1`,
      [tid]
    );

    if (!caja) {
      // No open caja — remind to open if it's a workday morning
      const hour = new Date().getHours();
      if (hour >= 8 && hour <= 10) {
        alerts.push({
          id: 'caja_cerrada',
          tipo: 'warning',
          icono: '⚠️',
          titulo: 'Caja no abierta',
          mensaje: 'Es hora de iniciar operaciones. ¿Abriste la caja de hoy?',
          accion: { label: 'Abrir caja', href: '/caja' },
          dallia: { label: 'Preguntarle a DalIA', href: '/chat?agent=salva&contexto=caja&prompt=No+abrí+caja+aún%2C+qué+hago%3F' }
        });
      }
      return;
    }

    const efectivo = Number(caja.efectivo_actual || 0);
    const umbral   = Number(caja.umbral_efectivo || 1500);

    if (efectivo >= umbral) {
      alerts.push({
        id: 'caja_umbral',
        tipo: 'warning',
        icono: '💰',
        titulo: `Efectivo alto: S/${efectivo.toFixed(0)}`,
        mensaje: `El fondo supera tu umbral de S/${umbral.toFixed(0)}. Considera un retiro a caja fuerte.`,
        accion: { label: 'Ver caja', href: '/caja' },
        dallia: { label: 'Preguntarle a DalIA', href: `/chat?agent=salva&contexto=caja&prompt=Tengo+S%2F${efectivo.toFixed(0)}+en+caja%2C+qué+hago%3F` }
      });
    }
  } catch (_) {}
}

async function checkStock(tid, alerts) {
  try {
    const [[row]] = await db.query(`
      SELECT COUNT(*) AS cnt
      FROM almacen_ingredientes
      WHERE tenant_id = $1
        AND deleted_at IS NULL
        AND stock_actual <= stock_minimo
        AND stock_minimo > 0
    `, [tid]);

    const cnt = Number(row?.cnt || 0);
    if (cnt > 0) {
      alerts.push({
        id: 'stock_critico',
        tipo: cnt >= 5 ? 'error' : 'warning',
        icono: '🔴',
        titulo: `${cnt} ingrediente${cnt !== 1 ? 's' : ''} en stock crítico`,
        mensaje: `${cnt} item${cnt !== 1 ? 's' : ''} ${cnt !== 1 ? 'están' : 'está'} en o bajo el stock mínimo.`,
        accion: { label: 'Ver almacén', href: '/almacen' },
        dallia: { label: 'Pedir a proveedores', href: `/chat?prompt=Revisa+mi+stock%2C+qué+me+falta+comprar%3F` }
      });
    }
  } catch (_) {}
}

async function checkMetas(tid, alerts) {
  try {
    const [metas] = await db.query(
      `SELECT tipo, meta_valor FROM metas_diarias WHERE tenant_id = $1 AND activa = true`,
      [tid]
    );
    if (!metas || metas.length === 0) return;

    // Get today's ventas progress
    const [[ventasRow]] = await db.query(`
      SELECT COALESCE(SUM(cm.monto), 0) AS total
      FROM caja_movimientos cm
      JOIN cajas c ON c.id = cm.caja_id
      WHERE c.tenant_id = $1
        AND cm.tipo = 'ingreso'
        AND cm.anulado = false
        AND (cm.created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
    `, [tid, TZ]);

    const ventasMeta = Number(metas.find(m => m.tipo === 'ventas')?.meta_valor || 0);
    const ventasReal = Number(ventasRow?.total || 0);

    if (ventasMeta > 0) {
      const pct = Math.round((ventasReal / ventasMeta) * 100);
      if (pct >= 100) {
        alerts.push({
          id: 'meta_ventas_ok',
          tipo: 'info',
          icono: '🏆',
          titulo: '¡Meta de ventas alcanzada!',
          mensaje: `Llevas S/${ventasReal.toFixed(0)} de S/${ventasMeta.toFixed(0)} meta. ¡Excelente día!`,
          accion: { label: 'Ver metas', href: '/metas' }
        });
      } else if (pct >= 75) {
        const hora = new Date().getHours();
        if (hora >= 15) {
          // Afternoon + 75%+ → encourage push
          alerts.push({
            id: 'meta_ventas_cerca',
            tipo: 'info',
            icono: '📈',
            titulo: `${pct}% de la meta de ventas`,
            mensaje: `Faltan S/${(ventasMeta - ventasReal).toFixed(0)} para alcanzar la meta. ¡Último empuje!`,
            accion: { label: 'Ver metas', href: '/metas' }
          });
        }
      }
    }
  } catch (_) {}
}

async function checkVencimiento(tid, alerts) {
  try {
    const [[row]] = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE fecha_vencimiento = CURRENT_DATE)             AS vencen_hoy,
        COUNT(*) FILTER (WHERE fecha_vencimiento = CURRENT_DATE + 1)         AS vencen_manana,
        COUNT(*) FILTER (WHERE fecha_vencimiento BETWEEN CURRENT_DATE + 2
                                                     AND CURRENT_DATE + 3)   AS vencen_pronto
      FROM almacen_lotes
      WHERE tenant_id = $1
        AND cantidad_disponible > 0
        AND fecha_vencimiento IS NOT NULL
        AND fecha_vencimiento >= CURRENT_DATE
        AND fecha_vencimiento <= CURRENT_DATE + 3
    `, [tid]);

    const hoy    = Number(row?.vencen_hoy    || 0);
    const manana = Number(row?.vencen_manana || 0);
    const pronto = Number(row?.vencen_pronto || 0);
    const total  = hoy + manana + pronto;

    if (total === 0) return;

    if (hoy > 0) {
      alerts.push({
        id: 'vencimiento_hoy',
        tipo: 'error',
        icono: '🚨',
        titulo: `${hoy} lote${hoy !== 1 ? 's' : ''} vencen HOY`,
        mensaje: `Usa estos insumos inmediatamente o coordina devolución con tu proveedor.`,
        accion: { label: 'Ver almacén', href: '/almacen' },
        dallia: { label: 'Ver lista completa', href: '/chat?prompt=Qué+insumos+vencen+hoy%3F' }
      });
    } else if (manana > 0) {
      alerts.push({
        id: 'vencimiento_manana',
        tipo: 'warning',
        icono: '⏰',
        titulo: `${manana} lote${manana !== 1 ? 's' : ''} vencen mañana`,
        mensaje: `Prioriza el uso de estos insumos hoy mismo para evitar pérdidas.`,
        accion: { label: 'Ver almacén', href: '/almacen' },
        dallia: { label: 'Ver con DalIA', href: '/chat?prompt=Insumos+próximos+a+vencerse' }
      });
    } else if (pronto > 0) {
      alerts.push({
        id: 'vencimiento_pronto',
        tipo: 'info',
        icono: '📅',
        titulo: `${pronto} lote${pronto !== 1 ? 's' : ''} vencen en 2-3 días`,
        mensaje: `Planifica el uso de estos insumos esta semana.`,
        accion: { label: 'Ver almacén', href: '/almacen' },
        dallia: { label: 'Ver con DalIA', href: '/chat?prompt=Insumos+próximos+a+vencerse' }
      });
    }
  } catch (_) {}
}

module.exports = router;
