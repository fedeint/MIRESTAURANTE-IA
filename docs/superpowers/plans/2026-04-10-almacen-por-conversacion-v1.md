# Almacen por Conversacion v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DallIA detecta insumos bajo minimo, propone mensajes WhatsApp agrupados por proveedor en el chat, el admin aprueba con un click, y se envian los mensajes + se crean ordenes de compra en borrador. Es la primera implementacion de un framework generico "DallIA Actions".

**Architecture:** Runtime genérico (`services/dallia-actions.js`) con un registry de handlers, cada handler implementa `{ detect, draft, execute }`. La primera accion (`enviar-pedido-proveedor`) reutiliza la query de `/almacen/que-comprar`, llama al LLM de DallIA para generar drafts naturales, y al aprobarse invoca `services/whatsapp-api.sendText()` + inserta en `ordenes_compra`. El chat (`routes/chat.js`) detecta intents por keywords y devuelve un mensaje tipo `action_card` que el frontend renderiza como una burbuja especial con botones.

**Tech Stack:** Node.js + Express + Postgres + EJS. LLM: Claude Sonnet (ya cableado en `routes/chat.js:318`) o Kimi (`KIMI_API_KEY`). WhatsApp: `services/whatsapp-api.sendText`. Tests: `node:test` + `node:assert/strict` con dependency injection para mocks.

**Spec:** [docs/superpowers/specs/2026-04-10-almacen-por-conversacion-v1-design.md](../specs/2026-04-10-almacen-por-conversacion-v1-design.md)

**Blockers externos (no bloquean codear, si bloquean el demo):**
- `DATABASE_URL` en Vercel produccion debe estar corregido antes del sabado 13:00
- `WHATSAPP_PHONE_ID` y `WHATSAPP_TOKEN` deben estar configurados en produccion
- Al menos un proveedor de prueba debe tener `telefono` cargado y conversacion WhatsApp abierta en <24h

---

## File Structure

**Create:**
- `services/dallia-actions.js` — runtime (registry, run, executeApproved) ~100 lineas
- `services/dallia-actions/enviar-pedido-proveedor.js` — primer action handler ~150 lineas
- `lib/llm.js` — wrapper unificado Claude/Kimi para reutilizar entre chat.js y dallia-actions ~50 lineas
- `tests/dallia-actions.test.js` — tests del runtime ~100 lineas
- `tests/dallia-actions-enviar-pedido-proveedor.test.js` — tests del handler ~150 lineas

**Modify:**
- `db.js` — agregar 2 tablas (`dallia_actions`, `dallia_actions_log`) y seed en `ensureSchema()`
- `routes/chat.js` — intent detection + endpoints approve/reject + usar `lib/llm.js`
- `views/chat.ejs` — renderizar `action_card` messages
- `package.json` — agregar los 2 test files nuevos al script `test`

**NO tocar:**
- `routes/almacen.js` (solo reutilizamos la logica de query inline)
- `services/whatsapp-api.js` (funciona, solo lo llamamos)
- `views/almacen/*` (CRUD de proveedores queda intacto)

---

## Task 1: Schema — crear tablas dallia_actions y dallia_actions_log

**Files:**
- Modify: `db.js` (agregar en la funcion `ensureSchema()`, cerca de las otras tablas de observabilidad alrededor de la linea 260)

- [ ] **Step 1.1: Agregar tabla dallia_actions con seed**

Abrir `db.js`, dentro de la funcion `ensureSchema()`, agregar al final del bloque `try` de observabilidad (despues de la creacion de `session_geo` en linea ~338 antes del `} catch (_) {}`):

```js
// ── DallIA Actions framework ──────────────────────────────────────
try {
    await pgNativeQuery(`CREATE TABLE IF NOT EXISTS dallia_actions (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        tipo_trigger VARCHAR(30) DEFAULT 'manual',
        activa BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pgNativeQuery(`CREATE TABLE IF NOT EXISTS dallia_actions_log (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL,
        action_id INT,
        usuario_id INT,
        estado VARCHAR(20) NOT NULL DEFAULT 'propuesta',
        input_data JSONB,
        draft_data JSONB,
        result_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pgNativeQuery(`CREATE INDEX IF NOT EXISTS idx_dallia_log_tenant ON dallia_actions_log(tenant_id, created_at DESC)`);
    await pgNativeQuery(`CREATE INDEX IF NOT EXISTS idx_dallia_log_estado ON dallia_actions_log(estado, created_at DESC)`);
    // Seed: registrar la primera accion
    await pgNativeQuery(`INSERT INTO dallia_actions (nombre, descripcion, tipo_trigger)
        VALUES ('enviar_pedido_proveedor', 'Detecta insumos bajo minimo y propone enviar pedido WhatsApp al proveedor', 'manual')
        ON CONFLICT (nombre) DO NOTHING`);
} catch (_) {}
```

- [ ] **Step 1.2: Verificar que las tablas se crean al arrancar**

Run: `node -e "require('./db'); setTimeout(() => process.exit(0), 2000)"`
Expected: ve el mensaje "Conexion exitosa a PostgreSQL" y no lanza errores.

Si no hay acceso a la DB local (por el bug de DATABASE_URL), correr en modo local:
Run: `MODO=local node -e "require('./db'); setTimeout(() => process.exit(0), 2000)"`

- [ ] **Step 1.3: Commit**

```bash
git add db.js
git commit -m "feat(db): add dallia_actions and dallia_actions_log tables

Part of 'Almacen por Conversacion v1'. New tables that power the generic
DallIA Actions framework: a registry of actions DallIA can propose, and
a per-tenant log of proposed/approved/rejected/executed actions.

Seeds the first action: enviar_pedido_proveedor.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: LLM wrapper unificado (`lib/llm.js`)

**Files:**
- Create: `lib/llm.js`
- Test: inline dentro del siguiente task

- [ ] **Step 2.1: Crear lib/llm.js**

Crear archivo con:

```js
// lib/llm.js
// Unified wrapper for Claude and Kimi LLMs used across DallIA chat and DallIA Actions.
// Priority: if KIMI_API_KEY is set, use Kimi; otherwise use ANTHROPIC_API_KEY.

'use strict';

const logger = require('./logger');

/**
 * Call an LLM with a system prompt and user message.
 * @param {string} systemPrompt - System prompt / role definition
 * @param {string} userMessage - User's message or structured input
 * @param {object} opts - { maxTokens = 2048 }
 * @returns {Promise<string>} - LLM response text
 * @throws {Error} - if no API key is configured or the call fails
 */
async function chatWithLLM(systemPrompt, userMessage, opts = {}) {
    const maxTokens = opts.maxTokens || 2048;
    const kimiKey = process.env.KIMI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!kimiKey && !anthropicKey) {
        throw new Error('No LLM API key configured (need KIMI_API_KEY or ANTHROPIC_API_KEY)');
    }

    if (kimiKey) {
        return callKimi(kimiKey, systemPrompt, userMessage, maxTokens);
    }
    return callClaude(anthropicKey, systemPrompt, userMessage, maxTokens);
}

async function callClaude(apiKey, systemPrompt, userMessage, maxTokens) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
    });
    return response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
}

async function callKimi(apiKey, systemPrompt, userMessage, maxTokens) {
    const resp = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'moonshot-v1-8k',
            max_tokens: maxTokens,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ]
        })
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(data?.error?.message || `Kimi API error ${resp.status}`);
    }
    return data.choices?.[0]?.message?.content || '';
}

