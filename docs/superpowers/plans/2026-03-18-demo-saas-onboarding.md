# Plan de Implementación: Demo SaaS + Onboarding Restaurante

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar el sistema para la demo/instalación de las 11:45 con rediseño de carta, permisos por rol, velocidad optimizada, y sentar las bases para offline/sync, SUNAT y panel SaaS.

**Architecture:** Express.js + EJS + PostgreSQL (Supabase). El offcanvas de pedidos se rediseña como layout sidebar+grid para tablet. Se agregan roles cajero/almacenero con dashboards personalizados. Se implementa compresión y caché para velocidad.

**Tech Stack:** Node.js, Express, EJS, Bootstrap 5, PostgreSQL, Service Workers (fase 2), Nubefact API (fase 2)

---

## FASE 1: DEMO HOY (antes de 11:45)

### Task 1: Rediseño Catálogo de Productos para Tablet/Desktop

**Problema actual:** El offcanvas de 420px muestra categorías como pills horizontales arriba y cards de productos muy pequeñas (ilegibles). En tablets las imágenes son oscuras y no se lee nombre ni precio.

**Solución:** Layout con categorías en sidebar izquierdo + grid de productos legibles a la derecha. El offcanvas se expande a 85vw en tablet/desktop.

**Files:**
- Modify: `views/mesas.ejs` (CSS del offcanvas y HTML del panel agregar)
- Modify: `public/js/mesas.js` (renderCatalogoGrid y renderCategoriaPills)

- [ ] **Step 1: Ampliar offcanvas y crear layout sidebar+grid**

En `views/mesas.ejs`, cambiar el CSS del offcanvas:

```css
/* Offcanvas más ancho en tablet/desktop */
@media (min-width: 768px) {
  #canvasPedido { --bs-offcanvas-width: 85vw; max-width: 1100px; }
}
@media (min-width: 1200px) {
  #canvasPedido { --bs-offcanvas-width: 70vw; max-width: 1100px; }
}

/* Layout del panel agregar: sidebar + grid */
#panelAgregar {
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  #panelAgregarContent {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  #categoriasSidebar {
    width: 200px;
    flex-shrink: 0;
    border-right: 1px solid rgba(0,0,0,0.08);
    padding: 0.75rem 0;
    overflow-y: auto;
    background: #fafafa;
  }
  #categoriasSidebar .cat-sidebar-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    border-left: 3px solid transparent;
    transition: all 0.15s;
  }
  #categoriasSidebar .cat-sidebar-item:hover {
    background: rgba(249,115,22,0.06);
    color: #ea580c;
  }
  #categoriasSidebar .cat-sidebar-item.active {
    background: rgba(249,115,22,0.08);
    color: #ea580c;
    border-left-color: #ea580c;
    font-weight: 700;
  }
  #categoriasSidebar .cat-sidebar-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    padding: 0.5rem 1rem 0.3rem;
  }
  /* Ocultar pills horizontales en desktop */
  #categoriasWrap { display: none !important; }
  /* Grid de productos más grande */
  #productosGridWrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  #productosGrid {
    grid-template-columns: repeat(3, 1fr);
    gap: 0.8rem;
    padding: 0.75rem 1rem;
  }
  /* Cards más grandes y legibles */
  .prod-name { font-size: 0.88rem; }
  .prod-cat-label { font-size: 0.72rem; }
  .prod-price { font-size: 0.9rem; }
  .prod-img-wrap { aspect-ratio: 16/10; }
}

@media (min-width: 1024px) {
  #productosGrid { grid-template-columns: repeat(4, 1fr); }
}
```

- [ ] **Step 2: Reestructurar HTML del panel agregar**

En `views/mesas.ejs`, reemplazar la sección del panel agregar para tener sidebar + grid envueltos:

```html
<!-- Panel AGREGAR PRODUCTOS -->
<div id="panelAgregar" class="canvas-panel active">
  <!-- Search bar (siempre arriba) -->
  <div id="catalogoSearchWrap">
    <input id="catalogoSearch" type="text" placeholder="Buscar productos..." autocomplete="off">
  </div>

  <!-- Contenedor flex: sidebar + grid -->
  <div id="panelAgregarContent">
    <!-- Sidebar de categorías (visible en tablet/desktop) -->
    <div id="categoriasSidebar">
      <button class="cat-sidebar-item active" data-cat="todos">
        <i class="bi bi-star"></i> Frecuentes & Populares
      </button>
      <div class="cat-sidebar-title">CATEGORÍAS</div>
      <!-- Las categorías dinámicas se insertan aquí por JS -->
    </div>

    <!-- Grid de productos -->
    <div id="productosGridWrap">
      <!-- Pills horizontales (solo mobile) -->
      <div id="categoriasWrap">
        <button class="cat-pill active" data-cat="todos"><i class="bi bi-star"></i> Todos</button>
      </div>
      <div id="productosGrid">
        <div id="catalogoEmptyState">
          <i class="bi bi-search"></i>
          No se encontraron productos
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom bar -->
  <div id="catalogoBottomBar">
    <div id="catalogoBottomBarInfo">
      <i class="bi bi-basket2"></i>
      <span id="catalogoBottomCount">0</span> productos agregados<br>
      Total: <strong id="catalogoBottomTotal">S/ 0.00</strong>
    </div>
    <button id="btnContinuarOrden">Continuar con la orden</button>
  </div>
</div>
```

