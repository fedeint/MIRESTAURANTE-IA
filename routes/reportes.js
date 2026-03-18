const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');

// GET /api/reportes/diario?fecha=2026-03-17
router.get('/diario', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

        // 1. Caja
        const [[caja]] = await db.query(`
            SELECT * FROM cajas WHERE tenant_id=? AND fecha_apertura::date=? ORDER BY fecha_apertura DESC LIMIT 1
        `, [tid, fecha]);

        let cajaIngresos = 0, cajaEgresos = 0;
        if (caja) {
            const [[tots]] = await db.query(`
                SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE 0 END),0) as i,
                       COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE 0 END),0) as e
                FROM caja_movimientos WHERE caja_id=? AND anulado=0
            `, [caja.id]);
            cajaIngresos = Number(tots.i);
            cajaEgresos = Number(tots.e);
        }

        // 2. Ventas
        const [[ventas]] = await db.query(`
            SELECT COUNT(*) as qty, COALESCE(SUM(total),0) as total,
                   COALESCE(SUM(CASE WHEN forma_pago='efectivo' THEN total ELSE 0 END),0) as efectivo,
                   COALESCE(SUM(CASE WHEN forma_pago='tarjeta' THEN total ELSE 0 END),0) as tarjeta,
                   COALESCE(SUM(CASE WHEN forma_pago='transferencia' THEN total ELSE 0 END),0) as transferencia
            FROM facturas WHERE fecha::date=?
        `, [fecha]);

        // 3. Top productos
        const [topProds] = await db.query(`
            SELECT p.nombre, SUM(df.cantidad) as qty, SUM(df.subtotal) as ingreso,
                   SUM(COALESCE(df.costo_receta,0) * df.cantidad) as costo
            FROM detalle_factura df
            JOIN facturas f ON f.id=df.factura_id
            JOIN productos p ON p.id=df.producto_id
            WHERE f.fecha::date=?
            GROUP BY df.producto_id ORDER BY qty DESC LIMIT 10
        `, [fecha]);

        // 4. Planilla del dia
        const [planillaHoy] = await db.query(`
            SELECT pe.nombre, pe.cargo, pp.monto_bruto, pp.monto_neto, pp.aporte_essalud
            FROM planilla_pagos pp JOIN personal pe ON pe.id=pp.personal_id
            WHERE pp.tenant_id=? AND pp.fecha=?
        `, [tid, fecha]);
        const totalPlanilla = planillaHoy.reduce((s, p) => s + Number(p.monto_bruto) + Number(p.aporte_essalud), 0);

        // 5. Gastos fijos prorrateo
        const [[gastosMes]] = await db.query(`
            SELECT COALESCE(SUM(g.monto),0) as total
            FROM gastos g JOIN gastos_categorias gc ON gc.id=g.categoria_id
            WHERE g.tenant_id=? AND gc.tipo='fijo' AND EXTRACT(MONTH FROM g.fecha)=EXTRACT(MONTH FROM ?::date) AND EXTRACT(YEAR FROM g.fecha)=EXTRACT(YEAR FROM ?::date)
        `, [tid, fecha, fecha]);
        const gastosFijosDia = Number(gastosMes.total) / 30;

        // 6. Alertas stock
        const [alertas] = await db.query(`
            SELECT nombre, stock_actual, stock_minimo, unidad_medida
            FROM almacen_ingredientes WHERE tenant_id=? AND activo=1 AND stock_actual <= stock_minimo
        `, [tid]);

        // 7. COGS total dia
        const cogsDia = topProds.reduce((s, p) => s + Number(p.costo || 0), 0);

        // Generar PDF
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=reporte-diario-${fecha}.pdf`);
        doc.pipe(res);

        // Titulo
        doc.fontSize(18).font('Helvetica-Bold').text('REPORTE DIARIO', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text(`Fecha: ${fecha}`, { align: 'center' });
        doc.fontSize(10).text('restaurante.dignita.tech', { align: 'center' });
        doc.moveDown(1.5);

        // 1. CAJA
        doc.fontSize(14).font('Helvetica-Bold').text('1. CAJA');
        doc.fontSize(10).font('Helvetica');
        if (caja) {
            doc.text(`Apertura: S/ ${Number(caja.monto_apertura).toFixed(2)}`);
            doc.text(`Ingresos: S/ ${cajaIngresos.toFixed(2)}`);
            doc.text(`Egresos:  S/ ${cajaEgresos.toFixed(2)}`);
            if (caja.monto_cierre_real) {
                doc.text(`Cierre sistema: S/ ${Number(caja.monto_cierre_sistema).toFixed(2)}`);
                doc.text(`Cierre real:    S/ ${Number(caja.monto_cierre_real).toFixed(2)}`);
                doc.text(`Diferencia:     S/ ${Number(caja.diferencia).toFixed(2)}`);
            }
        } else {
            doc.text('No se abrio caja este dia');
        }
        doc.moveDown();

        // 2. VENTAS
        doc.fontSize(14).font('Helvetica-Bold').text('2. VENTAS');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Facturas: ${ventas.qty}`);
        doc.text(`Total:        S/ ${Number(ventas.total).toFixed(2)}`);
        doc.text(`Efectivo:     S/ ${Number(ventas.efectivo).toFixed(2)}`);
        doc.text(`Tarjeta:      S/ ${Number(ventas.tarjeta).toFixed(2)}`);
        doc.text(`Transferencia:S/ ${Number(ventas.transferencia).toFixed(2)}`);
        doc.moveDown();

        // 3. COSTO POR PLATO
        doc.fontSize(14).font('Helvetica-Bold').text('3. COSTO POR PLATO (Top 10)');
        doc.fontSize(9).font('Helvetica');
        topProds.forEach(p => {
            const ingreso = Number(p.ingreso);
            const costo = Number(p.costo || 0);
            const margen = ingreso > 0 ? (((ingreso - costo) / ingreso) * 100).toFixed(0) : 0;
            doc.text(`${p.nombre}: ${p.qty} uds | Ingreso S/${ingreso.toFixed(2)} | Costo S/${costo.toFixed(2)} | Margen ${margen}%`);
        });
        doc.moveDown();

        // 4. PLANILLA
        doc.fontSize(14).font('Helvetica-Bold').text('4. PLANILLA DEL DIA');
        doc.fontSize(10).font('Helvetica');
        if (planillaHoy.length === 0) {
            doc.text('No hay pagos registrados hoy');
        } else {
            planillaHoy.forEach(p => doc.text(`${p.nombre} (${p.cargo}): S/${Number(p.monto_bruto).toFixed(2)} bruto / S/${Number(p.monto_neto).toFixed(2)} neto`));
            doc.text(`TOTAL PLANILLA: S/ ${totalPlanilla.toFixed(2)}`);
        }
        doc.moveDown();

        // 5. GASTOS FIJOS
        doc.fontSize(14).font('Helvetica-Bold').text('5. GASTOS FIJOS (prorrateo diario)');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Total fijos del mes prorrateado: S/ ${gastosFijosDia.toFixed(2)}`);
        doc.moveDown();

        // 6. FALTANTES
        doc.fontSize(14).font('Helvetica-Bold').text('6. FALTANTES DE INVENTARIO');
        doc.fontSize(10).font('Helvetica');
        if (alertas.length === 0) {
            doc.text('Todo el inventario esta sobre el minimo');
        } else {
            alertas.forEach(a => {
                doc.text(`${a.nombre}: ${Number(a.stock_actual).toFixed(1)} ${a.unidad_medida} (min: ${Number(a.stock_minimo).toFixed(1)})`);
            });
        }
        doc.moveDown();

        // 7. P&L DEL DIA
        const ventasTotal = Number(ventas.total);
        const ganancia = ventasTotal - cogsDia - totalPlanilla - gastosFijosDia;

        doc.fontSize(14).font('Helvetica-Bold').text('7. P&L DEL DIA');
        doc.fontSize(10).font('Helvetica');
        doc.text(`(+) Ventas:              S/ ${ventasTotal.toFixed(2)}`);
        doc.text(`(-) Costo ingredientes:  S/ ${cogsDia.toFixed(2)}`);
        doc.text(`(-) Planilla:            S/ ${totalPlanilla.toFixed(2)}`);
        doc.text(`(-) Gastos fijos:        S/ ${gastosFijosDia.toFixed(2)}`);
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`(=) GANANCIA NETA:       S/ ${ganancia.toFixed(2)}`);

        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica').text('Generado por dignita.tech | Creado por Leonidas Yauri, CEO', { align: 'center' });

        doc.end();
    } catch (e) {
        console.error('Reporte diario error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
