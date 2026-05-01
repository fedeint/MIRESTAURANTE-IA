# Fase 3: Antecedentes para DalIA — Diseño

**Fecha:** 2026-03-28
**Estado:** Aprobado
**Enfoque:** C — Modular por dominio + Feature flags por tenant

## Objetivo

Dotar al sistema de los antecedentes (datos, tablas, cálculos) necesarios para que DalIA pueda responder las 165 preguntas identificadas en las 9 categorías de un administrador de restaurante. Se crean 3 migraciones por dominio, módulos activables por tenant, y se integran con contratos digitales.

## Alcance

| # | Módulo | Tipo |
|---|--------|------|
| 1 | Asistencia por timestamps | Tabla nueva |
| 2 | Historial de precios (productos + insumos) | Tabla nueva |
| 3 | Calendario de eventos | Tabla nueva + seed feriados |
| 4 | Objetivo de merma % | Campo nuevo en config |
| 5 | Sub-recetas | ALTER receta_items + CTE recursivo |
| 6 | Costeo automático en tiempo real | Tabla cache + servicio |
| 7 | Delivery Rappi | Integración API completa |
| 8 | Delivery PedidosYa | Integración API completa |
| 9 | Delivery LlamaFood | Registro manual (sin API) |

**Excluidos:** Reseñas externas (Google Maps, TripAdvisor) — módulo separado futuro. Timestamps de cocina ya existen (`enviado_at`, `preparado_at`, `listo_at`, `servido_at`).

---

## Migración 016: Antecedentes operativos

### 016.1 — asistencia_marcaciones

```sql
CREATE TABLE asistencia_marcaciones (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT,
  metodo VARCHAR(20) DEFAULT 'auto_session',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_asistencia_tenant_fecha ON asistencia_marcaciones(tenant_id, timestamp::date);
CREATE INDEX idx_asistencia_usuario ON asistencia_marcaciones(usuario_id, timestamp);
```

### 016.2 — asistencia_resumen_diario

Tabla calculada (no vista materializada, para compatibilidad con Supabase):

```sql
CREATE TABLE asistencia_resumen_diario (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  fecha DATE NOT NULL,
  hora_entrada TIME,
  hora_salida TIME,
  horas_trabajadas DECIMAL(5,2),
  horas_extra DECIMAL(5,2),        -- > umbral_horas_extra
  costo_hora DECIMAL(10,2),        -- monto_pago / horas_contractuales + beneficios
  costo_total DECIMAL(10,2),       -- horas_trabajadas * costo_hora
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, usuario_id, fecha)
);
```

**Lógica de marcaciones:**
- Login del usuario inserta marcación tipo `entrada`
- Logout / sesión expirada / cierre de navegador inserta `salida`
- Si no hay `salida` al final del día: alerta al admin, NO se asume hora
- `costo_hora` se calcula desde `personal.monto_pago` + ESSALUD (9%) + SCTR (si aplica)
- `horas_extra` = MAX(0, horas_trabajadas - umbral_horas_extra)

### 016.3 — historial_precios

```sql
CREATE TABLE historial_precios (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  entidad_tipo VARCHAR(20) NOT NULL CHECK (entidad_tipo IN ('producto', 'ingrediente')),
  entidad_id INT NOT NULL,
  precio_anterior DECIMAL(10,2) NOT NULL,
  precio_nuevo DECIMAL(10,2) NOT NULL,
  campo VARCHAR(30) NOT NULL,      -- 'precio_unidad' | 'costo_unitario'
  usuario_id INT REFERENCES usuarios(id),
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historial_precios_entidad ON historial_precios(tenant_id, entidad_tipo, entidad_id);
CREATE INDEX idx_historial_precios_fecha ON historial_precios(created_at);
```

**Trigger (a nivel de ruta, no DB trigger):**
- Al hacer UPDATE en `productos.precio_unidad` se inserta registro con `entidad_tipo='producto'`
- Al hacer UPDATE en `almacen_ingredientes.costo_unitario` se inserta con `entidad_tipo='ingrediente'`
- Además, si cambia costo de ingrediente, se dispara recálculo de costeo de recetas (ver Sección 017)

### 016.4 — calendario_eventos

