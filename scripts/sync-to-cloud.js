#!/usr/bin/env node
/**
 * sync-to-cloud.js
 * Syncs data created/modified in the local PostgreSQL database to the cloud
 * (Supabase) instance. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node scripts/sync-to-cloud.js
 *   npm run sync:to-cloud
 *
 * Requirements:
 *   - CLOUD_DATABASE_URL env var must be set (in .env.local or environment)
 *   - Local database must be running at postgresql://localhost:5432/dignita_local
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');

// ── Connection pools ──────────────────────────────────────────────────────────

const LOCAL_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/dignita_local';
const CLOUD_DB_URL = process.env.CLOUD_DATABASE_URL;

if (!CLOUD_DB_URL) {
    console.error('ERROR: CLOUD_DATABASE_URL no esta configurado en .env.local');
    console.error('Ejemplo: CLOUD_DATABASE_URL=postgresql://postgres:pass@db.xxxx.supabase.co:5432/postgres');
    process.exit(1);
}

const localPool = new Pool({
    connectionString: LOCAL_DB_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    // No SSL for local
});

const cloudPool = new Pool({
    connectionString: CLOUD_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
});

// ── Tables to sync (ordered by foreign key dependencies) ─────────────────────

/**
 * Each entry defines:
 *   - name:        table name
 *   - conflictKey: column(s) to use for ON CONFLICT (usually 'id')
 *   - skipCols:    columns to exclude from sync (e.g. internal sync metadata)
 *   - hasUpdatedAt: whether the table has an updated_at column for change detection
 */
