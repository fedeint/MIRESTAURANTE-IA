const db = require('../db');

async function auditLog(req, action, entity, entityId, oldData, newData) {
    try {
        await db.query(
            `INSERT INTO audit_log (tenant_id, user_id, action, entity, entity_id, old_data, new_data, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.tenantId || 1,
                req.session?.user?.id || null,
                action,
                entity,
                entityId || null,
                oldData ? JSON.stringify(oldData) : null,
                newData ? JSON.stringify(newData) : null,
                req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.ip
            ]
        );
    } catch (err) {
        // Never fail a user request because audit logging failed
        console.warn('[AUDIT] Failed:', err.message);
    }
}

module.exports = { auditLog };