```sql
CREATE TABLE calendario_eventos (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id), -- NULL = global (feriados nacionales)
  nombre VARCHAR(150) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('feriado', 'evento_local', 'deportivo', 'promocion_interna', 'custom')),
  fecha DATE NOT NULL,
  recurrente BOOLEAN DEFAULT false,
  recurrencia_patron VARCHAR(30) CHECK (recurrencia_patron IN ('anual', 'mensual', 'semanal')),
  impacto_esperado VARCHAR(20) DEFAULT 'medio' CHECK (impacto_esperado IN ('alto', 'medio', 'bajo', 'negativo')),
  notas TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calendario_fecha ON calendario_eventos(fecha);
CREATE INDEX idx_calendario_tenant ON calendario_eventos(tenant_id);
```

**Seed de feriados peruanos (tenant_id = NULL, recurrente = true, recurrencia_patron = 'anual'):**
- 1 enero — Año Nuevo (impacto: bajo)
- Jueves y Viernes Santo — Semana Santa (impacto: alto) *fecha variable, se calcula*
- 1 mayo — Día del Trabajo (impacto: medio)
- 7 junio — Batalla de Arica (impacto: bajo)
- 28-29 julio — Fiestas Patrias (impacto: alto)
- 30 agosto — Santa Rosa de Lima (impacto: medio)
- 8 octubre — Combate de Angamos (impacto: bajo)
- 1 noviembre — Todos los Santos (impacto: medio)
- 8 diciembre — Inmaculada Concepción (impacto: medio)
- 25 diciembre — Navidad (impacto: alto)
- 31 diciembre — Nochevieja (impacto: alto)

### 016.5 — Campos de configuración

```sql
ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS
  merma_objetivo_pct DECIMAL(5,2) DEFAULT 3.00;

ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS
  horas_jornada_estandar INT DEFAULT 8;

ALTER TABLE configuracion_impresion ADD COLUMN IF NOT EXISTS
  umbral_horas_extra DECIMAL(5,2) DEFAULT 8.00;
```

---

## Migración 017: Recetas V2

### 017.1 — Sub-recetas en receta_items

```sql
ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS
  tipo VARCHAR(20) DEFAULT 'ingrediente' CHECK (tipo IN ('ingrediente', 'sub_receta'));

ALTER TABLE receta_items ADD COLUMN IF NOT EXISTS
  sub_receta_id INT REFERENCES recetas(id);

ALTER TABLE receta_items ALTER COLUMN ingrediente_id DROP NOT NULL;
```

**Reglas de negocio:**
- Si `tipo = 'ingrediente'` → usa `ingrediente_id` (comportamiento actual, sin cambios)
- Si `tipo = 'sub_receta'` → usa `sub_receta_id`, `cantidad` = porciones de la sub-receta
- Máximo 3 niveles de profundidad (receta > sub-receta > sub-sub-receta)
- Validación anti-circular: al guardar, verificar que no existan ciclos (A usa B usa A)
- CHECK constraint: `(tipo = 'ingrediente' AND ingrediente_id IS NOT NULL) OR (tipo = 'sub_receta' AND sub_receta_id IS NOT NULL)`

**CTE recursivo para explosión de ingredientes:**

```sql
WITH RECURSIVE explosion AS (
  -- Nivel 1: items directos de la receta
  SELECT ri.receta_id, ri.ingrediente_id, ri.sub_receta_id, ri.tipo,
         ri.cantidad, ri.unidad_medida, 1 as nivel
  FROM receta_items ri
  WHERE ri.receta_id = :receta_id

  UNION ALL

  -- Niveles siguientes: explotar sub-recetas
  SELECT e.receta_id, ri2.ingrediente_id, ri2.sub_receta_id, ri2.tipo,
         ri2.cantidad * (e.cantidad / r.rendimiento_porciones),
         ri2.unidad_medida, e.nivel + 1
  FROM explosion e
  JOIN recetas r ON r.id = e.sub_receta_id
  JOIN receta_items ri2 ON ri2.receta_id = r.id
  WHERE e.tipo = 'sub_receta' AND e.nivel < 3
)
SELECT ingrediente_id, SUM(cantidad) as cantidad_total, unidad_medida
FROM explosion
WHERE tipo = 'ingrediente'
GROUP BY ingrediente_id, unidad_medida;
```

### 017.2 — receta_costos_cache

