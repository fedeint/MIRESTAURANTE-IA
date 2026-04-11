// services/dallia-actions/meta-alcanzada.js
// DalIA Action: fires when today's sales reach or exceed the configured daily
// ventas goal (metas_diarias WHERE tipo='ventas'). Avoids re-proposing if it
// already fired today by checking dallia_actions_log.

'use strict';

const NAME = 'meta_alcanzada';

/**
 * Detect: query today's ingresos and compare to metas_diarias.
 * Suppresses duplicate proposals for the same calendar day.
 */
async function detect(tenantId, { db }) {
    // 1. Load the ventas meta for this tenant
    const [metaRows] = await db.query(
        `SELECT meta_valor FROM metas_diarias
         WHERE tenant_id = ? AND tipo = 'ventas' AND activa = true
         LIMIT 1`,
        [tenantId]
    );
    const metaValor = Number(metaRows?.[0]?.meta_valor || 0);

    if (metaValor <= 0) {
        return {
            shouldPropose: false,
            message: 'No tienes una meta de ventas configurada para hoy.'
        };
    }

    // 2. Today's ingresos from caja_movimientos
    const [ingRows] = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' AND concepto IN ('venta_factura','propina') AND NOT anulado THEN monto ELSE 0 END), 0) AS ingresos,
                COUNT(DISTINCT CASE WHEN tipo='ingreso' AND concepto IN ('venta_factura','propina') AND NOT anulado THEN id END) AS movimientos
         FROM caja_movimientos
         WHERE tenant_id = ?
           AND created_at AT TIME ZONE 'America/Lima' >= CURRENT_DATE AT TIME ZONE 'America/Lima'
           AND created_at AT TIME ZONE 'America/Lima' <  (CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'America/Lima'`,
        [tenantId]
    );
    const ingresosHoy = Number(ingRows?.[0]?.ingresos || 0);

    if (ingresosHoy < metaValor) {
        const faltante = metaValor - ingresosHoy;
        return {
            shouldPropose: false,
            message: `Faltan S/ ${faltante.toFixed(2)} para alcanzar la meta de ventas (S/ ${metaValor.toFixed(2)}).`
        };
    }

    // 3. Avoid re-proposing if we already fired today
    const [prevRows] = await db.query(
        `SELECT id FROM dallia_actions_log dal
         JOIN dallia_actions da ON da.id = dal.action_id
         WHERE dal.tenant_id = ?
           AND da.nombre = ?
           AND dal.created_at AT TIME ZONE 'America/Lima' >= CURRENT_DATE AT TIME ZONE 'America/Lima'
         LIMIT 1`,
        [tenantId, NAME]
    );
    if (prevRows && prevRows.length > 0) {
        return {
            shouldPropose: false,
            message: 'La meta de hoy ya fue celebrada. ¡Sigue así!'
        };
    }

    // 4. Count today's pedidos for context
    const [pedRows] = await db.query(
        `SELECT COUNT(*) AS pedidos FROM pedidos
         WHERE tenant_id = ? AND estado NOT IN ('cancelado')
           AND fecha = CURRENT_DATE`,
        [tenantId]
    );
    const pedidosHoy = Number(pedRows?.[0]?.pedidos || 0);

    const exceso = ingresosHoy - metaValor;
    const pct = Math.round((ingresosHoy / metaValor) * 100);

    return {
        shouldPropose: true,
        ingresosHoy,
        metaValor,
        exceso,
        pct,
        pedidosHoy
    };
}

/**
 * Draft a congratulatory message.
 */
async function draft(tenantId, detection, { db }) {
    const { ingresosHoy, metaValor, exceso, pct, pedidosHoy } = detection;

    const fmt = n => `S/ ${Number(n).toFixed(2)}`;
    const emoji = pct >= 130 ? '🚀' : pct >= 110 ? '🎉' : '🌟';

    const texto =
        `${emoji} *¡Meta de ventas alcanzada!*\n\n` +
        `📊 Ventas hoy: *${fmt(ingresosHoy)}* de ${fmt(metaValor)} meta (${pct}%)\n` +
        `🧾 Pedidos completados: *${pedidosHoy}*\n` +
        (exceso > 0
            ? `✨ Superaste la meta por *${fmt(exceso)}* — ¡extraordinario!\n\n`
            : `\n`) +
        `💡 Sugerencias para cerrar el día con éxito:\n` +
        `• Verifica que la caja esté balanceada\n` +
        `• Revisa el stock para mañana\n` +
        `• Envía el resumen al equipo`;

    return { texto, ingresosHoy, metaValor, exceso, pct };
}

/**
 * Execute: acknowledge the congratulation.
 */
async function execute(tenantId, userId, approvedDraft, { db }) {
    return {
        acknowledged: true,
        mensaje: `¡Meta alcanzada! Ventas: S/ ${Number(approvedDraft?.ingresosHoy || 0).toFixed(2)}`
    };
}

module.exports = {
    name: NAME,
    description: 'Celebra cuando las ventas del día alcanzan la meta configurada en metas_diarias (tipo=ventas)',
    detect,
    draft,
    execute
};
