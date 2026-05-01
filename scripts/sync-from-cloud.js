#!/usr/bin/env node
/**
 * sync-from-cloud.js
 * Downloads data from the cloud (Supabase) PostgreSQL database to the local
 * PostgreSQL instance. Use this:
 *   1. Once during initial local setup (populates local DB with all cloud data)
 *   2. At the start of each day to keep local in sync with cloud changes
 *
 * Usage:
 *   node scripts/sync-from-cloud.js
 *   npm run sync:from-cloud
 *
 *   # Force a full download (ignore last sync timestamp):
 *   node scripts/sync-from-cloud.js --full
 *
 * Requirements:
 *   - CLOUD_DATABASE_URL env var must be set in .env.local
 *   - Local database must be running at postgresql://localhost:5432/dignita_local
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');

// ── Connection pools ──────────────────────────────────────────────────────────

const LOCAL_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/dignita_local';
const CLOUD_DB_URL = process.env.CLOUD_DATABASE_URL;
const FULL_SYNC    = process.argv.includes('--full');

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
});

const cloudPool = new Pool({
    connectionString: CLOUD_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
});

// ── Tables to download (ordered by foreign key dependencies) ──────────────────
// These are all meaningful operational tables. Configuration/meta tables
// like tenants, configuracion_impresion, etc. are included so the local DB
// is fully operational without the cloud.

const DOWNLOAD_TABLES = [
    // Reference / configuration
    { name: 'tenants',               hasUpdatedAt: true  },
    { name: 'usuarios',              hasUpdatedAt: true  },
    { name: 'categorias',            hasUpdatedAt: false },
    { name: 'metodos_pago',          hasUpdatedAt: false },
    { name: 'configuracion_impresion', hasUpdatedAt: false },
    { name: 'configuracion_sistema', hasUpdatedAt: false },
    { name: 'configuracion_igv',     hasUpdatedAt: false },
    { name: 'configuracion_sunat',   hasUpdatedAt: false },
    // Core operational
    { name: 'clientes',              hasUpdatedAt: false },
    { name: 'productos',             hasUpdatedAt: true  },
    { name: 'producto_hijos',        hasUpdatedAt: false },
    { name: 'mesas',                 hasUpdatedAt: false },
    { name: 'modificadores',         hasUpdatedAt: false },
    { name: 'modificador_opciones',  hasUpdatedAt: false },
    { name: 'producto_modificadores', hasUpdatedAt: false },
    // Inventory
    { name: 'proveedores',           hasUpdatedAt: true  },
    { name: 'almacen_ingredientes',  hasUpdatedAt: true  },
    { name: 'almacen_unidades',      hasUpdatedAt: false },
    { name: 'recetas',               hasUpdatedAt: false },
    { name: 'receta_ingredientes',   hasUpdatedAt: false },
    // Transactions
    { name: 'cajas',                 hasUpdatedAt: false },
    { name: 'pedidos',               hasUpdatedAt: true  },
    { name: 'pedido_items',          hasUpdatedAt: true  },
    { name: 'facturas',              hasUpdatedAt: false },
    { name: 'detalle_factura',       hasUpdatedAt: false },
    { name: 'factura_pagos',         hasUpdatedAt: false },
    { name: 'caja_movimientos',      hasUpdatedAt: false },
    // Staff / admin
    { name: 'personal',              hasUpdatedAt: false },
    { name: 'gastos',                hasUpdatedAt: false },
    { name: 'gastos_categorias',     hasUpdatedAt: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getLastSyncAt(localClient) {
    const res = await localClient.query(
        "SELECT last_sync_at FROM sync_state WHERE direction = 'from_cloud' LIMIT 1"
    );
    return res.rows.length > 0 ? res.rows[0].last_sync_at : new Date(0);
}

async function setLastSyncAt(localClient, ts) {
    await localClient.query(
        "UPDATE sync_state SET last_sync_at = $1 WHERE direction = 'from_cloud'",
        [ts]
    );
}

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
 * Upsert a row from cloud into local DB.
 * Uses INSERT ... ON CONFLICT (id) DO UPDATE SET ...
 * with last-write-wins on updated_at when present.
 */
async function upsertLocalRow(localClient, tableName, columns, row, hasUpdatedAt) {
    const colList   = columns.map(c => `"${c}"`).join(', ');
    const valPlaces = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values    = columns.map(c => row[c] !== undefined ? row[c] : null);

    // Primary key conflict strategy: check if table has a single 'id' column
    const hasSingleId = columns.includes('id');
    if (!hasSingleId) {
        // Composite PK tables (e.g. producto_hijos) — use INSERT ... ON CONFLICT DO NOTHING
        const sql = `INSERT INTO ${tableName} (${colList}) VALUES (${valPlaces}) ON CONFLICT DO NOTHING`;
        await localClient.query(sql, values);
        return;
    }

    const updateCols = columns.filter(c => c !== 'id' && c !== 'created_at');
    const updateSet  = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

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

    await localClient.query(sql, values);
}