- [ ] **Step 3: Actualizar JS para sidebar de categorías en desktop**

En `public/js/mesas.js`, modificar `renderCategoriaPills()` para también renderizar el sidebar:

```javascript
function renderCategoriaPills() {
  const wrap = document.getElementById('categoriasWrap');
  const sidebar = document.getElementById('categoriasSidebar');
  // ... código existente de pills ...

  // También renderizar sidebar
  if (sidebar) {
    sidebar.querySelectorAll('.cat-sidebar-item[data-dynamic]').forEach(el => el.remove());
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-sidebar-item';
      btn.setAttribute('data-cat', cat);
      btn.setAttribute('data-dynamic', '1');
      btn.innerHTML = `<i class="bi bi-${iconoCategoria(cat)}"></i> ${escapeHtml(cat)}`;
      btn.addEventListener('click', () => {
        catalogoFiltroCategoria = cat;
        sidebar.querySelectorAll('.cat-sidebar-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Sync mobile pills
        if (wrap) {
          wrap.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
          const matchPill = wrap.querySelector(`.cat-pill[data-cat="${cat}"]`);
          if (matchPill) matchPill.classList.add('active');
        }
        renderCatalogoGrid();
      });
      sidebar.appendChild(btn);
    });
  }
}
```

- [ ] **Step 4: Probar en navegador con ventana ancha (tablet/desktop)**

Abrir la app, ir a Mesas, abrir pedido de una mesa, verificar que:
- En pantalla ancha: categorías a la izquierda, grid a la derecha
- Cards con nombre, precio y categoría legibles
- En móvil: mantiene layout actual con pills arriba

- [ ] **Step 5: Commit**

```bash
git add views/mesas.ejs public/js/mesas.js
git commit -m "feat: rediseño catálogo productos - sidebar categorías + cards legibles para tablet"
```

---

### Task 2: Roles y Permisos (cajero, almacenero, mozo con restricciones)

**Problema actual:** Solo existen roles 'administrador', 'mesero', 'cocinero' en el enum. Hay un user cajero1 con rol='cajero' y almacen1 con rol='administrador'. Falta restringir qué ve cada rol.

**Files:**
- Modify: `middleware/auth.js` (agregar permisos granulares)
- Modify: `routes/auth.js` (redirect por rol para cajero/almacenero)
- Modify: `server.js` (permisos en rutas)
- Modify: `views/partials/sidebar.ejs` (menú filtrado por rol)

- [ ] **Step 1: Agregar roles cajero y almacenero al enum y al sistema**

```sql
-- En setup-supabase.js o directamente en DB
ALTER TYPE rol_usuario_enum ADD VALUE IF NOT EXISTS 'cajero';
ALTER TYPE rol_usuario_enum ADD VALUE IF NOT EXISTS 'almacenero';
```

- [ ] **Step 2: Actualizar defaultRedirectForRole en auth.js**

```javascript
function defaultRedirectForRole(rol) {
  const r = String(rol || '').toLowerCase();
  if (r === 'cocinero') return '/cocina';
  if (r === 'mesero') return '/mesas';
  if (r === 'cajero') return '/';  // dashboard cajero
  if (r === 'almacenero') return '/almacen';
  return '/';
}
```

- [ ] **Step 3: Actualizar permisos de rutas en server.js**

Agregar almacenero y cajero a las rutas que les corresponden:

