const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /administracion - Dashboard P&L
router.get('/', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const mes = Number(req.query.mes) || new Date().getMonth() + 1;
        const anio = Number(req.query.anio) || new Date().getFullYear();

        // Ventas del mes (sin IGV)
        const [[ventas]] = await db.query(`
            SELECT COUNT(*) as cantidad, COALESCE(SUM(total),0) as total_bruto,
                   COALESCE(SUM(COALESCE(subtotal_sin_igv, total/1.18)),0) as ventas_netas,
                   COALESCE(SUM(COALESCE(igv, total - total/1.18)),0) as igv_ventas
            FROM facturas WHERE MONTH(fecha)=? AND YEAR(fecha)=?
        `, [mes, anio]);

        // COGS teorico (recetas x vendidos)
        const [[cogs]] = await db.query(`
            SELECT COALESCE(SUM(df.costo_receta * df.cantidad), 0) as cogs_teorico
            FROM detalle_factura df
            JOIN facturas f ON f.id = df.factura_id
            WHERE MONTH(f.fecha)=? AND YEAR(f.fecha)=? AND df.costo_receta IS NOT NULL
        `, [mes, anio]);

        // Compras del mes (COGS real)
        const [[compras]] = await db.query(`
            SELECT COALESCE(SUM(total),0) as total_compras
            FROM ordenes_compra WHERE tenant_id=? AND MONTH(fecha_orden)=? AND YEAR(fecha_orden)=? AND estado IN ('recibida','parcial')
        `, [tid, mes, anio]);

        // Planilla del mes
        const [[planilla]] = await db.query(`
            SELECT COALESCE(SUM(monto_bruto),0) as bruto,
                   COALESCE(SUM(aporte_essalud),0) as essalud,
                   COALESCE(SUM(aporte_sctr),0) as sctr
            FROM planilla_pagos WHERE tenant_id=? AND MONTH(fecha)=? AND YEAR(fecha)=?
        `, [tid, mes, anio]);

        // Gastos fijos del mes
        const [[gastosFijos]] = await db.query(`
            SELECT COALESCE(SUM(g.monto),0) as total
            FROM gastos g
            JOIN gastos_categorias gc ON gc.id = g.categoria_id
            WHERE g.tenant_id=? AND MONTH(g.fecha)=? AND YEAR(g.fecha)=? AND gc.tipo='fijo'
        `, [tid, mes, anio]);

        // Gastos variables del mes
        const [[gastosVar]] = await db.query(`
            SELECT COALESCE(SUM(g.monto),0) as total
            FROM gastos g
            JOIN gastos_categorias gc ON gc.id = g.categoria_id
            WHERE g.tenant_id=? AND MONTH(g.fecha)=? AND YEAR(g.fecha)=? AND gc.tipo='variable'
        `, [tid, mes, anio]);

        // Gastos por grupo
        const [gastosPorGrupo] = await db.query(`
            SELECT gc.grupo, gc.nombre, COALESCE(SUM(g.monto),0) as total
            FROM gastos g
            JOIN gastos_categorias gc ON gc.id = g.categoria_id
            WHERE g.tenant_id=? AND MONTH(g.fecha)=? AND YEAR(g.fecha)=?
            GROUP BY gc.grupo, gc.nombre
            ORDER BY gc.grupo, total DESC
        `, [tid, mes, anio]);

        // Presupuesto vs real
        const [presupuesto] = await db.query(`
            SELECT gc.nombre, p.monto_presupuestado,
                   COALESCE((SELECT SUM(g2.monto) FROM gastos g2 WHERE g2.categoria_id=gc.id AND MONTH(g2.fecha)=? AND YEAR(g2.fecha)=?), 0) as gasto_real
            FROM presupuestos p
            JOIN gastos_categorias gc ON gc.id = p.categoria_id
            WHERE p.tenant_id=? AND p.mes=? AND p.anio=?
        `, [mes, anio, tid, mes, anio]);

        // P&L
        const ventasNetas = Number(ventas.ventas_netas);
        const cogsTeorico = Number(cogs.cogs_teorico);
        const totalCompras = Number(compras.total_compras);
        const margenBruto = ventasNetas - cogsTeorico;
        const totalPlanilla = Number(planilla.bruto) + Number(planilla.essalud) + Number(planilla.sctr);
        const totalFijos = Number(gastosFijos.total);
        const totalVariables = Number(gastosVar.total);
        const ebitda = margenBruto - totalPlanilla - totalFijos - totalVariables;

        const pl = {
            mes, anio,
            ventas_brutas: Number(ventas.total_bruto),
            igv_ventas: Number(ventas.igv_ventas),
            ventas_netas: ventasNetas,
            cogs_teorico: cogsTeorico,
            cogs_real: totalCompras,
            varianza: cogsTeorico - totalCompras,
            margen_bruto: margenBruto,
            margen_bruto_pct: ventasNetas > 0 ? ((margenBruto / ventasNetas) * 100).toFixed(1) : 0,
            planilla_bruta: Number(planilla.bruto),
            planilla_aportes: Number(planilla.essalud) + Number(planilla.sctr),
            planilla_total: totalPlanilla,
            gastos_fijos: totalFijos,
            gastos_variables: totalVariables,
            ebitda,
            ebitda_pct: ventasNetas > 0 ? ((ebitda / ventasNetas) * 100).toFixed(1) : 0,
            facturas_cantidad: Number(ventas.cantidad)
        };

        res.render('administracion/dashboard', { pl, gastosPorGrupo, presupuesto });
    } catch (e) {
        console.error('Admin dashboard error:', e.message);
        res.render('administracion/dashboard', { pl: {}, gastosPorGrupo: [], presupuesto: [] });
    }
});

