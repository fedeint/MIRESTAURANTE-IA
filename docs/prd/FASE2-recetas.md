# PRD: Fase 2 - Modulo Recetas
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Tablas (migracion 003)
- `recetas` - Versionadas por producto, rendimiento, tiempo prep, food cost objetivo
- `receta_items` - Ingrediente o sub-receta, cantidad, unidad, opcional
- `combos` - Menu del dia, happy hour, con fechas y horarios
- `combo_items` - Productos del combo
- `detalle_factura.costo_receta` - Snapshot del costo al facturar
- `productos.categoria` - Campo agregado

## APIs
- GET `/api/recetas/:productoId` - Receta activa con costo calculado (incluye merma)
- POST `/api/recetas/:productoId` - Guardar receta (crea nueva version, desactiva anterior)
- GET `/api/recetas/:productoId/versiones` - Historial de versiones
- POST `/api/recetas/descontar-stock` - Descontar ingredientes al facturar

## Logica
- Versionado: cada cambio crea nueva version, historicas se mantienen
- Costo con merma: costo_ingrediente / (1 - merma_pct) * cantidad
- Sub-recetas: un item puede referenciar otra receta
- Descuento atomico al facturar via UPDATE SET stock = stock - ?
- Movimiento registrado con motivo 'venta_platillo' y referencia factura

## Archivos
- `migrations/003_recetas.js`
- `routes/recetas.js`
- `server.js` - Rutas recetas
