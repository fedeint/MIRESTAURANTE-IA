# Diseño: Homepage + Páginas Públicas

**Fecha:** 2026-04-02
**Estado:** Aprobado

---

## Contexto

Reemplazar el login genérico de www.mirestconia.com con una homepage estilo V3 marketing + 5 páginas públicas nuevas. El login con Google OAuth para trial queda como botón en el hero. Light mode + dark mode. Robot chef como elemento visual de marca.

**Referencia visual:** https://mirestconia-v3.vercel.app (estilo, tipografía, tono)

---

## Mapa del sitio

```
www.mirestconia.com/
├── / (Homepage)
├── /paquetes
├── /demo
├── /restaurantes
├── /beneficios
├── /marketplace
├── /login (Google OAuth → solicitud trial)
├── /privacidad (ya existe)
├── /terminos (ya existe)
└── /libro-reclamaciones (ya existe)
```

## Header (todas las páginas)

```
[🤖 MiRestconIA]   Paquetes | Demo | Restaurantes | Beneficios | Marketplace | [Probar gratis]
```

- Sticky top, dark (#0a0f24)
- "Probar gratis" → Google OAuth (redirige a /auth/google)
- Mobile: hamburger menu

## Footer (todas las páginas)

```
[🤖 MiRestconIA]
El sistema de gestión de restaurantes con IA

Producto              Legal                    Contacto
Paquetes              Términos                 WhatsApp
Demo                  Privacidad               ventas@mirestconia.com
Restaurantes          Libro de reclamaciones
Beneficios
Marketplace

© 2026 Dignita Tech — Lima, Perú · Powered by DallIA
```

---

## 1. Homepage `/`

Basada en V3 existente (https://mirestconia-v3.vercel.app) con estas adiciones:

### Header con navegación (reemplaza el nav actual de V3)

### Sección nueva: "Buscar mi restaurante"
Ubicación: entre "100+ tareas" y "Planes"

```
¿Ya tienes tu restaurante en MiRestcon IA?
[🔍 Buscar por nombre...]
Ingresa el nombre y accede a tu sistema
```

- Autocomplete consulta `GET /api/restaurantes?buscar=X` (público)
- Click en resultado → redirige a `subdominio.mirestconia.com/login`

### CTA Hero
El botón principal del hero ("Conversar con DallIA gratis") → conecta a Google OAuth para solicitud de trial.

---

## 2. `/paquetes`

### Parte 1 — Planes de Software

| | Free Trial | Anual ★ POPULAR | De por vida |
|---|---|---|---|
| Precio | Gratis | S/ 3,200/año | S/ 4,500 + S/ 700/año |
| Detalle | 15 días | S/ 2,500 sistema + S/ 700 almacenamiento | Licencia perpetua + S/ 700 almacenamiento/año |
| Usuarios | 3 | 5 | Ilimitados |
| Pedidos, cocina, mesas | ✓ | ✓ | ✓ |
| Almacén, caja | ✓ | ✓ | ✓ |
| Reportes básicos | ✓ | ✓ avanzados | ✓ avanzados |
| SUNAT, delivery, reservas | ✗ | ✓ | ✓ |
| DallIA asistente IA | ✗ | ✗ | ✓ |
| Servidor dedicado | ✗ | ✗ | ✓ |
| CTA | Probar gratis | Contratar | Contactar ventas |

### Parte 2 — Paquetes Hardware + Software

| Solo Software | Básico | Completo |
|---|---|---|
| S/ 500 | S/ 1,500 | S/ 3,000 |
| Demo virtual | All-in-one + Impresora térmica | Tablet + Impresora + Cámara seguridad |
| [Agendar demo] | [Agendar demo] | [Agendar demo] |

### Parte 3 — FAQ (accordion)
- ¿Puedo cambiar de plan después?
- ¿Qué incluye el almacenamiento?
- ¿Cómo funciona la licencia perpetua?
- ¿Los equipos tienen garantía?

---

## 3. `/demo`

Card centrada con formulario:

```
[🤖 Robot chef]
AGENDA TU DEMO
Conoce MiRestcon IA en acción

[Nombre]
[Nombre del restaurante]
[WhatsApp]
[Paquete de interés ▼] → Solo Software S/500 | Básico S/1,500 | Completo S/3,000
[Fecha preferida 📅]

[🚀 Agendar demo]

¿Dudas? Escríbenos a ventas@mirestconia.com
```

**Técnico:**
- `POST /api/demos` → guarda en tabla `demo_solicitudes`
- Tabla nueva: `demo_solicitudes (id, nombre, restaurante, whatsapp, paquete, fecha_preferida, estado, created_at)`
- Al guardar → notifica por email a ventas@mirestconia.com
- Confirmación: "Demo agendada. Te contactaremos por WhatsApp."

---

## 4. `/restaurantes`

### Mapa del Perú
- Leaflet.js (open source)
- Marcadores en ciudades con restaurantes: Lima, Cusco, Arequipa, Trujillo
- Click en marcador → filtra cards por ciudad

### Grid de restaurantes (estilo Skool)
- Cards con: foto local, nombre, tipo negocio, ciudad, botón "Entrar"
- Datos de DB: `tenants WHERE activo = true`
- Búsqueda por nombre
- Filtros por tipo de cocina
- Click "Entrar" → redirige a `subdominio.mirestconia.com`

### Sección beneficios (debajo del grid)
6 cards: DallIA, Reportes automáticos, Promociones dinámicas, Todo desde celular, Seguridad biométrica, Pedidos en tiempo real

**API pública:** `GET /api/restaurantes?buscar=X&tipo=Y&ciudad=Z`

---

## 5. `/beneficios`

3 tabs para 3 audiencias:

### Tab 1 — Comensales 🍽️
- Juegos y promociones (descuentos, postres gratis, 2x1)
- Pedido rápido por QR
- Programa de lealtad (puntos por visita)
- Cuenta en tiempo real (divide la cuenta)

### Tab 2 — Profesionales 👨‍🍳
Estilo LinkedIn para gente de restaurantes. Perfiles verificados con datos del sistema:

**Mozos:**
- Velocidad promedio de atención
- Mesas atendidas simultáneamente (récord)
- Ticket promedio por mesa
- Rating de clientes
- Racha — días consecutivos sin quejas
- Logros: "Mozo 100 mesas", "Mozo S/10K en ventas"

**Chefs:**
- Platos preparados (total lifetime)
- Tiempo promedio por plato
- Recetas que domina
- Especialidades top 3
- Rating calidad (devoluciones vs servidos)
- Logros: "Chef 1000 platos", "Cero devoluciones 30 días"

**Administradores:**
- Restaurantes gestionados
- Revenue total bajo su gestión
- Equipo más grande manejado
- Crecimiento ventas (% mes a mes)
- Logros: "Restaurante top 10", "100% inventario al día"

**Gamificación:**
- Badges bronce/plata/oro/diamante
- Nivel profesional IA (1-10)
- Portafolio visual (fotos de platos, setup de mesas)

Para esta versión: maqueta con datos de ejemplo. Los perfiles reales se conectan cuando el sistema de gamificación esté implementado.

### Tab 3 — Developers 💻
Teaser del ecosistema:
- Marketplace de apps (desarrolla y vende)
- Inspírate: MiroFish, Squads ya disponibles
- API + Webhooks
- CTA: "Ir al Marketplace"

---

## 6. `/marketplace`

Estilo app store para restaurantes:

### Grid de apps/herramientas
Cards con: ícono, nombre, descripción corta, precio, rating, botón "Instalar"

### Productos destacados
- **MiroFish** — Motor de predicción IA (S/.99, S/.199, S/.499/mes)
  "¿Qué pasaría si...?" — Simula escenarios para tu restaurante
- **Squads de Agentes** — Equipos de IA especializados
  Evento Gastronómico, Concurso/Sorteo, Campaña Influencers, Lanzamiento Producto

### Apps de terceros (placeholder)
- Espacio para que devs publiquen sus apps
- CTA: "¿Eres developer? Publica tu app"

### Para esta versión
Maqueta estática con MiroFish y Squads como productos de ejemplo. El sistema real de marketplace (publicar, instalar, pagar) es fase posterior.

---

## Técnico

### Nuevas vistas
- `views/public/homepage.ejs`
- `views/public/paquetes.ejs`
- `views/public/demo.ejs`
- `views/public/restaurantes.ejs`
- `views/public/beneficios.ejs`
- `views/public/marketplace.ejs`
- `views/partials/public-header.ejs`
- `views/partials/public-footer.ejs`

### Nueva ruta
- `routes/public.js` — todas las rutas públicas

### Nueva tabla
```sql
CREATE TABLE IF NOT EXISTS demo_solicitudes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  restaurante VARCHAR(200),
  whatsapp VARCHAR(20),
  paquete VARCHAR(50),
  fecha_preferida DATE,
  estado VARCHAR(20) DEFAULT 'pendiente',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API pública
- `GET /api/restaurantes?buscar=X&tipo=Y&ciudad=Z` — lista tenants activos
- `POST /api/demos` — guarda solicitud de demo

### Dark mode / Light mode
Todas las páginas con ambos modos. Toggle en header. Default: dark (consistente con V3).

### Dependencias nuevas
- Leaflet.js (CDN) para mapa en /restaurantes

---

## Fuera de alcance
- Marketplace funcional (instalar/pagar apps) — fase posterior
- Perfiles reales de profesionales — requiere sistema de gamificación
- MiroFish/Squads funcionales — productos separados
- Sistema de reviews/ratings público
