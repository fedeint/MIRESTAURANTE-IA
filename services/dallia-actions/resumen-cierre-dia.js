// services/dallia-actions/resumen-cierre-dia.js
// DalIA Action: generates an end-of-day summary comparing today's
// ventas/pedidos/ticket_promedio against yesterday. Triggers after 20:00 Lima time.

'use strict';

const NAME = 'resumen_cierre_dia';

/**
 * Returns current hour in America/Lima timezone (0-23).
 */
function horaLima() {
    const lima = new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false });
    return parseInt(lima, 10);
}

/**
 * Detect: only propose after 20:00 Lima time.
 * Queries caja_movimientos (ingresos de venta) and pedidos for today and yesterday.
 */
async function detect(tenantId, { db }) {
    const hora = horaLima();
    if (hora < 20) {
        return {
            shouldPropose: false,
            message: 'El resumen de cierre estará disponible a partir de las 8 PM.'
        };
    }

    const [[hoyRows], [ayerRows], [pedidosRows]] = await Promise.all([
        // Today's sales from caja_movimientos
        db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN tipo='ingreso' AND concepto IN ('venta_factura','propina') AND NOT anulado THEN monto ELSE 0 END), 0) AS ingresos,
                COALESCE(SUM(CASE WHEN tipo='egreso' AND NOT anulado THEN monto ELSE 0 END), 0) AS egresos,
                COUNT(DISTINCT caja_id) AS cajas_activas
            FROM caja_movimientos
            WHERE tenant_id = ?
              AND created_at AT TIME ZONE 'America/Lima' >= CURRENT_DATE AT TIME ZONE 'America/Lima'
              AND created_at AT TIME ZONE 'America/Lima' <  (CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'America/Lima'
        `, [tenantId]),
        // Yesterday's sales
        db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN tipo='ingreso' AND concepto IN ('venta_factura','propina') AND NOT anulado THEN monto ELSE 0 END), 0) AS ingresos,
                COALESCE(SUM(CASE WHEN tipo='egreso' AND NOT anulado THEN monto ELSE 0 END), 0) AS egresos
            FROM caja_movimientos
            WHERE tenant_id = ?
              AND created_at AT TIME ZONE 'America/Lima' >= (CURRENT_DATE - INTERVAL '1 day') AT TIME ZONE 'America/Lima'
              AND created_at AT TIME ZONE 'America/Lima' <  CURRENT_DATE AT TIME ZONE 'America/Lima'
        `, [tenantId]),
        // Today's pedidos count + yesterday's
        db.query(`
            SELECT
                COUNT(*) FILTER (WHERE fecha = CURRENT_DATE) AS pedidos_hoy,
                COUNT(*) FILTER (WHERE fecha = CURRENT_DATE - 1) AS pedidos_ayer
            FROM pedidos
            WHERE tenant_id = ?
              AND estado NOT IN ('cancelado')
              AND fecha >= CURRENT_DATE - 1
        `, [tenantId])
    ]);

    const hoy = hoyRows?.[0] || {};
    const ayer = ayerRows?.[0] || {};
    const ped = pedidosRows?.[0] || {};

    const ingresosHoy  = Number(hoy.ingresos)  || 0;
    const ingresosAyer = Number(ayer.ingresos) || 0;
    const egresosHoy   = Number(hoy.egresos)   || 0;
    const pedidosHoy   = Number(ped.pedidos_hoy)  || 0;
    const pedidosAyer  = Number(ped.pedidos_ayer) || 0;

    const ticketHoy   = pedidosHoy  > 0 ? Math.round((ingresosHoy  / pedidosHoy)  * 100) / 100 : 0;
    const ticketAyer  = pedidosAyer > 0 ? Math.round((ingresosAyer / pedidosAyer) * 100) / 100 : 0;

    const diff = ingresosHoy - ingresosAyer;
    const diffPct = ingresosAyer > 0
        ? Math.round((diff / ingresosAyer) * 100)
        : (ingresosHoy > 0 ? 100 : 0);

    return {
        shouldPropose: true,
        hoy:  { ingresos: ingresosHoy, egresos: egresosHoy, pedidos: pedidosHoy, ticket: ticketHoy },
        ayer: { ingresos: ingresosAyer, egresos: 0, pedidos: pedidosAyer, ticket: ticketAyer },
        diff, diffPct
    };
}

/**
 * Draft the end-of-day summary text.
 */
async function draft(tenantId, detection, { db }) {
    const { hoy, ayer, diffPct } = detection;

    const fmt = n => `S/ ${Number(n).toFixed(2)}`;
    const trend = diffPct > 0 ? `📈 +${diffPct}%` : diffPct < 0 ? `📉 ${diffPct}%` : '➡️ igual';
    const emoji = diffPct >= 10 ? '🎉' : diffPct >= 0 ? '😊' : '😐';

    const texto =
        `${emoji} *Resumen del día*\n\n` +
        `💰 Ventas: *${fmt(hoy.ingresos)}* ${trend} vs ayer (${fmt(ayer.ingresos)})\n` +
        `🧾 Pedidos: *${hoy.pedidos}* (ayer: ${ayer.pedidos})\n` +
        `🎟️ Ticket promedio: *${fmt(hoy.ticket)}* (ayer: ${fmt(ayer.ticket)})\n` +
        `💸 Egresos del día: ${fmt(hoy.egresos)}\n\n` +
        (diffPct >= 10
            ? '¡Excelente día! Superaste ayer por ' + diffPct + '%.'
            : diffPct >= 0
            ? 'Buen día, mantuviste el ritmo.'
            : `Hoy estuvo por debajo de ayer. Revisa qué pasó para mejorar mañana.`);

    return { texto, hoy, ayer, diffPct };
}

/**
 * Execute: acknowledge the summary. Could optionally store as report record.
 */
async function execute(tenantId, userId, approvedDraft, { db }) {
    return {
        acknowledged: true,
        mensaje: 'Resumen del día registrado correctamente.'
    };
}

module.exports = {
    name: NAME,
    description: 'Genera resumen de ventas del día vs ayer con comparativo de pedidos y ticket promedio (activo después de 20:00)',
    detect,
    draft,
    execute
};
