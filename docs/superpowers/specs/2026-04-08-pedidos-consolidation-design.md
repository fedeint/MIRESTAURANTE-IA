# Consolidación de Pedidos (Mesa + Delivery + Para Llevar)

**Fecha:** 2026-04-08
**Autor:** Claude + Leonidas
**Estado:** Diseño inicial, pendiente review

## Problema

El sistema actualmente tiene 3 flujos separados para tomar pedidos:
1. **Mesa**: cliente se sienta, mesero toma orden → `/mesas` → abre comanda con `mesa_id`
2. **Delivery**: cliente pide a domicilio → `/delivery` → requiere dirección + motorizado
3. **Para llevar**: cliente pasa a recoger → `/para-llevar-nuevo` → requiere nombre + hora pickup

Cada uno tiene su propio flujo, su propia vista, y su propia pantalla en el menú. Esto confunde al operador (cajero/mesero) que debe recordar cuál usar según el escenario.

La tabla `pedidos` actual tiene `mesa_id NOT NULL`, lo que obliga a que todo pedido esté tied a una mesa, bloqueando delivery y para-llevar reales.

## Objetivo

Consolidar los tres flujos en **una sola categoría "Pedidos"** (dentro de la sección OPS del sidebar nuevo) con 3 sub-flujos/tabs:

- Mesa (cliente en el restaurante)
- Delivery (a domicilio)
- Para llevar (cliente pasa a recoger)

Todos usan la misma tabla `pedidos` con un campo `tipo` que distingue el flujo. Las diferencias específicas (dirección de delivery, nombre de para-llevar) viven en columnas nullable en `pedidos` o en tablas satelite.

## Diseño DB

### Cambios a `pedidos`

```sql
-- Hacer mesa_id nullable (delivery/para-llevar no tienen mesa)
ALTER TABLE pedidos ALTER COLUMN mesa_id DROP NOT NULL;

-- Agregar tipo (mesa | delivery | para_llevar)
ALTER TABLE pedidos ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'mesa'
  CHECK (tipo IN ('mesa', 'delivery', 'para_llevar'));

-- Campos específicos para delivery
ALTER TABLE pedidos ADD COLUMN direccion_entrega TEXT;
ALTER TABLE pedidos ADD COLUMN referencia_entrega TEXT;
ALTER TABLE pedidos ADD COLUMN cliente_telefono VARCHAR(20);
ALTER TABLE pedidos ADD COLUMN motorizado_id INT REFERENCES usuarios(id);
ALTER TABLE pedidos ADD COLUMN hora_estimada_entrega TIMESTAMP;

-- Campos específicos para para-llevar
ALTER TABLE pedidos ADD COLUMN cliente_nombre_recojo VARCHAR(100);
ALTER TABLE pedidos ADD COLUMN hora_recojo TIMESTAMP;
ALTER TABLE pedidos ADD COLUMN listo_para_recojo BOOLEAN DEFAULT FALSE;

-- Backfill: todos los pedidos existentes son tipo 'mesa'
UPDATE pedidos SET tipo = 'mesa' WHERE tipo IS NULL;

-- Constraint: mesa_id requerido solo si tipo='mesa'
ALTER TABLE pedidos ADD CONSTRAINT pedidos_mesa_required_for_mesa_type
  CHECK ((tipo = 'mesa' AND mesa_id IS NOT NULL) OR tipo != 'mesa');

-- Constraint: dirección requerida solo si tipo='delivery'
ALTER TABLE pedidos ADD CONSTRAINT pedidos_direccion_required_for_delivery
  CHECK ((tipo = 'delivery' AND direccion_entrega IS NOT NULL) OR tipo != 'delivery');

-- Constraint: nombre_recojo requerido solo si tipo='para_llevar'
ALTER TABLE pedidos ADD CONSTRAINT pedidos_nombre_required_for_para_llevar
  CHECK ((tipo = 'para_llevar' AND cliente_nombre_recojo IS NOT NULL) OR tipo != 'para_llevar');
```

### Índices adicionales

```sql
CREATE INDEX idx_pedidos_tipo_estado ON pedidos(tipo, estado);
CREATE INDEX idx_pedidos_motorizado ON pedidos(motorizado_id) WHERE tipo = 'delivery';
CREATE INDEX idx_pedidos_hora_recojo ON pedidos(hora_recojo) WHERE tipo = 'para_llevar';
```

## Diseño UI (desktop)

