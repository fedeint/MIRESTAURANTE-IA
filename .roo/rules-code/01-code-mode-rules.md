# Reglas para Code Mode en MiRestconIA

Cuando trabajes en código:

## Pantallas EJS

- Mantener consistencia con `views/layout.ejs`.
- Reutilizar partials existentes antes de crear nuevos.
- No duplicar lógica innecesaria en cada vista.
- Separar comportamiento JS en `public/js/`.
- Separar estilos en `public/css/`.
- No usar `<%- %>` salvo que el contenido esté sanitizado.

## Diseño

- Respetar tokens de diseño indicados en `CLAUDE.md`.
- Mantener enfoque mobile-first PWA.
- Cuidar performance en Android gama media/baja.
- Evitar librerías pesadas si una solución CSS/JS simple basta.
- No introducir frameworks nuevos sin autorización.

## Backend

- Validar inputs con Zod o validación estricta.
- Usar queries parametrizadas.
- No concatenar SQL con input del usuario.
- Mantener separación routes/services/lib.
- No romper compatibilidad multi-tenant.

## Seguridad

- No leer ni imprimir `.env`.
- No hardcodear tokens, API keys ni credenciales.
- Si se crea endpoint nuevo, verificar auth, permisos y rate limit.
- Mantener Helmet, CSRF y sesiones seguras.

## Entrega

Al terminar, reportar:

1. Archivos modificados.
2. Qué cambió.
3. Cómo probar.
4. Riesgos o pendientes.