// GET /administracion/planilla
router.get('/planilla', async (req, res) => {
    const tid = req.tenantId || 1;
    const [personal] = await db.query('SELECT * FROM personal WHERE tenant_id=? AND activo=1 ORDER BY nombre', [tid]);
    res.render('administracion/planilla', { personal });
});

// GET /administracion/gastos
router.get('/gastos', async (req, res) => {
    const tid = req.tenantId || 1;
    const [categorias] = await db.query('SELECT * FROM gastos_categorias WHERE tenant_id=? ORDER BY grupo, nombre', [tid]);
    const [gastos] = await db.query(`
        SELECT g.*, gc.nombre as categoria_nombre, gc.grupo
        FROM gastos g JOIN gastos_categorias gc ON gc.id=g.categoria_id
        WHERE g.tenant_id=? ORDER BY g.fecha DESC LIMIT 100
    `, [tid]);
    res.render('administracion/gastos', { categorias, gastos });
});

// API: CRUD personal
router.post('/api/personal', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { nombre, dni, cargo, tipo_contrato, tipo_pago, monto_pago, regimen_pension, fecha_ingreso } = req.body;
        if (!nombre || !cargo || !monto_pago) return res.status(400).json({ error: 'Nombre, cargo y monto requeridos' });
        const [result] = await db.query(
            'INSERT INTO personal (tenant_id, nombre, dni, cargo, tipo_contrato, tipo_pago, monto_pago, regimen_pension, fecha_ingreso) VALUES (?,?,?,?,?,?,?,?,?)',
            [tid, nombre, dni||null, cargo, tipo_contrato||'planilla', tipo_pago||'diario', monto_pago, regimen_pension||'onp', fecha_ingreso||null]
        );
        res.status(201).json({ id: result.insertId, message: 'Personal registrado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Registrar pago planilla
router.post('/api/planilla/pagar', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { personal_id, fecha, horas_trabajadas, notas } = req.body;

        const [[emp]] = await db.query('SELECT * FROM personal WHERE id=? AND tenant_id=?', [personal_id, tid]);
        if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

        const bruto = Number(emp.monto_pago);
        // Calculos Peru
        const onpAfp = emp.regimen_pension === 'onp' ? bruto * 0.13
            : emp.regimen_pension.startsWith('afp') ? bruto * 0.125 : 0;
        const essalud = bruto * 0.09;
        const sctr = bruto * 0.015;
        const neto = bruto - onpAfp;

        await db.query(
            `INSERT INTO planilla_pagos (tenant_id, personal_id, fecha, monto_bruto, deduccion_onp_afp, monto_neto, aporte_essalud, aporte_sctr, horas_trabajadas, notas, pagado)
             VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
            [tid, personal_id, fecha || new Date().toISOString().split('T')[0], bruto, onpAfp, neto, essalud, sctr, horas_trabajadas||null, notas||null]
        );
        res.json({ message: 'Pago registrado', bruto, onp_afp: onpAfp, neto, essalud, sctr });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: CRUD gastos
router.post('/api/gastos', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { categoria_id, concepto, monto, fecha, comprobante, notas } = req.body;
        if (!categoria_id || !concepto || !monto) return res.status(400).json({ error: 'Categoria, concepto y monto requeridos' });
        const f = fecha || new Date().toISOString().split('T')[0];
        const d = new Date(f);
        await db.query(
            'INSERT INTO gastos (tenant_id, categoria_id, concepto, monto, fecha, periodo_mes, periodo_anio, comprobante, notas, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [tid, categoria_id, concepto, monto, f, d.getMonth()+1, d.getFullYear(), comprobante||null, notas||null, req.session?.user?.id||0]
        );
        res.status(201).json({ message: 'Gasto registrado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: Presupuesto
router.post('/api/presupuesto', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { categoria_id, mes, anio, monto_presupuestado } = req.body;
        await db.query(
            `INSERT INTO presupuestos (tenant_id, categoria_id, mes, anio, monto_presupuestado)
             VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE monto_presupuestado=?`,
            [tid, categoria_id, mes, anio, monto_presupuestado, monto_presupuestado]
        );
        res.json({ message: 'Presupuesto guardado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
