// services/dallia-actions/recordatorio-cerrar-caja.js
// DalIA Action: detects open cajas after 22:00 Lima time and reminds admin to close.
// Prevents forgotten open cajas causing next-day accounting discrepancies.

'use strict';

const NAME = 'recordatorio_cerrar_caja';

/**
 * Returns current hour in America/Lima timezone (0-23).
 */
function horaLima() {
    const lima = new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false });
    return parseInt(lima, 10);
}

/**
 * Detect: only propose after 22:00 Lima time. Finds cajas still 'abierta' opened today.
 */
async function detect(tenantId, { db }) {
    const hora = horaLima();
    if (hora < 22) {
        return {
            shouldPropose: false,
            message: 'El recordatorio de cierre de caja se activa después de las 10 PM.'
        };
    }

    const [rows] = await db.query(`
        SELECT
            c.id,
            c.nombre_caja,
            c.fecha_apertura,
            c.monto_apertura,
            u.nombre AS cajero_nombre,
            u.usuario AS cajero_usuario,
            COALESCE(SUM(CASE WHEN cm.tipo='ingreso' AND NOT cm.anulado THEN cm.monto ELSE 0 END), 0) AS total_ingresos,
            COALESCE(SUM(CASE WHEN cm.tipo='egreso'  AND NOT cm.anulado THEN cm.monto ELSE 0 END), 0) AS total_egresos
        FROM cajas c
        LEFT JOIN usuarios u ON u.id = c.usuario_id
        LEFT JOIN caja_movimientos cm ON cm.caja_id = c.id
        WHERE c.tenant_id = ?
          AND c.estado = 'abierta'
          AND c.fecha_apertura AT TIME ZONE 'America/Lima' >= CURRENT_DATE AT TIME ZONE 'America/Lima'
        GROUP BY c.id, c.nombre_caja, c.fecha_apertura, c.monto_apertura, u.nombre, u.usuario
        ORDER BY c.fecha_apertura ASC
    `, [tenantId]);

    const cajas = rows.map(r => ({
        id:             r.id,
        nombre_caja:    r.nombre_caja,
        fecha_apertura: r.fecha_apertura instanceof Date
            ? r.fecha_apertura.toISOString()
            : String(r.fecha_apertura),
        monto_apertura: Number(r.monto_apertura) || 0,
        cajero_nombre:  r.cajero_nombre || r.cajero_usuario || 'Cajero',
        total_ingresos: Number(r.total_ingresos) || 0,
        total_egresos:  Number(r.total_egresos)  || 0,
        efectivo_actual: Number(r.monto_apertura || 0) + Number(r.total_ingresos || 0) - Number(r.total_egresos || 0)
    }));

    if (cajas.length === 0) {
        return {
            shouldPropose: false,
            message: 'Todas las cajas del día ya están cerradas. Buen trabajo.'
        };
    }

    return { cajas, shouldPropose: true };
}

/**
 * Draft a reminder message to close the open cajas.
 */
async function draft(tenantId, detection, { db }) {
    const { cajas } = detection;

    const fmt = n => `S/ ${Number(n).toFixed(2)}`;

    const lineas = cajas.map(c =>
        `• *${c.nombre_caja}* — ${c.cajero_nombre}\n` +
        `  Efectivo actual estimado: ${fmt(c.efectivo_actual)} ` +
        `(ingresos ${fmt(c.total_ingresos)}, egresos ${fmt(c.total_egresos)})`
    ).join('\n\n');

    const texto =
        `🔔 *Recordatorio: Caja(s) aún abierta(s)*\n\n` +
        `${lineas}\n\n` +
        `Son las 10 PM y hay ${cajas.length > 1 ? `${cajas.length} cajas abiertas` : 'una caja abierta'}.\n` +
        `Ve a *Caja* → *Cerrar caja* para cuadrar el efectivo y cerrar el turno.`;

    return { texto, cajas, total_cajas: cajas.length };
}

/**
 * Execute: acknowledge reminder. The admin will manually close the caja in the UI.
 */
async function execute(tenantId, userId, approvedDraft, { db }) {
    const draftData = typeof approvedDraft === 'string' ? JSON.parse(approvedDraft) : approvedDraft;
    return {
        acknowledged: true,
        cajas_en_recordatorio: draftData?.total_cajas || 0,
        mensaje: 'Recordatorio de cierre de caja registrado. Cierra la caja desde el módulo Caja.'
    };
}

module.exports = {
    name: NAME,
    description: 'Recuerda al administrador cerrar cajas abiertas después de las 22:00 para evitar descuadres contables',
    detect,
    draft,
    execute
};
