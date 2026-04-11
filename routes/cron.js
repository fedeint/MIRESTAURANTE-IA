// routes/cron.js
const express = require('express')
const router = express.Router()
const db = require('../db')
const logger = require('../lib/logger')
const { detectarAtaques } = require('../lib/ip-protection')
const { forceRefresh } = require('../middleware/ipGuard')
const grafana = require('../lib/grafana-client')

// Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
function verifyCron(req, res, next) {
  const secret = process.env.CRON_SECRET
  if (!secret) return next() // Dev mode: no secret required
  if (req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

router.use(verifyCron)

// Helper: upsert a KPI snapshot
async function upsertKPI(tipo, datos) {
  await db.query(
    `INSERT INTO kpi_snapshots (tipo, datos, calculado_en)
     VALUES (?, ?::jsonb, NOW())
     ON CONFLICT (tipo) DO UPDATE SET datos = EXCLUDED.datos, calculado_en = NOW()`,
    [tipo, JSON.stringify(datos)]
  )
}

// KPI Snapshot — every 5 minutes
router.get('/kpi-snapshot', async (req, res) => {
  const errors = []

  // 1) Operaciones hoy
  try {
    const [[opHoy]] = await db.query(
      "SELECT COUNT(*) as c FROM facturas WHERE fecha::date = CURRENT_DATE"
    )
    const [[opAyer]] = await db.query(
      "SELECT COUNT(*) as c FROM facturas WHERE fecha::date = CURRENT_DATE - 1"
    )
    const [[pedHoy]] = await db.query(
      "SELECT COUNT(*) as c FROM pedidos WHERE created_at::date = CURRENT_DATE"
    )
    const [[pedAyer]] = await db.query(
      "SELECT COUNT(*) as c FROM pedidos WHERE created_at::date = CURRENT_DATE - 1"
    )
    const [[ticket]] = await db.query(
      "SELECT COALESCE(AVG(total),0) as avg FROM facturas WHERE fecha::date = CURRENT_DATE"
    )
    await upsertKPI('operaciones_hoy', {
      facturas: { hoy: parseInt(opHoy.c), ayer: parseInt(opAyer.c) },
      pedidos: { hoy: parseInt(pedHoy.c), ayer: parseInt(pedAyer.c) },
      ticket_promedio: parseFloat(ticket.avg)
    })
  } catch (err) {
    errors.push({ kpi: 'operaciones_hoy', error: err.message })
  }

  // 2) MRR
  try {
    const [[mrr]] = await db.query(
      "SELECT COALESCE(SUM(precio_mensual),0) as mrr FROM tenant_suscripciones WHERE estado = 'activa'"
    )
    await upsertKPI('mrr', { mrr: parseFloat(mrr.mrr) })
  } catch (err) {
    errors.push({ kpi: 'mrr', error: err.message })
  }

  // 3) Tenants activos 7d (via active sessions)
  try {
    const [[activos]] = await db.query(
      "SELECT COUNT(DISTINCT sess->>'tenantId') as c FROM session WHERE expire > NOW()"
    )
    await upsertKPI('tenants_activos_7d', { count: parseInt(activos.c || 0) })
  } catch (err) {
    errors.push({ kpi: 'tenants_activos_7d', error: err.message })
  }

  // 4) Top tenants
  try {
    const [topTenants] = await db.query(
      `SELECT t.id, t.nombre, t.plan,
         COUNT(f.id) as operaciones,
         COALESCE(SUM(f.total),0) as total_facturado
       FROM tenants t
       LEFT JOIN facturas f ON f.tenant_id = t.id AND f.fecha >= date_trunc('month', CURRENT_DATE)
       GROUP BY t.id, t.nombre, t.plan
       ORDER BY total_facturado DESC
       LIMIT 10`
    )
    await upsertKPI('top_tenants', topTenants)
  } catch (err) {
    errors.push({ kpi: 'top_tenants', error: err.message })
  }

  // 5) Inactivos
  try {
    const [inactivos] = await db.query(
      `SELECT t.id, t.nombre, t.plan,
         MAX(s.expire) as ultimo_login
       FROM tenants t
       LEFT JOIN session s ON s.sess::jsonb->>'tenantId' = t.id::text
       GROUP BY t.id, t.nombre, t.plan
       HAVING MAX(s.expire) < NOW() - INTERVAL '7 days' OR MAX(s.expire) IS NULL
       LIMIT 20`
    )
    await upsertKPI('inactivos', inactivos)
  } catch (err) {
    errors.push({ kpi: 'inactivos', error: err.message })
  }

  // 6) Churn mensual
  try {
    const [[totalInicio]] = await db.query(
      "SELECT COUNT(*) as c FROM tenant_suscripciones WHERE created_at < date_trunc('month', CURRENT_DATE)"
    )
    const [[cancelados]] = await db.query(
      `SELECT COUNT(*) as c FROM tenant_suscripciones
       WHERE estado = 'cancelada'
       AND created_at >= date_trunc('month', CURRENT_DATE)`
    )
    const churn = totalInicio.c > 0 ? (cancelados.c / totalInicio.c * 100) : 0
    await upsertKPI('churn_mensual', {
      churn: parseFloat(churn.toFixed(2)),
      cancelados: parseInt(cancelados.c),
      total_inicio: parseInt(totalInicio.c)
    })
  } catch (err) {
    errors.push({ kpi: 'churn_mensual', error: err.message })
  }

  if (errors.length > 0) {
    logger.warn('CRON_KPI_SNAPSHOT_PARTIAL', { errors })
  } else {
    logger.info('CRON_KPI_SNAPSHOT_OK')
  }
  res.json({ ok: true, errors: errors.length > 0 ? errors : undefined })
})

// Metrics Infra — every 5 minutes
router.get('/metrics-infra', async (req, res) => {
  try {
    const [[sessions]] = await db.query("SELECT COUNT(*) as c FROM session WHERE expire > NOW()")
    grafana.pushMetric('active_sessions', parseInt(sessions.c), { job: 'observabilidad' })

    // Tenant storage (approximate from doc counts)
    const [storage] = await db.query(
      `SELECT t.id, t.nombre,
         (SELECT COUNT(*) FROM facturas f WHERE f.tenant_id = t.id) as docs
       FROM tenants t`
    )
    for (const t of storage) {
      grafana.pushMetric('tenant_storage_docs', parseInt(t.docs || 0), { tenant: t.nombre }, 'gauge')
    }

    // VPS health snapshot
    try {
      const vpsStorage = require('../services/vps-storage')
      const health = await vpsStorage.getHealth()
      if (health) {
        await db.query(
          `INSERT INTO kpi_snapshots (tipo, datos, calculado_en)
           VALUES ('vps_health', ?::jsonb, NOW())
           ON CONFLICT (tipo) DO UPDATE SET datos = EXCLUDED.datos, calculado_en = NOW()`,
          [JSON.stringify(health)]
        )
      }
    } catch (_) {}

    logger.info('CRON_METRICS_INFRA_OK')
    res.json({ ok: true })
  } catch (err) {
    logger.error('CRON_METRICS_INFRA_FAILED', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// Attack Detection — every 1 minute
router.get('/attack-detection', async (req, res) => {
  try {
    await detectarAtaques()
    forceRefresh()
    logger.info('CRON_ATTACK_DETECTION_OK')
    res.json({ ok: true })
  } catch (err) {
    logger.error('CRON_ATTACK_DETECTION_FAILED', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// Cleanup — daily at 3am
router.get('/cleanup', async (req, res) => {
  try {
    const results = {}

    try {
      const [r1] = await db.query("DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days'")
      results.audit_log = r1.rowCount || 0
    } catch (e) { results.audit_log = 'error: ' + e.message }

    try {
      const [r2] = await db.query("DELETE FROM modulo_usage WHERE fecha < CURRENT_DATE - 365")
      results.modulo_usage = r2.rowCount || 0
    } catch (e) { results.modulo_usage = 'error: ' + e.message }

    try {
      const [r3] = await db.query("DELETE FROM session_geo WHERE last_seen < NOW() - INTERVAL '7 days'")
      results.session_geo = r3.rowCount || 0
    } catch (e) { results.session_geo = 'error: ' + e.message }

    try {
      const [r4] = await db.query("DELETE FROM ataques_log WHERE created_at < NOW() - INTERVAL '90 days'")
      results.ataques_log = r4.rowCount || 0
    } catch (e) { results.ataques_log = 'error: ' + e.message }

    try {
      const [r5] = await db.query("DELETE FROM request_counts WHERE created_at < NOW() - INTERVAL '5 minutes'")
      results.request_counts = r5.rowCount || 0
    } catch (e) { results.request_counts = 'error: ' + e.message }

    try {
      const [r6] = await db.query("DELETE FROM ip_blacklist WHERE expira_en IS NOT NULL AND expira_en < NOW()")
      results.ip_blacklist_expired = r6.rowCount || 0
    } catch (e) { results.ip_blacklist_expired = 'error: ' + e.message }

    // Clean up expired login_attempts rows (older than 24h and no longer locked)
    try {
      const [r7] = await db.query(`
        DELETE FROM login_attempts
        WHERE (locked_until IS NULL OR locked_until < NOW())
          AND last_attempt < NOW() - INTERVAL '24 hours'
      `)
      results.login_attempts_expired = r7.rowCount || 0
    } catch (e) { results.login_attempts_expired = 'error: ' + e.message }

    // Reset monthly alert counters
    try {
      await db.query("UPDATE alertas_estado SET conteo = 0 WHERE ultimo_envio < date_trunc('month', CURRENT_DATE)")
    } catch (_) {}

    logger.info('CRON_CLEANUP_OK', results)
    res.json({ ok: true, deleted: results })
  } catch (err) {
    logger.error('CRON_CLEANUP_FAILED', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------------------
// Trial expiration check — daily at 8am
// ---------------------------------------------------------------------------
router.get('/trial-expiration', async (req, res) => {
  try {
    // Mark expired trials
    const [expired] = await db.query(
      `UPDATE tenants SET estado_trial = 'expirado', activo = false
       WHERE estado_trial = 'activo' AND trial_fin < NOW()
       RETURNING id, nombre`
    )

    // Send expiration emails
    const { enviarEmailTrialExpirado } = require('../services/notificaciones-trial')
    for (const tenant of (expired || [])) {
      const [[user]] = await db.query(
        'SELECT google_email, nombre FROM usuarios WHERE tenant_id = ? AND rol = ? LIMIT 1',
        [tenant.id, 'administrador']
      )
      if (user?.google_email) {
        await enviarEmailTrialExpirado(user.google_email, user.nombre)
      }
    }

    // Cleanup: remove photos/video from approved requests older than 7 days
    await db.query(
      `UPDATE solicitudes_registro SET fotos = '[]'::jsonb, video_url = NULL
       WHERE estado = 'aprobado' AND revisado_at < NOW() - INTERVAL '7 days' AND fotos != '[]'::jsonb`
    )

    logger.info('cron_trial_expiration', { expired: (expired || []).length })
    res.json({ ok: true, expired: (expired || []).length })
  } catch (err) {
    logger.error('cron_trial_expiration_error', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------------------
// Data retention cleanup — weekly (30-day retention for expired trials)
// ---------------------------------------------------------------------------
router.get('/trial-data-cleanup', async (req, res) => {
  try {
    const [stale] = await db.query(
      `SELECT id FROM tenants
       WHERE estado_trial = 'expirado'
         AND trial_fin < NOW() - INTERVAL '75 days'
         AND plan = 'free'
         AND activo = true`
    )

    for (const tenant of (stale || [])) {
      await db.query(
        `UPDATE usuarios SET nombre = 'Usuario eliminado', google_email = NULL,
         google_avatar = NULL, google_id = NULL WHERE tenant_id = ?`,
        [tenant.id]
      )
      await db.query(
        `UPDATE tenants SET activo = false, nombre = 'Tenant inactivo',
         direccion = NULL, distrito = NULL, departamento = NULL WHERE id = ?`,
        [tenant.id]
      )
    }

    logger.info('cron_data_cleanup', { cleaned: (stale || []).length })
    res.json({ ok: true, cleaned: (stale || []).length })
  } catch (err) {
    logger.error('cron_data_cleanup_error', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------------------
// WhatsApp trial sequence — daily at 9am Lima time (14:00 UTC)
// ---------------------------------------------------------------------------
router.get('/whatsapp-trial-sequence', async (req, res) => {
  try {
    const whatsapp = require('../services/whatsapp-api')
    const results = { day3: 0, day7: 0, day12: 0, day14: 0 }

    const [trials] = await db.query(`
      SELECT t.id, t.nombre, t.email_admin, t.trial_inicio, t.trial_fin, t.telefono,
             u.nombre as user_nombre,
             EXTRACT(DAY FROM NOW() - t.trial_inicio) as trial_day
      FROM tenants t
      LEFT JOIN usuarios u ON u.tenant_id = t.id AND u.rol = 'administrador'
      WHERE t.estado_trial = 'activo'
        AND t.trial_fin > NOW()
    `)

    for (const trial of (trials || [])) {
      const day = Math.floor(trial.trial_day)
      const nombre = trial.user_nombre || trial.nombre
      const phone = trial.telefono || null

      if (!phone) continue

      if (day === 3) {
        await whatsapp.sendTemplate(phone, 'trial_dia3', [nombre])
        results.day3++
      } else if (day === 7) {
        await whatsapp.sendTemplate(phone, 'trial_dia7', [nombre])
        results.day7++
      } else if (day === 12) {
        await whatsapp.sendTemplate(phone, 'trial_dia12', [nombre])
        results.day12++
      } else if (day === 14) {
        await whatsapp.sendTemplate(phone, 'trial_dia14', [nombre])
        results.day14++
      }
    }

    logger.info('cron_whatsapp_trial', results)
    res.json({ ok: true, ...results })
  } catch (err) {
    logger.error('cron_whatsapp_trial_error', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------------------
// Daily digest — every day at 8am (summarizes YESTERDAY to admin via WhatsApp)
// ---------------------------------------------------------------------------
router.get('/daily-digest', async (req, res) => {
  const results = { sent: 0, skipped: 0, errors: [] }
  const whatsapp = require('../services/whatsapp-api')

  try {
    // Get all active tenants with an admin phone number
    const [tenants] = await db.query(`
      SELECT t.id, t.nombre,
             u.nombre AS admin_nombre,
             u.telefono AS admin_telefono
      FROM tenants t
      JOIN usuarios u ON u.tenant_id = t.id AND u.rol = 'administrador'
      WHERE t.activo = true
        AND u.telefono IS NOT NULL
        AND u.telefono != ''
      ORDER BY t.id
    `)

    for (const tenant of (tenants || [])) {
      try {
        // Yesterday's metrics
        const [[ventasRow]] = await db.query(`
          SELECT
            COALESCE(SUM(CASE WHEN cm.tipo='ingreso' AND NOT cm.anulado THEN cm.monto ELSE 0 END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN cm.tipo='egreso'  AND NOT cm.anulado THEN cm.monto ELSE 0 END), 0) AS egresos
          FROM caja_movimientos cm
          WHERE cm.tenant_id = ?
            AND (cm.created_at AT TIME ZONE 'America/Lima')::date = (CURRENT_DATE - 1)
        `, [tenant.id])

        const [[pedidosRow]] = await db.query(`
          SELECT COUNT(*) AS total
          FROM pedidos
          WHERE tenant_id = ?
            AND estado NOT IN ('cancelado')
            AND fecha = CURRENT_DATE - 1
        `, [tenant.id])

        const ingresos = Number(ventasRow?.ingresos || 0)
        const egresos  = Number(ventasRow?.egresos  || 0)
        const pedidos  = Number(pedidosRow?.total   || 0)
        const ticket   = pedidos > 0 ? Math.round((ingresos / pedidos) * 100) / 100 : 0

        // Skip if no activity yesterday
        if (ingresos === 0 && pedidos === 0) {
          results.skipped++
          continue
        }

        const fmt = n => `S/ ${Number(n).toFixed(2)}`
        const ayer = new Date()
        ayer.setDate(ayer.getDate() - 1)
        const fechaStr = ayer.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/Lima' })

        const mensaje =
          `📊 *Resumen de ${fechaStr}*\n` +
          `${tenant.nombre}\n\n` +
          `💰 Ventas: ${fmt(ingresos)}\n` +
          `🧾 Pedidos: ${pedidos}\n` +
          `🎟️ Ticket prom: ${fmt(ticket)}\n` +
          `💸 Egresos: ${fmt(egresos)}\n\n` +
          `Para más detalles abre MiRestcon → DalIA`

        await whatsapp.sendText(tenant.admin_telefono, mensaje)
        results.sent++

      } catch (tenantErr) {
        results.errors.push({ tenant_id: tenant.id, error: tenantErr.message })
      }
    }

    logger.info('CRON_DAILY_DIGEST_OK', results)
    res.json({ ok: true, ...results })
  } catch (err) {
    logger.error('CRON_DAILY_DIGEST_FAILED', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
