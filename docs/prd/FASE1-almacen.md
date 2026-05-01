# PRD: Fase 1 - Modulo Almacen Completo
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Resumen
Modulo de almacen con 11 tablas, 8 secciones UI, APIs de CRUD, entradas/salidas con trazabilidad y 14 categorias precargadas.

## Tablas creadas (migracion 002)
1. `almacen_categorias` - 14 categorias precargadas
2. `proveedores` - RUC, contacto, tipo, calificacion, credito
3. `almacen_ingredientes` - Stock, costos, merma %, sustituto, alergenos, ubicacion
4. `almacen_lotes` - Lotes con vencimiento real (FIFO)
5. `ordenes_compra` - Con estado pago y vencimiento
6. `orden_compra_items` - Items por orden
7. `inspeccion_recepcion` - Temperatura, peso, visual, foto
8. `almacen_movimientos` - 11 motivos, stock anterior/posterior, aprobacion
9. `almacen_historial_diario` - Consolidado por dia/ingrediente
10. `almacen_conteo_fisico` - Sistema vs contado
11. `almacen_temperaturas` - Registro por ubicacion

## Secciones UI
- `/almacen` - Dashboard con KPIs
- `/almacen/inventario` - CRUD ingredientes con semaforo
- `/almacen/proveedores` - CRUD proveedores
- `/almacen/entradas` - Entrada rapida (mercado)
- `/almacen/salidas` - Merma/consumo con justificacion
- `/almacen/historial` - Movimientos con filtros
- `/almacen/alertas` - Stock bajo minimo
- `/almacen/conteo-fisico` - Inventario fisico

## APIs
- POST/PUT/DELETE `/almacen/api/ingredientes`
- POST `/almacen/api/entrada` (con costo promedio ponderado atomico)
- POST `/almacen/api/salida` (con motivo obligatorio)
- GET `/almacen/api/movimientos` (filtros fecha/tipo/ingrediente)
- GET `/almacen/api/alertas`
- POST `/almacen/api/proveedores`

## Logica critica
- Descuento atomico: `UPDATE SET stock = stock - ? WHERE stock >= ?`
- Costo promedio ponderado al recibir compras
- Indices en tablas de alto volumen (movimientos, lotes)
- Soft delete en ingredientes y proveedores

## Archivos
- `migrations/002_almacen_completo.js`
- `routes/almacen.js`
- `views/almacen/` (8 archivos)
- `server.js` - Rutas almacen
- `views/partials/sidebar.ejs` - Link almacen