module.exports = { chatWithLLM };
```

- [ ] **Step 2.2: Smoke test (sin costar tokens reales)**

Si no hay key configurada, verificar que lanza el error esperado:

Run: `node -e "require('./lib/llm').chatWithLLM('test', 'hi').then(console.log).catch(e => console.log('EXPECTED:', e.message))"`
Expected output (sin keys): `EXPECTED: No LLM API key configured (need KIMI_API_KEY or ANTHROPIC_API_KEY)`

- [ ] **Step 2.3: Commit**

```bash
git add lib/llm.js
git commit -m "feat(lib): add unified LLM wrapper for Claude and Kimi

Extracts the chatWithClaude and chatWithKimi logic from routes/chat.js
into a reusable lib. Will be consumed by both chat.js and the new
dallia-actions service. No behavior change for chat.js until Task 7.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Runtime genérico (`services/dallia-actions.js`) + tests

**Files:**
- Create: `services/dallia-actions.js`
- Create: `tests/dallia-actions.test.js`
- Modify: `package.json` (agregar el test file al script `test`)

- [ ] **Step 3.1: Crear tests/dallia-actions.test.js con tests que fallen**

```js
// tests/dallia-actions.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Fake db for testing — collects queries, returns canned data
function makeFakeDb(cannedResponses = []) {
    const calls = [];
    let callIdx = 0;
    return {
        calls,
        query: async (sql, params) => {
            calls.push({ sql, params });
            const resp = cannedResponses[callIdx++] || [[]];
            return resp;
        }
    };
}

// Fake action handler for testing
function makeFakeHandler(opts = {}) {
    return {
        name: opts.name || 'fake_action',
        description: 'A fake action for testing',
        detect: opts.detect || (async () => ({ items: [], shouldPropose: false })),
        draft: opts.draft || (async () => ({ messages: [] })),
        execute: opts.execute || (async () => ({ sent: [], failed: [] }))
    };
}

test('register() adds a handler to the registry', () => {
    // Clear cached module between tests
    delete require.cache[require.resolve('../services/dallia-actions')];
    const daliaActions = require('../services/dallia-actions');
    const handler = makeFakeHandler({ name: 'test_register' });
    daliaActions.register(handler);
    assert.ok(daliaActions.getAction('test_register'));
    assert.equal(daliaActions.getAction('test_register').name, 'test_register');
});

test('register() throws if handler is missing required methods', () => {
    delete require.cache[require.resolve('../services/dallia-actions')];
    const daliaActions = require('../services/dallia-actions');
    assert.throws(() => daliaActions.register({ name: 'bad' }), /detect|draft|execute/);
});

test('run() calls detect then draft and returns action card', async () => {
    delete require.cache[require.resolve('../services/dallia-actions')];
    const daliaActions = require('../services/dallia-actions');
    const handler = makeFakeHandler({
        name: 'test_run',
        detect: async () => ({ items: [{ id: 1 }], shouldPropose: true }),
        draft: async (tid, detection) => ({ messages: [{ text: 'hello', proveedorId: 99 }] })
    });
    daliaActions.register(handler);
    const fakeDb = makeFakeDb([
        [[{ id: 42 }]],  // INSERT dallia_actions_log RETURNING id
    ]);
    const result = await daliaActions.run('test_run', 1, { db: fakeDb });
    assert.equal(result.actionName, 'test_run');
    assert.equal(result.draft.messages.length, 1);
    assert.equal(result.logId, 42);
    // verify log was written
    const insertCall = fakeDb.calls.find(c => c.sql.includes('INSERT INTO dallia_actions_log'));
    assert.ok(insertCall, 'Should have inserted a log row');
});

test('run() returns null when shouldPropose is false', async () => {
    delete require.cache[require.resolve('../services/dallia-actions')];
    const daliaActions = require('../services/dallia-actions');
    const handler = makeFakeHandler({
        name: 'test_no_propose',
        detect: async () => ({ items: [], shouldPropose: false })
    });
    daliaActions.register(handler);
    const result = await daliaActions.run('test_no_propose', 1, { db: makeFakeDb() });
    assert.equal(result.shouldPropose, false);
    assert.ok(result.message);  // Has a "nothing to do" message
});

test('executeApproved() calls handler.execute and updates log', async () => {
    delete require.cache[require.resolve('../services/dallia-actions')];
    const daliaActions = require('../services/dallia-actions');
    let executeCalled = false;
    const handler = makeFakeHandler({
        name: 'test_execute',
        execute: async (tid, uid, draft) => {
            executeCalled = true;
            return { sent: [{ proveedorId: 1 }], failed: [] };
        }
    });
    daliaActions.register(handler);
    const fakeDb = makeFakeDb([
        [[{ id: 42, action_id: 1, tenant_id: 1, draft_data: { messages: [] } }]],  // SELECT log
        [[]],  // UPDATE log
    ]);
    const result = await daliaActions.executeApproved(42, 1, 99, { db: fakeDb });
    assert.ok(executeCalled);
    assert.equal(result.sent.length, 1);
    const updateCall = fakeDb.calls.find(c => c.sql.includes('UPDATE dallia_actions_log'));
    assert.ok(updateCall);
});
```

- [ ] **Step 3.2: Correr el test — debe fallar porque el service no existe**

Run: `node --test tests/dallia-actions.test.js`
Expected: FAIL with "Cannot find module '../services/dallia-actions'"

- [ ] **Step 3.3: Crear services/dallia-actions.js con la implementacion minima**

```js
// services/dallia-actions.js
// Generic runtime for DallIA Actions: a registry of handlers and the
// run/executeApproved lifecycle used by routes/chat.js.
//
// Each handler must implement { name, description, detect, draft, execute }.
// See services/dallia-actions/enviar-pedido-proveedor.js for the first example.

'use strict';

const registry = new Map();

function register(handler) {
    if (!handler || !handler.name) {
        throw new Error('Handler must have a name');
    }
    if (typeof handler.detect !== 'function' ||
        typeof handler.draft !== 'function' ||
        typeof handler.execute !== 'function') {
        throw new Error(`Handler ${handler.name} must implement detect, draft, execute`);
    }
    registry.set(handler.name, handler);
}

function getAction(name) {
    return registry.get(name);
}

function listActions() {
    return Array.from(registry.values()).map(h => ({ name: h.name, description: h.description }));
}

/**
 * Run an action: detect → draft → persist as 'propuesta' → return for user approval.
 * Returns { actionName, detection, draft, logId, shouldPropose, message? }
 */
async function run(actionName, tenantId, deps) {
    const handler = registry.get(actionName);
    if (!handler) throw new Error(`Action not found: ${actionName}`);
    const { db } = deps;

    const detection = await handler.detect(tenantId, deps);
    if (!detection || !detection.shouldPropose) {
        return {
            actionName,
            shouldPropose: false,
            message: detection?.message || 'Nada que proponer por ahora.',
            detection
        };
    }

    const draft = await handler.draft(tenantId, detection, deps);

    // Look up action_id from the DB (registered via seed in db.js)
    const [actionRows] = await db.query('SELECT id FROM dallia_actions WHERE nombre=?', [actionName]);
    const actionId = actionRows?.[0]?.id || null;

    // Persist log row as 'propuesta'
    const [logRows] = await db.query(
        `INSERT INTO dallia_actions_log (tenant_id, action_id, estado, input_data, draft_data)
         VALUES (?, ?, 'propuesta', ?, ?) RETURNING id`,
        [tenantId, actionId, JSON.stringify(detection), JSON.stringify(draft)]
    );
    const logId = logRows?.[0]?.id;

    return { actionName, detection, draft, logId, shouldPropose: true };
}

/**
 * Execute a previously proposed action after user approval.
 * Loads the log row, calls handler.execute, updates the log with the result.
 */
async function executeApproved(logId, tenantId, userId, deps) {
    const { db } = deps;

    const [logRows] = await db.query(
        `SELECT l.id, l.action_id, l.tenant_id, l.draft_data, l.estado, a.nombre as action_name
         FROM dallia_actions_log l
         LEFT JOIN dallia_actions a ON a.id = l.action_id
         WHERE l.id=? AND l.tenant_id=?`,
        [logId, tenantId]
    );
    const log = logRows?.[0];
    if (!log) throw new Error(`Action log not found: ${logId}`);
    if (log.estado !== 'propuesta') {
        throw new Error(`Action log ${logId} is in state ${log.estado}, not 'propuesta'`);
    }

    const handler = registry.get(log.action_name);
    if (!handler) throw new Error(`Action not found in registry: ${log.action_name}`);

    let result;
    let finalEstado = 'ejecutada';
    try {
        result = await handler.execute(tenantId, userId, log.draft_data, deps);
        if (result.failed && result.failed.length > 0 && (!result.sent || result.sent.length === 0)) {
            finalEstado = 'fallida';
        }
    } catch (err) {
        result = { error: err.message };
        finalEstado = 'fallida';
    }

    await db.query(
        `UPDATE dallia_actions_log
         SET estado=?, usuario_id=?, result_data=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [finalEstado, userId, JSON.stringify(result), logId]
    );

    return result;
}