```sql
CREATE TABLE receta_costos_cache (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  receta_id INT NOT NULL REFERENCES recetas(id),
  costo_total DECIMAL(10,4),            -- costo de producir rendimiento completo
  costo_por_porcion DECIMAL(10,4),      -- costo_total / rendimiento_porciones
  food_cost_pct DECIMAL(5,2),           -- (costo_porcion / precio_venta) * 100
  precio_venta DECIMAL(10,2),           -- snapshot del precio actual
  margen_contribucion DECIMAL(10,2),    -- precio_venta - costo_por_porcion
  ingredientes_detalle JSONB,           -- [{ingrediente_id, nombre, cantidad, costo_unitario, subtotal}]
  tiene_sub_recetas BOOLEAN DEFAULT false,
  actualizado_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, receta_id)
);
```

### 017.3 — Servicio services/costeo-recetas.js

```
recalcularCostoReceta(tenantId, recetaId)
  1. Ejecuta CTE recursivo para explotar ingredientes base
  2. Suma (costo_unitario × cantidad) de cada ingrediente
  3. Divide por rendimiento_porciones → costo_por_porcion
  4. Obtiene precio_venta de productos
  5. Calcula food_cost_pct y margen_contribucion
  6. UPSERT en receta_costos_cache
  7. Busca recetas padre (WHERE sub_receta_id = recetaId en receta_items)
  8. Recalcula cada padre recursivamente (máx 3 niveles)

recalcularPorIngrediente(tenantId, ingredienteId)
  1. Busca todas las receta_items WHERE ingrediente_id = ingredienteId
  2. Llama recalcularCostoReceta() para cada receta encontrada

recalcularTodas(tenantId)
  1. Obtiene todas las recetas del tenant
  2. Ordena topológicamente (las que no tienen sub-recetas primero)
  3. Recalcula en orden para evitar recálculos redundantes
```

**Eventos que disparan recálculo:**

| Evento | Acción |
|--------|--------|
| UPDATE `almacen_ingredientes.costo_unitario` | `recalcularPorIngrediente(tenantId, ingredienteId)` |
| UPDATE `productos.precio_unidad` | Recalcular `food_cost_pct` y `margen_contribucion` de su receta |
| INSERT/UPDATE/DELETE `receta_items` | `recalcularCostoReceta(tenantId, recetaId)` + recetas padre |
| Recálculo masivo (admin) | `recalcularTodas(tenantId)` |

---

## Migración 018: Delivery integrado

### 018.1 — delivery_config

```sql
CREATE TABLE delivery_config (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  plataforma VARCHAR(20) NOT NULL CHECK (plataforma IN ('rappi', 'pedidosya', 'llamafood')),
  activo BOOLEAN DEFAULT false,
  client_id VARCHAR(255),
  client_secret TEXT,                    -- encriptado
  access_token TEXT,                     -- encriptado
  token_expira_at TIMESTAMPTZ,
  store_id VARCHAR(100),                 -- ID de tienda en la plataforma
  chain_id VARCHAR(100),                 -- PedidosYa chain_id
  webhook_secret TEXT,                   -- para validar HMAC Rappi
  comision_pct DECIMAL(5,2),            -- comisión acordada
  config_extra JSONB DEFAULT '{}',       -- IPs whitelist, flags adicionales
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, plataforma)
);
```

### 018.2 — delivery_pedidos

```sql
CREATE TABLE delivery_pedidos (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  plataforma VARCHAR(20) NOT NULL,
  pedido_externo_id VARCHAR(100),        -- ID en Rappi/PedidosYa
  pedido_interno_id INT REFERENCES pedidos(id),
  factura_id INT REFERENCES facturas(id),
  estado_externo VARCHAR(30),
  estado_interno VARCHAR(30) DEFAULT 'recibido'
    CHECK (estado_interno IN ('recibido','aceptado','preparando','listo','despachado','entregado','cancelado')),
  cliente_nombre VARCHAR(150),
  cliente_telefono VARCHAR(20),
  cliente_direccion TEXT,
  cliente_notas TEXT,
  items JSONB NOT NULL,                  -- [{nombre, cantidad, precio, notas}]
  subtotal DECIMAL(10,2) NOT NULL,
  descuento DECIMAL(10,2) DEFAULT 0,
  comision_plataforma DECIMAL(10,2),
  costo_envio DECIMAL(10,2) DEFAULT 0,
  propina DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  metodo_pago VARCHAR(30),               -- 'tarjeta'|'efectivo'|'mixto'
  tiempo_aceptacion_seg INT,
  tiempo_preparacion_min INT,
  repartidor_nombre VARCHAR(100),
  repartidor_telefono VARCHAR(20),
  tracking_url TEXT,
  payload_original JSONB,                -- payload crudo de la plataforma
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, plataforma, pedido_externo_id)
);

CREATE INDEX idx_delivery_pedidos_tenant ON delivery_pedidos(tenant_id, created_at DESC);
CREATE INDEX idx_delivery_pedidos_estado ON delivery_pedidos(tenant_id, estado_interno);
CREATE INDEX idx_delivery_pedidos_plataforma ON delivery_pedidos(tenant_id, plataforma);
```

