const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper para calcular P&L de un mes (parallelized queries)
async function calcularPL(tid, mes, anio) {
    try {
        // Run all independent queries in parallel
        const [
            [ventasR], [cogsR], [comprasR], [planillaR],
            [gastosFijosR], [gastosVarR], [cajaIngresosR], [cajaEgresosR], [cajaEgresosExtraR]
        ] = await Promise.all([
            // Ventas
            db.query(`
                SELECT COUNT(*) as cantidad, COALESCE(SUM(total),0) as total_bruto,
                       COALESCE(SUM(COALESCE(subtotal_sin_igv, total/1.18)),0) as ventas_netas,
                       COALESCE(SUM(COALESCE(igv, total - total/1.18)),0) as igv_ventas
                FROM facturas WHERE EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?
            `, [mes, anio]),
            // COGS teórico (from recipes)
            db.query(`
                SELECT COALESCE(SUM(df.costo_receta * df.cantidad), 0) as cogs_teorico
                FROM detalle_factura df
                JOIN facturas f ON f.id = df.factura_id
                WHERE EXTRACT(MONTH FROM f.fecha)=? AND EXTRACT(YEAR FROM f.fecha)=? AND df.costo_receta IS NOT NULL
            `, [mes, anio]),
            // COGS real (from purchase orders)
            db.query(`
                SELECT COALESCE(SUM(total),0) as total_compras
                FROM ordenes_compra WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha_orden)=? AND EXTRACT(YEAR FROM fecha_orden)=? AND estado IN ('recibida','parcial')
            `, [tid, mes, anio]).catch(() => [[{ total_compras: 0 }]]),
            // Planilla
            db.query(`
                SELECT COALESCE(SUM(monto_bruto),0) as bruto,
                       COALESCE(SUM(aporte_essalud),0) as essalud,
                       COALESCE(SUM(aporte_sctr),0) as sctr
                FROM planilla_pagos WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?
            `, [tid, mes, anio]),
            // Gastos fijos
            db.query(`
                SELECT COALESCE(SUM(g.monto),0) as total
                FROM gastos g JOIN gastos_categorias gc ON gc.id = g.categoria_id
                WHERE g.tenant_id=? AND EXTRACT(MONTH FROM g.fecha)=? AND EXTRACT(YEAR FROM g.fecha)=? AND gc.tipo='fijo'
            `, [tid, mes, anio]),
            // Gastos variables
            db.query(`
                SELECT COALESCE(SUM(g.monto),0) as total
                FROM gastos g JOIN gastos_categorias gc ON gc.id = g.categoria_id
                WHERE g.tenant_id=? AND EXTRACT(MONTH FROM g.fecha)=? AND EXTRACT(YEAR FROM g.fecha)=? AND gc.tipo='variable'
            `, [tid, mes, anio]),
            // Caja ingresos del mes (for reconciliation)
            db.query(`
                SELECT COALESCE(SUM(cm.monto), 0) as total
                FROM caja_movimientos cm
                WHERE cm.tenant_id=? AND cm.tipo='ingreso' AND cm.anulado=false
                  AND cm.concepto != 'fondo_inicial'
                  AND EXTRACT(MONTH FROM cm.created_at)=? AND EXTRACT(YEAR FROM cm.created_at)=?
            `, [tid, mes, anio]).catch(() => [[{ total: 0 }]]),
            // Caja egresos totales del mes (for reconciliation)
            db.query(`
                SELECT COALESCE(SUM(cm.monto), 0) as total
                FROM caja_movimientos cm
                WHERE cm.tenant_id=? AND cm.tipo='egreso' AND cm.anulado=false
                  AND EXTRACT(MONTH FROM cm.created_at)=? AND EXTRACT(YEAR FROM cm.created_at)=?
            `, [tid, mes, anio]).catch(() => [[{ total: 0 }]]),
            // Caja egresos NOT captured in gastos/planilla (extras)
            db.query(`
                SELECT COALESCE(SUM(cm.monto), 0) as total
                FROM caja_movimientos cm
                WHERE cm.tenant_id=? AND cm.tipo='egreso' AND cm.anulado=false
                  AND cm.concepto NOT IN ('pago_planilla', 'gasto_servicio', 'gasto_otro', 'gasto_compra_almacen')
                  AND EXTRACT(MONTH FROM cm.created_at)=? AND EXTRACT(YEAR FROM cm.created_at)=?
            `, [tid, mes, anio]).catch(() => [[{ total: 0 }]])
        ]);

        const ventas = ventasR[0];
        const cogs = cogsR[0];
        const compras = comprasR[0];
        const planilla = planillaR[0];
        const gastosFijos = gastosFijosR[0];
        const gastosVar = gastosVarR[0];
        const cajaEgresosExtra = Number(cajaEgresosExtraR[0].total);

        const ventasNetas = Number(ventas.ventas_netas);
        const cogsTeorico = Number(cogs.cogs_teorico);
        const totalCompras = Number(compras.total_compras);
        // Use COGS teórico if available, otherwise fall back to real purchases
        const cogsEfectivo = cogsTeorico > 0 ? cogsTeorico : totalCompras;
        const margenBruto = ventasNetas - cogsEfectivo;
        const totalPlanilla = Number(planilla.bruto) + Number(planilla.essalud) + Number(planilla.sctr);
        const totalFijos = Number(gastosFijos.total);
        const totalVariables = Number(gastosVar.total) + cajaEgresosExtra;
        const ebitda = margenBruto - totalPlanilla - totalFijos - totalVariables;

        // Reconciliation: facturas vs caja
        const cajaIngresos = Number(cajaIngresosR[0].total);
        const cajaEgresos = Number(cajaEgresosR[0].total);
        const ventasBrutas = Number(ventas.total_bruto);
        const diferenciaVentasCaja = ventasBrutas - cajaIngresos;

        return {
            mes, anio,
            ventas_brutas: ventasBrutas,
            igv_ventas: Number(ventas.igv_ventas),
            ventas_netas: ventasNetas,
            cogs_teorico: cogsTeorico,
            cogs_real: totalCompras,
            cogs_efectivo: cogsEfectivo,
            varianza: cogsTeorico - totalCompras,
            margen_bruto: margenBruto,
            margen_bruto_pct: ventasNetas > 0 ? ((margenBruto / ventasNetas) * 100).toFixed(1) : 0,
            planilla_bruta: Number(planilla.bruto),
            planilla_aportes: Number(planilla.essalud) + Number(planilla.sctr),
            planilla_total: totalPlanilla,
            gastos_fijos: totalFijos,
            gastos_variables: totalVariables,
            caja_egresos_extra: cajaEgresosExtra,
            ebitda,
            ebitda_pct: ventasNetas > 0 ? ((ebitda / ventasNetas) * 100).toFixed(1) : 0,
            facturas_cantidad: Number(ventas.cantidad),
            // Reconciliation
            caja_ingresos: cajaIngresos,
            caja_egresos: cajaEgresos,
            caja_saldo: cajaIngresos - cajaEgresos,
            diferencia_ventas_caja: diferenciaVentasCaja,
            reconciliacion_ok: Math.abs(diferenciaVentasCaja) < 1
        };
    } catch (e) {
        return { mes, anio, ventas_netas: 0, margen_bruto: 0, ebitda: 0, caja_ingresos: 0, caja_egresos: 0, diferencia_ventas_caja: 0, reconciliacion_ok: true, error: e.message };
    }
}

