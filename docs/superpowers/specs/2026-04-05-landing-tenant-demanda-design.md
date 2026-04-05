# Diseno: Landing Publica del Tenant — Menu Digital + Generacion de Demanda

**Fecha:** 2026-04-05
**Estado:** En revision

---

## Contexto

Cada restaurante en MiRestcon IA necesita una pagina publica accesible en `mirestconia.com/:slug` que funcione como vitrina digital y motor de generacion de demanda. Hoy la ruta `/:slug` solo resuelve el tenant y redirige al sistema interno (requiere auth). El menu digital publico existe en `/features/menu` pero es basico y no esta conectado al flujo operativo.

**Problema:** El restaurante no tiene presencia publica automatizada. El dueno debe manualmente publicar su menu en redes sociales cada dia.

**Solucion:** Una landing publica que se actualiza automaticamente cuando el restaurante "abre cocina" — conectando el flujo operativo (stock, disponibilidad, caja) con la cara publica del negocio. DalIA orquesta el ciclo: sugiere carta del dia, admin confirma, landing se actualiza, WhatsApp notifica suscriptores.

**Referencia visual:** Diseno en Pencil — `UI.DELSISTEMA.pen`, nodo `cwK9Q` ("Landing Tenant - Mobile")

---

## Diferenciador vs competencia

OlaClick (50,000+ restaurantes Peru) ofrece menu digital + WhatsApp, pero todo es manual. MiRestcon IA automatiza el ciclo completo con IA:

```
Stock almacen → DalIA analiza disponibilidad → Sugiere carta del dia
→ Admin confirma (1 tap) → Landing se actualiza → WhatsApp broadcast automatico
→ Cliente ve menu → Pide por WhatsApp (mensaje pre-rellenado) → Pedido entra al sistema
```

---

## Concepto: "Abrir Cocina" vs "Abrir Caja"

Son dos momentos diferentes que no deben confundirse:

| Accion | Tipo | Quien | Que activa |
|--------|------|-------|------------|
| Abrir caja | Administrativo | Admin/Cajero | Turno financiero, asignacion meseros |
| Abrir cocina | Operativo/Marketing | Admin/Cocinero (confirma DalIA) | Landing publica, disponibilidad, WhatsApp broadcast |

**Flujo "Abrir Cocina":**

1. DalIA ejecuta rutina pre-apertura (ya documentada en `antes-de-abrir.md`)
2. Analiza stock actual via `services/disponibilidad.js`
3. Muestra checklist: platos disponibles, platos sin insumos, sugerencias
4. Admin confirma: "Si, estos platos salen hoy" (1 tap)
5. Sistema marca `cocina_abierta = true` en el tenant
6. Landing publica se actualiza con platos confirmados
7. (Opcional) WhatsApp broadcast a suscriptores del menu diario

---

## Arquitectura

### Nuevas tablas

```sql
-- Estado de cocina por tenant (diario)
CREATE TABLE cocina_estado (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado ENUM('cerrada', 'preparando', 'abierta') DEFAULT 'cerrada',
  platos_aprobados JSON, -- IDs de productos confirmados para hoy
  menu_dia JSON, -- {entrada: {id, nombre, emoji}, segundo: {...}, postre: {...}, precio: 12}
  combos_activos JSON, -- [{nombre, items, precio_original, precio_combo, descuento}]
  abierta_por INT REFERENCES usuarios(id),
  abierta_at TIMESTAMP,
  cerrada_at TIMESTAMP,
  broadcast_enviado BOOLEAN DEFAULT FALSE,
  broadcast_at TIMESTAMP,
  UNIQUE(tenant_id, fecha)
);

-- Suscriptores del menu diario por WhatsApp
CREATE TABLE menu_suscriptores (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  telefono VARCHAR(20) NOT NULL,
  nombre VARCHAR(100),
  activo BOOLEAN DEFAULT TRUE,
  suscrito_at TIMESTAMP DEFAULT NOW(),
  baja_at TIMESTAMP,
  fuente ENUM('landing', 'whatsapp', 'manual') DEFAULT 'landing',
  UNIQUE(tenant_id, telefono)
);

-- Pedidos desde landing (WhatsApp pre-rellenado)
CREATE TABLE landing_pedidos (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  telefono VARCHAR(20),
  items JSON, -- [{producto_id, nombre, cantidad, precio}]
  tipo ENUM('delivery', 'recojo', 'mesa') DEFAULT 'recojo',
  total DECIMAL(10,2),
  mensaje_whatsapp TEXT, -- mensaje pre-generado
  estado ENUM('generado', 'enviado', 'confirmado', 'completado') DEFAULT 'generado',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Resolucion de ruta /:slug (publico vs interno)

Hoy `middleware/tenant.js` resuelve `/:slug` y redirige al sistema interno (requiere auth). La nueva logica:

```
GET /:slug
  → Si usuario NO autenticado → renderizar landing publica (views/landing-tenant.ejs)
  → Si usuario autenticado y pertenece al tenant → redirect a /dashboard (comportamiento actual)
  → Si usuario autenticado pero NO pertenece al tenant → renderizar landing publica
