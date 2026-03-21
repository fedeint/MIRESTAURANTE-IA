// middleware/telemetry.js
const grafana = require('../lib/grafana-client')

function telemetry(req, res, next) {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    const route = req.route?.path || req.path
    const method = req.method
    const status = String(res.statusCode)
    const labels = { method, route, status }

    grafana.pushMetric('http_request_duration_ms', duration, labels, 'gauge')
    grafana.pushMetric('http_requests_total', 1, labels, 'sum')
    if (res.statusCode >= 400) {
      grafana.pushMetric('http_errors_total', 1, labels, 'sum')
    }

    // Vercel function duration from header
    const vercelDuration = req.headers['x-vercel-duration']
    if (vercelDuration) {
      grafana.pushMetric('vercel_function_duration_ms', parseFloat(vercelDuration) * 1000, {}, 'gauge')
    }

    // DB pool metrics
    const pool = require('../db').pool
    if (pool) {
      grafana.pushMetric('db_pool_active', pool.totalCount - pool.idleCount, {}, 'gauge')
      grafana.pushMetric('db_pool_idle', pool.idleCount, {}, 'gauge')
      grafana.pushMetric('db_pool_waiting', pool.waitingCount, {}, 'gauge')
    }
  })
  next()
}

module.exports = telemetry
