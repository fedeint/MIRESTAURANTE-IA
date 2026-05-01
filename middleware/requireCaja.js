const db = require('../db');

// Middleware: verifica que hay una caja abierta antes de permitir operar
async function requireCajaAbierta(req, res, next) {
    try {
        const [[caja]] = await db.query(
            "SELECT id FROM cajas WHERE tenant_id=? AND estado='abierta' LIMIT 1",
            [req.tenantId || 1]
        );
        if (caja) {
            req.cajaId = caja.id;
            return next();
        }
    } catch (e) {
        console.error('requireCajaAbierta error:', e.message);
        // Si la tabla no existe, dejar pasar (compatibilidad con BD antigua)
        if (e.code === 'ER_NO_SUCH_TABLE') return next();
        // Cualquier otro error: redirigir a caja
    }

    // No hay caja abierta
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(403).json({ error: 'No hay caja abierta. Abre la caja primero en /caja' });
    }
    return res.redirect('/caja?msg=abre-caja');
}

module.exports = { requireCajaAbierta };