/**
 * Mark a proposed action as rejected (user cancelled without executing).
 */
async function rejectProposal(logId, tenantId, userId, deps) {
    const { db } = deps;
    await db.query(
        `UPDATE dallia_actions_log
         SET estado='rechazada', usuario_id=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND tenant_id=? AND estado='propuesta'`,
        [userId, logId, tenantId]
    );
}

module.exports = {
    register,
    getAction,
    listActions,
    run,
    executeApproved,
    rejectProposal
};
```

- [ ] **Step 3.4: Agregar el test file al script `test` en package.json**

Modificar `package.json` linea 27:
```json
"test": "node --test lib/deviceRouter.test.js tests/view-variants.test.js tests/dallia-actions.test.js",
```

- [ ] **Step 3.5: Correr los tests — deben pasar**

Run: `node --test tests/dallia-actions.test.js`
Expected: 5 tests pass (register, bad handler, run with propose, run without propose, executeApproved)

- [ ] **Step 3.6: Commit**

```bash
git add services/dallia-actions.js tests/dallia-actions.test.js package.json
git commit -m "feat(services): add generic DallIA Actions runtime

Runtime with registry, run(), executeApproved(), rejectProposal().
Each action handler implements { detect, draft, execute } and can be
injected with deps (db, llm, whatsapp) for testability.

Includes 5 unit tests covering register validation, run with/without
propose, and executeApproved state transition.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Action handler scaffold (`enviar-pedido-proveedor`)

**Files:**
- Create: `services/dallia-actions/enviar-pedido-proveedor.js`
- Create: `tests/dallia-actions-enviar-pedido-proveedor.test.js`
- Modify: `services/dallia-actions.js` (agregar require al final para auto-registrar)
- Modify: `package.json` (agregar el nuevo test file)

- [ ] **Step 4.1: Crear el scaffold del handler**

```js
// services/dallia-actions/enviar-pedido-proveedor.js
// First DallIA Action: detects ingredients below minimum stock, drafts a
// per-proveedor WhatsApp message, and (on approval) sends it and creates
// a draft orden_compra.

'use strict';

const NAME = 'enviar_pedido_proveedor';

/**
 * Detect ingredients below minimum grouped by proveedor.
 */
async function detect(tenantId, { db }) {
    // Reuse the logic of /almacen/que-comprar but scoped tighter
    const [rows] = await db.query(`
        SELECT ai.id as ingrediente_id, ai.nombre as ingrediente_nombre, ai.unidad_medida,
               ai.stock_actual, ai.stock_minimo, ai.proveedor_id,
               p.nombre as proveedor_nombre, p.telefono as proveedor_telefono,
               p.contacto_nombre as proveedor_contacto
        FROM almacen_ingredientes ai
        LEFT JOIN proveedores p ON p.id = ai.proveedor_id AND p.deleted_at IS NULL
        WHERE ai.tenant_id=? AND ai.activo=true AND ai.stock_actual <= ai.stock_minimo
        ORDER BY ai.proveedor_id NULLS LAST, ai.nombre
    `, [tenantId]);

    // Group by proveedor_id. Items without proveedor go in sinProveedor[]
    const byProveedor = new Map();
    const sinProveedor = [];

    for (const row of rows) {
        const item = {
            ingrediente_id: row.ingrediente_id,
            nombre: row.ingrediente_nombre,
            unidad: row.unidad_medida,
            stock_actual: Number(row.stock_actual) || 0,
            stock_minimo: Number(row.stock_minimo) || 0,
            falta: Math.max(0, Number(row.stock_minimo) - Number(row.stock_actual))
        };

        if (!row.proveedor_id || !row.proveedor_telefono) {
            sinProveedor.push({
                ...item,
                razon: !row.proveedor_id ? 'sin proveedor asignado' : 'proveedor sin telefono'
            });
            continue;
        }

        if (!byProveedor.has(row.proveedor_id)) {
            byProveedor.set(row.proveedor_id, {
                proveedor_id: row.proveedor_id,
                proveedor_nombre: row.proveedor_nombre,
                proveedor_telefono: row.proveedor_telefono,
                proveedor_contacto: row.proveedor_contacto,
                items: []
            });
        }
        byProveedor.get(row.proveedor_id).items.push(item);
    }

    const proveedores = Array.from(byProveedor.values());
    const shouldPropose = proveedores.length > 0 || sinProveedor.length > 0;

    let message;
    if (!shouldPropose) {
        message = 'Todo tu stock está bien — no hay insumos bajo mínimo ahora mismo.';
    }

    return { proveedores, sinProveedor, shouldPropose, message };
}

/**
 * Get the tenant's restaurant name for the message body.
 */
async function getRestauranteName(tenantId, db) {
    try {
        const [rows] = await db.query(
            'SELECT nombre FROM tenants WHERE id=?',
            [tenantId]
        );
        return rows?.[0]?.nombre || 'el restaurante';
    } catch {
        return 'el restaurante';
    }
}

/**
 * Draft a WhatsApp message per proveedor using the LLM, with a template fallback.
 */
async function draft(tenantId, detection, { db, llm }) {
    const restauranteName = await getRestauranteName(tenantId, db);
    const messages = [];

    for (const prov of detection.proveedores) {
        const itemsList = prov.items.map(i =>
            `- ${i.nombre}: faltan ${i.falta} ${i.unidad} (actual: ${i.stock_actual})`
        ).join('\n');

        let texto;
        try {
            const systemPrompt = `Eres DalIA, asistente de un restaurante peruano. Escribes mensajes WhatsApp cortos, amables y profesionales a proveedores. No uses emojis excesivos. Termina con "Gracias!".`;
            const userMessage = `Redacta un mensaje WhatsApp al proveedor "${prov.proveedor_contacto || prov.proveedor_nombre}" de parte del restaurante "${restauranteName}" pidiendo estos insumos:\n\n${itemsList}\n\nSolo el mensaje, sin introducciones ni explicaciones.`;
            texto = await llm.chatWithLLM(systemPrompt, userMessage, { maxTokens: 400 });
            texto = texto.trim();
        } catch (err) {
            // Fallback template if LLM fails
            texto = `Hola ${prov.proveedor_contacto || prov.proveedor_nombre}, soy ${restauranteName}.\n\nNecesitamos los siguientes insumos:\n${itemsList}\n\nPor favor confirma disponibilidad y precio.\n\nGracias!`;
        }

        messages.push({
            proveedor_id: prov.proveedor_id,
            proveedor_nombre: prov.proveedor_nombre,
            telefono: prov.proveedor_telefono,
            texto,
            items: prov.items
        });
    }

    return {
        messages,
        sinProveedor: detection.sinProveedor
    };
}

/**
 * Execute: send WhatsApp messages and create orden_compra records.
 */
async function execute(tenantId, userId, approvedDraft, { db, whatsapp }) {
    const sent = [];
    const failed = [];

    for (const msg of approvedDraft.messages) {
        let whatsappResult;
        try {
            whatsappResult = await whatsapp.sendText(msg.telefono, msg.texto);
        } catch (err) {
            whatsappResult = false;
        }

        if (!whatsappResult) {
            failed.push({
                proveedor_id: msg.proveedor_id,
                proveedor_nombre: msg.proveedor_nombre,
                razon: 'WhatsApp sendText returned false (ventana 24h cerrada, telefono invalido, o WhatsApp no configurado)'
            });
            continue;
        }

        // Create orden_compra in borrador state
        try {
            const total = msg.items.reduce((sum, it) => sum + (it.falta * 0), 0);  // precio desconocido en v1
            const fechaOrden = new Date().toISOString().split('T')[0];
            const [ocRows] = await db.query(
                `INSERT INTO ordenes_compra (tenant_id, proveedor_id, fecha_orden, estado, subtotal, total, usuario_id, notas)
                 VALUES (?, ?, ?, 'borrador', 0, 0, ?, ?) RETURNING id`,
                [tenantId, msg.proveedor_id, fechaOrden, userId, 'Creada automaticamente por DallIA Actions (enviar_pedido_proveedor)']
            );
            const ordenId = ocRows?.[0]?.id;

            // Insert items
            for (const item of msg.items) {
                await db.query(
                    `INSERT INTO orden_compra_items (orden_compra_id, ingrediente_id, cantidad_solicitada, precio_unitario, subtotal)
                     VALUES (?, ?, ?, 0, 0)`,
                    [ordenId, item.ingrediente_id, item.falta]
                );
            }

            sent.push({
                proveedor_id: msg.proveedor_id,
                proveedor_nombre: msg.proveedor_nombre,
                telefono: msg.telefono,
                orden_compra_id: ordenId,
                items_count: msg.items.length
            });
        } catch (err) {
            failed.push({
                proveedor_id: msg.proveedor_id,
                proveedor_nombre: msg.proveedor_nombre,
                razon: 'WhatsApp enviado pero fallo al crear orden_compra: ' + err.message
            });
        }
    }

    return { sent, failed };
}

module.exports = {
    name: NAME,
    description: 'Detecta insumos bajo minimo y propone enviar pedido WhatsApp al proveedor',
    detect,
    draft,
    execute
};
```

