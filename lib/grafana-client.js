// lib/grafana-client.js
const logger = require('./logger')

// Circuit breaker state
let failures = 0
let circuitOpenUntil = 0
const MAX_FAILURES = 3
const CIRCUIT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function isCircuitOpen() {
  if (Date.now() < circuitOpenUntil) return true
  if (failures >= MAX_FAILURES) {
    failures = 0
    return false
  }
  return false
}

function recordSuccess() { failures = 0; circuitOpenUntil = 0 }

function recordFailure() {
  failures++
  if (failures >= MAX_FAILURES) {
    circuitOpenUntil = Date.now() + CIRCUIT_TIMEOUT_MS
    logger.warn('GRAFANA_CIRCUIT_OPEN', { reopenAt: new Date(circuitOpenUntil).toISOString() })
  }
}

async function pushMetric(name, value, labels = {}, type = 'gauge') {
  if (isCircuitOpen()) return
  const url = process.env.GRAFANA_CLOUD_OTLP_URL
  const key = process.env.GRAFANA_CLOUD_WRITE_KEY
  if (!url || !key) return
  try {
    const body = {
      resourceMetrics: [{
        scopeMetrics: [{
          metrics: [{
            name,
            [type === 'gauge' ? 'gauge' : 'sum']: {
              dataPoints: [{
                asInt: Math.round(value),
                timeUnixNano: String(Date.now() * 1000000),
                attributes: Object.entries(labels).map(([k, v]) => ({
                  key: k, value: { stringValue: String(v) }
                }))
              }]
            }
          }]
        }]
      }]
    }
    const resp = await fetch(`${url}/v1/metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${process.env.GRAFANA_CLOUD_PROM_USER}:${key}`).toString('base64')}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    })
    if (resp.ok) recordSuccess()
    else recordFailure()
  } catch (err) {
    recordFailure()
    logger.warn('GRAFANA_PUSH_FAILED', { metric: name, error: err.message })
  }
}

async function pushLog(labels, message) {
  if (isCircuitOpen()) return
  const url = process.env.GRAFANA_CLOUD_LOKI_URL
  const key = process.env.GRAFANA_CLOUD_WRITE_KEY
  const user = process.env.GRAFANA_CLOUD_LOKI_USER
  if (!url || !key) return
  try {
    const body = {
      streams: [{
        stream: labels,
        values: [[String(Date.now() * 1000000), typeof message === 'string' ? message : JSON.stringify(message)]]
      }]
    }
    const resp = await fetch(`${url}/loki/api/v1/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    })
    if (resp.ok) recordSuccess()
    else recordFailure()
  } catch (err) {
    recordFailure()
    logger.warn('LOKI_PUSH_FAILED', { error: err.message })
  }
}

async function queryProm(promql) {
  if (isCircuitOpen()) return { status: 'error', data: null, circuitOpen: true }
  const url = process.env.GRAFANA_CLOUD_PROM_URL
  const key = process.env.GRAFANA_CLOUD_READ_KEY
  const user = process.env.GRAFANA_CLOUD_PROM_USER
  if (!url || !key) return { status: 'error', data: null, notConfigured: true }
  try {
    const resp = await fetch(`${url}/api/prom/api/v1/query?query=${encodeURIComponent(promql)}`, {
      headers: { 'Authorization': `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}` },
      signal: AbortSignal.timeout(10000)
    })
    if (!resp.ok) { recordFailure(); return { status: 'error', data: null } }
    recordSuccess()
    return await resp.json()
  } catch (err) {
    recordFailure()
    return { status: 'error', data: null, error: err.message }
  }
}

async function queryPromRange(promql, start, end, step = '1h') {
  if (isCircuitOpen()) return { status: 'error', data: null, circuitOpen: true }
  const url = process.env.GRAFANA_CLOUD_PROM_URL
  const key = process.env.GRAFANA_CLOUD_READ_KEY
  const user = process.env.GRAFANA_CLOUD_PROM_USER
  if (!url || !key) return { status: 'error', data: null, notConfigured: true }
  try {
    const params = new URLSearchParams({ query: promql, start, end, step })
    const resp = await fetch(`${url}/api/prom/api/v1/query_range?${params}`, {
      headers: { 'Authorization': `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}` },
      signal: AbortSignal.timeout(10000)
    })
    if (!resp.ok) { recordFailure(); return { status: 'error', data: null } }
    recordSuccess()
    return await resp.json()
  } catch (err) {
    recordFailure()
    return { status: 'error', data: null, error: err.message }
  }
}

async function queryLoki({ severidad, evento, tenant_id, desde, hasta, limit = 100 }) {
  if (isCircuitOpen()) return { status: 'error', data: null, circuitOpen: true }
  const url = process.env.GRAFANA_CLOUD_LOKI_URL
  const key = process.env.GRAFANA_CLOUD_READ_KEY
  const user = process.env.GRAFANA_CLOUD_LOKI_USER
  if (!url || !key) return { status: 'error', data: null, notConfigured: true }
  let logql = '{job="observabilidad"}'
  const filters = []
  if (severidad) filters.push(`| json | severidad = \`${severidad.replace(/[`\\]/g, '')}\``)
  if (evento) filters.push(`| json | evento = \`${evento.replace(/[`\\]/g, '')}\``)
  if (tenant_id) filters.push(`| json | tenant_id = \`${String(tenant_id).replace(/[`\\]/g, '')}\``)
  if (filters.length) logql += ' ' + filters.join(' ')
  try {
    const params = new URLSearchParams({
      query: logql, limit: String(limit),
      ...(desde && { start: String(new Date(desde).getTime() * 1000000) }),
      ...(hasta && { end: String(new Date(hasta).getTime() * 1000000) })
    })
    const resp = await fetch(`${url}/loki/api/v1/query_range?${params}`, {
      headers: { 'Authorization': `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}` },
      signal: AbortSignal.timeout(10000)
    })
    if (!resp.ok) { recordFailure(); return { status: 'error', data: null } }
    recordSuccess()
    return await resp.json()
  } catch (err) {
    recordFailure()
    return { status: 'error', data: null, error: err.message }
  }
}

function getCircuitStatus() {
  return { open: isCircuitOpen(), failures, reopenAt: circuitOpenUntil ? new Date(circuitOpenUntil) : null }
}

module.exports = { pushMetric, pushLog, queryProm, queryPromRange, queryLoki, getCircuitStatus }
