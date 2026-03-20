const db = require('../db');
const logger = require('./logger');

async function checkSuspiciousLogin(tenantId, userId, userName, currentCountry, currentIp) {
    if (!currentCountry || currentCountry === 'unknown') return;
    try {
        const [history] = await db.query(
            `SELECT DISTINCT country FROM login_history
             WHERE user_id = ? AND success = true AND country != 'unknown'
               AND created_at > NOW() - INTERVAL '90 days'`,
            [userId]
        );
        const knownCountries = history.map(r => r.country).filter(Boolean);
        if (knownCountries.length > 0 && !knownCountries.includes(currentCountry)) {
            logger.security('suspicious_login_new_country', {
                tenantId,
                userId,
                userName,
                newCountry: currentCountry,
                knownCountries,
                ip: currentIp
            });
            return true; // suspicious
        }
    } catch (_) {}
    return false;
}

module.exports = { checkSuspiciousLogin };
