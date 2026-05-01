// middleware/moduloUsage.js
const db = require('../db')

const RUTA_A_MODULO = {
  '/mesas': 'mesas', '/cocina': 'cocina', '/caja': 'caja',
  '/facturas': 'facturacion', '/ventas': 'ventas', '/almacen': 'almacen',
  '/productos': 'productos', '/clientes': 'clientes',
  '/administracion': 'administracion', '/canales': 'canales',
  '/usuarios': 'usuarios', '/configuracion': 'configuracion'
}

function moduloUsage(req, res, next) {
  res.on('finish', () => {
    const tenantId = req.tenantId
    if (!tenantId) return
    const firstSegment = '/' + (req.path.split('/')[1] || '')
    const modulo = RUTA_A_MODULO[firstSegment]
    if (!modulo) return
    db.query(
      `INSERT INTO modulo_usage (tenant_id, modulo, fecha, hits)
       VALUES (?, ?, CURRENT_DATE, 1)
       ON CONFLICT (tenant_id, modulo, fecha) DO UPDATE SET hits = modulo_usage.hits + 1`,
      [tenantId, modulo]
    ).catch(() => {})
  })
  next()
}

module.exports = moduloUsage