// GET /administracion - Dashboard P&L
router.get('/', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const mes = Number(req.query.mes) || new Date().getMonth() + 1;
        const anio = Number(req.query.anio) || new Date().getFullYear();

        const pl = await calcularPL(tid, mes, anio);

        // Gastos por grupo
        const [gastosPorGrupo] = await db.query(`
            SELECT gc.grupo, gc.nombre, COALESCE(SUM(g.monto),0) as total
            FROM gastos g
            JOIN gastos_categorias gc ON gc.id = g.categoria_id
            WHERE g.tenant_id=? AND EXTRACT(MONTH FROM g.fecha)=? AND EXTRACT(YEAR FROM g.fecha)=?
            GROUP BY gc.grupo, gc.nombre
            ORDER BY gc.grupo, total DESC
        `, [tid, mes, anio]);

        // Presupuesto vs real
        const [presupuesto] = await db.query(`
            SELECT gc.nombre, p.monto_presupuestado,
                   COALESCE((SELECT SUM(g2.monto) FROM gastos g2 WHERE g2.categoria_id=gc.id AND EXTRACT(MONTH FROM g2.fecha)=? AND EXTRACT(YEAR FROM g2.fecha)=?), 0) as gasto_real
            FROM presupuestos p
            JOIN gastos_categorias gc ON gc.id = p.categoria_id
            WHERE p.tenant_id=? AND p.mes=? AND p.anio=?
        `, [mes, anio, tid, mes, anio]);

        // Historial de los últimos 6 meses
        const historialMeses = [];
        for (let i = 5; i >= 0; i--) {
            let m = mes - i;
            let a = anio;
            if (m <= 0) { m += 12; a -= 1; }
            const datosMes = await calcularPL(tid, m, a);
            historialMeses.push(datosMes);
        }

        res.render('administracion/dashboard', { pl, gastosPorGrupo, presupuesto, historialMeses, mes, anio });
    } catch (e) {
        console.error('Admin dashboard error:', e.message);
        res.render('administracion/dashboard', { pl: {}, gastosPorGrupo: [], presupuesto: [], historialMeses: [], mes: new Date().getMonth()+1, anio: new Date().getFullYear() });
    }
});

