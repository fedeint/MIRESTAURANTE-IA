// middleware/sessionGeo.js
const db = require('../db')

function sessionGeo(req, res, next) {
  res.on('finish', () => {
    if (!req.session?.id || !req.geo?.lat) return
    db.query(
      `INSERT INTO session_geo (session_id, tenant_id, usuario_id, ip, pais, ciudad, lat, lon, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         ip = EXCLUDED.ip, pais = EXCLUDED.pais, ciudad = EXCLUDED.ciudad,
         lat = EXCLUDED.lat, lon = EXCLUDED.lon, last_seen = NOW()`,
      [req.session.id, req.tenantId || null, req.session?.user?.id || null,
       req.geo.ip, req.geo.country, req.geo.city, req.geo.lat, req.geo.lon]
    ).catch(() => {})
  })
  next()
}

module.exports = sessionGeo