### 018.3 — delivery_webhook_log

```sql
CREATE TABLE delivery_webhook_log (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id),
  plataforma VARCHAR(20) NOT NULL,
  evento VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  signature_valida BOOLEAN,
  procesado BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_log_fecha ON delivery_webhook_log(created_at DESC);
```

### 018.4 — delivery_menu_sync

```sql
CREATE TABLE delivery_menu_sync (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  plataforma VARCHAR(20) NOT NULL,
  producto_id INT NOT NULL REFERENCES productos(id),
  producto_externo_id VARCHAR(100),
  precio_plataforma DECIMAL(10,2),       -- puede diferir del precio en salón
  disponible BOOLEAN DEFAULT true,
  ultimo_sync_at TIMESTAMPTZ,
  estado_sync VARCHAR(20) DEFAULT 'pendiente'
    CHECK (estado_sync IN ('pendiente','sincronizado','error','aprobacion')),
  error_sync TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, plataforma, producto_id)
);
```

### 018.5 — Servicios

```
services/delivery/
├── rappi.js
│   ├── autenticar(tenantId)              -- OAuth, refresh token semanal
│   ├── recibirPedido(webhook payload)    -- parsear NEW_ORDER
│   ├── aceptarPedido(tenantId, orderId)  -- PUT /orders/{id}/take
│   ├── rechazarPedido(tenantId, orderId, motivo)
│   ├── sincronizarMenu(tenantId)         -- POST menu completo
│   ├── actualizarDisponibilidad(tenantId, productoId, disponible)
│   ├── obtenerFinanzas(tenantId, desde, hasta) -- Financial API
│   └── validarWebhook(payload, signature) -- HMAC SHA-256
│
├── pedidosya.js
│   ├── autenticar(tenantId)              -- OAuth 2.0 Client Credentials
│   ├── recibirPedido(webhook payload)
│   ├── aceptarPedido(tenantId, orderId)  -- PUT /orders/{id} status:ACCEPTED
│   ├── marcarListo(tenantId, orderId)    -- READY_FOR_PICKUP
│   ├── sincronizarMenu(tenantId)         -- PUT catalog batch
│   ├── crearPromocion(tenantId, data)    -- PUT promotions
│   └── obtenerHistorial(tenantId, desde, hasta) -- GET orders (max 60 días)
│
├── llamafood.js
│   ├── crearPedidoManual(tenantId, data) -- Solo CRUD local
│   ├── actualizarEstado(tenantId, pedidoId, estado)
│   └── obtenerHistorial(tenantId, desde, hasta)
│
├── delivery-core.js
│   ├── procesarPedidoEntrante(tenantId, plataforma, payload)
│   │   1. Inserta en delivery_pedidos
│   │   2. Crea pedido interno (pedidos + pedido_items)
│   │   3. Mapea productos via delivery_menu_sync
│   │   4. Notifica cocina (mismo flujo que mesa)
│   │   5. Auto-acepta o alerta admin (configurable)
│   ├── sincronizarConCocina(pedidoId)
│   ├── facturarDelivery(tenantId, deliveryPedidoId)
│   └── calcularAnalytics(tenantId, desde, hasta)
│
└── webhook-handler.js
    ├── POST /api/delivery/webhook/rappi
    ├── POST /api/delivery/webhook/pedidosya
    ├── Valida firma → guarda en webhook_log → rutea al servicio
    └── Responde 200 inmediatamente, procesa async
```