```

Esto se implementa en `routes/landing-tenant.js` que se registra ANTES de `slugRewrite` en server.js.

### Nuevas rutas

```
# Rutas publicas (sin auth) — nuevo routes/landing-tenant.js
GET  /:slug                    → Landing publica del tenant (nueva, ver logica arriba)
GET  /:slug/menu               → Redirect a /:slug#menu
GET  /api/public/:slug/estado  → JSON: cocina abierta/cerrada, horario
GET  /api/public/:slug/menu    → JSON: menu del dia + carta + combos + disponibilidad
GET  /api/public/:slug/equipo  → JSON: miembros del equipo publicos
POST /api/public/:slug/suscribir → Suscribirse al menu diario

# Rutas internas (con auth) — nuevo routes/cocina.js
POST /api/cocina/abrir          → Confirmar carta y abrir cocina
POST /api/cocina/cerrar         → Cerrar cocina
GET  /api/cocina/estado         → Estado actual
POST /api/cocina/broadcast      → Enviar menu del dia por WhatsApp
PUT  /api/cocina/menu-dia       → Editar menu del dia manualmente
```

### Archivos nuevos

```
routes/cocina.js              — Router "abrir/cerrar cocina"
routes/landing-tenant.js      — Router landing publica
views/landing-tenant.ejs      — Vista EJS de la landing
services/cocina.js            — Logica de negocio cocina
services/broadcast-menu.js    — Envio WhatsApp broadcast del menu
public/css/landing-tenant.css — Estilos de la landing
public/js/landing-tenant.js   — JS interactivo (agregar items, WhatsApp link)
```

### Integracion con modulos existentes

```
services/disponibilidad.js   → Se usa para calcular platos disponibles hoy
services/whatsapp-api.js     → Se usa para broadcast del menu diario
middleware/tenant.js          → Resuelve tenant desde /:slug (ya existe)
routes/caja.js               → Al abrir caja, DalIA sugiere abrir cocina si no esta abierta
routes/productos.js          → GET /productos/carta alimenta el menu de la landing
```

---

## Secciones de la Landing

### 1. Hero

- Imagen/gradiente de fondo del restaurante
- Badge dinamico: "COCINA ABIERTA" (verde) / "CERRADA" (rojo) / "ABRE A LAS 11 AM" (amarillo)
- Horario de atencion (de `configuracion_impresion` o nuevo campo)
- Nombre del restaurante + tagline
- 2 CTAs: "Pedir por WhatsApp" (primario, naranja) + "Ver carta" (secundario, anchor #carta)

**Datos de:** `tenants`, `configuracion_impresion`, `cocina_estado`

### 2. Menu del Dia (dinamico)

- Badge "HOY DISPONIBLE" con icono fuego
- Fecha actual
- Precio del menu (S/ XX)
- Items: Entrada, Segundo, Postre+Refresco — cada uno con emoji, categoria, nombre
- CTA: "Pedir este menu" (genera WhatsApp link) + "Recibir diario" (suscripcion)
- **Solo visible cuando `cocina_estado.estado = 'abierta'` y hay menu_dia configurado**
- Cuando cocina cerrada: muestra "Manana vuelve nuestro menu del dia" con CTA de suscripcion

**Datos de:** `cocina_estado.menu_dia`

### 3. Nuestra Carta (a la carta)

- Filtros horizontales por categoria (chips scrollables)
- Cards de platos: emoji/foto, nombre, descripcion, precio, disponibilidad en tiempo real
- Disponibilidad:
  - Verde: "X disponibles" (del `services/disponibilidad.js`)
  - Sin indicador: disponibilidad ilimitada (sin receta, retorna -1)
  - Rojo + opacidad 50%: "AGOTADO" (disponibilidad = 0)
- Boton "+" para agregar al pedido (construye WhatsApp message)
- Solo muestra productos con `activo = true`

**Datos de:** `productos` WHERE `activo = true`, `services/disponibilidad.js`

### 4. Combos y Ofertas

- Cards con nombre, items incluidos, precio original tachado, precio combo, % descuento
- Badge "X ACTIVAS"
- CTA "Pedir" por combo
- **Solo visible si hay combos activos en `cocina_estado.combos_activos`**

**Datos de:** `cocina_estado.combos_activos`

### 5. Juega y Gana Premios

- Stats del usuario: puntos totales, partidas jugadas, premios ganados
- 2-3 juegos destacados con icono, nombre, descripcion, tags (duracion, tipo premio), boton play
- Fila de recompensas canjeables (cafe 150pts, postre 300pts, 10% dcto 500pts)
- Link "Ver los 13 juegos disponibles" → abre catalogo completo
- **Los juegos se habilitan segun configuracion del tenant**
- Sin login: muestra juegos pero stats en 0, invita a crear cuenta para guardar puntos

**Datos de:** Sistema de juegos existente (`/Documents/Claude/Projects/videojuegos/`)

### 6. Nuestro Equipo

- Grid de miembros: avatar (iniciales con gradiente por rol), nombre, rol (Chef, Mesero, Admin)
- Roles con colores diferenciados:
  - Chef: naranja (#ef520f)
  - Mesero/a: purpura (#8B5CF6)
  - Admin: verde (#22c55e)
  - Cocinero/a: teal (#14b8a6)
- Solo muestra miembros con `visible_en_landing = true` (nuevo campo en usuarios)

**Datos de:** `usuarios` WHERE `tenant_id = X AND visible_en_landing = true`

### 7. Footer

- CTA de suscripcion al menu diario: "No te pierdas el menu de manana" → boton verde "Suscribirme por WhatsApp"
- Direccion del local (icono map-pin)
- Telefono (icono phone)
- "Powered by MiRestCon IA"

**Datos de:** `configuracion_impresion` (nombre, direccion, telefono)

### 8. Bottom Navigation (fixed)

- 4 tabs: Inicio (#hero), Carta (#carta), Juegos (#juegos), Perfil (#perfil)
- Highlight activo segun scroll position
- En mobile se queda fijo abajo

---

## Flujo de pedido por WhatsApp

El usuario selecciona platos en la landing y se construye un mensaje de WhatsApp pre-rellenado:

```
Hola! Quisiera pedir de Corkys Restaurante:

