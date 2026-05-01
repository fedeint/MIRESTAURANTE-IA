# PRD: Fase 5 - Administracion / P&L
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Tablas (migracion 006)
- `personal` - DNI, cargo, tipo contrato, regimen pension (ONP/AFP)
- `planilla_pagos` - Bruto, deducciones ONP/AFP, neto, EsSalud 9%, SCTR 1.5%
- `gastos_categorias` - 17 precargadas (7 grupos: compras, servicios, marketing, sueldos, inmovilizado, legal, otros)
- `gastos` - Con comprobante, recurrente, frecuencia
- `presupuestos` - Mensual por categoria, presupuesto vs real

## APIs
- GET `/administracion` - Dashboard P&L completo
- GET `/administracion/planilla` - Vista planilla
- GET `/administracion/gastos` - Vista gastos
- POST `/api/administracion/personal` - CRUD personal
- POST `/api/administracion/planilla/pagar` - Pago con calculos Peru (ONP 13%, AFP ~12.5%, EsSalud 9%, SCTR 1.5%)
- POST `/api/administracion/gastos` - CRUD gastos
- POST `/api/administracion/presupuesto` - Presupuesto mensual

## P&L automatico
```
(+) Ventas brutas
(-) IGV ventas (18%)
(=) Ventas netas
(-) COGS teorico (recetas x ventas)
(=) Margen bruto (%)
    Varianza COGS (teorico vs real compras)
(-) Planilla (bruta + EsSalud + SCTR)
(-) Gastos fijos (alquiler, luz, agua, internet, gas, seguro)
(-) Gastos variables (marketing, transporte, otros)
(=) EBITDA (%)
```

## Sidebar
- Seccion "Administracion" reemplaza "Marketing"
- Links: P&L/Finanzas, Planilla, Gastos, SUNAT

## Archivos
- `migrations/006_administracion.js`
- `routes/administracion.js`
- `views/administracion/` (3 archivos: dashboard, planilla, gastos)
- `server.js`, `views/partials/sidebar.ejs`