Nueva vista `/pedidos` con 3 tabs en la parte superior:

```
┌──────────────────────────────────────────┐
│ Pedidos                    [+ Nuevo ▼]   │
│ ─────────────────────                    │
│ [Mesa (12)] [Delivery (5)] [Llevar (3)]  │
├──────────────────────────────────────────┤
│                                          │
│ (contenido del tab activo)               │
│                                          │
└──────────────────────────────────────────┘
```

- **Tab Mesa**: muestra el grid de mesas actual (como `/mesas` hoy)
- **Tab Delivery**: lista de pedidos delivery con dirección + estado + motorizado
- **Tab Llevar**: lista de pedidos para recoger con cliente + hora + estado listo/no

Botón "+ Nuevo" abre dropdown que permite elegir cuál crear:
- Nuevo pedido en mesa → flow de mesas existente
- Nueva orden delivery → formulario con cliente + dirección
- Nueva orden para llevar → formulario con cliente + hora pickup

## Diseño UI (PWA mobile)

Tres tabs en el footer del shell PWA que reemplazan el botón "Pedidos" actual. Al tocar cada tab, se navega al flow correspondiente. Se mantiene el diseño mobile-first existente de `mesa-ronda.ejs`, etc.

## Routes

### Nuevos

```js
// GET /pedidos → renderiza consolidado (desktop: tabs; mobile: redirige a /mesas como home del flow)
app.get('/pedidos', requireAuth, async (req, res) => {
  const tab = req.query.tab || 'mesa'; // mesa | delivery | para_llevar
  // cargar pedidos activos del tenant filtrados por tipo
  const data = { tab, mesaPedidos, deliveryPedidos, paraLlevarPedidos };
  renderForDevice(req, res, 'pedidos', data);
});

// POST /api/pedidos/delivery → crear nuevo delivery
app.post('/api/pedidos/delivery', requireAuth, csrfProtection, async (req, res) => {
  const { cliente_nombre, cliente_telefono, direccion, referencia, items } = req.body;
  // Validar con zod schema
  // Insertar pedido con tipo='delivery'
});

// POST /api/pedidos/para-llevar → crear nuevo para-llevar
app.post('/api/pedidos/para-llevar', requireAuth, csrfProtection, async (req, res) => {
  const { cliente_nombre, hora_recojo, items } = req.body;
  // Insertar pedido con tipo='para_llevar'
});

// PATCH /api/pedidos/:id/listo → marcar para-llevar como listo
app.patch('/api/pedidos/:id/listo', ...);

// PATCH /api/pedidos/:id/asignar-motorizado → asignar driver a delivery
app.patch('/api/pedidos/:id/asignar-motorizado', ...);
```

### Deprecated (redirects)

```js
// Redirects permanentes para que links viejos sigan funcionando
app.get('/mesas', (req, res) => res.redirect(301, '/pedidos?tab=mesa'));
app.get('/delivery', (req, res) => res.redirect(301, '/pedidos?tab=delivery'));
app.get('/para-llevar-nuevo', (req, res) => res.redirect(301, '/pedidos?tab=para_llevar'));
```

NOTA: El route actual `/mesas` hace más que solo listar — tiene lógica compleja de tomar orden, cerrar cuenta, etc. Esas rutas internas (`/mesas/:id/comanda`, etc) se mantienen sin cambio; solo el entry point `/mesas` redirige.

## Migración de datos existentes

Los pedidos existentes ya tienen `mesa_id` y se backfillean con `tipo='mesa'` automáticamente por el `UPDATE`. No hay pérdida de datos.

## Compatibilidad con cocina

La cocina (`/cocina`) lista todos los pedidos `estado='en_cocina'`. Con el cambio:
- Muestra badge por tipo: [MESA 3] [DELIVERY] [LLEVAR]
- Para delivery/para-llevar muestra el nombre del cliente en vez del número de mesa
- Filtros por tipo en la cabecera

## Out of scope (futuro)

- Integración con Rappi/PedidosYa (delivery externo)
- Tracking en tiempo real del motorizado
- SMS/WhatsApp automático al cliente cuando el pedido está listo
- Rating post-pedido

## Dependencias

- Iteración 1 completa (feat/desktop-pwa-separation merged): necesita `deviceRouter` para servir variante correcta
- Iteración 1.5 (sidebar nuevo): el sidebar nuevo ya tiene el link "Pedidos" apuntando a `/pedidos`