### 018.6 — Flujo de pedido entrante (Rappi/PedidosYa)

```
1. Webhook NEW_ORDER llega al endpoint
2. webhook-handler.js:
   a. Valida firma HMAC (Rappi) o IP whitelist (PedidosYa)
   b. Guarda en delivery_webhook_log
   c. Identifica tenant por store_id via delivery_config
3. delivery-core.js procesarPedidoEntrante():
   a. Inserta en delivery_pedidos (estado: 'recibido')
   b. Crea pedido interno en pedidos + pedido_items
   c. Mapea productos externos → internos via delivery_menu_sync
   d. Notifica a cocina (mismo flujo que pedido de mesa)
   e. Auto-acepta o alerta al admin (según config)
4. rappi.js/pedidosya.js: confirma aceptación via API de la plataforma
5. Cocina marca "listo":
   a. Actualiza delivery_pedidos.estado_interno = 'listo'
   b. Llama API plataforma: READY_FOR_PICKUP
6. Entregado (webhook o manual):
   a. Estado → 'entregado'
   b. Se genera factura automática
   c. Stock se descuenta via recetas
```

### 018.7 — LlamaFood (flujo manual)

Sin API disponible. El flujo es:
1. Admin ingresa pedido manualmente desde pantalla de delivery
2. Selecciona plataforma "LlamaFood"
3. Carga items, cliente, dirección
4. El sistema lo trata como cualquier delivery_pedidos
5. Mismo flujo de cocina, facturación y stock

### 018.8 — Rutas

```
routes/delivery.js (nuevo)
├── GET  /delivery                        -- Dashboard: pedidos activos por plataforma
├── GET  /delivery/config                 -- Configurar credenciales por plataforma
├── POST /delivery/config/:plataforma     -- Guardar credenciales
├── POST /delivery/manual                 -- Crear pedido manual (LlamaFood u otros)
├── GET  /delivery/historial              -- Historial con filtros
├── GET  /delivery/analytics              -- Métricas por plataforma
├── POST /api/delivery/webhook/rappi      -- Endpoint webhook Rappi
├── POST /api/delivery/webhook/pedidosya  -- Endpoint webhook PedidosYa
├── GET  /api/delivery/sync-menu/:plataforma -- Sincronizar menú
```

---

## Feature Flags y Contratos

### Feature flags en tenant_suscripciones

```sql
ALTER TABLE tenant_suscripciones ADD COLUMN IF NOT EXISTS
  modulos_habilitados JSONB DEFAULT '{
    "asistencia": true,
    "historial_precios": true,
    "calendario_eventos": true,
    "sub_recetas": true,
    "costeo_automatico": true,
    "delivery_rappi": false,
    "delivery_pedidosya": false,
    "delivery_llamafood": false
  }';
```

### Middleware requireModulo(modulo)

```javascript
function requireModulo(modulo) {
  return (req, res, next) => {
    const modulos = req.tenant?.suscripcion?.modulos_habilitados || {};
    if (!modulos[modulo]) {
      return res.status(403).json({
        error: 'Módulo no disponible en tu plan',
        modulo
      });
    }
    next();
  };
}
```

**Aplicación:** `router.get('/recetas/sub', requireModulo('sub_recetas'), ...)`

### Contratos digitales

```sql
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS
  modulos_contratados JSONB DEFAULT '[]';

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS
  modulos_precio JSONB DEFAULT '{}';
```

Ejemplo:
```json
{
  "modulos_contratados": ["asistencia", "sub_recetas", "delivery_rappi"],
  "modulos_precio": {"delivery_rappi": 49.90, "delivery_pedidosya": 49.90}
}
```

**Flujo:**
1. Cotizador genera cotización con módulos seleccionados
2. Al firmar contrato → `modulos_contratados` se copia de la cotización
3. Al activar contrato → `tenant_suscripciones.modulos_habilitados` se sincroniza
4. Si contrato vence → módulos premium (delivery) se desactivan; internos se mantienen

### Panel superadmin

- Toggle por módulo por tenant
- Vista de qué tenants tienen qué módulos activos
- Activación masiva por plan

### Defaults para tenants nuevos

- Módulos internos activos: `asistencia`, `historial_precios`, `calendario_eventos`, `sub_recetas`, `costeo_automatico`
- Módulos de delivery desactivados hasta configurar credenciales API

