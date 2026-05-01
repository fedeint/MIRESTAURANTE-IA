// middleware/ipGuard.js
const db = require('../db')
const { cargarListas } = require('../lib/ip-protection')
const logger = require('../lib/logger')

let blacklistSet = new Set()
let whitelistSet = new Set()
let lastRefresh = 0
const REFRESH_INTERVAL = 60000

async function refreshCache() {
  const now = Date.now()
  if (now - lastRefresh < REFRESH_INTERVAL) return
  lastRefresh = now
  try {
    const listas = await cargarListas()
    blacklistSet = listas.blacklistSet
    whitelistSet = listas.whitelistSet
  } catch (err) {
    logger.warn('IPGUARD_CACHE_REFRESH_FAILED', { error: err.message })
  }
}

function forceRefresh() { lastRefresh = 0 }

function getClientIP(req) {
  return req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
}

// Eagerly load on module init (cold start)
refreshCache().catch(() => {})

async function ipGuard(req, res, next) {
  // Non-blocking refresh
  refreshCache().catch(() => {})

  const ip = getClientIP(req)
  if (whitelistSet.has(ip)) return next()
  if (blacklistSet.has(ip)) {
    db.query('UPDATE ip_blacklist SET hits_bloqueados = hits_bloqueados + 1 WHERE ip = ?', [ip]).catch(() => {})
    return res.status(403).json({ error: 'Acceso bloqueado' })
  }

  // Log request count for attack detection (fire-and-forget)
  res.on('finish', () => {
    const ruta = req.route?.path || req.path
    db.query(
      'INSERT INTO request_counts (ip, ruta, status_code) VALUES (?, ?, ?)',
      [ip, ruta, res.statusCode]
    ).catch(() => {})
  })

  next()
}

module.exports = ipGuard
module.exports.forceRefresh = forceRefresh
module.exports.getClientIP = getClientIP
