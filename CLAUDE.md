# MiRestcon IA — Instrucciones para Claude

## Proyecto
Sistema de gestión de restaurantes peruano con IA conversacional (DallIA).
PWA mobile-first, multi-tenant, para micro-restaurantes hasta cadenas.

## Antes de escribir código
1. Lee `/UI GPT/HANDOFF-SONNET.md` para entender el proyecto completo
2. Lee `/UI GPT/PROMPT-SONNET.md` para ver el paso actual y los nodeIds de diseño
3. Para CADA pantalla que implementes, usa `mcp__pencil__get_screenshot` para ver el diseño exacto:
   - Archivo: `UI.DELSISTEMA.pen`
   - Usa `mcp__pencil__batch_get(filePath, nodeIds, readDepth:3)` para leer colores, fonts, spacing
4. NO borres código existente. Extiende lo que hay.

## Design tokens
- Font: DM Sans (primary), Inter (status bar)
- Dark: gradient #10152f → #0a0f24 → #090d1d
- Orange: gradient 8-stop #ef520f → #df2c05
- Background: #F0F2F8
- Cards: #FFFFFF, cornerRadius 16
- Headers: cornerRadius [0,0,20,20]
- Text primary: #0a0f24, secondary: #8B8FAD
- Success: #22C55E, Warning: #F97316, Error: #EF4444, Info: #6366F1

## Stack existente
- Backend: Express.js (server.js)
- DB: MySQL/PostgreSQL (db.js, migrations/)
- Views: EJS (views/)
- Frontend: public/
- Auth: Google OAuth 2.0 (routes/google-auth.js)
- Panel admin: routes/superadmin.js

## Documentación clave
- `/UI GPT/HANDOFF-SONNET.md` — Mapa completo del proyecto
- `/UI GPT/PROMPT-SONNET.md` — 9 pasos con nodeIds de diseño
- `/UI GPT/ROADMAP-VERSIONES.md` — Features V1 + V2
- `/UI GPT/tenant-template/` — Onboarding, rutinas, knowledge base, config
- `UI.DELSISTEMA.pen` — 64+ pantallas diseñadas (usar get_screenshot)

## Regla crítica
Antes de implementar una pantalla, SIEMPRE haz get_screenshot del .pen para ver el diseño exacto y replicarlo en código.

## Credenciales
NUNCA leer ni mostrar valores del .env. Solo verificar que las variables existen.