---

## Inyección en DalIA

### Queries nuevas para knowledge-base.js / chat.js

Todas condicionadas por feature flags del tenant:

#### Si modulos.asistencia:

```sql
-- ASISTENCIA HOY
SELECT u.nombre, u.rol, am.tipo, am.timestamp
FROM asistencia_marcaciones am
JOIN usuarios u ON u.id = am.usuario_id
WHERE am.tenant_id = :tenantId AND am.timestamp::date = CURRENT_DATE
ORDER BY am.timestamp;

-- RESUMEN ASISTENCIA SEMANA
SELECT u.nombre,
  COUNT(*) FILTER (WHERE tipo='entrada') as dias_asistidos,
  SUM(horas_trabajadas) as horas_semana,
  SUM(horas_extra) as extras_semana
FROM asistencia_resumen_diario ard
JOIN usuarios u ON u.id = ard.usuario_id
WHERE ard.tenant_id = :tenantId AND ard.fecha >= NOW() - INTERVAL '7 days'
GROUP BY u.id, u.nombre;
```

#### Si modulos.costeo_automatico:

```sql
-- FOOD COST POR PLATO (TOP 20)
SELECT p.nombre, p.precio_unidad,
  rcc.costo_por_porcion, rcc.food_cost_pct,
  rcc.margen_contribucion
FROM receta_costos_cache rcc
JOIN recetas r ON r.id = rcc.receta_id
JOIN productos p ON p.id = r.producto_id
WHERE rcc.tenant_id = :tenantId
ORDER BY rcc.food_cost_pct DESC LIMIT 20;

-- MATRIZ INGENIERÍA DE MENÚ (30 días)
SELECT p.nombre,
  SUM(df.cantidad) as unidades,
  rcc.food_cost_pct,
  rcc.margen_contribucion,
  SUM(df.cantidad) * rcc.margen_contribucion as margen_total,
  CASE
    WHEN SUM(df.cantidad) >= avg_ventas.avg_qty
     AND rcc.margen_contribucion >= avg_ventas.avg_margin THEN 'estrella'
    WHEN SUM(df.cantidad) >= avg_ventas.avg_qty
     AND rcc.margen_contribucion < avg_ventas.avg_margin THEN 'caballo'
    WHEN SUM(df.cantidad) < avg_ventas.avg_qty
     AND rcc.margen_contribucion >= avg_ventas.avg_margin THEN 'enigma'
    ELSE 'perro'
  END as clasificacion
FROM detalle_factura df
JOIN productos p ON p.id = df.producto_id
LEFT JOIN receta_costos_cache rcc ON rcc.receta_id = (
  SELECT id FROM recetas WHERE producto_id = p.id AND tenant_id = :tenantId LIMIT 1
)
CROSS JOIN (
  SELECT AVG(sub.qty) as avg_qty, AVG(sub.margin) as avg_margin
  FROM (
    SELECT SUM(df2.cantidad) as qty, rcc2.margen_contribucion as margin
    FROM detalle_factura df2
    JOIN productos p2 ON p2.id = df2.producto_id
    LEFT JOIN receta_costos_cache rcc2 ON rcc2.receta_id = (
      SELECT id FROM recetas WHERE producto_id = p2.id AND tenant_id = :tenantId LIMIT 1
    )
    WHERE df2.tenant_id = :tenantId AND df2.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p2.id, rcc2.margen_contribucion
  ) sub
) avg_ventas
WHERE df.tenant_id = :tenantId AND df.created_at >= NOW() - INTERVAL '30 days'
GROUP BY p.id, p.nombre, rcc.food_cost_pct, rcc.margen_contribucion,
         avg_ventas.avg_qty, avg_ventas.avg_margin;
```

#### Si modulos.delivery_*:

