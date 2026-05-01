# PRD: Fase 8 - Features Competitivos
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Tablas (migracion 008) - 9 tablas
- `reservas` - Fecha, hora, personas, mesa, estado, canal origen
- `pedidos_delivery` - Tipo, plataforma (Rappi/PedidosYa/UberEats), repartidor, comision
- `promociones` - Porcentaje, monto fijo, 2x1, happy hour, combo con vigencia
- `descuentos_aplicados` - Vinculado a factura y promocion
- `fidelidad_puntos` - Acumulados, canjeados, disponibles, nivel (bronce→platino)
- `fidelidad_movimientos` - Historial de puntos
- `modificadores_grupo` - Termino coccion, Extras, Sin ingrediente (3 precargados)
- `modificadores` - 11 precargados (crudo, medio, extra aji, sin cebolla, etc.)
- `producto_modificadores` - Relacion producto ↔ grupo

## Modulos

### Reservas (/features/reservas)
- Calendario por fecha, crear reserva con mesa asignada
- Estados: pendiente → confirmada → sentada → completada / no_show / cancelada
- Canal: telefono, whatsapp, web, presencial

### Delivery (/features/delivery)
- Pedidos delivery y para llevar
- Plataformas: propio, Rappi, PedidosYa, UberEats
- Comision por plataforma, tracking de estado

### Promociones (/features/promociones)
- 5 tipos: porcentaje, monto fijo, 2x1, happy hour, combo
- Codigo cupon, vigencia por fecha y hora, usos maximo
- Toggle activa/inactiva

### Fidelidad (/features/fidelidad)
- 1 sol = 1 punto, 100 puntos = S/5 descuento
- Niveles: bronce (0-1999), plata (2000-4999), oro (5000-9999), platino (10000+)
- Acumulacion automatica al facturar

### Menu Digital QR (/features/menu)
- Pagina publica sin login
- Productos agrupados por categoria con fotos
- "No disponible" si ingredientes agotados
- Mobile-friendly

### Modificadores de plato
- 3 grupos precargados con 11 opciones
- Vinculados a productos especificos

## Archivos
- `migrations/008_features.js`
- `routes/features.js`
- `views/features/` (5 vistas)
- `server.js`, `views/partials/sidebar.ejs`