- 1x Menu del dia (Entrada: Caldo de gallina, Segundo: Lomo saltado, Postre: Mazamorra) — S/ 12
- 1x Ceviche Clasico — S/ 28

Tipo: Recojo en local
Total estimado: S/ 40

Enviado desde mirestconia.com/corkys
```

**Implementacion tecnica:**
- JS en el frontend construye el carrito en `localStorage`
- Al hacer click en "Pedir por WhatsApp", genera URL: `https://wa.me/51XXXXXXXXX?text={mensaje_encoded}`
- El telefono del restaurante viene de `config_sunat.whatsapp_phone_id` (Meta) o `whatsapp_twilio_from` (Twilio). Si ninguno configurado, usa telefono de `configuracion_impresion`
- Se registra en `landing_pedidos` para tracking (beacon POST antes de redirect)

---

## Generacion de demanda

### Ciclo diario (automatico)

```
06:00 AM  DalIA ejecuta rutina pre-apertura
          → Analiza stock (disponibilidad.js)
          → Genera sugerencia de carta del dia
          → Notifica admin: "Buenos dias! Hoy puedes ofrecer: [platos]. Confirmo?"

07-10 AM  Admin confirma carta del dia (1 tap en dashboard o chat DalIA)
          → POST /api/cocina/abrir
          → Landing se actualiza automaticamente

09:00 AM  Broadcast del menu del dia a suscriptores WhatsApp
          → Usa services/whatsapp-api.js sendTemplate()
          → Template: imagen + menu + link a landing
          → Se registra en cocina_estado.broadcast_enviado

11 PM     Cierre automatico o manual
          → POST /api/cocina/cerrar
          → Landing muestra "Cerrado — vuelve manana"
          → Stats del dia se guardan
```

### Campanas puntuales (bajo demanda)

El admin puede crear campanas desde el dashboard o por DalIA:
- "Este viernes ceviche especial a S/ 20" → combo temporal
- "Cumpleanos de clientes esta semana" → promo personalizada via WhatsApp
- Estas se gestionan via `cocina_estado.combos_activos` y se muestran en la seccion de Ofertas

### Suscripcion al menu diario

- Boton en landing abre WhatsApp con mensaje: "Hola, quiero recibir el menu del dia de [Restaurante]"
- El sistema (o DalIA) detecta el mensaje y agrega a `menu_suscriptores`
- Cada dia a las 9 AM, broadcast automatico con el menu confirmado
- Para desuscribirse: "BAJA" por WhatsApp

---

## Disponibilidad en tiempo real

