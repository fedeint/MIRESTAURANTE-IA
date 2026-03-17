const db = require('../db');

// Middleware: verifica que hay una caja abierta antes de permitir operar
async function requireCajaAbierta(req, res, next) {
    try {
        const [[caja]] = await db.query(
            "SELECT id FROM cajas WHERE tenant_id=1 AND estado='abierta' LIMIT 1"
        );
        if (caja) {
            req.cajaId = caja.id;
            return next();
        }
    } catch (e) {
        // Si la tabla no existe, dejar pasar (compatibilidad)
        return next();
    }

    // No hay caja abierta
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(403).json({ error: 'No hay caja abierta. Abre la caja primero en /caja' });
    }
    return res.redirect('/caja?msg=abre-caja');
}

module.exports = { requireCajaAbierta };
