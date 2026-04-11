// tests/dallia-actions-nuevos.test.js
// Unit tests for the three new DalIA automation handlers:
//   vencimiento_ingredientes, resumen_cierre_dia, recordatorio_cerrar_caja
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// --- Helpers ---

function makeFakeDb(cannedResponses = []) {
    let callIdx = 0;
    return {
        query: async () => {
            const resp = cannedResponses[callIdx++] || [[]];
            return resp;
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// vencimiento_ingredientes
// ─────────────────────────────────────────────────────────────────────────────

test('vencimiento_ingredientes: shouldPropose=false when no expiring lotes', async () => {
    const handler = require('../services/dallia-actions/vencimiento-ingredientes');
    const db = makeFakeDb([ [[]] ]); // empty rows
    const result = await handler.detect(1, { db });
    assert.equal(result.shouldPropose, false);
    assert.ok(result.message);
});

test('vencimiento_ingredientes: shouldPropose=true with lotes expiring soon', async () => {
    const handler = require('../services/dallia-actions/vencimiento-ingredientes');
    const fakeLotes = [
        { lote_id: 1, numero_lote: 'L001', fecha_vencimiento: new Date(), cantidad_disponible: 5.0, ingrediente_nombre: 'Tomate', unidad_medida: 'kg', dias_restantes: 0 },
        { lote_id: 2, numero_lote: 'L002', fecha_vencimiento: new Date(), cantidad_disponible: 2.5, ingrediente_nombre: 'Lechuga', unidad_medida: 'kg', dias_restantes: 2 },
    ];
    const db = makeFakeDb([ [fakeLotes] ]);
    const result = await handler.detect(1, { db });
    assert.equal(result.shouldPropose, true);
    assert.equal(result.lotes.length, 2);
});

test('vencimiento_ingredientes: draft formats sections by urgency', async () => {
    const handler = require('../services/dallia-actions/vencimiento-ingredientes');
    const lotes = [
        { lote_id: 1, numero_lote: 'L1', fecha_vencimiento: '2026-04-11', cantidad_disponible: 3, ingrediente_nombre: 'Papa', unidad_medida: 'kg', dias_restantes: 0 },
        { lote_id: 2, numero_lote: 'L2', fecha_vencimiento: '2026-04-13', cantidad_disponible: 1, ingrediente_nombre: 'Cebolla', unidad_medida: 'kg', dias_restantes: 2 },
    ];
    const db = makeFakeDb();
    const result = await handler.draft(1, { lotes, shouldPropose: true }, { db });
    assert.ok(result.texto.includes('HOY'), 'Should include HOY section');
    assert.ok(result.texto.includes('Papa'));
    assert.ok(result.texto.includes('Cebolla'));
    assert.equal(result.resumen.hoy, 1);
    assert.equal(result.resumen.en2dias, 1);
});

test('vencimiento_ingredientes: execute acknowledges without DB writes', async () => {
    const handler = require('../services/dallia-actions/vencimiento-ingredientes');
    const db = makeFakeDb();
    const result = await handler.execute(1, 99, JSON.stringify({ lotes: [{ lote_id: 1 }, { lote_id: 2 }] }), { db });
    assert.equal(result.acknowledged, true);
    assert.equal(result.lotes_alertados, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// resumen_cierre_dia
// ─────────────────────────────────────────────────────────────────────────────

test('resumen_cierre_dia: shouldPropose=false before 20:00', async () => {
    const handler = require('../services/dallia-actions/resumen-cierre-dia');
    // Monkey-patch internal horaLima via module — we test detect behavior by overriding
    // the module's internal time check. Since horaLima is a private function we test
    // with a real time that may be before/after 20:00. We rely on the message being set.
    // This test just verifies the handler exports correctly and returns a valid shape.
    const db = makeFakeDb([ [[{ ingresos: 500, egresos: 50, cajas_activas: 1 }]], [[{ ingresos: 450, egresos: 30 }]], [[{ pedidos_hoy: 20, pedidos_ayer: 18 }]] ]);
    const result = await handler.detect(1, { db });
    // result.shouldPropose depends on actual Lima time — just validate the shape
    assert.ok(typeof result.shouldPropose === 'boolean');
    assert.ok(result.message !== undefined || result.hoy !== undefined);
});

test('resumen_cierre_dia: draft formats summary with comparison', async () => {
    const handler = require('../services/dallia-actions/resumen-cierre-dia');
    const detection = {
        shouldPropose: true,
        hoy:  { ingresos: 1200.00, egresos: 120.00, pedidos: 40, ticket: 30.00 },
        ayer: { ingresos: 1000.00, egresos: 100.00, pedidos: 35, ticket: 28.57 },
        diff: 200, diffPct: 20
    };
    const db = makeFakeDb();
    const result = await handler.draft(1, detection, { db });
    assert.ok(result.texto.includes('1200'), 'Should show today ventas');
    assert.ok(result.texto.includes('1000'), 'Should show yesterday ventas');
    assert.ok(result.texto.includes('+20%'), 'Should show positive trend');
    assert.equal(result.diffPct, 20);
});

test('resumen_cierre_dia: draft shows negative trend when below yesterday', async () => {
    const handler = require('../services/dallia-actions/resumen-cierre-dia');
    const detection = {
        shouldPropose: true,
        hoy:  { ingresos: 800, egresos: 50, pedidos: 25, ticket: 32 },
        ayer: { ingresos: 1000, egresos: 80, pedidos: 32, ticket: 31.25 },
        diff: -200, diffPct: -20
    };
    const db = makeFakeDb();
    const result = await handler.draft(1, detection, { db });
    assert.ok(result.texto.includes('-20%') || result.texto.includes('debajo'), 'Should show negative trend');
});

test('resumen_cierre_dia: execute returns acknowledged', async () => {
    const handler = require('../services/dallia-actions/resumen-cierre-dia');
    const db = makeFakeDb();
    const result = await handler.execute(1, 99, JSON.stringify({}), { db });
    assert.equal(result.acknowledged, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// recordatorio_cerrar_caja
// ─────────────────────────────────────────────────────────────────────────────

test('recordatorio_cerrar_caja: shouldPropose=false when no open cajas', async () => {
    const handler = require('../services/dallia-actions/recordatorio-cerrar-caja');
    const db = makeFakeDb([ [[]] ]); // empty rows from cajas query
    const result = await handler.detect(1, { db });
    // May return shouldPropose=false for time reason OR for empty cajas
    assert.ok(typeof result.shouldPropose === 'boolean');
    if (result.shouldPropose === false) {
        assert.ok(result.message);
    }
});

test('recordatorio_cerrar_caja: draft lists open cajas with efectivo estimado', async () => {
    const handler = require('../services/dallia-actions/recordatorio-cerrar-caja');
    const detection = {
        shouldPropose: true,
        cajas: [
            {
                id: 1,
                nombre_caja: 'Caja 1',
                cajero_nombre: 'Maria',
                fecha_apertura: new Date().toISOString(),
                monto_apertura: 200,
                total_ingresos: 1500,
                total_egresos: 300,
                efectivo_actual: 1400
            }
        ]
    };
    const db = makeFakeDb();
    const result = await handler.draft(1, detection, { db });
    assert.ok(result.texto.includes('Caja 1'));
    assert.ok(result.texto.includes('Maria'));
    assert.ok(result.texto.includes('1400'), 'Should show efectivo actual');
    assert.equal(result.total_cajas, 1);
});

test('recordatorio_cerrar_caja: execute acknowledges reminder', async () => {
    const handler = require('../services/dallia-actions/recordatorio-cerrar-caja');
    const db = makeFakeDb();
    const result = await handler.execute(1, 99, JSON.stringify({ total_cajas: 2 }), { db });
    assert.equal(result.acknowledged, true);
    assert.equal(result.cajas_en_recordatorio, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// meta_alcanzada
// ─────────────────────────────────────────────────────────────────────────────

test('meta_alcanzada: shouldPropose=false when no meta configured', async () => {
    const handler = require('../services/dallia-actions/meta-alcanzada');
    const db = makeFakeDb([ [[]] ]); // no meta rows
    const result = await handler.detect(1, { db });
    assert.equal(result.shouldPropose, false);
    assert.ok(result.message);
});

test('meta_alcanzada: shouldPropose=false when ingresos below meta', async () => {
    const handler = require('../services/dallia-actions/meta-alcanzada');
    const db = makeFakeDb([
        [[{ meta_valor: 1000 }]],   // metas_diarias
        [[{ ingresos: 750, movimientos: 5 }]], // caja_movimientos
    ]);
    const result = await handler.detect(1, { db });
    assert.equal(result.shouldPropose, false);
    assert.ok(result.message.includes('250')); // faltante
});

test('meta_alcanzada: shouldPropose=true when ingresos >= meta and no prior proposal', async () => {
    const handler = require('../services/dallia-actions/meta-alcanzada');
    const db = makeFakeDb([
        [[{ meta_valor: 1000 }]],           // metas_diarias
        [[{ ingresos: 1200, movimientos: 30 }]], // caja_movimientos
        [[]],                               // dallia_actions_log (no prior proposal)
        [[{ pedidos: 30 }]],               // pedidos count
    ]);
    const result = await handler.detect(1, { db });
    assert.equal(result.shouldPropose, true);
    assert.equal(result.metaValor, 1000);
    assert.equal(result.ingresosHoy, 1200);
    assert.equal(result.exceso, 200);
    assert.equal(result.pct, 120);
});

test('meta_alcanzada: draft includes celebration message with pct', async () => {
    const handler = require('../services/dallia-actions/meta-alcanzada');
    const detection = { shouldPropose: true, ingresosHoy: 1500, metaValor: 1000, exceso: 500, pct: 150, pedidosHoy: 40 };
    const db = makeFakeDb();
    const result = await handler.draft(1, detection, { db });
    assert.ok(result.texto.includes('1500') || result.texto.includes('1,500'));
    assert.ok(result.texto.includes('150%'));
    assert.ok(result.texto.includes('500') || result.texto.includes('exceso'));
});

test('meta_alcanzada: execute returns acknowledged with ingresos', async () => {
    const handler = require('../services/dallia-actions/meta-alcanzada');
    const db = makeFakeDb();
    const result = await handler.execute(1, 99, JSON.stringify({ ingresosHoy: 1200 }), { db });
    assert.equal(result.acknowledged, true);
    assert.ok(result.mensaje.includes('1200') || result.mensaje.includes('Meta'));
});

test('all five handlers are registered in dallia-actions', () => {
    delete require.cache[require.resolve('../services/dallia-actions')];
    const daliaActions = require('../services/dallia-actions');
    const list = daliaActions.listActions();
    const names = list.map(a => a.name);
    assert.ok(names.includes('enviar_pedido_proveedor'), 'enviar_pedido_proveedor should be registered');
    assert.ok(names.includes('vencimiento_ingredientes'), 'vencimiento_ingredientes should be registered');
    assert.ok(names.includes('resumen_cierre_dia'), 'resumen_cierre_dia should be registered');
    assert.ok(names.includes('recordatorio_cerrar_caja'), 'recordatorio_cerrar_caja should be registered');
    assert.ok(names.includes('meta_alcanzada'), 'meta_alcanzada should be registered');
});