La landing muestra disponibilidad calculada del stock actual:

```javascript
// services/disponibilidad.js ya tiene esto:
calcularDisponibilidadProducto(productoId, tenantId)
// Retorna: numero de porciones posibles basado en ingrediente limitante
// -1 = sin receta (ilimitado)
// 0 = agotado

rankingDisponibilidad(tenantId)
// Retorna: todos los productos ordenados por disponibilidad
```

**En la landing:**
- Se llama a `/api/public/:slug/menu` que ejecuta `rankingDisponibilidad()`
- Cache de 5 minutos para no sobrecargar (misma estrategia que tenant cache)
- Los platos con disponibilidad 0 se muestran como "AGOTADO" con opacity reducida
- Los platos sin receta (-1) no muestran indicador de disponibilidad

---

## Datos del equipo

Nuevo campo en tabla `usuarios`:

```sql
ALTER TABLE usuarios ADD COLUMN visible_en_landing BOOLEAN DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN bio_publica VARCHAR(200);
```

El admin marca que miembros aparecen en la landing desde la seccion de equipo del dashboard.

---

## SEO y Performance

- **Server-side rendered** (EJS) para SEO — Google indexa cada landing de tenant
- **Meta tags dinamicos:** `<title>Corkys Restaurante — Menu del dia | MiRestcon IA</title>`
- **Open Graph:** imagen del restaurante, descripcion, menu del dia
- **Schema.org:** Restaurant schema con horarios, menu, ubicacion
- **Performance:**
  - Lazy loading de imagenes
  - CSS critico inline, resto async
  - Cache de 5 min en datos de disponibilidad
  - Sin frameworks JS pesados — vanilla JS para interactividad
  - Target: < 3 segundos en 4G

---

## Mobile-first

- Ancho base: 402px (iPhone standard)
- Todos los botones minimo 48px de altura (thumb-friendly)
- Navegacion bottom-fixed con 4 tabs
- Chips de filtro con scroll horizontal
- Cards de platos: layout horizontal (imagen izq, info der, boton +)
- CTA "Pedir por WhatsApp" siempre visible o accesible con 1 tap

---

## Estados de la landing

| Estado cocina | Hero badge | Menu del dia | Carta | Combos | Juegos |
|---|---|---|---|---|---|
| Abierta | Verde "COCINA ABIERTA" | Visible con platos | Visible con disponibilidad | Visible si hay | Siempre |
| Cerrada | Rojo "CERRADA" | "Manana vuelve..." + suscripcion | Visible sin disponibilidad | Oculta | Siempre |
| Preparando | Amarillo "ABRE PRONTO" | "Estamos preparando..." | Visible sin disponibilidad | Oculta | Siempre |

---

## Migracion del menu digital existente

El menu digital actual en `/features/menu` y `/menu` se mantiene como fallback pero se depreca:
- Redirect: `GET /:slug/menu` → `GET /:slug#carta`
- `GET /features/menu` → sigue funcionando pero con banner "Visita nuestra nueva pagina"
- En 30 dias, redirect 301 de `/features/menu` a `/:slug`

---

## Dependencias

- `middleware/tenant.js` — ya resuelve tenant desde `/:slug` (agregar rutas publicas)
- `services/disponibilidad.js` — ya calcula disponibilidad de platos
- `services/whatsapp-api.js` — ya envia templates y textos
- `routes/caja.js` — trigger para sugerir "abrir cocina"
- `routes/productos.js` — GET /productos/carta para la carta publica
- Sistema de juegos — `/Documents/Claude/Projects/videojuegos/`

---

## Fuera de alcance (V2)

- Pago online integrado (Yape/Plin en landing) — V1 solo WhatsApp
- Reserva de mesas online — V1 solo boton WhatsApp
- Chat en vivo en la landing — V1 solo WhatsApp
- Resenas/calificaciones publicas — futuro con directorio
- Multi-idioma — no necesario para mercado peruano
- Notificaciones push — WhatsApp es suficiente
- Historial de pedidos del cliente — requiere login, V2

---

## Metricas de exito

| Metrica | Objetivo | Medicion |
|---------|----------|----------|
| Click en "Pedir por WhatsApp" | > 15% de visitantes | Evento JS + landing_pedidos |
| Suscriptores menu diario | > 50 en primer mes | menu_suscriptores COUNT |
| Pedidos desde broadcast | > 30% del total | landing_pedidos WHERE fuente = 'broadcast' |
| Tiempo de carga mobile | < 3 segundos | Lighthouse |
| Tasa de rebote mobile | < 60% | Analytics |
| Conversion landing → pedido | > 10% | landing_pedidos / visitas unicas |