// GET /administracion/planilla
router.get('/planilla', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const mes = Number(req.query.mes) || new Date().getMonth() + 1;
        const anio = Number(req.query.anio) || new Date().getFullYear();
        const personal_filtro = req.query.personal_id || '';

        const [personal] = await db.query('SELECT * FROM personal WHERE tenant_id=? AND activo=true ORDER BY nombre', [tid]);

        // Historial de pagos del mes seleccionado
        let queryHistorial = `
            SELECT pp.*, p.nombre as empleado_nombre, p.cargo, p.tipo_pago
            FROM planilla_pagos pp
            JOIN personal p ON p.id = pp.personal_id
            WHERE pp.tenant_id=? AND EXTRACT(MONTH FROM pp.fecha)=? AND EXTRACT(YEAR FROM pp.fecha)=?
        `;
        const paramsHistorial = [tid, mes, anio];
        if (personal_filtro) {
            queryHistorial += ' AND pp.personal_id=?';
            paramsHistorial.push(personal_filtro);
        }
        queryHistorial += ' ORDER BY pp.fecha DESC, p.nombre';

        const [historialPagos] = await db.query(queryHistorial, paramsHistorial);

        // Totales del mes
        const [[totalesMes]] = await db.query(`
            SELECT COALESCE(SUM(monto_bruto),0) as total_bruto,
                   COALESCE(SUM(monto_neto),0) as total_neto,
                   COALESCE(SUM(deduccion_onp_afp),0) as total_descuentos,
                   COALESCE(SUM(aporte_essalud),0) as total_essalud,
                   COUNT(*) as cantidad_pagos
            FROM planilla_pagos WHERE tenant_id=? AND EXTRACT(MONTH FROM fecha)=? AND EXTRACT(YEAR FROM fecha)=?
        `, [tid, mes, anio]);

        res.render('administracion/planilla', { personal, historialPagos, totalesMes, mes, anio, personal_filtro });
    } catch (e) {
        console.error('Planilla error:', e.message);
        res.render('administracion/planilla', { personal: [], historialPagos: [], totalesMes: {}, mes: new Date().getMonth()+1, anio: new Date().getFullYear(), personal_filtro: '' });
    }
});

