# PRD: Fase 10 - Modo Offline (PWA)
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Implementacion
- `manifest.json` - PWA manifest (nombre, icono, theme color)
- `sw.js` - Service Worker: cache static assets, network-first con fallback
- Footer: registro SW + indicador offline (barra roja fija)
- Online/offline events para mostrar/ocultar indicador

## Cache strategy
- Static assets cacheados al instalar (CSS, JS, Bootstrap, jQuery, SweetAlert)
- Network first: intenta red, si falla sirve de cache
- API requests no se cachean (solo GET de paginas)

## Offline indicator
- Barra roja fija al fondo "Sin conexion a internet"
- Se muestra automaticamente cuando `window.offline` se dispara
- Se oculta al reconectar

## Archivos
- `public/manifest.json`
- `public/sw.js`
- `views/partials/footer.ejs`
