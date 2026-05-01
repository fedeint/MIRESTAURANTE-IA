# Reglas de arquitectura — MiRestconIA

## Arquitectura base

Este proyecto usa:

- Node.js
- Express
- EJS
- CSS/JS tradicional
- Bootstrap
- PostgreSQL/Supabase
- PWA
- IA DallIA

No migrar a React, Next.js, Vue, Angular, Tailwind o shadcn sin autorización explícita.

## Estructura

Respetar la organización existente:

- `server.js` para configuración principal del servidor.
- `routes/` para rutas Express.
- `views/` para vistas EJS.
- `views/partials/` para componentes reutilizables.
- `public/css/` para estilos.
- `public/js/` para scripts frontend.
- `lib/` para lógica auxiliar.
- `config/` para configuración.

## Regla mobile/desktop

Si una pantalla tiene versión mobile y desktop, revisar ambas antes de modificar.

Ejemplos:

- `dashboard.ejs`
- `dashboard-desktop.ejs`
- `mesas.ejs`
- `mesas-desktop.ejs`

No modificar solo una variante si el cambio afecta navegación, datos, layout o flujo principal.

## Backend

- No mezclar lógica pesada dentro de las vistas EJS.
- No poner lógica SQL directamente dentro del frontend.
- No duplicar rutas si ya existe una ruta equivalente.
- Reutilizar middlewares existentes cuando sea posible.
- Mantener separación entre rutas, servicios, vistas y scripts.

## PWA

Antes de modificar navegación, rutas públicas o assets, revisar:

- `public/manifest.json`
- service worker si existe
- scripts relacionados con instalación/offline