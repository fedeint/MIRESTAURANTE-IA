'use strict';

/**
 * routes/sync.js
 * Sync status and trigger endpoints.
 *
 * GET  /api/sync/status  - returns current mode, last sync timestamps and pending count
 * POST /api/sync/trigger - manually triggers sync-to-cloud (admin only)
 */

const { Router } = require('express');
const { spawn }  = require('child_process');
const path       = require('path');
const db         = require('../db');

const router = Router();

// ── GET /api/sync/status ──────────────────────────────────────────────────────

router.get('/status', async (req, res) => {
    const modo     = db.MODO     || process.env.MODO || 'cloud';
    const isLocal  = db.IS_LOCAL || modo === 'local';

    const status = {
        modo,
        isLocal,
        lastSyncToCloud:   null,
        lastSyncFromCloud: null,
        pendingSync:       0,
        syncLogAvailable:  false,
        recentSyncs:       [],
    };

    if (!isLocal) {
        // In cloud mode there is no local sync infrastructure
        return res.json(status);
    }

    try {
        // Last sync timestamps
        const syncState = await db.query(
            "SELECT direction, last_sync_at FROM sync_state"
        );
        const [stateRows] = syncState;
        for (const row of stateRows) {
            if (row.direction === 'to_cloud')   status.lastSyncToCloud   = row.last_sync_at;
            if (row.direction === 'from_cloud') status.lastSyncFromCloud = row.last_sync_at;
        }
        status.syncLogAvailable = true;

        // Count records modified since last sync-to-cloud (across critical tables)
        const since = status.lastSyncToCloud || new Date(0);
        const criticalTables = [
            'pedidos', 'pedido_items', 'facturas', 'detalle_factura',
            'factura_pagos', 'caja_movimientos',
        ];
        let pendingTotal = 0;
        for (const tbl of criticalTables) {
            try {
                const [[row]] = await db.query(
                    `SELECT COUNT(*) as cnt FROM ${tbl} WHERE created_at > $1`,
                    [since]
                );
                pendingTotal += Number(row.cnt || 0);
            } catch (_) { /* table might not exist */ }
        }
        status.pendingSync = pendingTotal;

        // Recent sync log entries (last 10)
        try {
            const [logRows] = await db.query(
                `SELECT id, table_name, synced_at, records_sent, records_recv,
                        direction, status, error_msg
                 FROM sync_log
                 ORDER BY synced_at DESC
                 LIMIT 10`
            );
            status.recentSyncs = logRows;
        } catch (_) { /* sync_log might not exist yet */ }

    } catch (err) {
        // sync_state table not yet created (setup not run)
        status.syncLogAvailable = false;
        status.error = err.message;
    }

    res.json(status);
});

// ── POST /api/sync/trigger ────────────────────────────────────────────────────

router.post('/trigger', async (req, res) => {
    const modo    = db.MODO || process.env.MODO || 'cloud';
    const isLocal = db.IS_LOCAL || modo === 'local';

    if (!isLocal) {
        return res.status(400).json({
            error: 'La sincronizacion manual solo esta disponible en modo local.'
        });
    }

    if (!process.env.CLOUD_DATABASE_URL) {
        return res.status(400).json({
            error: 'CLOUD_DATABASE_URL no esta configurado en .env.local. No se puede sincronizar.'
        });
    }

    // Spawn the sync script as a child process so it does not block the server
    const scriptPath = path.join(__dirname, '..', 'scripts', 'sync-to-cloud.js');

    let output = '';
    let errorOutput = '';

    const child = spawn(process.execPath, [scriptPath], {
        env: { ...process.env },
        cwd: path.join(__dirname, '..'),
    });

    child.stdout.on('data', chunk => { output      += chunk.toString(); });
    child.stderr.on('data', chunk => { errorOutput += chunk.toString(); });

    // Respond immediately with 202 Accepted — sync runs in background
    res.status(202).json({
        message: 'Sincronizacion iniciada en segundo plano.',
        note:    'Consulta GET /api/sync/status en unos segundos para ver el resultado.',
    });

    child.on('close', code => {
        if (code === 0) {
            console.log('[sync/trigger] Sincronizacion completada OK.');
        } else {
            console.error(`[sync/trigger] Sincronizacion termino con codigo ${code}.`);
            if (errorOutput) console.error(errorOutput);
        }
        if (output) console.log(output);
    });

    child.on('error', err => {
        console.error('[sync/trigger] Error al lanzar proceso de sync:', err.message);
    });
});

// ── POST /api/sync/trigger-from-cloud ────────────────────────────────────────
// Download cloud data to local (useful at start of day)

router.post('/trigger-from-cloud', async (req, res) => {
    const modo    = db.MODO || process.env.MODO || 'cloud';
    const isLocal = db.IS_LOCAL || modo === 'local';

    if (!isLocal) {
        return res.status(400).json({
            error: 'Solo disponible en modo local.'
        });
    }

    if (!process.env.CLOUD_DATABASE_URL) {
        return res.status(400).json({
            error: 'CLOUD_DATABASE_URL no configurado.'
        });
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', 'sync-from-cloud.js');
    const args       = req.body && req.body.full ? ['--full'] : [];

    const child = spawn(process.execPath, [scriptPath, ...args], {
        env: { ...process.env },
        cwd: path.join(__dirname, '..'),
    });

    let output = '';
    let errorOutput = '';
    child.stdout.on('data', c => { output += c.toString(); });
    child.stderr.on('data', c => { errorOutput += c.toString(); });

    res.status(202).json({
        message: 'Descarga desde la nube iniciada.',
        full:    args.includes('--full'),
    });

    child.on('close', code => {
        const label = args.includes('--full') ? 'completa' : 'incremental';
        if (code === 0) console.log(`[sync/from-cloud] Descarga ${label} OK.`);
        else {
            console.error(`[sync/from-cloud] Termino con codigo ${code}.`);
            if (errorOutput) console.error(errorOutput);
        }
        if (output) console.log(output);
    });

    child.on('error', err => {
        console.error('[sync/from-cloud] Error al lanzar proceso:', err.message);
    });
});

module.exports = router;