- [ ] **Step 4.2: Auto-registrar el handler cuando se carga el runtime**

Modificar `services/dallia-actions.js` — agregar al FINAL del archivo, despues del `module.exports`:

```js
// Auto-register known handlers (lazy require to avoid circular deps)
try {
    register(require('./dallia-actions/enviar-pedido-proveedor'));
} catch (err) {
    console.error('Failed to register dallia-actions handler:', err.message);
}
```

- [ ] **Step 4.3: Crear tests del handler con mocks**

```js
// tests/dallia-actions-enviar-pedido-proveedor.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../services/dallia-actions/enviar-pedido-proveedor');

function makeFakeDb(responses) {
    let idx = 0;
    const calls = [];
    return {
        calls,
        query: async (sql, params) => {
            calls.push({ sql, params });
            return responses[idx++] || [[]];
        }
    };
}

function makeFakeLlm(responseText) {
    return {
        chatWithLLM: async () => responseText
    };
}

function makeFakeWhatsapp(sendResult = true) {
    const sent = [];
    return {
        sent,
        sendText: async (phone, text) => {
            sent.push({ phone, text });
            return sendResult;
        }
    };
}

test('handler exports { name, description, detect, draft, execute }', () => {
    assert.equal(handler.name, 'enviar_pedido_proveedor');
    assert.equal(typeof handler.description, 'string');
    assert.equal(typeof handler.detect, 'function');
    assert.equal(typeof handler.draft, 'function');
    assert.equal(typeof handler.execute, 'function');
});

test('detect() groups items by proveedor and separates items without proveedor', async () => {
    const fakeDb = makeFakeDb([
        // Query result: 3 items, 2 with proveedor_id=1, 1 with no proveedor
        [[
            { ingrediente_id: 1, ingrediente_nombre: 'Tomate', unidad_medida: 'kg',
              stock_actual: 2, stock_minimo: 10, proveedor_id: 1,
              proveedor_nombre: 'Mayorista Rio', proveedor_telefono: '987654321', proveedor_contacto: 'Juan' },
            { ingrediente_id: 2, ingrediente_nombre: 'Cebolla', unidad_medida: 'kg',
              stock_actual: 0, stock_minimo: 5, proveedor_id: 1,
              proveedor_nombre: 'Mayorista Rio', proveedor_telefono: '987654321', proveedor_contacto: 'Juan' },
            { ingrediente_id: 3, ingrediente_nombre: 'Arroz', unidad_medida: 'kg',
              stock_actual: 1, stock_minimo: 20, proveedor_id: null,
              proveedor_nombre: null, proveedor_telefono: null, proveedor_contacto: null }
        ]]
    ]);
    const result = await handler.detect(1, { db: fakeDb });
    assert.equal(result.shouldPropose, true);
    assert.equal(result.proveedores.length, 1);
    assert.equal(result.proveedores[0].proveedor_nombre, 'Mayorista Rio');
    assert.equal(result.proveedores[0].items.length, 2);
    assert.equal(result.sinProveedor.length, 1);
    assert.equal(result.sinProveedor[0].nombre, 'Arroz');
});

test('detect() returns shouldPropose=false when nothing is critical', async () => {
    const fakeDb = makeFakeDb([[[]]]);  // empty query result
    const result = await handler.detect(1, { db: fakeDb });
    assert.equal(result.shouldPropose, false);
    assert.ok(result.message);
});

test('detect() puts item in sinProveedor when proveedor has no telefono', async () => {
    const fakeDb = makeFakeDb([
        [[
            { ingrediente_id: 1, ingrediente_nombre: 'Sal', unidad_medida: 'kg',
              stock_actual: 0, stock_minimo: 3, proveedor_id: 5,
              proveedor_nombre: 'Distribuidora X', proveedor_telefono: null, proveedor_contacto: null }
        ]]
    ]);
    const result = await handler.detect(1, { db: fakeDb });
    assert.equal(result.proveedores.length, 0);
    assert.equal(result.sinProveedor.length, 1);
    assert.match(result.sinProveedor[0].razon, /telefono/);
});

test('draft() calls LLM and returns messages per proveedor', async () => {
    const detection = {
        proveedores: [{
            proveedor_id: 1,
            proveedor_nombre: 'Mayorista Rio',
            proveedor_telefono: '987654321',
            proveedor_contacto: 'Juan',
            items: [{ ingrediente_id: 1, nombre: 'Tomate', unidad: 'kg', falta: 8, stock_actual: 2 }]
        }],
        sinProveedor: []
    };
    const fakeDb = makeFakeDb([[[{ nombre: 'El Sabor Peruano' }]]]);
    const fakeLlm = makeFakeLlm('Hola Juan, soy El Sabor Peruano. Necesito 8 kg de tomate. Gracias!');
    const result = await handler.draft(1, detection, { db: fakeDb, llm: fakeLlm });
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].proveedor_id, 1);
    assert.match(result.messages[0].texto, /Juan/);
    assert.match(result.messages[0].texto, /tomate/i);
});

test('draft() falls back to template if LLM throws', async () => {
    const detection = {
        proveedores: [{
            proveedor_id: 1,
            proveedor_nombre: 'Mayorista Rio',
            proveedor_telefono: '987654321',
            proveedor_contacto: null,  // no contact name
            items: [{ ingrediente_id: 1, nombre: 'Tomate', unidad: 'kg', falta: 8, stock_actual: 2 }]
        }],
        sinProveedor: []
    };
    const fakeDb = makeFakeDb([[[{ nombre: 'El Sabor Peruano' }]]]);
    const fakeLlm = { chatWithLLM: async () => { throw new Error('LLM down'); } };
    const result = await handler.draft(1, detection, { db: fakeDb, llm: fakeLlm });
    assert.equal(result.messages.length, 1);
    // Fallback template uses proveedor_nombre when contacto is null
    assert.match(result.messages[0].texto, /Mayorista Rio/);
    assert.match(result.messages[0].texto, /Tomate/);
});

test('execute() calls sendText and creates orden_compra on success', async () => {
    const draft = {
        messages: [{
            proveedor_id: 1,
            proveedor_nombre: 'Mayorista Rio',
            telefono: '987654321',
            texto: 'Hola, necesitamos tomate',
            items: [{ ingrediente_id: 1, nombre: 'Tomate', unidad: 'kg', falta: 8 }]
        }]
    };
    const fakeDb = makeFakeDb([
        [[{ id: 500 }]],  // INSERT orden_compra RETURNING id
        [[]]              // INSERT orden_compra_items
    ]);
    const fakeWhatsapp = makeFakeWhatsapp(true);
    const result = await handler.execute(1, 99, draft, { db: fakeDb, whatsapp: fakeWhatsapp });
    assert.equal(result.sent.length, 1);
    assert.equal(result.sent[0].orden_compra_id, 500);
    assert.equal(result.failed.length, 0);
    assert.equal(fakeWhatsapp.sent.length, 1);
    assert.equal(fakeWhatsapp.sent[0].phone, '987654321');
});

test('execute() records failure when sendText returns false', async () => {
    const draft = {
        messages: [{
            proveedor_id: 1,
            proveedor_nombre: 'Mayorista Rio',
            telefono: '987654321',
            texto: 'msg',
            items: [{ ingrediente_id: 1, nombre: 'X', unidad: 'kg', falta: 1 }]
        }]
    };
    const fakeDb = makeFakeDb([]);
    const fakeWhatsapp = makeFakeWhatsapp(false);
    const result = await handler.execute(1, 99, draft, { db: fakeDb, whatsapp: fakeWhatsapp });
    assert.equal(result.sent.length, 0);
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0].razon, /ventana/);
});
```

