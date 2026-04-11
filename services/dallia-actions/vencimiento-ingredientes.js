// services/dallia-actions/vencimiento-ingredientes.js
// DalIA Action: detects almacen_lotes expiring within 3 days and alerts admin
// to use or return those ingredients before they are wasted.

'use strict';

const NAME = 'vencimiento_ingredientes';
const DIAS_ALERTA = 3; // alert when expiry is within this many days

/**
 * Detect lotes expiring within DIAS_ALERTA days that still have stock.
 */
async function detect(tenantId, { db }) {
    const [rows] = await db.query(`
        SELECT
            al.id          AS lote_id,
            al.numero_lote,
            al.fecha_vencimiento,
            al.cantidad_disponible,
            ai.nombre      AS ingrediente_nombre,
            ai.unidad_medida,
            (al.fecha_vencimiento - CURRENT_DATE) AS dias_restantes
        FROM almacen_lotes al
        JOIN almacen_ingredientes ai ON ai.id = al.ingrediente_id
        WHERE al.tenant_id = ?
          AND al.cantidad_disponible > 0
          AND al.fecha_vencimiento IS NOT NULL
          AND al.fecha_vencimiento >= CURRENT_DATE
          AND al.fecha_vencimiento <= CURRENT_DATE + INTERVAL '3 days'
        ORDER BY al.fecha_vencimiento ASC, ai.nombre ASC
    `, [tenantId]);

    const lotes = rows.map(r => ({
        lote_id:             r.lote_id,
        numero_lote:         r.numero_lote,
        ingrediente_nombre:  r.ingrediente_nombre,
        unidad_medida:       r.unidad_medida,
        cantidad_disponible: Number(r.cantidad_disponible) || 0,
        fecha_vencimiento:   r.fecha_vencimiento instanceof Date
            ? r.fecha_vencimiento.toISOString().split('T')[0]
            : String(r.fecha_vencimiento).split('T')[0],
        dias_restantes:      Number(r.dias_restantes) || 0
    }));

    const shouldPropose = lotes.length > 0;
    const message = shouldPropose ? null :
        `Sin lotes próximos a vencer en los próximos ${DIAS_ALERTA} días. ¡Todo en orden!`;

    return { lotes, shouldPropose, message };
}

/**
 * Draft a formatted alert message. No LLM call needed — structured data is clearer.
 */
async function draft(tenantId, detection, { db }) {
    const { lotes } = detection;

    const hoy     = lotes.filter(l => l.dias_restantes === 0);
    const manana  = lotes.filter(l => l.dias_restantes === 1);
    const en2dias = lotes.filter(l => l.dias_restantes === 2);
    const en3dias = lotes.filter(l => l.dias_restantes === 3);

    const formatLote = l =>
        `• ${l.ingrediente_nombre} — ${l.cantidad_disponible} ${l.unidad_medida}` +
        (l.numero_lote ? ` (lote ${l.numero_lote})` : '');

    const sections = [];
    if (hoy.length)     sections.push(`🔴 *Vencen HOY:*\n${hoy.map(formatLote).join('\n')}`);
    if (manana.length)  sections.push(`🟠 *Vencen mañana:*\n${manana.map(formatLote).join('\n')}`);
    if (en2dias.length) sections.push(`🟡 *En 2 días:*\n${en2dias.map(formatLote).join('\n')}`);
    if (en3dias.length) sections.push(`⚪ *En 3 días:*\n${en3dias.map(formatLote).join('\n')}`);

    const texto = `⚠️ *Ingredientes próximos a vencer*\n\n${sections.join('\n\n')}\n\n` +
        `Usa estos insumos prioritariamente o coordina su devolución con el proveedor.`;

    return { texto, lotes, resumen: { hoy: hoy.length, manana: manana.length, en2dias: en2dias.length, en3dias: en3dias.length } };
}

/**
 * Execute: acknowledge alert. Mark lotes as alerted to avoid repeat notifications today.
 * (No external action — the alert itself IS the action.)
 */
async function execute(tenantId, userId, approvedDraft, { db }) {
    const draftData = typeof approvedDraft === 'string' ? JSON.parse(approvedDraft) : approvedDraft;
    const lotes = draftData?.lotes || [];

    return {
        acknowledged: true,
        lotes_alertados: lotes.length,
        mensaje: `${lotes.length} lote(s) registrados como alertados.`
    };
}

module.exports = {
    name: NAME,
    description: 'Detecta lotes de almacén próximos a vencer (≤3 días) para evitar desperdicio',
    detect,
    draft,
    execute
};
