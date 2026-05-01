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
        [[{ id: 42 }]],  // INSERT dallia_actions_log RETURNING id — SELECT for action_id
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
        [[{ id: 42, action_id: 1, tenant_id: 1, draft_data: { messages: [] }, estado: 'propuesta', action_name: 'test_execute' }]],  // SELECT log
        [[]],  // UPDATE log
    ]);
    const result = await daliaActions.executeApproved(42, 1, 99, { db: fakeDb });
    assert.ok(executeCalled);
    assert.equal(result.sent.length, 1);
    const updateCall = fakeDb.calls.find(c => c.sql.includes('UPDATE dallia_actions_log'));
    assert.ok(updateCall);
});
