const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');

// GET /reportes - Página principal de reportes con botones de descarga
router.get('/', (req, res) => {
    const hoy = new Date().toISOString().split('T')[0];
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reportes PDF - dignita.tech</title>
    <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.css">
    <link rel="stylesheet" href="/css/theme.css">
</head>
<body>
    ${req.app.get('view engine') === 'ejs' ? '' : ''}
    <div class="dg-main" style="padding:2rem;max-width:900px;margin:0 auto;">
        <h3 class="mb-4"><i class="bi bi-file-earmark-pdf me-2"></i>Reportes PDF</h3>

        <div class="row g-4">
            <div class="col-md-6">
                <div class="card border-0 shadow-sm" style="border-radius:14px;">
                    <div class="card-body p-4">
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div style="width:48px;height:48px;border-radius:12px;background:rgba(249,115,22,0.1);display:flex;align-items:center;justify-content:center;">
                                <i class="bi bi-graph-up" style="font-size:1.4rem;color:#F97316;"></i>
                            </div>
                            <div>
                                <h5 class="mb-0" style="font-weight:700;">Resumen del Día</h5>
                                <small class="text-muted">Ventas, platos, mesas, caja</small>
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label small fw-bold">Fecha</label>
                            <input type="date" id="fechaResumen" class="form-control" value="${hoy}">
                        </div>
                        <a id="btnResumen" href="/api/reportes/resumen-dia?fecha=${hoy}" class="btn w-100 text-white fw-bold" style="background:linear-gradient(135deg,#F97316,#EA580C);border:none;border-radius:10px;padding:0.6rem;">
                            <i class="bi bi-download me-1"></i> Descargar PDF
                        </a>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="card border-0 shadow-sm" style="border-radius:14px;">
                    <div class="card-body p-4">
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div style="width:48px;height:48px;border-radius:12px;background:rgba(22,163,74,0.1);display:flex;align-items:center;justify-content:center;">
                                <i class="bi bi-cart-check" style="font-size:1.4rem;color:#16a34a;"></i>
                            </div>
                            <div>
                                <h5 class="mb-0" style="font-weight:700;">Lista de Compras</h5>
                                <small class="text-muted">Qué comprar para mañana</small>
                            </div>
                        </div>
                        <p class="text-muted small mb-3">Basado en el consumo promedio de los últimos 7 días vs stock actual del almacén.</p>
                        <a href="/api/reportes/lista-compras" class="btn w-100 text-white fw-bold" style="background:linear-gradient(135deg,#16a34a,#15803d);border:none;border-radius:10px;padding:0.6rem;">
                            <i class="bi bi-download me-1"></i> Descargar PDF
                        </a>
                    </div>
                </div>
            </div>
        </div>

        <div class="mt-4">
            <a href="/" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-left me-1"></i> Volver al inicio</a>
        </div>
    </div>
    <script>
        document.getElementById('fechaResumen').addEventListener('change', function() {
            document.getElementById('btnResumen').href = '/api/reportes/resumen-dia?fecha=' + this.value;
        });
    </script>
</body>
</html>
    `);
});

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
                FROM caja_movimientos WHERE caja_id=? AND anulado=false
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
            FROM almacen_ingredientes WHERE tenant_id=? AND activo=true AND stock_actual <= stock_minimo
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

// ---------------------------------------------------------------------------
// Helpers for PDF drawing
// ---------------------------------------------------------------------------

const ORANGE = '#F97316';
const DARK   = '#1F2937';
const GRAY   = '#6B7280';
const LIGHT  = '#F3F4F6';
const WHITE  = '#FFFFFF';
const RED    = '#DC2626';

/**
 * Draw a full-width colored section header bar.
 */
function sectionHeader(doc, title) {
    const x = doc.page.margins.left;
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.y;
    doc.rect(x, y, w, 20).fill(ORANGE);
    doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold')
        .text(title, x + 8, y + 4, { width: w - 16 });
    doc.fillColor(DARK);
    doc.y = y + 26;
}

/**
 * Draw a simple two-column key/value row.
 */
function kvRow(doc, label, value, opts = {}) {
    const x = doc.page.margins.left;
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    if (opts.shade) {
        doc.rect(x, doc.y, w, 16).fill(LIGHT);
        doc.fillColor(DARK);
    }
    doc.fontSize(9).font('Helvetica').fillColor(GRAY)
        .text(label, x + 4, doc.y + 3, { width: w / 2 - 8, continued: false });
    doc.fillColor(DARK).font('Helvetica-Bold')
        .text(value, x + w / 2, doc.y - 12, { width: w / 2, align: 'right' });
    doc.y += 4;
}

/**
 * Draw a table with column definitions.
 * columns: [{ label, width, align }]
 * rows: array of arrays matching column order
 * highlightRow: function(row) => boolean  – if true, row text is RED
 */
function drawTable(doc, columns, rows, highlightRow) {
    const marginL = doc.page.margins.left;
    const marginR = doc.page.margins.right;
    const tableWidth = doc.page.width - marginL - marginR;

    // Normalize widths as fractions
    const totalW = columns.reduce((s, c) => s + c.width, 0);
    const colWidths = columns.map(c => (c.width / totalW) * tableWidth);

    // Header row
    let xPos = marginL;
    const headerY = doc.y;
    doc.rect(marginL, headerY, tableWidth, 18).fill(DARK);
    columns.forEach((col, i) => {
        doc.fillColor(WHITE).fontSize(8).font('Helvetica-Bold')
            .text(col.label, xPos + 3, headerY + 4, {
                width: colWidths[i] - 6,
                align: col.align || 'left'
            });
        xPos += colWidths[i];
    });
    doc.y = headerY + 20;

    rows.forEach((row, rowIdx) => {
        // Page break check
        if (doc.y + 16 > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
        }

        const rowY = doc.y;
        const shade = rowIdx % 2 === 1;
        if (shade) {
            doc.rect(marginL, rowY, tableWidth, 16).fill(LIGHT);
        }

        const isRed = highlightRow && highlightRow(row, rowIdx);
        const textColor = isRed ? RED : DARK;

        xPos = marginL;
        columns.forEach((col, i) => {
            const cellVal = row[i] != null ? String(row[i]) : '';
            doc.fillColor(textColor).fontSize(8).font(isRed ? 'Helvetica-Bold' : 'Helvetica')
                .text(cellVal, xPos + 3, rowY + 3, {
                    width: colWidths[i] - 6,
                    align: col.align || 'left'
                });
            xPos += colWidths[i];
        });

        doc.y = rowY + 18;
    });
}

/**
 * Draw the PDF header (restaurant name + date + report title).
 */
function drawPdfHeader(doc, title, subtitle) {
    const marginL = doc.page.margins.left;
    const pageW   = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Top orange bar
    doc.rect(marginL, doc.page.margins.top - 10, pageW, 60).fill(ORANGE);
    doc.fillColor(WHITE)
        .fontSize(20).font('Helvetica-Bold')
        .text(title, marginL + 10, doc.page.margins.top + 2, { width: pageW - 20 });
    doc.fillColor(WHITE)
        .fontSize(10).font('Helvetica')
        .text(subtitle, marginL + 10, doc.page.margins.top + 28, { width: pageW - 20 });

    doc.fillColor(DARK);
    doc.y = doc.page.margins.top + 70;
}

/**
 * Draw footer on current page.
 */
function drawFooter(doc) {
    const y = doc.page.height - doc.page.margins.bottom + 10;
    const x = doc.page.margins.left;
    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.rect(x, y - 4, w, 22).fill(ORANGE);
    doc.fillColor(WHITE).fontSize(8).font('Helvetica')
        .text(
            `Generado por dignita.tech  |  ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
            x + 4, y + 2, { width: w - 8, align: 'center' }
        );
}