const SYNC_TABLES = [
    { name: 'clientes',              conflictKey: 'id', hasUpdatedAt: false },
    { name: 'productos',             conflictKey: 'id', hasUpdatedAt: true  },
    { name: 'mesas',                 conflictKey: 'id', hasUpdatedAt: false },
    { name: 'pedidos',               conflictKey: 'id', hasUpdatedAt: true  },
    { name: 'pedido_items',          conflictKey: 'id', hasUpdatedAt: true  },
    { name: 'facturas',              conflictKey: 'id', hasUpdatedAt: false },
    { name: 'detalle_factura',       conflictKey: 'id', hasUpdatedAt: false },
    { name: 'factura_pagos',         conflictKey: 'id', hasUpdatedAt: false },
    { name: 'caja_movimientos',      conflictKey: 'id', hasUpdatedAt: false },
    { name: 'almacen_ingredientes',  conflictKey: 'id', hasUpdatedAt: true  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch the last sync timestamp from local sync_state table. */
async function getLastSyncAt(localClient) {
    const res = await localClient.query(
        "SELECT last_sync_at FROM sync_state WHERE direction = 'to_cloud' LIMIT 1"
    );
    return res.rows.length > 0 ? res.rows[0].last_sync_at : new Date(0);
}

/** Update the last sync timestamp in local sync_state table. */
async function setLastSyncAt(localClient, ts) {
    await localClient.query(
        "UPDATE sync_state SET last_sync_at = $1 WHERE direction = 'to_cloud'",
        [ts]
    );
}

/** Discover all column names for a table in the given pool. */
async function getTableColumns(pool, tableName) {
    const res = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = $1
         ORDER BY ordinal_position`,
        [tableName]
    );
    return res.rows.map(r => r.column_name);
}

/**
 * Build and execute an upsert for a single row into the cloud database.
 * Uses INSERT ... ON CONFLICT (id) DO UPDATE SET ... with last-write-wins
 * logic on updated_at (when present).
 */
async function upsertRow(cloudClient, tableName, columns, row, hasUpdatedAt) {
    const colList   = columns.map(c => `"${c}"`).join(', ');
    const valPlaces = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values    = columns.map(c => row[c] !== undefined ? row[c] : null);

    // Columns to update (exclude id, created_at)
    const updateCols = columns.filter(c => c !== 'id' && c !== 'created_at');
    const updateSet  = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

    // When updated_at exists: only overwrite if local row is newer
    const conflictAction = updateCols.length === 0
        ? 'DO NOTHING'
        : hasUpdatedAt
            ? `DO UPDATE SET ${updateSet} WHERE ${tableName}.updated_at IS NULL OR EXCLUDED.updated_at >= ${tableName}.updated_at`
            : `DO UPDATE SET ${updateSet}`;

    const sql = `
        INSERT INTO ${tableName} (${colList})
        VALUES (${valPlaces})
        ON CONFLICT (id) ${conflictAction}
    `;

    await cloudClient.query(sql, values);
}

/**
 * Sync a single table: find rows changed since `since`, upsert them to cloud.
 * Returns count of records processed.
 */
async function syncTable(tableName, localClient, cloudClient, since, hasUpdatedAt) {
    // Discover columns from local schema
    const localCols = await getTableColumns(localPool, tableName);
    if (localCols.length === 0) {
        console.log(`  [SKIP] ${tableName} - tabla no encontrada en local`);
        return 0;
    }

    // Discover columns from cloud schema (only sync columns that exist in both)
    let cloudCols;
    try {
        cloudCols = await getTableColumns(cloudPool, tableName);
    } catch (_) {
        console.log(`  [SKIP] ${tableName} - tabla no encontrada en la nube`);
        return 0;
    }

    const sharedCols = localCols.filter(c => cloudCols.includes(c));

    // Fetch rows changed since last sync
    let rows;
    if (hasUpdatedAt) {
        const res = await localClient.query(
            `SELECT * FROM ${tableName}
             WHERE updated_at > $1 OR created_at > $1
             ORDER BY id`,
            [since]
        );
        rows = res.rows;
    } else {
        // Fall back to created_at only (tables without updated_at)
        const hasCa = localCols.includes('created_at');
        if (hasCa) {
            const res = await localClient.query(
                `SELECT * FROM ${tableName} WHERE created_at > $1 ORDER BY id`,
                [since]
            );
            rows = res.rows;
        } else {
            // No timestamp — sync all rows (safe because of ON CONFLICT DO NOTHING/UPDATE)
            const res = await localClient.query(`SELECT * FROM ${tableName} ORDER BY id`);
            rows = res.rows;
        }
    }

    if (rows.length === 0) return 0;

    let synced = 0;
    for (const row of rows) {
        try {
            await upsertRow(cloudClient, tableName, sharedCols, row, hasUpdatedAt);
            synced++;
        } catch (err) {
            console.warn(`  [WARN] ${tableName} id=${row.id}: ${err.message}`);
        }
    }

    return synced;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const startTime = new Date();
    console.log('============================================');
    console.log('  dignita.tech - Sincronizar a la Nube');
    console.log(`  Iniciado: ${startTime.toLocaleString()}`);
    console.log('============================================');

    let localClient, cloudClient;

    try {
        localClient = await localPool.connect();
        cloudClient = await cloudPool.connect();
        console.log('\nConectado a ambas bases de datos.');

        const since = await getLastSyncAt(localClient);
        console.log(`Sincronizando cambios desde: ${since instanceof Date ? since.toLocaleString() : since}`);
        console.log('');

        const results = {};
        let totalSynced = 0;

        for (const tableConfig of SYNC_TABLES) {
            process.stdout.write(`  Sincronizando ${tableConfig.name}...`);
            try {
                const count = await syncTable(
                    tableConfig.name,
                    localClient,
                    cloudClient,
                    since,
                    tableConfig.hasUpdatedAt
                );
                results[tableConfig.name] = { count, error: null };
                totalSynced += count;
                console.log(` ${count} registros`);
            } catch (err) {
                results[tableConfig.name] = { count: 0, error: err.message };
                console.log(` ERROR: ${err.message}`);
            }
        }

        // Update last sync timestamp only if we had no critical errors
        const hasErrors = Object.values(results).some(r => r.error !== null);
        if (!hasErrors) {
            await setLastSyncAt(localClient, startTime);
        } else {
            console.warn('\nHubo errores en algunas tablas. El timestamp de sincronizacion NO fue actualizado.');
        }

        // Write to sync_log
        await localClient.query(
            `INSERT INTO sync_log
                (table_name, synced_at, records_sent, records_recv, direction, status, details)
             VALUES ($1, $2, $3, $4, 'to_cloud', $5, $6)`,
            [
                'ALL',
                startTime,
                totalSynced,
                0,
                hasErrors ? 'partial' : 'ok',
                JSON.stringify(results),
            ]
        );

        console.log('');
        console.log(`============================================`);
        console.log(`  Total sincronizado: ${totalSynced} registros`);
        console.log(`  Estado: ${hasErrors ? 'PARCIAL (ver errores arriba)' : 'OK'}`);
        console.log(`  Duracion: ${((Date.now() - startTime.getTime()) / 1000).toFixed(1)}s`);
        console.log(`============================================`);

        if (hasErrors) process.exit(2);

    } catch (err) {
        console.error('\nERROR FATAL:', err.message);
        console.error(err.stack);

        // Try to log the error
        if (localClient) {
            try {
                await localClient.query(
                    `INSERT INTO sync_log
                        (table_name, synced_at, records_sent, records_recv, direction, status, error_msg)
                     VALUES ('ALL', $1, 0, 0, 'to_cloud', 'error', $2)`,
                    [startTime, err.message]
                );
            } catch (_) { /* ignore */ }
        }
        process.exit(1);
    } finally {
        if (localClient) localClient.release();
        if (cloudClient) cloudClient.release();
        await localPool.end().catch(() => {});
        await cloudPool.end().catch(() => {});
    }
}

main();