```javascript
// Mesas: admin + mesero + cajero (cajero puede ver pero no editar)
app.use('/mesas', requireAuth, requireRole('administrador','mesero'), requireCajaAbierta, mesasRoutes);
app.use('/api/mesas', requireAuth, requireRole('administrador','mesero'), requireCajaAbierta, mesasRoutes);

// Cocina: admin + mesero + cocinero
app.use('/cocina', requireAuth, requireRole('administrador','mesero','cocinero'), requireCajaAbierta, cocinaRoutes);

// Caja: admin + cajero
app.use('/caja', requireAuth, requireRole('administrador','cajero'), cajaRoutes);

// Almacen: admin + almacenero
app.use('/almacen', requireAuth, requireRole('administrador','almacenero'), almacenRoutes);

// Productos: admin + mesero + almacenero (mesero solo lectura)
app.use('/productos', requireAuth, requireRole('administrador','mesero','almacenero'), productosRoutes);

// Ventas, Reportes, Admin: solo administrador
app.use('/ventas', requireAuth, requireRole('administrador'), ventasRoutes);
app.use('/administracion', requireAuth, requireRole('administrador'), administracionRoutes);
```

- [ ] **Step 4: Filtrar sidebar por rol**

Modificar `views/partials/sidebar.ejs` para mostrar solo las opciones que corresponden al rol del usuario.

- [ ] **Step 5: Actualizar usuario almacen1 al rol correcto**

```sql
UPDATE usuarios SET rol = 'almacenero' WHERE usuario = 'almacen1';
```

- [ ] **Step 6: Commit**

```bash
git add middleware/auth.js routes/auth.js server.js views/partials/sidebar.ejs
git commit -m "feat: roles cajero y almacenero con permisos granulares por módulo"
```

---

### Task 3: Dashboard con DalIA personalizada por rol

**Problema actual:** El dashboard admin ya existe. El dashboard cajero existe. Falta dashboard para mesero, cocinero y almacenero con saludo de DalIA y tareas del día.

**Files:**
- Modify: `server.js` (dashboards por rol)
- Create: `views/dashboard-mesero.ejs`
- Create: `views/dashboard-almacenero.ejs`

- [ ] **Step 1: Crear dashboard mesero con DalIA**

Dashboard simple que muestra:
- Saludo de DalIA: "¡Hola [nombre]! Hoy tienes X mesas asignadas"
- Tareas: Limpiar mesas, mantener buena actitud, revisar pedidos pendientes
- Acceso rápido a Mesas y Cocina

- [ ] **Step 2: Crear dashboard almacenero con DalIA**

Dashboard que muestra:
- Saludo de DalIA: "¡Hola [nombre]! Tienes X alertas de stock bajo"
- Alertas de ingredientes con stock bajo
- Acceso a recepción de productos
- Tareas: Verificar stock, registrar entradas, reportar mermas

- [ ] **Step 3: Actualizar server.js para enrutar cada rol a su dashboard**

```javascript
if (rol === 'mesero') return res.render('dashboard-mesero', { data });
if (rol === 'almacenero') return res.render('dashboard-almacenero', { data });
// cocinero ya redirige a /cocina
```

- [ ] **Step 4: Commit**

```bash
git add views/dashboard-mesero.ejs views/dashboard-almacenero.ejs server.js
git commit -m "feat: dashboards personalizados con DalIA para mesero y almacenero"
```

---

### Task 4: Optimización de Velocidad

**Problema actual:** La app está lenta conectándose a Cloudflare/Supabase.

**Files:**
- Modify: `server.js` (agregar compresión, caché de assets)
- Modify: `package.json` (agregar compression)

- [ ] **Step 1: Agregar compresión gzip**

```bash
npm install compression
```

En server.js, agregar al inicio:
```javascript
const compression = require('compression');
app.use(compression());
```

- [ ] **Step 2: Agregar caché de assets estáticos**

```javascript
const oneDay = 86400000;
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: oneDay * 7 }));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules'), { maxAge: oneDay * 30 }));
```

- [ ] **Step 3: Optimizar queries del dashboard (índices)**

```sql
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_estado ON pedidos(mesa_id, estado);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id);
```

- [ ] **Step 4: Commit**

```bash
git add server.js package.json package-lock.json
git commit -m "perf: compresión gzip + caché de assets + índices DB para velocidad"
```

---

### Task 5: Onboarding básico - Configuración inicial del restaurante

**Files:**
- Create: `views/onboarding.ejs`
- Modify: `routes/configuracion.js` (ruta de onboarding)
- Modify: `server.js` (detectar si falta config inicial)

- [ ] **Step 1: Crear vista de onboarding con pasos**

Wizard de 4 pasos:
1. Nombre de la empresa + logo
2. Configuración de impresión y moneda
3. Conexión SUNAT (RUC, token OSE)
4. Crear primer usuario staff

- [ ] **Step 2: Detectar si necesita onboarding**

En server.js, después del login, verificar si `configuracion_impresion` tiene nombre_empresa. Si no, redirigir a `/onboarding`.

- [ ] **Step 3: Commit**

```bash
git add views/onboarding.ejs routes/configuracion.js server.js
git commit -m "feat: wizard de onboarding para configuración inicial del restaurante"
```

