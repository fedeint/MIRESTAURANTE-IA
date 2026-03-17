---
tarea: 0.1.2
fase: 0
titulo: Restringir CORS
estado: COMPLETADO
fecha: 2026-03-17
hallazgo: SEC-002
---

## Problema
CORS abierto a `*` permitia que cualquier sitio web hiciera requests a la API.

## Solucion
- CORS ahora usa `CORS_ORIGIN` de .env si existe
- Fallback al origin del request (mismo dominio)
- Configurable por tenant cuando sea SaaS

## Archivos
- `server.js` - CORS configurable via env