- [ ] **Step 4.4: Agregar el nuevo test file a package.json**

Modificar `package.json` linea del script `test`:
```json
"test": "node --test lib/deviceRouter.test.js tests/view-variants.test.js tests/dallia-actions.test.js tests/dallia-actions-enviar-pedido-proveedor.test.js",
```

- [ ] **Step 4.5: Correr los tests**

Run: `node --test tests/dallia-actions-enviar-pedido-proveedor.test.js`
Expected: 7 tests pass

Run: `npm test`
Expected: all tests (view variants + both dallia-actions suites) pass

- [ ] **Step 4.6: Commit**

```bash
git add services/dallia-actions/ services/dallia-actions.js tests/dallia-actions-enviar-pedido-proveedor.test.js package.json
git commit -m "feat(dallia-actions): add enviar_pedido_proveedor handler

First action handler for the DallIA Actions framework. Detects insumos
below minimo grouped by proveedor, drafts per-proveedor WhatsApp messages
via LLM (with template fallback), and on execution sends WhatsApp +
creates orden_compra in borrador state.

Registered automatically when services/dallia-actions is required.
Includes 7 unit tests with mocked db, llm, and whatsapp dependencies.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Integrar en routes/chat.js — intent detection + endpoints

**Files:**
- Modify: `routes/chat.js`

- [ ] **Step 5.1: Agregar imports y constantes**

En `routes/chat.js`, despues de los requires existentes (aprox linea 1-11), agregar:

```js
const daliaActions = require('../services/dallia-actions');
const whatsappApi = require('../services/whatsapp-api');
const llm = require('../lib/llm');
const db = require('../db');

// Keywords that trigger the enviar_pedido_proveedor action
const STOCK_INTENT_KEYWORDS = ['revisa', 'revisar', 'stock', 'falta', 'pedido', 'compras', 'comprar', 'insumos'];

function detectStockIntent(text) {
    const lower = (text || '').toLowerCase();
    // Trigger if at least 2 keywords match, to avoid false positives
    let matches = 0;
    for (const kw of STOCK_INTENT_KEYWORDS) {
        if (lower.includes(kw)) matches++;
    }
    return matches >= 2 || lower.includes('revisa mi stock') || lower.includes('haz el pedido');
}
```

- [ ] **Step 5.2: Interceptar en el handler principal del chat**

Encontrar el endpoint `POST /chat` o similar en `routes/chat.js` (debe ser el que maneja los mensajes entrantes). Antes de llamar al LLM, agregar la deteccion del intent:

```js
// --- DallIA Actions intent detection ---
// If the user's message matches a registered action, run it instead of calling the LLM.
const tenantId = req.tenantId || 1;
const userRole = req.session?.user?.rol || 'usuario';
if (detectStockIntent(userMessage) && (userRole === 'administrador' || userRole === 'superadmin')) {
    try {
        const result = await daliaActions.run('enviar_pedido_proveedor', tenantId, {
            db, llm, whatsapp: whatsappApi
        });
        if (!result.shouldPropose) {
            return res.json({
                respuesta: result.message,
                modelo: 'dallia-actions',
                type: 'text'
            });
        }
        return res.json({
            respuesta: 'Te propongo enviar estos pedidos:',
            modelo: 'dallia-actions',
            type: 'action_card',
            action_card: {
                logId: result.logId,
                actionName: result.actionName,
                detection: result.detection,
                draft: result.draft
            }
        });
    } catch (err) {
        console.error('[dallia-actions] run failed:', err.message);
        // Fall through to normal LLM chat on error
    }
}
// --- End DallIA Actions ---
```

NOTA: el nombre exacto de `userMessage` y el formato del response dependen del codigo existente en `routes/chat.js`. Leer primero la linea del handler (~alrededor de linea 400-500 donde se llama a `chatWithClaude` o `chatWithKimi`) y adaptar los nombres de variables.

- [ ] **Step 5.3: Agregar endpoints approve/reject**

Al final de `routes/chat.js` ANTES del `module.exports = router`, agregar:

```js
// --- DallIA Actions approve/reject ---
function requireAdmin(req, res, next) {
    const rol = req.session?.user?.rol;
    if (rol !== 'administrador' && rol !== 'superadmin') {
        return res.status(403).json({ error: 'Solo administradores pueden aprobar acciones de DallIA' });
    }
    next();
}