// GET /administracion/gastos
router.get('/gastos', async (req, res) => {
    try {
        const tid = req.tenantId || 1;

        // Filtros de fecha
        const hoy = new Date();
        const desde = req.query.desde || new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
        const hasta = req.query.hasta || hoy.toISOString().split('T')[0];
        const categoria_filtro = req.query.categoria_id || '';

        const [categorias] = await db.query('SELECT * FROM gastos_categorias WHERE tenant_id=? ORDER BY grupo, nombre', [tid]);

        // Gastos del rango seleccionado
        let queryGastos = `
            SELECT g.*, gc.nombre as categoria_nombre, gc.grupo, gc.tipo
            FROM gastos g JOIN gastos_categorias gc ON gc.id=g.categoria_id
            WHERE g.tenant_id=? AND g.fecha BETWEEN ? AND ?
        `;
        const paramsGastos = [tid, desde, hasta];
        if (categoria_filtro) {
            queryGastos += ' AND g.categoria_id=?';
            paramsGastos.push(categoria_filtro);
        }
        queryGastos += ' ORDER BY g.fecha DESC, g.id DESC LIMIT 200';

        const [gastos] = await db.query(queryGastos, paramsGastos);

        // Historial diario (agrupado por día en el rango)
        const [historialDiario] = await db.query(`
            SELECT g.fecha::date as dia,
                   COUNT(*) as cantidad,
                   COALESCE(SUM(g.monto),0) as total,
                   COALESCE(SUM(CASE WHEN gc.tipo='fijo' THEN g.monto ELSE 0 END),0) as fijos,
                   COALESCE(SUM(CASE WHEN gc.tipo='variable' THEN g.monto ELSE 0 END),0) as variables
            FROM gastos g
            JOIN gastos_categorias gc ON gc.id=g.categoria_id
            WHERE g.tenant_id=? AND g.fecha BETWEEN ? AND ?
            GROUP BY g.fecha::date
            ORDER BY dia DESC
        `, [tid, desde, hasta]);

        // KPIs del rango
        const [[kpis]] = await db.query(`
            SELECT COALESCE(SUM(g.monto),0) as total_periodo,
                   COUNT(*) as cantidad_registros,
                   COALESCE(MAX(g.monto),0) as gasto_mayor
            FROM gastos g WHERE g.tenant_id=? AND g.fecha BETWEEN ? AND ?
        `, [tid, desde, hasta]);

        // Categoría más costosa
        const [[catTop]] = await db.query(`
            SELECT gc.nombre, COALESCE(SUM(g.monto),0) as total
            FROM gastos g JOIN gastos_categorias gc ON gc.id=g.categoria_id
            WHERE g.tenant_id=? AND g.fecha BETWEEN ? AND ?
            GROUP BY gc.id, gc.nombre ORDER BY total DESC LIMIT 1
        `, [tid, desde, hasta]);

        res.render('administracion/gastos', { categorias, gastos, historialDiario, kpis, catTop, desde, hasta, categoria_filtro });
    } catch (e) {
        console.error('Gastos error:', e.message);
        res.render('administracion/gastos', { categorias: [], gastos: [], historialDiario: [], kpis: {}, catTop: null, desde: '', hasta: '', categoria_filtro: '' });
    }
});

