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

    // ── 5. P&L RESUMIDO ─────────────────────────────────────────────────────
    try {
        const now = new Date();
        const mes = now.getMonth() + 1;
        const anio = now.getFullYear();
        const [[ventas30]] = await db.query(
            `SELECT COALESCE(SUM(total),0) as ingresos, COUNT(*) as facturas FROM facturas WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?`,
            [tenantId, mes, anio]
        );
        const [[gastos30]] = await db.query(
            `SELECT COALESCE(SUM(monto),0) as total_gastos FROM gastos WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?`,
            [tenantId, mes, anio]
        );
        const [[planilla30]] = await db.query(
            `SELECT COALESCE(SUM(monto_bruto),0) as total_planilla FROM planilla_pagos WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?`,
            [tenantId, mes, anio]
        );
        const ingresos = Number(ventas30.ingresos);
        const totalGastos = Number(gastos30.total_gastos);
        const totalPlanilla = Number(planilla30.total_planilla);
        const margenBruto = ingresos - totalGastos - totalPlanilla;
        const margenPct = ingresos > 0 ? ((margenBruto / ingresos) * 100).toFixed(1) : '0';

        const lines = [`=== P&L RESUMIDO (${mes}/${anio}) ===`];
        lines.push(`Ingresos: S/ ${ingresos.toFixed(2)} (${ventas30.facturas} facturas)`);
        lines.push(`Gastos operativos: S/ ${totalGastos.toFixed(2)}`);
        lines.push(`Planilla: S/ ${totalPlanilla.toFixed(2)}`);
        lines.push(`Margen: S/ ${margenBruto.toFixed(2)} (${margenPct}%)`);
        parts.push(lines.join('\n'));
    } catch (_) {}

    // ── 6. FOOD COST POR PLATO (top 15) ─────────────────────────────────────
    try {
        const [costos] = await db.query(`
            SELECT p.nombre, p.precio_unidad, rcc.costo_por_porcion, rcc.food_cost_pct, rcc.margen_contribucion
            FROM receta_costos_cache rcc
            JOIN recetas r ON r.id = rcc.receta_id
            JOIN productos p ON p.id = r.producto_id
            WHERE rcc.tenant_id = ?
            ORDER BY rcc.food_cost_pct DESC LIMIT 15
        `, [tenantId]);
        if (costos.length > 0) {
            const lines = ['=== FOOD COST POR PLATO ==='];
            for (const c of costos) {
                lines.push(`- ${c.nombre}: costo S/${Number(c.costo_por_porcion).toFixed(2)}, precio S/${Number(c.precio_unidad).toFixed(2)}, food cost ${Number(c.food_cost_pct).toFixed(1)}%, margen S/${Number(c.margen_contribucion).toFixed(2)}`);
            }
            parts.push(lines.join('\n'));
        }
    } catch (_) {}

    // ── 7. MERMA VS OBJETIVO ─────────────────────────────────────────────────
    try {
        const [[merma]] = await db.query(`
            SELECT
              COALESCE(SUM(CASE WHEN am.tipo='merma' THEN am.cantidad * ai.costo_unitario ELSE 0 END), 0) as merma_soles,
              COALESCE(SUM(CASE WHEN am.tipo IN ('salida','merma') THEN am.cantidad * ai.costo_unitario ELSE 0 END), 1) as consumo_total
            FROM almacen_movimientos am
            JOIN almacen_ingredientes ai ON ai.id = am.ingrediente_id
            WHERE am.tenant_id = ? AND am.created_at >= NOW() - INTERVAL '30 days'
        `, [tenantId]);
        const [[config]] = await db.query('SELECT merma_objetivo_pct FROM configuracion_impresion LIMIT 1');
        const objetivo = Number(config?.merma_objetivo_pct || 3);
        const mermaPct = Number(merma.consumo_total) > 0 ? (Number(merma.merma_soles) / Number(merma.consumo_total) * 100) : 0;
        const lines = ['=== MERMA ==='];
        lines.push(`Merma actual: ${mermaPct.toFixed(1)}% (S/ ${Number(merma.merma_soles).toFixed(2)}) - Objetivo: ${objetivo}%`);
        if (mermaPct > objetivo) lines.push(`ALERTA: Merma por encima del objetivo en ${(mermaPct - objetivo).toFixed(1)} puntos`);
        parts.push(lines.join('\n'));
    } catch (_) {}

    // ── 8. DELIVERY (30 dias) ────────────────────────────────────────────────
    try {
        const [delivery] = await db.query(`
            SELECT plataforma, COUNT(*) as pedidos, COALESCE(SUM(total),0) as venta,
              COALESCE(SUM(comision_plataforma),0) as comisiones,
              COALESCE(SUM(total - COALESCE(comision_plataforma,0)),0) as neto
            FROM delivery_pedidos WHERE tenant_id=? AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY plataforma
        `, [tenantId]);
        if (delivery.length > 0) {
            const lines = ['=== DELIVERY (30 dias) ==='];
            for (const d of delivery) {
                lines.push(`- ${d.plataforma}: ${d.pedidos} pedidos, venta S/${Number(d.venta).toFixed(2)}, comisiones S/${Number(d.comisiones).toFixed(2)}, neto S/${Number(d.neto).toFixed(2)}`);
            }
            parts.push(lines.join('\n'));
        }
    } catch (_) {}

    // ── 9. VARIACION DE COSTOS (ultimos 30 dias) ────────────────────────────
    try {
        const [variaciones] = await db.query(`
            SELECT ai.nombre, hp.precio_anterior, hp.precio_nuevo,
              ROUND((hp.precio_nuevo - hp.precio_anterior) / NULLIF(hp.precio_anterior,0) * 100, 1) as variacion_pct,
              hp.created_at
            FROM historial_precios hp
            JOIN almacen_ingredientes ai ON ai.id = hp.entidad_id
            WHERE hp.tenant_id = ? AND hp.entidad_tipo = 'ingrediente' AND hp.created_at >= NOW() - INTERVAL '30 days'
            ORDER BY ABS(hp.precio_nuevo - hp.precio_anterior) DESC LIMIT 5
        `, [tenantId]);
        if (variaciones.length > 0) {
            const lines = ['=== VARIACION DE COSTOS INSUMOS ==='];
            for (const v of variaciones) {
                const dir = Number(v.variacion_pct) > 0 ? '+' : '';
                lines.push(`- ${v.nombre}: S/${Number(v.precio_anterior).toFixed(2)} -> S/${Number(v.precio_nuevo).toFixed(2)} (${dir}${v.variacion_pct}%)`);
            }
            parts.push(lines.join('\n'));
        }
    } catch (_) {}

    // ── 10. CALENDARIO PROXIMOS 14 DIAS ─────────────────────────────────────
    try {
        const [eventos] = await db.query(`
            SELECT nombre, tipo, fecha, impacto_esperado
            FROM calendario_eventos
            WHERE (tenant_id = ? OR tenant_id IS NULL)
              AND fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
              AND activo = true
            ORDER BY fecha LIMIT 10
        `, [tenantId]);
        if (eventos.length > 0) {
            const lines = ['=== PROXIMOS EVENTOS (14 dias) ==='];
            for (const e of eventos) {
                lines.push(`- ${e.fecha}: ${e.nombre} (${e.tipo}, impacto: ${e.impacto_esperado})`);
            }
            parts.push(lines.join('\n'));
        }
    } catch (_) {}

    // ── 11. ASISTENCIA HOY ──────────────────────────────────────────────────
    try {
        const [marcaciones] = await db.query(`
            SELECT u.nombre, u.rol, am.tipo, am.timestamp
            FROM asistencia_marcaciones am
            JOIN usuarios u ON u.id = am.usuario_id
            WHERE am.tenant_id = ? AND am.timestamp::date = CURRENT_DATE
            ORDER BY am.timestamp
        `, [tenantId]);
        if (marcaciones.length > 0) {
            const lines = ['=== ASISTENCIA HOY ==='];
            for (const m of marcaciones) {
                const hora = new Date(m.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                lines.push(`- ${m.nombre} (${m.rol}): ${m.tipo} a las ${hora}`);
            }
            parts.push(lines.join('\n'));
        }
    } catch (_) {}

    if (parts.length === 0) return '';
    return parts.join('\n\n');
}

module.exports = { buildContext };
