# PRD: Fase 7 - Reportes PDF
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Reporte diario PDF (7 secciones)
1. Caja: apertura, ingresos, egresos, cierre, diferencia
2. Ventas: cantidad facturas, total, por metodo de pago
3. Costo por plato: top 10 con ingreso, costo receta, margen %
4. Planilla del dia: cada empleado con bruto/neto
5. Gastos fijos: prorrateo diario del mes
6. Faltantes inventario: stock bajo minimo
7. P&L del dia: Ventas - COGS - Planilla - Fijos = Ganancia neta

## API
- GET `/api/reportes/diario?fecha=2026-03-17` → PDF descargable

## Tecnologia
- pdfkit (ligero, sin Chrome/Puppeteer)
- Inline en el response (Content-Type: application/pdf)

## Archivos
- `routes/reportes.js`
- `server.js`
- `package.json` (pdfkit)