// API: CRUD personal
router.post('/planilla', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { nombre, dni, cargo, tipo_contrato, tipo_pago, monto_pago, regimen_pension, fecha_ingreso } = req.body;
        if (!nombre || !cargo || !monto_pago) return res.status(400).json({ error: 'Nombre, cargo y monto requeridos' });
        const [result] = await db.query(
            'INSERT INTO personal (tenant_id, nombre, dni, cargo, tipo_contrato, tipo_pago, monto_pago, regimen_pension, fecha_ingreso) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
            [tid, nombre, dni||null, cargo, tipo_contrato||'planilla', tipo_pago||'diario', monto_pago, regimen_pension||'onp', fecha_ingreso||null]
        );
        res.status(201).json({ ok: true, id: result.insertId, message: 'Personal registrado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Registrar pago planilla
router.post('/planilla/pagar', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { personal_id, fecha, horas_trabajadas, notas } = req.body;

        const [[emp]] = await db.query('SELECT * FROM personal WHERE id=? AND tenant_id=?', [personal_id, tid]);
        if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

        const bruto = Number(emp.monto_pago);
        const onpAfp = emp.regimen_pension === 'onp' ? bruto * 0.13
            : emp.regimen_pension.startsWith('afp') ? bruto * 0.125 : 0;
        const essalud = bruto * 0.09;
        const sctr = bruto * 0.015;
        const neto = bruto - onpAfp;

        const fechaPago = fecha || new Date().toISOString().split('T')[0];
        await db.query(
            `INSERT INTO planilla_pagos (tenant_id, personal_id, fecha, monto_bruto, deduccion_onp_afp, monto_neto, aporte_essalud, aporte_sctr, horas_trabajadas, notas, pagado)
             VALUES (?,?,?,?,?,?,?,?,?,?,true)`,
            [tid, personal_id, fechaPago, bruto, onpAfp, neto, essalud, sctr, horas_trabajadas||null, notas||null]
        );

        // Register payroll as caja egreso
        try {
            const [[cajaAbierta]] = await db.query(
                "SELECT id FROM cajas WHERE tenant_id=? AND estado='abierta' LIMIT 1", [tid]
            );
            if (cajaAbierta) {
                await db.query(
                    `INSERT INTO caja_movimientos (tenant_id, caja_id, tipo, concepto, monto, usuario_id)
                     VALUES (?, ?, 'egreso', 'pago_planilla', ?, ?)`,
                    [tid, cajaAbierta.id, neto, req.session?.user?.id || 0]
                );
            }
        } catch (_) {}

        res.json({ ok: true, message: 'Pago registrado', bruto, onp_afp: onpAfp, neto, essalud, sctr });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Eliminar personal (soft delete)
router.delete('/planilla/:id', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        await db.query('UPDATE personal SET activo=false, deleted_at=NOW() WHERE id=? AND tenant_id=?', [req.params.id, tid]);
        res.json({ ok: true, message: 'Personal eliminado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: CRUD gastos
router.post('/gastos', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { categoria_id, concepto, monto, fecha, comprobante, notas } = req.body;
        if (!categoria_id || !concepto || !monto) return res.status(400).json({ error: 'Categoria, concepto y monto requeridos' });
        const f = fecha || new Date().toISOString().split('T')[0];
        const d = new Date(f);
        const uid = req.session?.user?.id || 0;
        await db.query(
            'INSERT INTO gastos (tenant_id, categoria_id, concepto, monto, fecha, periodo_mes, periodo_anio, comprobante, notas, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [tid, categoria_id, concepto, monto, f, d.getMonth()+1, d.getFullYear(), comprobante||null, notas||null, uid]
        );

        // Register expense in caja as egreso
        try {
            const [[cajaAbierta]] = await db.query(
                "SELECT id FROM cajas WHERE tenant_id=? AND estado='abierta' LIMIT 1", [tid]
            );
            if (cajaAbierta) {
                // Map gastos_categorias.tipo to caja concepto
                const [[cat]] = await db.query('SELECT tipo FROM gastos_categorias WHERE id=?', [categoria_id]);
                const cajaConcepto = cat?.tipo === 'fijo' ? 'gasto_servicio' : 'gasto_otro';
                await db.query(
                    `INSERT INTO caja_movimientos (tenant_id, caja_id, tipo, concepto, monto, usuario_id)
                     VALUES (?, ?, 'egreso', ?, ?, ?)`,
                    [tid, cajaAbierta.id, cajaConcepto, monto, uid]
                );
            }
        } catch (_) {}

        res.status(201).json({ ok: true, message: 'Gasto registrado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Eliminar gasto
router.delete('/gastos/:id', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        await db.query('DELETE FROM gastos WHERE id=? AND tenant_id=?', [req.params.id, tid]);
        res.json({ ok: true, message: 'Gasto eliminado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Presupuesto
router.post('/presupuesto', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { categoria_id, mes, anio, monto_presupuestado } = req.body;
        await db.query(
            `INSERT INTO presupuestos (tenant_id, categoria_id, mes, anio, monto_presupuestado)
             VALUES (?,?,?,?,?) ON CONFLICT (tenant_id, categoria_id, mes, anio) DO UPDATE SET monto_presupuestado=EXCLUDED.monto_presupuestado`,
            [tid, categoria_id, mes, anio, monto_presupuestado]
        );
        res.json({ ok: true, message: 'Presupuesto guardado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