```sql
-- DELIVERY POR PLATAFORMA (30 días)
SELECT plataforma,
  COUNT(*) as pedidos,
  SUM(total) as venta_total,
  SUM(comision_plataforma) as comisiones,
  SUM(total - COALESCE(comision_plataforma,0)) as ingreso_neto,
  AVG(tiempo_preparacion_min) as tiempo_prep_promedio,
  AVG(tiempo_aceptacion_seg) as aceptacion_promedio
FROM delivery_pedidos
WHERE tenant_id = :tenantId AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY plataforma;

-- DELIVERY VS SALÓN
SELECT
  (SELECT COALESCE(SUM(total),0) FROM delivery_pedidos
   WHERE tenant_id = :tenantId AND created_at >= NOW() - INTERVAL '30 days') as venta_delivery,
  (SELECT COALESCE(SUM(total),0) FROM facturas
   WHERE tenant_id = :tenantId AND fecha >= NOW() - INTERVAL '30 days') as venta_total;
```

#### Si modulos.historial_precios:

```sql
-- VARIACIÓN DE COSTOS (últimos 30 días)
SELECT ai.nombre,
  hp.precio_anterior, hp.precio_nuevo,
  ROUND((hp.precio_nuevo - hp.precio_anterior) / NULLIF(hp.precio_anterior,0) * 100, 1) as variacion_pct,
  hp.created_at
FROM historial_precios hp
JOIN almacen_ingredientes ai ON ai.id = hp.entidad_id
WHERE hp.tenant_id = :tenantId AND hp.entidad_tipo = 'ingrediente'
  AND hp.created_at >= NOW() - INTERVAL '30 days'
ORDER BY ABS(hp.precio_nuevo - hp.precio_anterior) DESC LIMIT 10;
```

#### Si modulos.calendario_eventos:

```sql
-- CALENDARIO PRÓXIMOS 14 DÍAS
SELECT nombre, tipo, fecha, impacto_esperado
FROM calendario_eventos
WHERE (tenant_id = :tenantId OR tenant_id IS NULL)
  AND fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
  AND activo = true
ORDER BY fecha;
```

#### Siempre (sin feature flag):

```sql
-- MERMA VS OBJETIVO
SELECT
  SUM(CASE WHEN am.tipo='merma' THEN am.cantidad * ai.costo_unitario ELSE 0 END) as merma_soles,
  SUM(CASE WHEN am.tipo IN ('salida','merma') THEN am.cantidad * ai.costo_unitario ELSE 0 END) as consumo_total,
  ci.merma_objetivo_pct
FROM almacen_movimientos am
JOIN almacen_ingredientes ai ON ai.id = am.ingrediente_id
CROSS JOIN configuracion_impresion ci
WHERE am.tenant_id = :tenantId AND am.created_at >= NOW() - INTERVAL '30 days';

-- P&L RESUMIDO: reutilizar función existente calcularPL(tenantId, mes, anio)
-- Inyectar: ingresos, COGS, margen_bruto_pct, ebitda, ebitda_pct
```

---

## Preguntas desbloqueadas por módulo

| Módulo | Preguntas que DalIA puede responder |
|--------|-------------------------------------|
| Asistencia | Horas trabajadas, costo real/hora, horas extra, quién faltó, staffing |
| Historial precios | Variación de costos, impacto en food cost, cuándo/quién cambió precio |
| Calendario | Pronóstico por feriado, eventos próximos, impacto esperado en demanda |
| Sub-recetas + costeo | Food cost por plato, matriz menú, margen contribución, estrella/perro/caballo/enigma |
| Delivery | Ventas por plataforma, comisiones, rentabilidad delivery vs salón, tiempos de aceptación |
| Merma objetivo | Merma actual vs meta %, ahorro potencial si se reduce |
| P&L inyectado | EBITDA, margen bruto %, punto equilibrio, proyección mensual |

---

## APIs externas

### Rappi (dev-portal.rappi.com)
- Auth: OAuth 2.0 Bearer, token válido 7 días
- Webhooks: 8 eventos, HMAC SHA-256, pedidos se aceptan en < 4min 30seg
- Endpoints: órdenes, menú, disponibilidad, scheduling, finanzas (13 endpoints)
- Limitación: acceso vía representante comercial, menú requiere aprobación (~1 semana)

### PedidosYa (developer.pedidosya.com)
- Auth: OAuth 2.0 Client Credentials desde Partner Portal
- Webhooks: order dispatch + status updates, requiere HTTPS + IP whitelist (3 IPs)
- Endpoints: órdenes (60 días), catálogo CRUD async, store status, promociones
- Limitación: datos financieros solo en portal/email, no en API

### LlamaFood
- Sin API pública
- Integración manual únicamente