// ---------------------------------------------------------------------------
// GET /api/reportes/resumen-dia?fecha=YYYY-MM-DD
// ---------------------------------------------------------------------------
router.get('/resumen-dia', async (req, res) => {
    try {
        const tid   = req.tenantId || 1;
        const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

        // ------------------------------------------------------------------
        // 1. Ventas del día
        // ------------------------------------------------------------------
        const [[ventas]] = await db.query(`
            SELECT
                COUNT(*)                          AS facturas,
                COALESCE(SUM(total), 0)           AS total
            FROM facturas
            WHERE tenant_id = ? AND fecha::date = ?
        `, [tid, fecha]);

        const totalVentas   = Number(ventas.total);
        const numFacturas   = Number(ventas.facturas);
        const ticketPromedio = numFacturas > 0 ? totalVentas / numFacturas : 0;

        // ------------------------------------------------------------------
        // 2. Desglose por método de pago (via factura_pagos)
        // factura_pagos.metodo is the enum column (efectivo/tarjeta/transferencia)
        // ------------------------------------------------------------------
        const [metodosPago] = await db.query(`
            SELECT
                fp.metodo                      AS metodo,
                COUNT(DISTINCT fp.factura_id)  AS qty,
                COALESCE(SUM(fp.monto), 0)     AS total
            FROM factura_pagos fp
            JOIN facturas f ON f.id = fp.factura_id
            WHERE f.tenant_id = ? AND f.fecha::date = ?
            GROUP BY fp.metodo
            ORDER BY total DESC
        `, [tid, fecha]);

        // Fallback: if factura_pagos is empty, read forma_pago from facturas
        let metodoRows = metodosPago;
        if (metodoRows.length === 0) {
            const [mp2] = await db.query(`
                SELECT
                    forma_pago                    AS metodo,
                    COUNT(*)                      AS qty,
                    COALESCE(SUM(total), 0)       AS total
                FROM facturas
                WHERE tenant_id = ? AND fecha::date = ?
                GROUP BY forma_pago
                ORDER BY total DESC
            `, [tid, fecha]);
            metodoRows = mp2;
        }

        // ------------------------------------------------------------------
        // 3. Platos vendidos
        // ------------------------------------------------------------------
        const [platos] = await db.query(`
            SELECT
                p.nombre,
                COALESCE(SUM(df.cantidad), 0)  AS cantidad,
                COALESCE(SUM(df.subtotal), 0)  AS total
            FROM detalle_factura df
            JOIN facturas f  ON f.id  = df.factura_id
            JOIN productos p ON p.id  = df.producto_id
            WHERE f.tenant_id = ? AND f.fecha::date = ?
            GROUP BY p.nombre
            ORDER BY cantidad DESC
        `, [tid, fecha]);

        // ------------------------------------------------------------------
        // 4. Mesas atendidas
        // ------------------------------------------------------------------
        const [[mesasStats]] = await db.query(`
            SELECT
                COUNT(DISTINCT p.mesa_id)  AS mesas_atendidas
            FROM pedidos p
            WHERE p.tenant_id = ? AND p.estado = 'cerrado' AND p.created_at::date = ?
        `, [tid, fecha]);

        // Derive mesa mayor consumo from closed pedidos on this date
        // (facturas does not carry pedido_id; we use pedidos.total instead)
        const [[mesaMayor]] = await db.query(`
            SELECT
                m.numero AS mesa,
                COALESCE(SUM(p.total), 0) AS consumo
            FROM pedidos p
            JOIN mesas m ON m.id = p.mesa_id
            WHERE p.tenant_id = ? AND p.estado = 'cerrado' AND p.created_at::date = ?
            GROUP BY m.numero
            ORDER BY consumo DESC
            LIMIT 1
        `, [tid, fecha]).catch(() => [[null]]);

        // ------------------------------------------------------------------
        // 5. Caja
        // ------------------------------------------------------------------
        const [[caja]] = await db.query(`
            SELECT *
            FROM cajas
            WHERE tenant_id = ? AND fecha_apertura::date = ?
            ORDER BY fecha_apertura DESC
            LIMIT 1
        `, [tid, fecha]);

        let cajaIngresos = 0, cajaEgresos = 0;
        if (caja) {
            const [[tots]] = await db.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS i,
                    COALESCE(SUM(CASE WHEN tipo = 'egreso'  THEN monto ELSE 0 END), 0) AS e
                FROM caja_movimientos
                WHERE caja_id = ? AND anulado = false
            `, [caja.id]);
            cajaIngresos = Number(tots.i);
            cajaEgresos  = Number(tots.e);
        }

        // ------------------------------------------------------------------
        // Build PDF
        // ------------------------------------------------------------------
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=resumen-dia-${fecha}.pdf`);
        doc.pipe(res);

        // Header
        drawPdfHeader(
            doc,
            'RESUMEN DEL DIA',
            `Fecha: ${fecha}  |  Restaurante Dignita`
        );

        // ---- SECTION 1: VENTAS ----
        sectionHeader(doc, '1.  VENTAS DEL DIA');
        doc.moveDown(0.3);
        kvRow(doc, 'Total ventas',       `S/ ${totalVentas.toFixed(2)}`,     { shade: false });
        kvRow(doc, 'Facturas emitidas',  `${numFacturas}`,                    { shade: true  });
        kvRow(doc, 'Ticket promedio',    `S/ ${ticketPromedio.toFixed(2)}`,   { shade: false });
        doc.moveDown(0.6);

        // Métodos de pago sub-table
        if (metodoRows.length > 0) {
            doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
                .text('Desglose por metodo de pago:', doc.page.margins.left + 4);
            doc.moveDown(0.3);
            drawTable(
                doc,
                [
                    { label: 'Metodo de Pago', width: 4, align: 'left'  },
                    { label: 'Transacciones',  width: 2, align: 'center'},
                    { label: 'Total (S/)',     width: 2, align: 'right' }
                ],
                metodoRows.map(m => [
                    m.metodo || '—',
                    m.qty,
                    `S/ ${Number(m.total).toFixed(2)}`
                ]),
                null
            );
        } else {
            doc.fontSize(9).font('Helvetica').fillColor(GRAY)
                .text('Sin registros de pagos para esta fecha.', doc.page.margins.left + 4);
        }
        doc.moveDown(1);

        // ---- SECTION 2: PLATOS VENDIDOS ----
        sectionHeader(doc, '2.  PLATOS VENDIDOS');
        doc.moveDown(0.3);
        if (platos.length > 0) {
            drawTable(
                doc,
                [
                    { label: 'Producto',    width: 5, align: 'left'  },
                    { label: 'Cantidad',    width: 2, align: 'center'},
                    { label: 'Total (S/)', width: 2, align: 'right' }
                ],
                platos.map(p => [
                    p.nombre,
                    Number(p.cantidad).toFixed(0),
                    `S/ ${Number(p.total).toFixed(2)}`
                ]),
                null
            );
        } else {
            doc.fontSize(9).font('Helvetica').fillColor(GRAY)
                .text('Sin ventas registradas para esta fecha.', doc.page.margins.left + 4);
        }
        doc.moveDown(1);

        // ---- SECTION 3: MESAS ----
        sectionHeader(doc, '3.  MESAS ATENDIDAS');
        doc.moveDown(0.3);
        kvRow(doc, 'Total mesas atendidas', `${Number(mesasStats.mesas_atendidas)}`, { shade: false });
        if (mesaMayor && mesaMayor.mesa) {
            kvRow(doc,
                'Mesa con mayor consumo',
                `Mesa ${mesaMayor.mesa}  (S/ ${Number(mesaMayor.consumo).toFixed(2)})`,
                { shade: true }
            );
        }
        doc.moveDown(1);

        // ---- SECTION 4: CAJA ----
        sectionHeader(doc, '4.  CAJA');
        doc.moveDown(0.3);
        if (caja) {
            const saldo = Number(caja.monto_apertura) + cajaIngresos - cajaEgresos;
            kvRow(doc, 'Monto de apertura', `S/ ${Number(caja.monto_apertura).toFixed(2)}`, { shade: false });
            kvRow(doc, 'Total ingresos',    `S/ ${cajaIngresos.toFixed(2)}`,                 { shade: true  });
            kvRow(doc, 'Total egresos',     `S/ ${cajaEgresos.toFixed(2)}`,                  { shade: false });
            kvRow(doc, 'Saldo final',       `S/ ${saldo.toFixed(2)}`,                        { shade: true  });
            if (caja.monto_cierre_real != null) {
                kvRow(doc, 'Cierre real',   `S/ ${Number(caja.monto_cierre_real).toFixed(2)}`, { shade: false });
                kvRow(doc, 'Diferencia',    `S/ ${Number(caja.diferencia || 0).toFixed(2)}`,   { shade: true  });
            }
        } else {
            doc.fontSize(9).font('Helvetica').fillColor(GRAY)
                .text('No se registro apertura de caja para esta fecha.', doc.page.margins.left + 4);
        }

        // Footer on every page
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            drawFooter(doc);
        }

        doc.end();
    } catch (e) {
        console.error('Resumen dia error:', e.message);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/reportes/lista-compras
// ---------------------------------------------------------------------------
router.get('/lista-compras', async (req, res) => {
    try {
        const tid    = req.tenantId || 1;
        const manana = new Date();
        manana.setDate(manana.getDate() + 1);
        const fechaManana = manana.toISOString().split('T')[0];

        // ------------------------------------------------------------------
        // Stock vs consumo promedio (last 7 days via recetas)
        // ------------------------------------------------------------------
        const [stockRows] = await db.query(`
            SELECT
                ai.id,
                ai.nombre,
                ai.stock_actual,
                ai.stock_minimo,
                ai.unidad_medida,
                COALESCE(consumo.promedio_diario, 0) AS consumo_diario
            FROM almacen_ingredientes ai
            LEFT JOIN (
                SELECT
                    ri.ingrediente_id,
                    SUM(df.cantidad * ri.cantidad) / 7.0 AS promedio_diario
                FROM receta_items ri
                JOIN recetas r       ON r.id  = ri.receta_id  AND r.activa = true
                JOIN detalle_factura df ON df.producto_id = r.producto_id
                JOIN facturas f      ON f.id  = df.factura_id
                WHERE f.tenant_id = ? AND f.fecha >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY ri.ingrediente_id
            ) consumo ON consumo.ingrediente_id = ai.id
            WHERE ai.tenant_id = ? AND ai.activo = true
            ORDER BY ai.nombre
        `, [tid, tid]);

        // ------------------------------------------------------------------
        // Determine if we have recipe/sales data at all
        // ------------------------------------------------------------------
        const hasConsumptionData = stockRows.some(r => Number(r.consumo_diario) > 0);

        // Build table rows
        let tableRows;
        let columns;

        if (hasConsumptionData) {
            // Full shopping list with projections
            columns = [
                { label: 'Ingrediente',              width: 5, align: 'left'   },
                { label: 'Stock Actual',             width: 2, align: 'right'  },
                { label: 'Consumo/dia',              width: 2, align: 'right'  },
                { label: 'Neces. 1 dia',             width: 2, align: 'right'  },
                { label: 'Neces. 3 dias',            width: 2, align: 'right'  },
                { label: 'COMPRAR',                  width: 2, align: 'right'  },
            ];

            tableRows = stockRows.map(r => {
                const stock    = Number(r.stock_actual);
                const diario   = Number(r.consumo_diario);
                const nec1     = diario;
                const nec3     = diario * 3;
                const deficit  = Math.max(0, nec1 - stock);
                const um       = r.unidad_medida || '';
                return [
                    r.nombre,
                    `${stock.toFixed(2)} ${um}`,
                    `${diario.toFixed(2)} ${um}`,
                    `${nec1.toFixed(2)} ${um}`,
                    `${nec3.toFixed(2)} ${um}`,
                    deficit > 0 ? `${deficit.toFixed(2)} ${um}` : '—',
                    // hidden flag used by highlight function
                    stock < diario
                ];
            });
        } else {
            // Fallback: show all items below stock_minimo
            columns = [
                { label: 'Ingrediente',   width: 5, align: 'left'  },
                { label: 'Stock Actual',  width: 2, align: 'right' },
                { label: 'Stock Minimo',  width: 2, align: 'right' },
                { label: 'Unidad',        width: 1, align: 'center'},
                { label: 'Alerta',        width: 2, align: 'center'},
            ];

            tableRows = stockRows.map(r => {
                const stock = Number(r.stock_actual);
                const min   = Number(r.stock_minimo);
                const bajo  = stock <= min;
                return [
                    r.nombre,
                    stock.toFixed(2),
                    min.toFixed(2),
                    r.unidad_medida || '—',
                    bajo ? 'BAJO MINIMO' : 'OK',
                    bajo  // hidden flag
                ];
            });
        }

        // ------------------------------------------------------------------
        // Build PDF
        // ------------------------------------------------------------------
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=lista-compras-${fechaManana}.pdf`);
        doc.pipe(res);

        drawPdfHeader(
            doc,
            'LISTA DE COMPRAS',
            `Para: ${fechaManana}  |  Restaurante Dignita`
        );

        // Summary note
        const totalIngredientes = tableRows.length;
        const itemsBajos = tableRows.filter(r => r[r.length - 1] === true).length;

        doc.fontSize(9).font('Helvetica').fillColor(GRAY)
            .text(
                `Total ingredientes activos: ${totalIngredientes}   |   Ingredientes a reponer: ${itemsBajos}`,
                doc.page.margins.left + 4
            );
        doc.moveDown(0.6);

        if (hasConsumptionData) {
            sectionHeader(doc, 'PROYECCION BASADA EN CONSUMO PROMEDIO (ultimos 7 dias)');
        } else {
            sectionHeader(doc, 'ITEMS POR DEBAJO DEL STOCK MINIMO (sin datos de recetas/ventas)');
        }
        doc.moveDown(0.3);

        // Strip the hidden boolean flag before drawing
        const visibleRows = tableRows.map(r => r.slice(0, r.length - 1));

        drawTable(
            doc,
            columns,
            visibleRows,
            (row, idx) => tableRows[idx][tableRows[idx].length - 1] === true
        );

        // Legend
        doc.moveDown(0.8);
        doc.fontSize(8).font('Helvetica').fillColor(RED)
            .text('  Filas en rojo: stock actual inferior al consumo diario promedio (requieren reposicion urgente).',
                doc.page.margins.left + 4);

        // Footer on every page
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            drawFooter(doc);
        }

        doc.end();
    } catch (e) {
        console.error('Lista compras error:', e.message);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

module.exports = router;