async function downloadTable(tableName, cloudClient, localClient, since, hasUpdatedAt) {
    // Discover columns
    let cloudCols;
    try {
        cloudCols = await getTableColumns(cloudPool, tableName);
    } catch (_) {
        console.log(`  [SKIP] ${tableName} - tabla no encontrada en la nube`);
        return 0;
    }

    let localCols;
    try {
        localCols = await getTableColumns(localPool, tableName);
    } catch (_) {
        console.log(`  [SKIP] ${tableName} - tabla no encontrada en local`);
        return 0;
    }

    const sharedCols = cloudCols.filter(c => localCols.includes(c));

    // Fetch rows from cloud
    let rows;
    if (FULL_SYNC) {
        const res = await cloudClient.query(
            `SELECT * FROM ${tableName} ORDER BY id`
        );
        rows = res.rows;
    } else if (hasUpdatedAt) {
        const res = await cloudClient.query(
            `SELECT * FROM ${tableName}
             WHERE updated_at > $1 OR created_at > $1
             ORDER BY id`,
            [since]
        );
        rows = res.rows;
    } else {
        const hasCa = cloudCols.includes('created_at');
        if (hasCa) {
            const res = await cloudClient.query(
                `SELECT * FROM ${tableName} WHERE created_at > $1 ORDER BY id`,
                [since]
            );
            rows = res.rows;
        } else {
            // No timestamp column — download everything (small reference tables)
            const res = await cloudClient.query(`SELECT * FROM ${tableName} ORDER BY id`);
            rows = res.rows;
        }
    }

    if (rows.length === 0) return 0;

    let downloaded = 0;
    for (const row of rows) {
        try {
            await upsertLocalRow(localClient, tableName, sharedCols, row, hasUpdatedAt);
            downloaded++;
        } catch (err) {
            const rowId = row.id ?? JSON.stringify(Object.values(row).slice(0, 2));
            console.warn(`  [WARN] ${tableName} id=${rowId}: ${err.message}`);
        }
    }

    return downloaded;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const startTime = new Date();
    const mode      = FULL_SYNC ? 'COMPLETA (--full)' : 'INCREMENTAL';

    console.log('============================================');
    console.log('  mirestconia.com - Descargar desde la Nube');
    console.log(`  Modo: ${mode}`);
    console.log(`  Iniciado: ${startTime.toLocaleString()}`);
    console.log('============================================');

    let localClient, cloudClient;

    try {
        localClient = await localPool.connect();
        cloudClient = await cloudPool.connect();
        console.log('\nConectado a ambas bases de datos.');

        let since;
        if (FULL_SYNC) {
            since = new Date(0);
            console.log('Modo completo: descargando TODOS los registros de la nube.');
        } else {
            since = await getLastSyncAt(localClient);
            console.log(`Descargando cambios desde: ${since instanceof Date ? since.toLocaleString() : since}`);
        }
        console.log('');

        const results = {};
        let totalDownloaded = 0;

        for (const tableConfig of DOWNLOAD_TABLES) {
            process.stdout.write(`  Descargando ${tableConfig.name}...`);
            try {
                const count = await downloadTable(
                    tableConfig.name,
                    cloudClient,
                    localClient,
                    since,
                    tableConfig.hasUpdatedAt
                );
                results[tableConfig.name] = { count, error: null };
                totalDownloaded += count;
                console.log(` ${count} registros`);
            } catch (err) {
                results[tableConfig.name] = { count: 0, error: err.message };
                console.log(` ERROR: ${err.message}`);
            }
        }

        const hasErrors = Object.values(results).some(r => r.error !== null);
        if (!hasErrors) {
            await setLastSyncAt(localClient, startTime);
        } else {
            console.warn('\nHubo errores. El timestamp de sincronizacion NO fue actualizado.');
        }

        // Write to sync_log
        await localClient.query(
            `INSERT INTO sync_log
                (table_name, synced_at, records_sent, records_recv, direction, status, details)
             VALUES ($1, $2, $3, $4, 'from_cloud', $5, $6)`,
            [
                'ALL',
                startTime,
                0,
                totalDownloaded,
                hasErrors ? 'partial' : 'ok',
                JSON.stringify(results),
            ]
        );

        console.log('');
        console.log(`============================================`);
        console.log(`  Total descargado: ${totalDownloaded} registros`);
        console.log(`  Estado: ${hasErrors ? 'PARCIAL (ver errores arriba)' : 'OK'}`);
        console.log(`  Duracion: ${((Date.now() - startTime.getTime()) / 1000).toFixed(1)}s`);
        console.log(`============================================`);

        if (hasErrors) process.exit(2);

    } catch (err) {
        console.error('\nERROR FATAL:', err.message);
        console.error(err.stack);

        if (localClient) {
            try {
                await localClient.query(
                    `INSERT INTO sync_log
                        (table_name, synced_at, records_sent, records_recv, direction, status, error_msg)
                     VALUES ('ALL', $1, 0, 0, 'from_cloud', 'error', $2)`,
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
