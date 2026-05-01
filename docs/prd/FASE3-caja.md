# PRD: Fase 3 - Caja Registradora
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Tablas (migracion 004)
- `turnos` - Manana/Tarde precargados
- `metodos_pago` - 8 metodos Peru (Efectivo, Visa, MC, Yape, Plin, BCP, Interbank, Credito)
- `cajas` - Apertura/cierre con denominacion JSON, umbral efectivo
- `caja_movimientos` - 12 conceptos, anulable, propina separada
- `facturas.propina` - Campo agregado

## APIs
- POST `/api/caja/abrir` - Con monto inicial y turno
- POST `/api/caja/cerrar` - Con conteo por denominacion y diferencia
- POST `/api/caja/movimiento` - Ingreso/egreso manual

## Vista
- Estado sin caja: formulario de apertura
- Estado con caja: KPIs + tabla movimientos + modales (cerrar con denominacion, registrar movimiento)

## Archivos
- `migrations/004_caja.js`
- `routes/caja.js`
- `views/caja.ejs`
- `server.js` - Rutas caja (admin + cajero)
- `views/partials/sidebar.ejs` - Link caja
