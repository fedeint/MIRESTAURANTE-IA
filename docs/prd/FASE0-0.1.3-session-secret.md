---
tarea: 0.1.3
fase: 0
titulo: Session secret desde .env con advertencia
estado: COMPLETADO
fecha: 2026-03-17
hallazgo: SEC-003
---

## Cambio
- Si SESSION_SECRET no esta en .env, muestra advertencia en consola
- El valor por defecto se marca como "dev-only-insecure"
- SESSION_SECRET ya existe en .env del proyecto

## Archivos
- `server.js` - Advertencia si falta SESSION_SECRET
