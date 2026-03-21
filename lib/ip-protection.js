// lib/ip-protection.js
const db = require('../db')
const logger = require('./logger')
const alertas = require('./alertas')
const grafana = require('./grafana-client')

async function detectarAtaques() {
  try {
    // DDoS: > 100 req/min from same IP
    const [ddos] = await db.query(
      `SELECT ip, COUNT(*) as cnt FROM request_counts
       WHERE created_at > NOW() - INTERVAL '1 minute'
       GROUP BY ip HAVING COUNT(*) > 100`
    )
    for (const row of ddos) {
      await bloquearIP(row.ip, `DDoS: ${row.cnt} req/min`, 'ddos', 60, row.cnt)
    }

    // Brute force: > 5 login failures in 15min from same IP
    const [bruteForce] = await db.query(
      `SELECT ip_address as ip, COUNT(*) as cnt FROM audit_log
       WHERE action = 'login_failed' AND created_at > NOW() - INTERVAL '15 minutes'
       GROUP BY ip_address HAVING COUNT(*) > 5`
    )
    for (const row of bruteForce) {
      await bloquearIP(row.ip, `Brute force: ${row.cnt} login fallidos en 15min`, 'brute_force', 30, row.cnt)
    }

    // Credential stuffing: > 10 distinct users failed from same IP in 15min
    const [credStuffing] = await db.query(
      `SELECT ip_address as ip, COUNT(DISTINCT entity_id) as users, COUNT(*) as cnt FROM audit_log
       WHERE action = 'login_failed' AND created_at > NOW() - INTERVAL '15 minutes'
       GROUP BY ip_address HAVING COUNT(DISTINCT entity_id) > 10`
    )
    for (const row of credStuffing) {
      await bloquearIP(row.ip, `Credential stuffing: ${row.users} usuarios distintos`, 'credential_stuffing', 1440, row.cnt)
    }

    // Scan/probe: > 20 requests with 404 status per minute
    const [scanners] = await db.query(
      `SELECT ip, COUNT(*) as cnt FROM request_counts
       WHERE created_at > NOW() - INTERVAL '1 minute'
       AND status_code = 404
       GROUP BY ip HAVING COUNT(*) > 20`
    )
    for (const row of scanners) {
      await bloquearIP(row.ip, `Scan: ${row.cnt} 404s/min`, 'scan', 120, row.cnt)
    }

    // API abuse: > 60 req/min to same endpoint from same IP
    const [abusers] = await db.query(
      `SELECT ip, ruta, COUNT(*) as cnt FROM request_counts
       WHERE created_at > NOW() - INTERVAL '1 minute'
       GROUP BY ip, ruta HAVING COUNT(*) > 60`
    )
    for (const row of abusers) {
      await bloquearIP(row.ip, `API abuse: ${row.cnt} req/min a ${row.ruta}`, 'api_abuse', 60, row.cnt)
    }

    // Sustained attack: same IP blocked 3+ times in 24h
    const [sostenidos] = await db.query(
      `SELECT ip, COUNT(*) as cnt FROM ataques_log
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY ip HAVING COUNT(*) >= 3`
    )
    for (const row of sostenidos) {
      await bloquearIP(row.ip, `Ataque sostenido: ${row.cnt} bloqueos en 24h`, 'ddos', 1440, 0)
      await alertas.disparar('ataque_sostenido', 'critical', { ip: row.ip, bloqueos_24h: row.cnt })
    }

    // Cleanup old request_counts (> 5 min)
    await db.query("DELETE FROM request_counts WHERE created_at < NOW() - INTERVAL '5 minutes'")
  } catch (err) {
    logger.error('ATTACK_DETECTION_FAILED', { error: err.message })
  }
}

async function bloquearIP(ip, razon, tipo, duracionMinutos, reqPorMinuto) {
  try {
    const [[white]] = await db.query('SELECT id FROM ip_whitelist WHERE ip = ?', [ip])
    if (white) return

    const mins = parseInt(duracionMinutos) || 60
    await db.query(
      `INSERT INTO ip_blacklist (ip, razon, tipo, expira_en)
       VALUES (?, ?, 'auto', NOW() + make_interval(mins => ?))
       ON CONFLICT (ip) DO UPDATE SET
         bloqueado_en = NOW(),
         expira_en = NOW() + make_interval(mins => ?),
         razon = EXCLUDED.razon`,
      [ip, razon, mins, mins]
    )

    const [[lastReq]] = await db.query(
      'SELECT pais, ciudad, lat, lon FROM session_geo WHERE ip = ? LIMIT 1', [ip]
    )

    await db.query(
      `INSERT INTO ataques_log (ip, tipo, requests_por_minuto, geo_pais, geo_ciudad, geo_lat, geo_lon, accion_tomada)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'blocked')`,
      [ip, tipo, reqPorMinuto || 0,
       lastReq?.pais || null, lastReq?.ciudad || null,
       lastReq?.lat || null, lastReq?.lon || null]
    )

    grafana.pushLog(
      { job: 'observabilidad', level: 'SECURITY', event: 'ip_blocked' },
      JSON.stringify({ ip, razon, tipo, duracion_min: mins })
    )

    const TIPO_A_REGLA = { ddos: 'ddos_detectado', brute_force: 'brute_force', credential_stuffing: 'credential_stuffing', api_abuse: 'api_abuse', scan: 'ddos_detectado' }
    const alertRegla = TIPO_A_REGLA[tipo] || 'ddos_detectado'
    const sev = ['ddos', 'brute_force', 'credential_stuffing'].includes(tipo) ? 'critical' : 'warning'
    await alertas.disparar(alertRegla, sev, { ip, razon, tipo })

    logger.security('IP_BLOCKED', { ip, razon, tipo, duracion_min: mins })
  } catch (err) {
    logger.error('IP_BLOCK_FAILED', { ip, error: err.message })
  }
}

async function cargarListas() {
  try {
    const [blacklist] = await db.query(
      "SELECT ip FROM ip_blacklist WHERE expira_en > NOW() OR expira_en IS NULL"
    )
    const [whitelist] = await db.query("SELECT ip FROM ip_whitelist")
    return {
      blacklistSet: new Set(blacklist.map(r => r.ip)),
      whitelistSet: new Set(whitelist.map(r => r.ip))
    }
  } catch (err) {
    logger.error('IP_LISTS_LOAD_FAILED', { error: err.message })
    return { blacklistSet: new Set(), whitelistSet: new Set() }
  }
}

module.exports = { detectarAtaques, bloquearIP, cargarListas }
