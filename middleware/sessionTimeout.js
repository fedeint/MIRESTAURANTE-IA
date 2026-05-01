'use strict';

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Tracks last activity timestamp in session.
 * Destroys session if idle for more than 8 hours.
 * The absolute 24h max is enforced by cookie.maxAge in session config.
 */
function sessionTimeout(req, res, next) {
  if (!req.session || !req.session.user) return next();

  const now = Date.now();
  const lastActivity = req.session.lastActivity || now;

  if (now - lastActivity > IDLE_TIMEOUT_MS) {
    // Session idle too long — destroy it
    return req.session.destroy(() => {
      if (req.xhr || (req.headers.accept || '').includes('json') || req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Sesión expirada por inactividad' });
      }
      res.redirect('/login?expired=1');
    });
  }

  // Update last activity
  req.session.lastActivity = now;
  next();
}

module.exports = { sessionTimeout };
