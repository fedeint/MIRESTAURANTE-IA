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
 *
 * Note: db.query() uses ? placeholders (auto-converted to $N by db.js wrapper).
 * Returns [rows] so we destructure as: const [rows] = await db.query(...)
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
