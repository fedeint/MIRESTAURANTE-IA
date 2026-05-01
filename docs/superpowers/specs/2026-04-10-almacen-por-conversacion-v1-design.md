# Almacen por Conversacion v1 — Design Spec

**Fecha:** 2026-04-10
**Deadline:** Sabado 2026-04-11, 13:00
**Autor:** Leonidas + Claude
**Estado:** Draft — pendiente aprobacion

---

## 1. Objetivo

DallIA puede revisar el stock del tenant, detectar insumos criticos, redactar mensajes WhatsApp agrupados por proveedor, y enviarlos previa aprobacion del admin en el chat. Es la primera implementacion de un framework generico "DallIA Actions" que soportara las 100+ tareas del roadmap.

## 2. Prerequisitos / Blockers

- **DATABASE_URL en Vercel** debe estar corregido y produccion funcional antes del demo. Sin DB, nada funciona.
- **WhatsApp Business API** configurada con `WHATSAPP_PHONE_ID` y `WHATSAPP_TOKEN` en env vars. Ya existe en `services/whatsapp-api.js`.
- Los proveedores del tenant deben tener `telefono` cargado en la tabla `proveedores`.

## 3. Arquitectura

### 3.1 Framework generico: DallIA Actions

Un sistema extensible donde cada "tarea automatizable" se registra como una accion con 3 handlers:

```
dallia_actions (tabla registro)
  id, nombre, descripcion, tipo_trigger, activa, created_at

dallia_actions_log (tabla historial)
  id, tenant_id, action_id, usuario_id,
  estado (propuesta | aprobada | rechazada | ejecutada | fallida),
  input_data JSONB,    -- datos que disparo la accion
  draft_data JSONB,    -- mensaje(s) propuesto(s) por DallIA
  result_data JSONB,   -- resultado de la ejecucion
  created_at, updated_at
```

En codigo, cada accion implementa una interfaz:

```js
// services/dallia-actions/<nombre>.js
module.exports = {
  name: 'enviar_pedido_proveedor',
  description: 'Detecta insumos bajo minimo y propone enviar pedido por WhatsApp',

  async detect(tenantId) {
    // Retorna { items: [...], shouldPropose: true/false }
  },

  async draft(tenantId, detectionResult) {
    // Retorna { messages: [{ proveedorId, proveedorNombre, telefono, texto, items }] }
  },

  async execute(tenantId, userId, approvedDraft) {
    // Envia WhatsApp + crea orden_compra borrador
    // Retorna { sent: [...], failed: [...] }
  }
};
```

Runtime en `services/dallia-actions.js`:

```js
const actions = {};  // registry

function register(handler) { actions[handler.name] = handler; }

async function run(actionName, tenantId) {
  const handler = actions[actionName];
  const detection = await handler.detect(tenantId);
  if (!detection.shouldPropose) return null;
  const draft = await handler.draft(tenantId, detection);
  // Retorna el draft para que el chat lo muestre y espere aprobacion
  return { actionName, detection, draft };
}

async function executeApproved(actionName, tenantId, userId, draft) {
  const handler = actions[actionName];
  const result = await handler.execute(tenantId, userId, draft);
  // Log en dallia_actions_log
  return result;
}
```

### 3.2 Primera accion: `enviar_pedido_proveedor`

**detect(tenantId):**
- Reutiliza la logica de `GET /almacen/que-comprar` (routes/almacen.js:362-418)
- Query: ingredientes donde `stock_actual <= stock_minimo` con JOIN a `proveedores`
- Agrupa por `proveedor_id`
- Si hay al menos 1 insumo bajo minimo con proveedor asignado, `shouldPropose = true`
- Los insumos SIN proveedor asignado (`proveedor_id IS NULL`) se listan aparte como "sin proveedor — asignar antes de pedir"

