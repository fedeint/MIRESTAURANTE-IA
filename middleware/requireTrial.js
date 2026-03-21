// middleware/requireTrial.js
'use strict';

const db = require('../db');

function wantsJson(req) {
  const accept = String(req.headers.accept || '').toLowerCase();
  return req.xhr || accept.includes('application/json') ||
    String(req.path || '').startsWith('/api/');
}

// Paths que no requieren trial activo
const EXCLUDED_PATHS = [
  '/login', '/logout', '/setup', '/landing', '/auth/',
  '/espera-verificacion', '/trial-expirado', '/onboarding',
  '/api/cron', '/firmar', '/libro-reclamaciones', '/privacidad',
  '/terminos', '/api/pagos', '/api/health', '/sw.js',
  '/vendor/', '/static/'
];

/**
 * Middleware que verifica el estado del trial para tenants con auth Google.
 * Orden de evaluación:
 *   1. plan pagado → skip
 *   2. auth local → skip
 *   3. evaluar estado_trial
 */
function requireTrialActivo(req, res, next) {
  // Excluir paths públicos
  const reqPath = req.path || req.originalUrl || '';
  if (EXCLUDED_PATHS.some(p => reqPath.startsWith(p))) return next();

  const user = req.session && req.session.user;
  if (!user) return next();

  // Auth local (on-premise) no tiene trial
  if (user.auth_provider === 'local' || !user.auth_provider) return next();

  const tenant = req.tenant;
  if (!tenant) return next();

  // Plan pagado no tiene restricción de trial
  if (tenant.plan === 'pro' || tenant.plan === 'enterprise') return next();

  const estado = tenant.estado_trial;

  if (estado === 'pendiente') {
    if (wantsJson(req)) return res.status(403).json({ error: 'Tu cuenta está en revisión' });
    return res.redirect('/espera-verificacion');
  }

  if (estado === 'expirado') {
    if (wantsJson(req)) return res.status(403).json({ error: 'Tu prueba gratuita ha terminado' });
    return res.redirect('/trial-expirado');
  }

  if (estado === 'activo' && tenant.trial_fin) {
    const ahora = new Date();
    const fin = new Date(tenant.trial_fin);
    if (ahora > fin) {
      // Marcar como expirado (fire-and-forget, logged on failure)
      db.query('UPDATE tenants SET estado_trial = ? WHERE id = ?', ['expirado', tenant.id])
        .catch(err => console.error('Error updating trial status:', err.message));
      if (wantsJson(req)) return res.status(403).json({ error: 'Tu prueba gratuita ha terminado' });
      return res.redirect('/trial-expirado');
    }
  }

  next();
}

/**
 * Bloquea exportaciones masivas para tenants en trial.
 */
function blockTrialExports(req, res, next) {
  const user = req.session?.user;
  if (!user || user.auth_provider === 'local' || !user.auth_provider) return next();

  const tenant = req.tenant;
  if (!tenant || tenant.plan === 'pro' || tenant.plan === 'enterprise') return next();

  if (tenant.estado_trial === 'activo') {
    const exportPaths = ['/api/reportes/excel', '/api/backups', '/api/ventas/export'];
    if (exportPaths.some(p => req.path.startsWith(p))) {
      return res.status(403).json({
        error: 'Exportación no disponible en versión de prueba. Actualiza tu plan.'
      });
    }
  }

  next();
}

module.exports = { requireTrialActivo, blockTrialExports };
