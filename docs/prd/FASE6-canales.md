# PRD: Fase 6 - Canales Internos
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Tablas (migracion 007)
- `canales` - 5 precargados (#inventario, #meseros, #cocina, #administracion, #soporte)
- `canal_mensajes` - Texto/alerta/sistema, prioridad, pinned con expiracion
- `canal_mensajes_leidos` - Tabla separada (no JSON) para escalabilidad

## APIs
- GET `/canales` - Vista con canales filtrados por rol
- GET `/api/canales/:id/mensajes` - Mensajes del canal (pinned primero)
- POST `/api/canales/:id/mensajes` - Enviar mensaje
- `enviarMensajeSistema()` - Funcion exportada para otros modulos

## Vista
- 2 columnas: lista canales (izq) + chat mensajes (der)
- Mensajes de sistema con estilo diferente (azul)
- Pinned messages arriba con icono pin
- Input con Enter para enviar

## Archivos
- `migrations/007_canales.js`
- `routes/canales.js`
- `views/canales.ejs`