**draft(tenantId, detectionResult):**
- Para cada proveedor, DallIA genera un mensaje WhatsApp natural usando el mismo LLM que ya esta cableado en `routes/chat.js:318` (Claude `claude-sonnet-4-20250514` via `@anthropic-ai/sdk`, o Kimi si `KIMI_API_KEY` esta definida — ver `routes/chat.js:406-468`)
- Un prompt dedicado que recibe: nombre del restaurante (de `tenants.nombre`), nombre del contacto del proveedor (`proveedores.contacto_nombre` o `proveedores.nombre` si esta vacio), lista de items con cantidades
- Formato esperado del LLM:

```
Hola [contacto], soy [restaurante].

Necesitamos los siguientes insumos:
- Tomate: 10 kg (actual: 2 kg)
- Cebolla: 5 kg (actual: 0.5 kg)

Por favor confirma disponibilidad y precio.
Gracias!
```

- Se genera **un draft por proveedor**, no uno global — cada proveedor recibe solo sus items
- Si el LLM falla (API caida, timeout, rate limit), fallback a un template fijo en codigo con el mismo formato — el demo no puede depender 100% del LLM estando online

**execute(tenantId, userId, approvedDraft):**
- Por cada mensaje aprobado:
  1. Llama `whatsappApi.sendText(telefono, texto)` — funcion existente en `services/whatsapp-api.js:64`, requiere ventana de conversacion de 24h abierta con el proveedor
  2. Crea `orden_compra` en estado `borrador` con los items detectados, asociada al `proveedor_id`
  3. Loguea en `dallia_actions_log` con estado `ejecutada` y el `result_data` incluyendo `message_id` de WhatsApp si disponible
- Si `sendText` retorna `false` (ventana cerrada, telefono invalido, WhatsApp no configurado):
  - Loguea estado `fallida` con la razon en `result_data`
  - DallIA reporta al usuario: "No pude enviar a [proveedor]: la conversacion de WhatsApp con ese numero esta cerrada (no has hablado con el en 24h). Envia tu primero un mensaje manual y vuelve a intentar."
  - **V1.1** agregara fallback a `sendTemplate` con template pre-aprobado de Meta

## 4. Flujo del usuario (chat)

```
ADMIN: "DallIA, revisa mi stock"
       (o hace click en boton "Revisar stock" en el chat)

DALLIA: "Revise tu almacen. Encontre 5 insumos criticos con 2 proveedores:

         Mayorista Rio (3 insumos):
         - Tomate: necesitas 10 kg (te quedan 2 kg)
         - Cebolla: necesitas 5 kg (te quedan 0.5 kg)
         - Aji amarillo: necesitas 3 kg (agotado)

         Mercado Central (1 insumo):
         - Pollo: necesitas 15 kg (te quedan 4 kg)

         Sin proveedor asignado (1 insumo):
         - Arroz: te quedan 2 kg — asignale un proveedor en Almacen

         Quieres que les envie el pedido por WhatsApp?"

         [Enviar pedidos]  [Cancelar]

ADMIN: [click Enviar pedidos]

DALLIA: "Listo! Envie 2 mensajes:
         - Mayorista Rio (987654321) — enviado OK
         - Mercado Central (912345678) — enviado OK
         Cree 2 ordenes de compra en borrador.
         Te aviso si responden."
```

## 5. Modelo de datos (nuevas tablas)

```sql
-- Framework generico
CREATE TABLE IF NOT EXISTS dallia_actions (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    tipo_trigger VARCHAR(30) DEFAULT 'manual',  -- manual | cron | event
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Historial de ejecuciones
CREATE TABLE IF NOT EXISTS dallia_actions_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    action_id INT REFERENCES dallia_actions(id),
    usuario_id INT,
    estado VARCHAR(20) NOT NULL DEFAULT 'propuesta',
    -- propuesta | aprobada | rechazada | ejecutada | fallida
    input_data JSONB,
    draft_data JSONB,
    result_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dallia_log_tenant ON dallia_actions_log(tenant_id, created_at DESC);

-- Seed: registrar primera accion
INSERT INTO dallia_actions (nombre, descripcion, tipo_trigger)
VALUES ('enviar_pedido_proveedor', 'Detecta insumos bajo minimo y propone enviar pedido WhatsApp al proveedor', 'manual')
ON CONFLICT (nombre) DO NOTHING;
```