router.post('/action/:logId/approve', requireAdmin, async (req, res) => {
    try {
        const logId = parseInt(req.params.logId, 10);
        if (!logId) return res.status(400).json({ error: 'logId invalido' });
        const tenantId = req.tenantId || 1;
        const userId = req.session?.user?.id || 0;
        const result = await daliaActions.executeApproved(logId, tenantId, userId, {
            db, llm, whatsapp: whatsappApi
        });
        res.json({ ok: true, result });
    } catch (err) {
        console.error('[dallia-actions approve]', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/action/:logId/reject', requireAdmin, async (req, res) => {
    try {
        const logId = parseInt(req.params.logId, 10);
        if (!logId) return res.status(400).json({ error: 'logId invalido' });
        const tenantId = req.tenantId || 1;
        const userId = req.session?.user?.id || 0;
        await daliaActions.rejectProposal(logId, tenantId, userId, { db });
        res.json({ ok: true });
    } catch (err) {
        console.error('[dallia-actions reject]', err);
        res.status(500).json({ error: err.message });
    }
});
```

- [ ] **Step 5.4: Smoke test con curl**

Start the server in another terminal: `MODO=local npm start` (o `node server.js`)

Run:
```bash
# Assume tenant 1 has a test admin session cookie in cookies.txt
curl -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"message":"DallIA, revisa mi stock porfa"}'
```

Expected: JSON response with `type: "action_card"` if there are insumos bajo minimo, or `type: "text"` with "Todo tu stock está bien" otherwise.

Si no tenes un admin session a mano, crea uno rapido:
```bash
curl -X POST http://localhost:3000/login -c cookies.txt -d 'usuario=admin&password=<tu-pass>'
```

- [ ] **Step 5.5: Commit**

```bash
git add routes/chat.js
git commit -m "feat(chat): wire DallIA Actions into chat intent detection

Adds keyword-based intent detection for stock management queries.
When the user's message matches keywords like 'revisa mi stock' or
'haz el pedido', routes/chat.js runs the enviar_pedido_proveedor
action instead of calling the LLM, returning an action_card response
for the frontend to render.

Also adds POST /chat/action/:logId/approve and /reject endpoints,
protected by requireAdmin middleware.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Frontend — renderizar action_card en chat.ejs

**Files:**
- Modify: `views/chat.ejs` (y/o `views/dallia-chat.ejs` segun cual este en uso)

- [ ] **Step 6.1: Identificar el handler JS del chat**

Run: `grep -n "respuesta\|action_card\|appendMessage" views/chat.ejs views/dallia-chat.ejs | head -30`

Identificar donde en el JS del frontend se procesa el response del fetch a `/chat`. Buscar una funcion tipo `appendMessage(text, role)` o `renderResponse(data)`.

- [ ] **Step 6.2: Agregar el renderizado del action_card**

Dentro del JS del frontend (al final del `<script>` tag del chat), agregar una funcion que reciba el response y si `data.type === 'action_card'` pinte una burbuja especial:

```html
<script>
function renderActionCard(data) {
    const card = data.action_card;
    const draft = card.draft;
    const container = document.createElement('div');
    container.className = 'message dallia-message action-card';
    container.dataset.logId = card.logId;

    let html = `<div class="action-card-header">
        <i class="bi bi-robot"></i> <strong>DallIA propone enviar pedidos</strong>
    </div>`;

    // Per-proveedor blocks
    for (const msg of draft.messages) {
        html += `<div class="action-card-proveedor">
            <div class="prov-header">
                <strong>${escapeHtml(msg.proveedor_nombre)}</strong>
                <span class="badge bg-secondary">${msg.items.length} items</span>
            </div>
            <pre class="prov-message">${escapeHtml(msg.texto)}</pre>
        </div>`;
    }

    // Sin proveedor block
    if (draft.sinProveedor && draft.sinProveedor.length > 0) {
        html += `<div class="action-card-warning">
            <strong>Sin proveedor asignado:</strong>
            <ul>`;
        for (const it of draft.sinProveedor) {
            html += `<li>${escapeHtml(it.nombre)} (${escapeHtml(it.razon)})</li>`;
        }
        html += `</ul></div>`;
    }

    // Buttons
    html += `<div class="action-card-buttons">
        <button class="btn btn-primary" onclick="approveAction(${card.logId}, this)">
            <i class="bi bi-check-circle"></i> Aprobar y enviar
        </button>
        <button class="btn btn-outline-secondary" onclick="rejectAction(${card.logId}, this)">
            Cancelar
        </button>
    </div>
    <div class="action-card-status"></div>`;

    container.innerHTML = html;
    document.querySelector('#chat-messages').appendChild(container);
    container.scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

async function approveAction(logId, btn) {
    const card = btn.closest('.action-card');
    const statusDiv = card.querySelector('.action-card-status');
    btn.disabled = true;
    statusDiv.textContent = 'Enviando…';
    try {
        const res = await fetch(`/chat/action/${logId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error desconocido');
        let msg = `Listo! Envie ${data.result.sent.length} mensaje(s)`;
        if (data.result.failed.length > 0) {
            msg += `. Fallaron ${data.result.failed.length}: ${data.result.failed.map(f => f.proveedor_nombre).join(', ')}`;
        }
        statusDiv.textContent = msg;
        statusDiv.className = 'action-card-status success';
        card.querySelectorAll('.action-card-buttons button').forEach(b => b.remove());
    } catch (err) {
        statusDiv.textContent = 'Error: ' + err.message;
        statusDiv.className = 'action-card-status error';
        btn.disabled = false;
    }
}

