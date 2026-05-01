// Re-export the main db pool (already migrated to PostgreSQL)
// This file kept for backward compatibility - use db.js directly
module.exports = require('../db');