## 6. Archivos a crear / modificar

### Crear:
- `services/dallia-actions.js` — runtime del framework (register, run, executeApproved)
- `services/dallia-actions/enviar-pedido-proveedor.js` — primer action handler (detect, draft, execute)

### Modificar:
- `routes/chat.js` — agregar:
  - Deteccion de intent por keywords en el input del usuario (`"revisa", "stock", "falta", "pedido", "compras"` — simple keyword match, no NLU complejo para v1)
  - Cuando se detecta el intent, en vez de responder con texto el LLM, se llama `daliaActions.run('enviar_pedido_proveedor', tenantId)` y se devuelve el draft como un mensaje especial tipo `action_card`
  - Endpoint `POST /chat/action/:logId/approve` — marca el log como `aprobada` y llama `daliaActions.executeApproved(...)`
  - Endpoint `POST /chat/action/:logId/reject` — marca como `rechazada`, ambos endpoints protegidos por `requireRole(['administrador','superadmin'])`
- `views/chat.ejs` — agregar:
  - Componente inline "action card" en el stream del chat (no es un modal/popup — es una burbuja mas rica que las del chat, con los drafts agrupados por proveedor + botones `Enviar pedidos` / `Cancelar`)
  - Handler JS que detecta mensajes con `type: 'action_card'` y los renderiza con el componente custom
  - Fetch a `/chat/action/:logId/approve` al click, y actualiza la card al resultado de la ejecucion
- `db.js` (ensureSchema) — agregar las tablas `dallia_actions` y `dallia_actions_log`

### NO tocar:
- `routes/almacen.js` — no modificamos, solo reutilizamos la logica de query
- `services/whatsapp-api.js` — ya funciona, solo lo llamamos
- `views/almacen/*` — el CRUD de proveedores queda intacto

## 7. Multi-tenant

- Todas las queries scoped por `req.tenantId`
- `dallia_actions` es global (mismas acciones para todos los tenants)
- `dallia_actions_log` es por tenant (cada tenant tiene su propio historial)
- El mensaje WhatsApp usa el nombre del restaurante del tenant, no un texto generico
- El WhatsApp sender es el configurado por el tenant (o el de la plataforma si es compartido)

## 8. Permisos

- Solo usuarios con rol `administrador` o `superadmin` pueden disparar acciones y aprobar envios
- El check se hace en el endpoint de chat, no en el framework (el framework es agnostico de roles)

## 9. Que se DEFIERE a v1.1 (deuda tecnica documentada)

| Item | Razon del defer | Cuando |
|---|---|---|
| Migracion N:N `ingrediente_proveedores` | Toca 5+ queries + form, riesgo alto para deadline | Sprint post-demo |
| Deteccion proactiva (cron) | Necesita idempotencia, quiet hours, backoff | Despues de validar v1 manual |
| Fallback multi-proveedor | Requiere N:N primero | Despues de migracion |
| Edicion del draft antes de aprobar | "Cambia 10kg a 15kg" en chat natural | v1.1 |
| Parseo de respuestas WhatsApp inbound | Webhook + NLU para leer confirmaciones | v1.2 |
| Template Meta pre-aprobado | Evaluar si necesitamos uno propio vs ventana 24h | Cuando tengamos metricas de uso |
| Sidebar "Comunicacion" | Renombrar seccion, agregar submenu | Sprint de PRs pendientes |

## 10. Criterios de exito para el demo del sabado

- [ ] Admin abre chat DallIA, escribe "revisa mi stock"
- [ ] DallIA responde con lista de insumos criticos agrupados por proveedor
- [ ] Admin hace click en "Enviar pedidos"
- [ ] DallIA reporta envios exitosos
- [ ] En la tabla `ordenes_compra` aparecen las ordenes en estado `borrador`
- [ ] En `dallia_actions_log` queda registrada la accion completa
- [ ] Funciona para cualquier tenant con proveedores y stock configurado
- [ ] No rompe ninguna funcionalidad existente de DallIA
