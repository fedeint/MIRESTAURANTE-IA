// routes/observabilidad.js
const express = require('express')
const router = express.Router()
const db = require('../db')
const grafana = require('../lib/grafana-client')
const alertas = require('../lib/alertas')
const rateLimit = require('express-rate-limit')

// Rate limit: 10 req/min for observability endpoints
const obsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas solicitudes al panel de observabilidad' }
})
router.use(obsLimiter)

// === TAB NEGOCIO ===

router.get('/api/negocio/kpis', async (req, res) => {
  try {
    const [snapshots] = await db.query(
      "SELECT tipo, datos, calculado_en FROM kpi_snapshots WHERE tipo IN ('operaciones_hoy', 'mrr', 'tenants_activos_7d')"
    )
    const result = {}
    for (const s of snapshots) result[s.tipo] = { datos: s.datos, calculado_en: s.calculado_en }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/negocio/operaciones', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30
    const [rows] = await db.query(
      `SELECT fecha, COUNT(*) as facturas,
         (SELECT COUNT(*) FROM pedidos p WHERE p.fecha = f.fecha) as pedidos
       FROM facturas f
       WHERE fecha >= CURRENT_DATE - make_interval(days => ?)
       GROUP BY fecha ORDER BY fecha`,
      [dias]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/negocio/mrr', async (req, res) => {
  try {
    const meses = parseInt(req.query.meses) || 12
    const [rows] = await db.query(
      `SELECT date_trunc('month', created_at) as mes,
         SUM(precio_mensual) as mrr
       FROM tenant_suscripciones
       WHERE estado = 'activa'
       AND created_at >= NOW() - make_interval(months => ?)
       GROUP BY mes ORDER BY mes`
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/negocio/top-tenants', async (req, res) => {
  try {
    const [[snapshot]] = await db.query("SELECT datos FROM kpi_snapshots WHERE tipo = 'top_tenants'")
    res.json(snapshot?.datos || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/negocio/inactivos', async (req, res) => {
  try {
    const [[snapshot]] = await db.query("SELECT datos FROM kpi_snapshots WHERE tipo = 'inactivos'")
    res.json(snapshot?.datos || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/negocio/uso-modulos', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30
    const [rows] = await db.query(
      `SELECT modulo, SUM(hits) as total_hits
       FROM modulo_usage
       WHERE fecha >= CURRENT_DATE - make_interval(days => ?)
       GROUP BY modulo ORDER BY total_hits DESC`,
      [dias]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/negocio/churn', async (req, res) => {
  try {
    const [[snapshot]] = await db.query("SELECT datos FROM kpi_snapshots WHERE tipo = 'churn_mensual'")
    res.json(snapshot?.datos || { churn: 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// === TAB RENDIMIENTO ===

router.get('/api/rendimiento/kpis', async (req, res) => {
  try {
    const p95 = await grafana.queryProm('histogram_quantile(0.95, rate(http_request_duration_ms_bucket[1h]))')
    const errorRate = await grafana.queryProm('rate(http_errors_total[1h]) / rate(http_requests_total[1h]) * 100')
    const reqRate = await grafana.queryProm('rate(http_requests_total[5m]) * 60')
    const dbP95 = await grafana.queryProm('histogram_quantile(0.95, rate(db_query_duration_ms_bucket[1h]))')

    res.json({
      latencia_p95: p95?.data?.result?.[0]?.value?.[1] || null,
      error_rate: errorRate?.data?.result?.[0]?.value?.[1] || null,
      requests_per_min: reqRate?.data?.result?.[0]?.value?.[1] || null,
      db_p95: dbP95?.data?.result?.[0]?.value?.[1] || null,
      circuit: grafana.getCircuitStatus()
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/rendimiento/latencia', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const end = Math.floor(Date.now() / 1000)
    const start = end - (horas * 3600)
    const result = await grafana.queryPromRange(
      'histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))',
      start, end, '1h'
    )
    res.json(result?.data?.result || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/rendimiento/errores', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const end = Math.floor(Date.now() / 1000)
    const start = end - (horas * 3600)
    const result = await grafana.queryPromRange(
      'rate(http_errors_total[5m]) / rate(http_requests_total[5m]) * 100',
      start, end, '1h'
    )
    res.json(result?.data?.result || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/rendimiento/rutas-lentas', async (req, res) => {
  try {
    const result = await grafana.queryProm(
      'topk(10, histogram_quantile(0.95, rate(http_request_duration_ms_bucket[1h])) by (route))'
    )
    res.json(result?.data?.result || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/rendimiento/rutas-errores', async (req, res) => {
  try {
    const result = await grafana.queryProm(
      'topk(10, sum(rate(http_errors_total[1h])) by (route))'
    )
    res.json(result?.data?.result || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// === TAB SEGURIDAD ===

router.get('/api/seguridad/kpis', async (req, res) => {
  try {
    const [[fallidos]] = await db.query(
      "SELECT COUNT(*) as c FROM audit_log WHERE action = 'login_failed' AND created_at >= CURRENT_DATE"
    )
    const [[bloqueadas]] = await db.query(
      "SELECT COUNT(*) as c FROM ip_blacklist WHERE expira_en > NOW() OR expira_en IS NULL"
    )
    const [[criticos]] = await db.query(
      `SELECT COUNT(*) as c FROM audit_log
       WHERE created_at >= CURRENT_DATE
       AND action IN ('role_change','user_delete','price_change','config_change')`
    )
    const [[ultimo]] = await db.query(
      `SELECT created_at FROM audit_log
       WHERE action IN ('login_failed','role_change','user_delete')
       ORDER BY created_at DESC LIMIT 1`
    )

    res.json({
      intentos_fallidos_hoy: parseInt(fallidos.c),
      ips_bloqueadas: parseInt(bloqueadas.c),
      cambios_criticos_hoy: parseInt(criticos.c),
      ultimo_evento_critico: ultimo?.created_at || null
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/seguridad/eventos', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const severidad = req.query.severidad
    let sql = `SELECT * FROM audit_log WHERE created_at > NOW() - make_interval(hours => ?)`
    const params = [horas]
    if (severidad === 'critical') {
      sql += " AND action IN ('login_failed','role_change','user_delete')"
    }
    sql += ' ORDER BY created_at DESC LIMIT 50'
    const [rows] = await db.query(sql, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/seguridad/ips-sospechosas', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ip_address as ip, COUNT(*) as intentos,
         MAX(created_at) as ultimo_intento
       FROM audit_log
       WHERE action = 'login_failed' AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY ip_address
       ORDER BY intentos DESC LIMIT 20`
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/seguridad/cambios-por-tenant', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 7
    const [rows] = await db.query(
      `SELECT tenant_id, COUNT(*) as cambios
       FROM audit_log
       WHERE action IN ('price_change','role_change','config_change','user_delete')
       AND created_at > NOW() - make_interval(days => ?)
       GROUP BY tenant_id ORDER BY cambios DESC LIMIT 20`
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/seguridad/buscar-logs', async (req, res) => {
  try {
    const { severidad, evento, tenant_id, desde, hasta } = req.query
    const result = await grafana.queryLoki({ severidad, evento, tenant_id, desde, hasta })
    res.json(result?.data?.result || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// === TAB INFRA ===

router.get('/api/infra/kpis', async (req, res) => {
  try {
    const dbPool = await grafana.queryProm('db_pool_active')
    const sessions = await grafana.queryProm('active_sessions')
    const rlHits = await grafana.queryProm('increase(rate_limit_hits_total[24h])')

    res.json({
      db_pool_active: dbPool?.data?.result?.[0]?.value?.[1] || null,
      sesiones_activas: sessions?.data?.result?.[0]?.value?.[1] || null,
      rate_limits_hoy: rlHits?.data?.result?.[0]?.value?.[1] || null,
      circuit: grafana.getCircuitStatus()
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/infra/db-pool', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const end = Math.floor(Date.now() / 1000)
    const start = end - (horas * 3600)
    const [active, idle, waiting] = await Promise.all([
      grafana.queryPromRange('db_pool_active', start, end, '5m'),
      grafana.queryPromRange('db_pool_idle', start, end, '5m'),
      grafana.queryPromRange('db_pool_waiting', start, end, '5m')
    ])
    res.json({ active: active?.data?.result, idle: idle?.data?.result, waiting: waiting?.data?.result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/infra/rate-limits', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const end = Math.floor(Date.now() / 1000)
    const start = end - (horas * 3600)
    const result = await grafana.queryPromRange('increase(rate_limit_hits_total[1h])', start, end, '1h')
    res.json(result?.data?.result || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/infra/sesiones', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const end = Math.floor(Date.now() / 1000)
    const start = end - (horas * 3600)
    const result = await grafana.queryPromRange('active_sessions', start, end, '1h')
    res.json(result?.data?.result || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/infra/storage', async (req, res) => {
  try {
    const result = await grafana.queryProm('topk(10, tenant_storage_bytes)')
    res.json(result?.data?.result || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// VPS Health — from kpi_snapshots or live
router.get('/api/infra/vps-health', async (req, res) => {
  try {
    // Try live first
    const vpsStorage = require('../services/vps-storage')
    const live = await vpsStorage.getHealth()
    if (live) return res.json(live)

    // Fallback to cached snapshot
    const [[snapshot]] = await db.query(
      "SELECT datos, calculado_en FROM kpi_snapshots WHERE tipo = 'vps_health'"
    )
    if (snapshot) return res.json({ ...snapshot.datos, cached: true, cached_at: snapshot.calculado_en })

    res.json({ error: 'VPS health not available' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// === TAB MAPA ===

router.get('/api/mapa/tenants', async (req, res) => {
  try {
    // Try with tenant_suscripciones join first
    try {
      const [rows] = await db.query(
        `SELECT t.id, t.nombre, t.plan, t.geo_lat, t.geo_lon,
           ts.estado as suscripcion_estado,
           (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id) as num_usuarios
         FROM tenants t
         LEFT JOIN tenant_suscripciones ts ON ts.tenant_id = t.id
         WHERE t.geo_lat IS NOT NULL`
      )
      return res.json(rows)
    } catch (_) {
      // tenant_suscripciones may not exist, try without it
      const [rows] = await db.query(
        `SELECT t.id, t.nombre, t.plan, t.geo_lat, t.geo_lon,
           NULL as suscripcion_estado,
           (SELECT COUNT(*) FROM usuarios u WHERE u.tenant_id = t.id) as num_usuarios
         FROM tenants t
         WHERE t.geo_lat IS NOT NULL`
      )
      return res.json(rows)
    }
  } catch (err) {
    res.json([])
  }
})

router.get('/api/mapa/sesiones-activas', async (req, res) => {
  try {
    // Support 304 Not Modified
    const [[lastUpdate]] = await db.query("SELECT MAX(last_seen) as lm FROM session_geo")
    const lastMod = lastUpdate?.lm ? new Date(lastUpdate.lm).toUTCString() : null
    if (lastMod && req.headers['if-modified-since'] === lastMod) {
      return res.status(304).end()
    }
    if (lastMod) res.setHeader('Last-Modified', lastMod)

    const [rows] = await db.query(
      `SELECT sg.tenant_id, sg.ip, sg.pais, sg.ciudad, sg.lat, sg.lon, sg.last_seen,
         t.nombre as tenant_nombre
       FROM session_geo sg
       LEFT JOIN tenants t ON t.id = sg.tenant_id
       WHERE sg.last_seen > NOW() - INTERVAL '15 minutes'
       AND sg.lat IS NOT NULL`
    )
    res.json(rows)
  } catch (err) {
    res.json([])
  }
})

router.get('/api/mapa/ataques', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const [rows] = await db.query(
      `SELECT ip, tipo, lat as geo_lat, lon as geo_lon, pais as geo_pais, ciudad as geo_ciudad, requests_por_minuto, created_at
       FROM ataques_log
       WHERE created_at > NOW() - make_interval(hours => ?)
       AND lat IS NOT NULL
       ORDER BY created_at DESC`,
      [horas]
    )
    res.json(rows)
  } catch (err) {
    res.json([])
  }
})

// === TAB ATAQUES ===

router.get('/api/ataques/kpis', async (req, res) => {
  try {
    const [[bloqueadas]] = await db.query(
      "SELECT COUNT(*) as c FROM ip_blacklist WHERE expira_en > NOW() OR expira_en IS NULL"
    )
    const [[ataques24h]] = await db.query(
      "SELECT COUNT(*) as c FROM ataques_log WHERE created_at > NOW() - INTERVAL '24 hours'"
    )
    const [[reqBloqueados]] = await db.query(
      "SELECT COALESCE(SUM(hits_bloqueados),0) as c FROM ip_blacklist"
    )
    const [[topTipo]] = await db.query(
      `SELECT tipo, COUNT(*) as c FROM ataques_log
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY tipo ORDER BY c DESC LIMIT 1`
    )

    res.json({
      ips_bloqueadas: parseInt(bloqueadas.c),
      ataques_24h: parseInt(ataques24h.c),
      requests_bloqueados: parseInt(reqBloqueados.c),
      top_tipo: topTipo?.tipo || 'ninguno'
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/ataques/timeline', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const [rows] = await db.query(
      `SELECT date_trunc('hour', created_at) as hora, tipo, COUNT(*) as cnt
       FROM ataques_log
       WHERE created_at > NOW() - make_interval(hours => ?)
       GROUP BY hora, tipo ORDER BY hora`,
      [horas]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/ataques/mapa', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const [rows] = await db.query(
      `SELECT lat as geo_lat, lon as geo_lon, tipo, COUNT(*) as intensidad
       FROM ataques_log
       WHERE created_at > NOW() - make_interval(hours => ?)
       AND lat IS NOT NULL
       GROUP BY lat, lon, tipo`,
      [horas]
    )
    res.json(rows)
  } catch (err) {
    res.json([])
  }
})

// Blacklist CRUD
router.get('/api/ataques/blacklist', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM ip_blacklist ORDER BY bloqueado_en DESC'
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/ataques/blacklist', async (req, res) => {
  try {
    const { ip, razon, duracion_horas } = req.body
    if (!ip || !razon) return res.status(400).json({ error: 'IP y razón requeridas' })
    if (duracion_horas) {
      const hrs = parseInt(duracion_horas) || 24
      await db.query(
        `INSERT INTO ip_blacklist (ip, razon, tipo, expira_en)
         VALUES (?, ?, 'manual', NOW() + make_interval(hours => ?))
         ON CONFLICT (ip) DO UPDATE SET razon = EXCLUDED.razon, tipo = 'manual', bloqueado_en = NOW(), expira_en = NOW() + make_interval(hours => ?)`,
        [ip, razon, hrs, hrs]
      )
    } else {
      await db.query(
        `INSERT INTO ip_blacklist (ip, razon, tipo, expira_en)
         VALUES (?, ?, 'manual', NULL)
         ON CONFLICT (ip) DO UPDATE SET razon = EXCLUDED.razon, tipo = 'manual', bloqueado_en = NOW(), expira_en = NULL`,
        [ip, razon]
      )
    }
    require('../middleware/ipGuard').forceRefresh()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/api/ataques/blacklist/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM ip_blacklist WHERE id = ?', [req.params.id])
    require('../middleware/ipGuard').forceRefresh()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/api/ataques/blacklist/:id', async (req, res) => {
  try {
    if (req.body.permanente) {
      await db.query('UPDATE ip_blacklist SET expira_en = NULL WHERE id = ?', [req.params.id])
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Whitelist CRUD
router.get('/api/ataques/whitelist', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ip_whitelist ORDER BY agregado_en DESC')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/ataques/whitelist', async (req, res) => {
  try {
    const { ip, descripcion } = req.body
    if (!ip) return res.status(400).json({ error: 'IP requerida' })
    await db.query(
      `INSERT INTO ip_whitelist (ip, descripcion)
       VALUES (?, ?)
       ON CONFLICT (ip) DO UPDATE SET descripcion = EXCLUDED.descripcion`,
      [ip, descripcion || '']
    )
    // Also remove from blacklist if present
    await db.query('DELETE FROM ip_blacklist WHERE ip = ?', [ip])
    require('../middleware/ipGuard').forceRefresh()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/api/ataques/whitelist/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM ip_whitelist WHERE id = ?', [req.params.id])
    require('../middleware/ipGuard').forceRefresh()
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Attack log + CSV export
router.get('/api/ataques/log', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const tipo = req.query.tipo
    let sql = `SELECT * FROM ataques_log WHERE created_at > NOW() - make_interval(hours => ?)`
    const params = [horas]
    if (tipo) { sql += ' AND tipo = ?'; params.push(tipo) }
    sql += ' ORDER BY created_at DESC LIMIT 200'
    const [rows] = await db.query(sql, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/ataques/exportar-csv', async (req, res) => {
  try {
    const horas = parseInt(req.query.horas) || 24
    const [rows] = await db.query(
      `SELECT * FROM ataques_log WHERE created_at > NOW() - make_interval(hours => ?) ORDER BY created_at DESC`,
      [horas]
    )
    const headers = 'id,ip,tipo,ruta,requests_por_minuto,geo_pais,geo_ciudad,accion_tomada,created_at\n'
    const csv = headers + rows.map(r =>
      `${r.id},${r.ip},${r.tipo},${r.ruta || ''},${r.requests_por_minuto || 0},${r.geo_pais || ''},${r.geo_ciudad || ''},${r.accion_tomada},${r.created_at}`
    ).join('\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename=ataques_${new Date().toISOString().split('T')[0]}.csv`)
    res.send(csv)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// === ALERTAS ===

router.get('/api/alertas/historial', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM alertas_estado ORDER BY ultimo_envio DESC'
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/alertas/silenciar', async (req, res) => {
  try {
    const { regla, minutos } = req.body
    if (!regla || !minutos) return res.status(400).json({ error: 'Regla y minutos requeridos' })
    await alertas.silenciar(regla, parseInt(minutos))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/alertas/configuracion', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM alertas_configuracion ORDER BY regla')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/api/alertas/configuracion', async (req, res) => {
  try {
    const { regla, umbral, severidad, canal, activa } = req.body
    if (!regla) return res.status(400).json({ error: 'Regla requerida' })
    await db.query(
      `UPDATE alertas_configuracion SET
         umbral = COALESCE(?::jsonb, umbral),
         severidad = COALESCE(?, severidad),
         canal = COALESCE(?, canal),
         activa = COALESCE(?, activa)
       WHERE regla = ?`,
      [umbral ? JSON.stringify(umbral) : null, severidad || null, canal || null, activa ?? null, regla]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ======================================================
// COMBINED ENDPOINTS (consumed by observabilidad.js frontend)
// Each aggregates data from sub-queries with individual try/catch
// so a missing table never crashes the whole tab.
// ======================================================

router.get('/api/negocio', async (req, res) => {
  const result = { kpis: {}, mrr: null, operaciones: null, top_tenants: null, actividad: [], inactivos: [], uso_modulos: null }
  try {
    // KPIs
    try {
      const [snapshots] = await db.query(
        "SELECT tipo, datos, calculado_en FROM kpi_snapshots WHERE tipo IN ('operaciones_hoy', 'mrr', 'tenants_activos_7d', 'churn_mensual')"
      )
      for (const s of snapshots) {
        if (s.tipo === 'mrr') result.kpis.mrr = s.datos?.mrr ?? s.datos ?? 0
        if (s.tipo === 'tenants_activos_7d') result.kpis.tenants_activos = s.datos?.count ?? s.datos?.total ?? 0
        if (s.tipo === 'operaciones_hoy') result.kpis.ventas_hoy = s.datos?.facturas?.hoy ?? s.datos?.pedidos?.hoy ?? s.datos?.total ?? 0
        if (s.tipo === 'churn_mensual') result.kpis.churn = s.datos?.churn ?? s.datos ?? 0
      }
    } catch (_) {}

    // MRR chart
    try {
      const [rows] = await db.query(
        `SELECT date_trunc('month', created_at) as mes, SUM(precio_mensual) as mrr
         FROM tenant_suscripciones WHERE estado = 'activa'
         AND created_at >= NOW() - INTERVAL '12 months'
         GROUP BY mes ORDER BY mes`
      )
      if (rows.length) {
        result.mrr = {
          labels: rows.map(r => new Date(r.mes).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' })),
          data: rows.map(r => parseFloat(r.mrr) || 0)
        }
      }
    } catch (_) {}

    // Top tenants
    try {
      const [[snapshot]] = await db.query("SELECT datos FROM kpi_snapshots WHERE tipo = 'top_tenants'")
      if (snapshot?.datos) {
        const d = Array.isArray(snapshot.datos) ? snapshot.datos : []
        result.top_tenants = {
          labels: d.map(t => t.nombre || t.tenant || ''),
          data: d.map(t => t.total || t.ventas || 0)
        }
      }
    } catch (_) {}

    // Actividad (recent facturas)
    try {
      const [rows] = await db.query(
        `SELECT t.nombre as tenant, 'Factura' as evento,
           f.total as monto, f.fecha
         FROM facturas f
         LEFT JOIN tenants t ON t.id = f.tenant_id
         ORDER BY f.created_at DESC LIMIT 10`
      )
      result.actividad = rows.map(r => ({
        tenant: r.tenant || 'Desconocido',
        evento: r.evento,
        monto: r.monto != null ? 'S/ ' + parseFloat(r.monto).toFixed(2) : '-',
        fecha: r.fecha ? new Date(r.fecha).toLocaleDateString('es-PE') : '-'
      }))
    } catch (_) {}

    // Uso modulos
    try {
      const [rows] = await db.query(
        `SELECT modulo, SUM(hits) as total_hits
         FROM modulo_usage WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY modulo ORDER BY total_hits DESC`
      )
      if (rows.length) {
        result.uso_modulos = {
          labels: rows.map(r => r.modulo),
          data: rows.map(r => parseInt(r.total_hits) || 0)
        }
      }
    } catch (_) {}

    res.json(result)
  } catch (err) {
    res.json(result) // return empty structure, never 500
  }
})

router.get('/api/rendimiento', async (req, res) => {
  const result = { kpis: {}, latencia: null, throughput: null, endpoints_lentos: [], circuit_open: false }
  try {
    // KPIs from Grafana
    try {
      const p95 = await grafana.queryProm('histogram_quantile(0.95, rate(http_request_duration_ms_bucket[1h]))')
      const errorRate = await grafana.queryProm('rate(http_errors_total[1h]) / rate(http_requests_total[1h]) * 100')
      const reqRate = await grafana.queryProm('rate(http_requests_total[5m]) * 60')
      const circuitStatus = grafana.getCircuitStatus()

      result.kpis.p50 = null
      result.kpis.p99 = p95?.data?.result?.[0]?.value?.[1] ? parseFloat(p95.data.result[0].value[1]).toFixed(1) : null
      result.kpis.rpm = reqRate?.data?.result?.[0]?.value?.[1] ? Math.round(parseFloat(reqRate.data.result[0].value[1])) : null
      result.kpis.error_rate = errorRate?.data?.result?.[0]?.value?.[1] ? parseFloat(errorRate.data.result[0].value[1]).toFixed(2) : null
      result.circuit_open = circuitStatus?.open || false
    } catch (_) {}

    // Latencia time series
    try {
      const horas = 24
      const end = Math.floor(Date.now() / 1000)
      const start = end - (horas * 3600)
      const latResult = await grafana.queryPromRange(
        'histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))',
        start, end, '1h'
      )
      if (latResult?.data?.result?.length) {
        const series = latResult.data.result[0]
        result.latencia = {
          labels: (series.values || []).map(v => new Date(v[0] * 1000).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })),
          p50: [],
          p99: (series.values || []).map(v => parseFloat(v[1]).toFixed(1))
        }
      }
    } catch (_) {}

    // Slow endpoints
    try {
      const slowResult = await grafana.queryProm(
        'topk(10, histogram_quantile(0.95, rate(http_request_duration_ms_bucket[1h])) by (route))'
      )
      if (slowResult?.data?.result?.length) {
        result.endpoints_lentos = slowResult.data.result.map(r => ({
          endpoint: r.metric?.route || '-',
          metodo: r.metric?.method || 'GET',
          p50: '-', p99: parseFloat(r.value?.[1] || 0).toFixed(1),
          rpm: '-', errores: '-'
        }))
      }
    } catch (_) {}

    res.json(result)
  } catch (err) {
    res.json(result)
  }
})

router.get('/api/seguridad', async (req, res) => {
  const result = { kpis: {}, log: [], login_fallidos_chart: null, cambios_por_tenant: null, ips_sospechosas: [] }
  try {
    // KPIs
    try {
      const [[fallidos]] = await db.query(
        "SELECT COUNT(*) as c FROM audit_log WHERE action = 'login_failed' AND created_at >= CURRENT_DATE"
      )
      result.kpis.login_fallidos = parseInt(fallidos?.c) || 0
    } catch (_) { result.kpis.login_fallidos = 0 }

    try {
      const [[bloqueadas]] = await db.query(
        "SELECT COUNT(*) as c FROM ip_blacklist WHERE expira_en > NOW() OR expira_en IS NULL"
      )
      result.kpis.ips_bloqueadas = parseInt(bloqueadas?.c) || 0
    } catch (_) { result.kpis.ips_bloqueadas = 0 }

    try {
      const [[criticos]] = await db.query(
        `SELECT COUNT(*) as c FROM audit_log
         WHERE created_at >= CURRENT_DATE
         AND action IN ('role_change','user_delete','price_change','config_change')`
      )
      result.kpis.eventos = parseInt(criticos?.c) || 0
    } catch (_) { result.kpis.eventos = 0 }

    result.kpis.rate_limit_hits = 0

    // Log de seguridad
    try {
      const [rows] = await db.query(
        `SELECT action as tipo, ip_address as ip, user_id, entity as detalle, created_at
         FROM audit_log
         WHERE created_at > NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC LIMIT 30`
      )
      result.log = rows.map(r => ({
        fecha: r.created_at ? new Date(r.created_at).toLocaleString('es-PE') : '-',
        tipo: r.tipo || '-',
        ip: r.ip || '-',
        usuario: r.user_id || '-',
        detalle: r.detalle || '-',
        severidad: ['login_failed', 'role_change', 'user_delete'].includes(r.tipo) ? 'Alta' : 'Normal'
      }))
    } catch (_) {}

    // IPs sospechosas
    try {
      const [rows] = await db.query(
        `SELECT ip_address as ip, COUNT(*) as intentos, MAX(created_at) as ultimo_intento
         FROM audit_log
         WHERE action = 'login_failed' AND created_at > NOW() - INTERVAL '24 hours'
         GROUP BY ip_address ORDER BY intentos DESC LIMIT 20`
      )
      result.ips_sospechosas = rows.map(r => ({
        ip: r.ip, intentos: parseInt(r.intentos), ultimo_intento: r.ultimo_intento ? new Date(r.ultimo_intento).toLocaleString('es-PE') : '-', pais: '-'
      }))
    } catch (_) {}

    res.json(result)
  } catch (err) {
    res.json(result)
  }
})

router.get('/api/infra', async (req, res) => {
  const result = { kpis: {}, cpu_mem: null, db_pool_chart: null, servicios: [], circuit_open: false }
  try {
    // KPIs from Grafana (or fallback to process info)
    try {
      const mem = process.memoryUsage()
      const memMB = Math.round(mem.heapUsed / 1024 / 1024)
      result.kpis.memoria = memMB + ' MB'
      result.kpis.cpu = null
      result.kpis.disco = null
    } catch (_) {}

    try {
      const dbPool = await grafana.queryProm('db_pool_active')
      result.kpis.db_pool = dbPool?.data?.result?.[0]?.value?.[1] ?? null
      result.circuit_open = grafana.getCircuitStatus()?.open || false
    } catch (_) {}

    // Servicios (basic health checks)
    result.servicios = [
      { servicio: 'PostgreSQL', estado: 'ok', uptime: '-', latencia: '-', ultima_verificacion: new Date().toLocaleString('es-PE') },
      { servicio: 'Express', estado: 'ok', uptime: Math.round(process.uptime() / 60) + ' min', latencia: '-', ultima_verificacion: new Date().toLocaleString('es-PE') }
    ]

    // Verify DB connection
    try {
      const t0 = Date.now()
      await db.query('SELECT 1')
      const latMs = Date.now() - t0
      result.servicios[0].latencia = latMs + 'ms'
    } catch (_) {
      result.servicios[0].estado = 'error'
    }

    res.json(result)
  } catch (err) {
    res.json(result)
  }
})

router.get('/api/ataques', async (req, res) => {
  const result = { kpis: {}, timeline: null, tipos: null, blacklist: [], whitelist: [], log: [], geo: [] }
  try {
    // KPIs
    try {
      const [[ataques24h]] = await db.query(
        "SELECT COUNT(*) as c FROM ataques_log WHERE created_at > NOW() - INTERVAL '24 hours'"
      )
      result.kpis.ataques_24h = parseInt(ataques24h?.c) || 0
    } catch (_) { result.kpis.ataques_24h = 0 }

    try {
      const [[bloqueadas]] = await db.query(
        "SELECT COUNT(*) as c FROM ip_blacklist WHERE expira_en > NOW() OR expira_en IS NULL"
      )
      result.kpis.blacklisted = parseInt(bloqueadas?.c) || 0
    } catch (_) { result.kpis.blacklisted = 0 }

    try {
      const [[whitelisted]] = await db.query("SELECT COUNT(*) as c FROM ip_whitelist")
      result.kpis.whitelisted = parseInt(whitelisted?.c) || 0
    } catch (_) { result.kpis.whitelisted = 0 }

    try {
      const [[reqBloqueados]] = await db.query(
        "SELECT COALESCE(SUM(hits_bloqueados),0) as c FROM ip_blacklist"
      )
      result.kpis.bloqueados_hoy = parseInt(reqBloqueados?.c) || 0
    } catch (_) { result.kpis.bloqueados_hoy = 0 }

    // Timeline
    try {
      const [rows] = await db.query(
        `SELECT date_trunc('hour', created_at) as hora, tipo, COUNT(*) as cnt
         FROM ataques_log
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY hora, tipo ORDER BY hora`
      )
      if (rows.length) {
        const horas = [...new Set(rows.map(r => new Date(r.hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })))]
        const tipos = [...new Set(rows.map(r => r.tipo))]
        result.timeline = {
          labels: horas,
          datasets: tipos.map(tipo => ({
            label: tipo,
            data: horas.map(h => {
              const match = rows.find(r =>
                new Date(r.hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) === h && r.tipo === tipo
              )
              return match ? parseInt(match.cnt) : 0
            })
          }))
        }
      }
    } catch (_) {}

    // Tipos (doughnut)
    try {
      const [rows] = await db.query(
        `SELECT tipo, COUNT(*) as cnt FROM ataques_log
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY tipo ORDER BY cnt DESC`
      )
      if (rows.length) {
        result.tipos = {
          labels: rows.map(r => r.tipo),
          data: rows.map(r => parseInt(r.cnt))
        }
      }
    } catch (_) {}

    // Blacklist
    try {
      const [rows] = await db.query('SELECT * FROM ip_blacklist ORDER BY bloqueado_en DESC')
      result.blacklist = rows.map(r => ({
        id: r.id, ip: r.ip, razon: r.razon || '-',
        duracion: r.expira_en ? 'Temporal' : 'Permanente',
        permanente: !r.expira_en,
        fecha_bloqueo: r.bloqueado_en ? new Date(r.bloqueado_en).toLocaleString('es-PE') : '-',
        expira: r.expira_en ? new Date(r.expira_en).toLocaleString('es-PE') : 'Nunca'
      }))
    } catch (_) {}

    // Whitelist
    try {
      const [rows] = await db.query('SELECT * FROM ip_whitelist ORDER BY agregado_en DESC')
      result.whitelist = rows.map(r => ({
        id: r.id, ip: r.ip, descripcion: r.descripcion || '-',
        fecha_agregado: r.agregado_en ? new Date(r.agregado_en).toLocaleString('es-PE') : '-'
      }))
    } catch (_) {}

    // Geo data for mini map (frontend expects geo_lat/geo_lon)
    try {
      const [rows] = await db.query(
        `SELECT lat, lon, tipo, COUNT(*) as intensidad
         FROM ataques_log
         WHERE created_at > NOW() - INTERVAL '24 hours' AND lat IS NOT NULL
         GROUP BY lat, lon, tipo`
      )
      result.geo = rows.map(r => ({
        geo_lat: parseFloat(r.lat), geo_lon: parseFloat(r.lon), tipo: r.tipo, intensidad: parseInt(r.intensidad)
      }))
    } catch (_) {}

    res.json(result)
  } catch (err) {
    res.json(result)
  }
})

// === VIEW ===

router.get('/', async (req, res) => {
  res.render('superadmin/observabilidad', {
    pageTitle: 'Observabilidad',
    user: req.session.user
  })
})

module.exports = router
