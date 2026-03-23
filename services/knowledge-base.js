'use strict';

/**
 * Knowledge Base service for DalIA.
 * Gathers structured context about the tenant from multiple DB tables
 * and returns a formatted string ready to be injected into the AI system prompt.
 */

const db = require('../db');

/**
 * Build a rich context string for a given tenant.
 * Each section is wrapped in its own try/catch so a missing table or
 * column never prevents the rest of the context from being assembled.
 *
 * @param {number} tenantId
 * @returns {Promise<string>}
 */
async function buildContext(tenantId) {
    const parts = [];

    // ── 1. NEGOCIO (from sostac_briefs) ──────────────────────────────────────
    try {
        const [[brief]] = await db.query(
            `SELECT datos FROM sostac_briefs
             WHERE tenant_id = ? AND activo = true
             ORDER BY updated_at DESC LIMIT 1`,
            [tenantId]
        );

        if (brief && brief.datos) {
            const d = typeof brief.datos === 'string' ? JSON.parse(brief.datos) : brief.datos;

            const nombre          = d.nombre_negocio  || d.nombre          || '';
            const tipoCocina      = d.tipo_cocina      || d.categoria       || '';
            const empleados       = d.empleados        || d.num_empleados   || '';
            const objetivoPrincipal = d.objetivo_principal || d.objetivo   || '';
            const ubicacion       = d.ubicacion        || d.ciudad          || '';
            const descripcion     = d.descripcion      || '';

            const lines = ['=== CONTEXTO DEL NEGOCIO ==='];
            if (nombre)            lines.push(`Nombre: ${nombre}`);
            if (tipoCocina)        lines.push(`Tipo de cocina: ${tipoCocina}`);
            if (empleados)         lines.push(`Empleados: ${empleados}`);
            if (ubicacion)         lines.push(`Ubicacion: ${ubicacion}`);
            if (descripcion)       lines.push(`Descripcion: ${descripcion}`);
            if (objetivoPrincipal) lines.push(`Objetivo principal: ${objetivoPrincipal}`);

            if (lines.length > 1) parts.push(lines.join('\n'));
        }
    } catch (_) {}

    // ── 2. DATOS OPERATIVOS (últimos 7 días) ─────────────────────────────────
    try {
        const [[ventas]] = await db.query(
            `SELECT
                COALESCE(SUM(f.total), 0)                        AS ventas_total,
                COALESCE(AVG(f.total), 0)                        AS ticket_promedio,
                COUNT(*)                                          AS num_facturas
             FROM facturas f
             WHERE f.tenant_id = ?
               AND f.fecha >= NOW() - INTERVAL '7 days'`,
            [tenantId]
        );

        const [productos] = await db.query(
            `SELECT nombre FROM productos WHERE tenant_id = ? ORDER BY nombre LIMIT 5`,
            [tenantId]
        );

        const [[totalProductos]] = await db.query(
            `SELECT COUNT(*) AS total FROM productos WHERE tenant_id = ?`,
            [tenantId]
        );

        const lines = ['=== DATOS OPERATIVOS (ultimos 7 dias) ==='];
        lines.push(`Ventas totales: S/ ${Number(ventas.ventas_total).toFixed(2)}`);
        lines.push(`Ticket promedio: S/ ${Number(ventas.ticket_promedio).toFixed(2)}`);
        lines.push(`Facturas emitidas: ${ventas.num_facturas}`);
        lines.push(`Total productos en carta: ${totalProductos.total}`);
        if (productos.length > 0) {
            lines.push(`Productos (muestra): ${productos.map(p => p.nombre).join(', ')}`);
        }

        parts.push(lines.join('\n'));
    } catch (_) {}

    // ── 3. ALERTAS DE STOCK ───────────────────────────────────────────────────
    try {
        const [alertas] = await db.query(
            `SELECT nombre, stock_actual, stock_minimo, unidad_medida
             FROM almacen_ingredientes
             WHERE tenant_id = ?
               AND activo = true
               AND stock_actual <= stock_minimo
             ORDER BY (stock_actual - stock_minimo) ASC
             LIMIT 10`,
            [tenantId]
        );

        if (alertas.length > 0) {
            const lines = ['=== ALERTAS ACTIVAS ==='];
            for (const a of alertas) {
                lines.push(`- ${a.nombre} por debajo del minimo (actual: ${a.stock_actual} ${a.unidad_medida || ''}, minimo: ${a.stock_minimo} ${a.unidad_medida || ''})`);
            }
            parts.push(lines.join('\n'));
        }
    } catch (_) {}

    // ── 4. CONOCIMIENTO ADICIONAL (agentes_knowledge_base) ───────────────────
    try {
        const [entries] = await db.query(
            `SELECT categoria, clave, valor, datos
             FROM agentes_knowledge_base
             WHERE tenant_id = ?
             ORDER BY categoria, clave`,
            [tenantId]
        );

        if (entries.length > 0) {
            const lines = ['=== CONOCIMIENTO ADICIONAL ==='];
            let currentCat = null;
            for (const e of entries) {
                if (e.categoria !== currentCat) {
                    lines.push(`[${e.categoria.toUpperCase()}]`);
                    currentCat = e.categoria;
                }
                const val = e.valor || (e.datos && Object.keys(e.datos).length ? JSON.stringify(e.datos) : '');
                if (val) lines.push(`  ${e.clave}: ${val}`);
            }
            parts.push(lines.join('\n'));
        }
    } catch (_) {}

    if (parts.length === 0) return '';
    return parts.join('\n\n');
}

module.exports = { buildContext };
