const db = require('../db');

async function registrarAudit({ tenantId, usuarioId, accion, modulo, tabla, registroId, datosAnteriores, datosNuevos, ip, userAgent }) {
    try {
        await db.query(
            `INSERT INTO audit_log (tenant_id, usuario_id, accion, modulo, tabla_afectada, registro_id, datos_anteriores, datos_nuevos, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tenantId || 1,
                usuarioId || 0,
                accion,
                modulo || '',
                tabla || '',
                registroId || null,
                datosAnteriores ? JSON.stringify(datosAnteriores) : null,
                datosNuevos ? JSON.stringify(datosNuevos) : null,
                ip || null,
                userAgent ? String(userAgent).substring(0, 300) : null
            ]
        );
    } catch (err) {
        console.error('Audit log error:', err.message);
    }
}

module.exports = { registrarAudit };
