// Vercel serverless entry point (lazy load + bootstrap error guard)
let appInstance = null;

module.exports = (req, res) => {
  try {
    if (!appInstance) {
      appInstance = require('../server');
    }
    return appInstance(req, res);
  } catch (error) {
    console.error('[vercel-bootstrap] failed to initialize app:', error);
    res.status(500).json({
      error: 'BOOTSTRAP_FAILED',
      message: process.env.NODE_ENV === 'production'
        ? 'Server initialization failed'
        : (error?.message || 'Server initialization failed')
    });
  }
};
