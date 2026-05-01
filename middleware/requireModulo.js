'use strict';
const db = require('../db');

/**
 * Middleware that checks if a module is enabled for the current tenant.
 * Reads from tenant_suscripciones.modulos_habilitados JSONB field.
 * @param {string} modulo - Module key (e.g. 'sub_recetas', 'delivery_rappi')
 */
function requireModulo(modulo) {
  return async (req, res, next) => {
    const tid = req.tenantId || 1;
    try {
      const [[sub]] = await db.query(
        `SELECT modulos_habilitados FROM tenant_suscripciones WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`,
        [tid]
      );
      const modulos = sub?.modulos_habilitados || {};
      if (!modulos[modulo]) {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json')) || String(req.path || '').startsWith('/api/')) {
          return res.status(403).json({ error: `Módulo "${modulo}" no disponible en tu plan. Contacta a soporte para activarlo.` });
        }
        return res.status(403).render('error', {
          error: { message: `El módulo "${modulo}" no está incluido en tu plan actual.`, stack: '' }
        });
      }
      next();
    } catch (e) {
      // Fail open if table doesn't exist yet
      next();
    }
  };
}

module.exports = { requireModulo };
