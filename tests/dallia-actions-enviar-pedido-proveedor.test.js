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
    return { chatWithLLM: async () => responseText };
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
    const fakeDb = makeFakeDb([[[]]]);
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
            proveedor_contacto: null,
            items: [{ ingrediente_id: 1, nombre: 'Tomate', unidad: 'kg', falta: 8, stock_actual: 2 }]
        }],
        sinProveedor: []
    };
    const fakeDb = makeFakeDb([[[{ nombre: 'El Sabor Peruano' }]]]);
    const fakeLlm = { chatWithLLM: async () => { throw new Error('LLM down'); } };
    const result = await handler.draft(1, detection, { db: fakeDb, llm: fakeLlm });
    assert.equal(result.messages.length, 1);
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
        [[{ id: 500 }]],
        [[]]
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