---

## FASE 2: POST-DEMO (implementación posterior)

### Task 6: Modo Offline/Sync con Service Workers

**Objetivo:** Que la app funcione sin internet y sincronice al reconectarse.

**Files:**
- Create: `public/sw.js` (Service Worker)
- Create: `public/js/offline-sync.js` (lógica de sync)
- Create: `routes/sync.js` (API de sincronización)
- Modify: `views/partials/sidebar.ejs` (indicador online/offline)

**Enfoque:**
1. Service Worker cachea la app shell (HTML/CSS/JS/imágenes)
2. IndexedDB almacena pedidos/facturas cuando no hay conexión
3. Al reconectar, cola de sync envía datos al servidor
4. Resolución de conflictos: último timestamp gana

- [ ] **Step 1: Crear Service Worker con estrategia cache-first para assets**
- [ ] **Step 2: Implementar IndexedDB store para pedidos offline**
- [ ] **Step 3: Crear cola de sincronización con retry exponencial**
- [ ] **Step 4: API /api/sync para recibir batch de operaciones offline**
- [ ] **Step 5: Indicador visual de estado online/offline en sidebar**
- [ ] **Step 6: Tests de flujo: crear pedido offline → reconectar → verificar sync**

---

### Task 7: SUNAT Facturación Electrónica + WhatsApp

**Objetivo:** Emitir boletas/facturas válidas ante SUNAT y enviarlas por WhatsApp.

**Files:**
- Modify: `services/sunat.js` (completar integración con Nubefact/OSE)
- Create: `services/whatsapp.js` (envío por WhatsApp Business API)
- Modify: `routes/sunat.js` (endpoints de emisión)
- Modify: `routes/facturas.js` (botón "Enviar por WhatsApp")

**Enfoque:**
1. Usar Nubefact como OSE (ya está parcialmente implementado)
2. Generar XML UBL 2.1 para SUNAT
3. Certificado digital (.pfx) para firma
4. WhatsApp Business API o alternativa (Twilio/Meta)
5. Enviar PDF del comprobante como adjunto por WhatsApp

- [ ] **Step 1: Completar emitirComprobante() con XML UBL válido**
- [ ] **Step 2: Implementar firma digital con certificado .pfx**
- [ ] **Step 3: Envío a Nubefact API y recepción de CDR**
- [ ] **Step 4: Generar PDF del comprobante**
- [ ] **Step 5: Integrar WhatsApp Business API para envío**
- [ ] **Step 6: Botón "Enviar por WhatsApp" en vista de factura**

---

### Task 8: Panel de Control SaaS (Superadministrador)

**Objetivo:** Panel para el dueño del SaaS para gestionar tenants, módulos, APIs y contabilidad.

**Files:**
- Create: `views/superadmin/dashboard.ejs`
- Create: `views/superadmin/tenants.ejs`
- Create: `views/superadmin/billing.ejs`
- Create: `routes/superadmin.js`
- Modify: `server.js` (montar rutas superadmin)

**Enfoque:**
1. Rol 'superadmin' separado del 'administrador' de tenant
2. Dashboard con: tenants activos, MRR, uso de APIs, costos
3. CRUD de tenants con habilitación de módulos
4. Control de APIs (tokens, límites, costos)
5. Contabilidad: servicios pagados, ingresos, gastos

- [ ] **Step 1: Crear modelo superadmin y autenticación**
- [ ] **Step 2: Dashboard con KPIs del SaaS**
- [ ] **Step 3: CRUD de tenants con toggle de módulos**
- [ ] **Step 4: Panel de contabilidad y control de APIs**

---

### Task 9: Reportes PDF

**Objetivo:** Generar PDFs de resumen del día y lista de necesidades para el día siguiente.

**Files:**
- Modify: `routes/reportes.js` (nuevos endpoints)
- Create: `services/pdf-reports.js` (generación de PDFs)

**Reportes:**
1. **Resumen del día:** Platos vendidos, mesas atendidas, ingresos, métodos de pago
2. **Necesidades para mañana:** Ingredientes que comprar basado en recetas + stock actual

- [ ] **Step 1: Resumen del día con pdfkit**
- [ ] **Step 2: Lista de compras para el día siguiente**

---

### Task 10: Onboarding Guiado con IA

**Objetivo:** El sistema guía al nuevo cliente paso a paso para configurar todo.

**Enfoque:** Tour interactivo con tooltips + chat con DalIA que pregunta y configura.

- [ ] **Step 1: Tour interactivo con driver.js o similar**
- [ ] **Step 2: DalIA conversacional para configuración**