async function rejectAction(logId, btn) {
    const card = btn.closest('.action-card');
    const statusDiv = card.querySelector('.action-card-status');
    try {
        await fetch(`/chat/action/${logId}/reject`, { method: 'POST' });
        statusDiv.textContent = 'Cancelado.';
        card.querySelectorAll('.action-card-buttons button').forEach(b => b.remove());
    } catch (err) {
        statusDiv.textContent = 'Error al cancelar: ' + err.message;
    }
}
</script>
```

- [ ] **Step 6.3: Agregar CSS para la action card**

Dentro de la seccion `<style>` del chat view (o si no existe, crear una al head):

```html
<style>
.action-card {
    background: linear-gradient(135deg, #fff8f0 0%, #fafaf7 100%);
    border: 2px solid #ef520f;
    border-radius: 16px;
    padding: 16px;
    margin: 12px 0;
    box-shadow: 0 4px 12px rgba(239, 82, 15, 0.15);
}
.action-card-header {
    font-size: 1.1em;
    color: #ef520f;
    margin-bottom: 12px;
    border-bottom: 1px solid rgba(239, 82, 15, 0.2);
    padding-bottom: 8px;
}
.action-card-proveedor {
    background: white;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
}
.prov-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}
.prov-message {
    background: #f5f5f5;
    padding: 10px;
    border-radius: 6px;
    font-family: 'DM Sans', sans-serif;
    white-space: pre-wrap;
    font-size: 0.9em;
    margin: 0;
}
.action-card-warning {
    background: #fff4e5;
    border-left: 4px solid #F97316;
    padding: 10px;
    border-radius: 6px;
    margin-bottom: 8px;
    font-size: 0.9em;
}
.action-card-warning ul {
    margin: 4px 0 0 16px;
}
.action-card-buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}
.action-card-status {
    margin-top: 10px;
    font-size: 0.9em;
}
.action-card-status.success { color: #22C55E; }
.action-card-status.error { color: #EF4444; }
</style>
```

- [ ] **Step 6.4: Wire the renderActionCard into the existing message handler**

Encontrar la funcion existente que procesa la respuesta del fetch a /chat (probablemente `sendMessage` o `handleResponse`). Agregar el check:

```js
// Dentro del handler existente, despues del `const data = await res.json()`:
if (data.type === 'action_card') {
    renderActionCard(data);
} else {
    // logica existente de renderizado de texto
    appendMessage(data.respuesta, 'dallia');  // o como se llame la funcion existente
}
```

- [ ] **Step 6.5: Manual test en browser**

Start the server. Open the chat in the browser. Login as admin. Type: "DallIA, revisa mi stock"

Expected: If there are insumos bajo minimo, an action card renders with the per-proveedor messages and buttons. If not, a text bubble says "Todo tu stock está bien".

- [ ] **Step 6.6: Commit**

```bash
git add views/chat.ejs
git commit -m "feat(chat): render DallIA action cards in chat UI

Adds renderActionCard() to handle response messages of type 'action_card'.
The card displays per-proveedor drafts with approve/cancel buttons that
POST to /chat/action/:logId/approve|reject. Includes styles that match
the MiRest design tokens (orange gradient, backdrop-blur).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Seed data de prueba + smoke test end-to-end

**Files:**
- Create: `scripts/seed-dallia-actions-demo.js` (solo para demo, se borra después)

- [ ] **Step 7.1: Crear script de seed con un tenant de prueba**

```js
// scripts/seed-dallia-actions-demo.js
// Seed one tenant, one admin user, one proveedor, and 3 insumos bajo minimo
// for demoing the DallIA Actions flow.
//
// USAGE: MODO=local node scripts/seed-dallia-actions-demo.js

'use strict';
const db = require('../db');

async function seed() {
    const tenantId = 1;  // assume tenant 1 exists

    // 1. Proveedor de prueba (con telefono) — use a real number you can receive WhatsApp on
    const TEST_PHONE = process.env.DEMO_PROVEEDOR_PHONE || '51987654321';
    const [existing] = await db.query(
        "SELECT id FROM proveedores WHERE tenant_id=? AND nombre='Proveedor Demo DallIA'",
        [tenantId]
    );
    let proveedorId;
    if (existing.length > 0) {
        proveedorId = existing[0].id;
        console.log('Proveedor demo ya existe, id=', proveedorId);
    } else {
        const [rows] = await db.query(`
            INSERT INTO proveedores (tenant_id, nombre, ruc, telefono, contacto_nombre, tipo, calificacion, activo)
            VALUES (?, 'Proveedor Demo DallIA', '20100000000', ?, 'Contacto Demo', 'mayorista', 5, true)
            RETURNING id
        `, [tenantId, TEST_PHONE]);
        proveedorId = rows[0].id;
        console.log('Proveedor demo creado, id=', proveedorId);
    }

    // 2. Categoria (si no existe)
    const [cats] = await db.query("SELECT id FROM almacen_categorias WHERE tenant_id=? LIMIT 1", [tenantId]);
    let categoriaId = cats[0]?.id;
    if (!categoriaId) {
        const [catRows] = await db.query(`
            INSERT INTO almacen_categorias (tenant_id, nombre) VALUES (?, 'Demo') RETURNING id
        `, [tenantId]);
        categoriaId = catRows[0].id;
    }

    // 3. Insumos bajo minimo para el proveedor de prueba
    const insumos = [
        { nombre: 'Tomate DEMO', codigo: 'T-DEMO', unidad: 'kg', stock: 2, minimo: 10 },
        { nombre: 'Cebolla DEMO', codigo: 'C-DEMO', unidad: 'kg', stock: 0.5, minimo: 5 },
        { nombre: 'Aji amarillo DEMO', codigo: 'A-DEMO', unidad: 'kg', stock: 0, minimo: 3 }
    ];
    for (const i of insumos) {
        const [ex] = await db.query(
            "SELECT id FROM almacen_ingredientes WHERE tenant_id=? AND codigo=?",
            [tenantId, i.codigo]
        );
        if (ex.length > 0) {
            // Update to set stock below minimo
            await db.query(
                "UPDATE almacen_ingredientes SET stock_actual=?, stock_minimo=?, proveedor_id=?, activo=true WHERE id=?",
                [i.stock, i.minimo, proveedorId, ex[0].id]
            );
            console.log(`Updated ${i.nombre} (id=${ex[0].id})`);
        } else {
            await db.query(`
                INSERT INTO almacen_ingredientes
                (tenant_id, categoria_id, proveedor_id, codigo, nombre, unidad_medida, unidad_compra,
                 stock_actual, stock_minimo, costo_unitario, activo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, true)
            `, [tenantId, categoriaId, proveedorId, i.codigo, i.nombre, i.unidad, i.unidad, i.stock, i.minimo]);
            console.log(`Created ${i.nombre}`);
        }
    }

    console.log('');
    console.log('✓ Seed complete. Now login as admin, open the chat, and type:');
    console.log('   "DallIA, revisa mi stock"');
    console.log('');
    console.log('Note: the WhatsApp number is', TEST_PHONE);
    console.log('  → the send will succeed only if you have an open 24h conversation with this number');
    console.log('  → otherwise expect a "ventana cerrada" failure (which is correct v1 behavior)');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
```

- [ ] **Step 7.2: Correr el seed**

Run: `MODO=local DEMO_PROVEEDOR_PHONE=51XXXXXXXXX node scripts/seed-dallia-actions-demo.js`
Expected: mensajes confirmando creacion de proveedor + 3 insumos demo.

Reemplazar `51XXXXXXXXX` con un numero WhatsApp al que tengas acceso para testear.

- [ ] **Step 7.3: Smoke test end-to-end en local**

1. `MODO=local npm start` (o similar)
2. Abrir http://localhost:3000 en el browser
3. Login como admin
4. Abrir el chat de DallIA
5. Enviar: "DallIA, revisa mi stock porfa"
6. Verificar: aparece action card con 3 items agrupados bajo "Proveedor Demo DallIA"
7. Click "Aprobar y enviar"
8. Verificar: mensaje de success con "1 enviado" (o "1 fallido" si la ventana WhatsApp esta cerrada — ambos son validos para v1)
9. Query directa a la DB:
```bash
MODO=local node -e "
const db = require('./db');
(async () => {
  const [logs] = await db.query('SELECT id, estado, created_at FROM dallia_actions_log ORDER BY id DESC LIMIT 5');
  console.log('Action log:', logs);
  const [oc] = await db.query('SELECT id, proveedor_id, estado, fecha_orden FROM ordenes_compra ORDER BY id DESC LIMIT 5');
  console.log('Ordenes compra:', oc);
  process.exit(0);
})();
"
```
Expected: la ultima fila de `dallia_actions_log` tiene `estado='ejecutada'` (o `fallida` si ventana cerrada), y la ultima fila de `ordenes_compra` (solo si fue exitoso) tiene `estado='borrador'`.

- [ ] **Step 7.4: Commit**

```bash
git add scripts/seed-dallia-actions-demo.js
git commit -m "chore(scripts): add seed script for DallIA Actions demo

Creates one demo proveedor and 3 insumos below minimo in tenant 1,
for testing the 'Almacen por Conversacion' end-to-end flow locally
and in the Saturday demo.

Usage: MODO=local DEMO_PROVEEDOR_PHONE=51XXXXXXXXX node scripts/seed-dallia-actions-demo.js

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Deploy y verificación en producción

**Files:** none (deploy only)

- [ ] **Step 8.1: Verificar DATABASE_URL en produccion**

Pregunta al usuario: ¿DATABASE_URL ya fue corregido? Si no, bloqueador hard.

Si si, verificar:
```bash
vercel env ls production | grep DATABASE_URL
vercel env ls production | grep WHATSAPP
```
Expected: ambos listados.

- [ ] **Step 8.2: Merge de la rama feature al main**

Por el deadline, no abrimos PR formal. Hacemos merge directo desde `fix/security-stack-traces` (la rama activa) o una rama nueva `feat/almacen-por-conversacion` dedicada a esta feature.

**Recomendacion:** crear una rama nueva limpia para este feature y mergear directo:

```bash
# Desde la rama actual
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes"
git worktree add -b feat/almacen-por-conversacion .worktrees/pr-feature origin/main
cd .worktrees/pr-feature

# Cherry-pick todos los commits de este plan (los IDs reales van a aparecer despues de cada commit)
# Ejemplo:
git cherry-pick <commit1> <commit2> <commit3> <commit4> <commit5> <commit6> <commit7>

# Push
git push -u origin feat/almacen-por-conversacion
```

- [ ] **Step 8.3: Crear PR y mergear a main**

```bash
gh pr create --base main --head feat/almacen-por-conversacion \
  --title "feat(dallia): Almacen por Conversacion v1 — DallIA Actions framework + first instance" \
  --body "Primera implementacion del framework DallIA Actions. Ver spec en docs/superpowers/specs/2026-04-10-almacen-por-conversacion-v1-design.md"
```

O si `gh` no esta instalado, usar `mcp__github__create_pull_request` con el mismo contenido.

Mergear via UI de GitHub (o `mcp__github__merge_pull_request`). Vercel auto-deploya main.

- [ ] **Step 8.4: Verificar deploy en Vercel**

Esperar ~2 minutos. Visitar `mirestconia.com`, login como admin, abrir chat, probar el intent "revisa mi stock".

Expected: funciona igual que en local.

- [ ] **Step 8.5: Commit del plan como "ejecutado"**

```bash
# Sin cambios de codigo, solo confirmar que todo corrio
git log --oneline -20
```

---

## Self-Review

Corro este checklist sobre el plan:

**1. Spec coverage — ¿cada requerimiento del spec tiene task?**

| Spec section | Task que lo implementa |
|---|---|
| 3.1 Framework (tabla + runtime) | Task 1 (tablas) + Task 3 (runtime) |
| 3.2 Primera accion (detect/draft/execute) | Task 4 |
| 4 Flujo usuario (chat → action card → aprobar) | Task 5 (backend) + Task 6 (UI) |
| 5 Modelo de datos | Task 1 |
| 6 Archivos a crear/modificar | Tasks 1-6 |
| 7 Multi-tenant | Cubierto en cada task (tenantId en queries) |
| 8 Permisos (solo admin) | Task 5 (requireAdmin middleware) |
| 9 Deuda tecnica diferida | Documentado en spec, no aplica al plan |
| 10 Criterios de exito | Task 7 (smoke test) + Task 8 (prod verify) |

✅ Todo cubierto.

**2. Placeholder scan** — busco TBD, TODO, "fill in later", etc.

- Task 5.2 dice "el nombre exacto de `userMessage` … depende del codigo existente". Esto es una instruccion al ejecutor de leer primero el contexto, no un placeholder — es valido porque el codigo del chat.js tiene variables legacy que no puedo adivinar sin leer. Aceptable.
- Task 8.2 tiene `<commit1> <commit2>` — esto es porque los IDs se generan en los commits anteriores. Reemplazar en el momento de ejecutar. Aceptable (es un template operacional).

No encuentro placeholders criticos.

**3. Type consistency** — ¿los nombres de funciones y props son consistentes entre tasks?

- `daliaActions.run(actionName, tenantId, deps)` — usado en Task 3, Task 5.2 ✅
- `daliaActions.executeApproved(logId, tenantId, userId, deps)` — Task 3, Task 5.3 ✅
- `daliaActions.rejectProposal(logId, tenantId, userId, deps)` — Task 3, Task 5.3 ✅
- Handler shape `{ name, description, detect, draft, execute }` — Task 3, Task 4 ✅
- `detection.proveedores`, `detection.sinProveedor`, `detection.shouldPropose` — Task 4, Task 6 ✅
- `draft.messages[i].texto`, `draft.messages[i].proveedor_nombre`, `draft.messages[i].telefono` — Task 4, Task 5, Task 6 ✅
- `result.sent[]`, `result.failed[]` — Task 4, Task 5, Task 6 ✅

✅ Consistent.

**4. Ambiguity check**

- Task 5.1 `tenantId = req.tenantId || 1` — el fallback a 1 es un atajo de desarrollo, ya esta en el resto del codigo (ej: routes/almacen.js:82). Aceptable como patron existente.
- Task 6.2: usa `#chat-messages` como selector del contenedor. Puede ser que el real sea `.chat-body` o similar — se verifica en Step 6.1 antes de hardcodear. El ejecutor debe ajustarlo al leer el HTML real.

OK. El plan esta listo.

---

## Notas finales para el ejecutor

1. **TDD cuando tiene sentido.** Tasks 3 y 4 son puros unit tests con dependency injection (clean TDD). Tasks 5 y 6 son integracion con codigo existente complejo (chat.js tiene 880 lineas de logica legacy) — ahi testing manual es mas rapido y pragmatico para el deadline.

2. **Frequent commits.** Commitea despues de cada task. Si algo rompe el sabado, podes revertir tasks individuales sin perder todo.

3. **Bloqueador hard del viernes noche:** la ejecucion de Task 1 requiere una DB donde crear las tablas. Si `DATABASE_URL` de Vercel no esta arreglado pero la DB local funciona, correr todo en `MODO=local` hasta Task 8.

4. **El intent detection de Task 5 es simple keyword match.** Si falla a detectar o genera falsos positivos durante el demo, ajustar `STOCK_INTENT_KEYWORDS` en el momento — es una variable, no requiere redeployeo.

5. **El fallback template en Task 4.3 es critico.** Si el LLM falla durante el demo, la feature sigue funcionando con mensajes pre-escritos. No saltearse el try/catch.

6. **Si la ventana de 24h de WhatsApp esta cerrada con el proveedor de prueba**, el demo aun funciona — el flujo completo llega hasta `execute()`, solo que la seccion `failed[]` explica por que. Eso en si demuestra que el sistema maneja errores correctamente.
