# MiRestconIA — Contexto obligatorio para Roo Code

Este proyecto es un SaaS multi-tenant para restaurantes peruanos con IA conversacional DallIA.

## Stack real

- Backend: Node.js + Express
- Vistas: EJS server-side rendering
- Frontend: CSS/JS en public/
- UI: Bootstrap + CSS propio
- DB: PostgreSQL/Supabase y compatibilidad parcial MySQL según módulos
- Auth: sesiones, Google OAuth, WebAuthn
- PWA: manifest, service worker, modo offline
- IA: DallIA, servicios en lib/ y routes/chat.js
- Tests: node:test mediante `npm test`

## Reglas de arquitectura

1. No migrar a React, Next.js, Tailwind o shadcn salvo orden explícita.
2. No romper la arquitectura EJS existente.
3. Respetar la regla de dos variantes por pantalla:
   - Mobile/PWA: `views/pagina.ejs`
   - Desktop: `views/pagina-desktop.ejs`
4. Si se modifica una pantalla, revisar también su variante mobile/desktop relacionada.
5. Usar `lib/deviceRouter.js` cuando aplique.
6. No borrar código existente sin justificarlo.
7. No tocar `.env` ni mostrar secretos.
8. Toda variable nueva debe agregarse a `.env.example` sin valor real.
9. Todo endpoint nuevo debe tener validación, control de sesión/permisos y rate limit si corresponde.
10. Antes de implementar, leer:
    - `README.md`
    - `CLAUDE.md`
    - `public/css/theme.css`
    - `views/layout.ejs`
    - los partials relevantes en `views/partials/`

## Objetivo actual

Ayudar a implementar mejoras de diseño, secciones, pantallas, UX, navegación, PWA y módulos existentes sin reescribir el sistema completo.

## Flujo obligatorio

Antes de modificar código:

1. Explicar qué archivos se tocarán.
2. Hacer plan corto.
3. Implementar por bloques pequeños.
4. Ejecutar o indicar el comando de prueba:
   - `npm test`
   - `npm run dev`
5. Resumir cambios y riesgos.
