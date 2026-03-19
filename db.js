require('dotenv').config();
const { Pool } = require('pg');

// ── Mode detection ────────────────────────────────────────────────────────────
// MODO=local  → local PostgreSQL (no SSL, restaurant's Mac/laptop)
// MODO=cloud  → Supabase (default, used on Vercel and when internet is available)
const MODO = (process.env.MODO || 'cloud').toLowerCase();
const IS_LOCAL = MODO === 'local';

// ── Pool configuration ────────────────────────────────────────────────────────
let poolConfig;

if (IS_LOCAL) {
    // Local mode: connect to local PostgreSQL — no SSL, lower pool size,
    // faster timeouts so the app fails quickly if pg is not running.
    poolConfig = {
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/dignita_local',
        // No SSL for local connections
        max: Number(process.env.DB_POOL_SIZE) || 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    };
} else if (process.env.DATABASE_URL) {
    // Cloud mode with DATABASE_URL (Vercel / Supabase connection string).
    // IMPORTANT: Vercel serverless functions can spin up many instances in parallel.
    // A pool size of 50 per instance will exhaust Supabase's connection limit
    // (typically 60 on the free tier) very quickly, causing connection errors.
    // Keep the per-instance pool small (2-5) for serverless environments.
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: Number(process.env.DB_POOL_SIZE) || 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
    };
} else {
    // Cloud mode with individual env vars (legacy / manual Supabase setup)
    poolConfig = {
        host:     process.env.DB_HOST     || 'db.vfltsjcktxgmqbrzwthn.supabase.co',
        port:     Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE || 'postgres',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: { rejectUnauthorized: false },
        max: Number(process.env.DB_POOL_SIZE) || 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
    };
}

const pgPool = new Pool(poolConfig);

// Preserve the original pg Pool.query before we override it
const pgNativeQuery = pgPool.query.bind(pgPool);

/**
 * Convert MySQL-style ? placeholders to PostgreSQL $1, $2, $3 placeholders.
 * Also handles array placeholders like IN (?) by expanding them.
 */
function convertPlaceholders(sql, params) {
    if (!params || params.length === 0) return { sql, params: [] };

    const flatParams = [];
    let paramIndex = 0;
    let result = '';
    let i = 0;

    while (i < sql.length) {
        if (sql[i] === '?') {
            const param = params[paramIndex];
            if (Array.isArray(param)) {
                // Expand array for IN (?) -> IN ($n, $n+1, ...)
                if (param.length === 0) {
                    // Empty array: use a value that never matches (NULL)
                    flatParams.push(null);
                    result += `$${flatParams.length}`;
                } else {
                    const pgPlaceholders = param.map(val => {
                        flatParams.push(val);
                        return `$${flatParams.length}`;
                    }).join(', ');
                    result += pgPlaceholders;
                }
            } else {
                flatParams.push(param);
                result += `$${flatParams.length}`;
            }
            paramIndex++;
        } else {
            result += sql[i];
        }
        i++;
    }

    return { sql: result, params: flatParams };
}

/**
 * Wrap pg query result to match mysql2's [rows] return format.
 * MySQL2: returns [rows, fields] where rows is array of row objects.
 * PostgreSQL pg: returns { rows, rowCount, ... }
 *
 * We return [rows] so existing patterns work:
 *   const [rows] = await db.query(...)      => rows is array
 *   const [[row]] = await db.query(...)     => row is rows[0]
 *   result.insertId                          => from RETURNING id
 *   result.affectedRows                     => from rowCount
 */
async function wrappedQuery(sql, params) {
    const converted = convertPlaceholders(sql, params || []);

    try {
        // Use the native pg query (not the overridden wrapper) to avoid infinite recursion
        const pgResult = await pgNativeQuery(converted.sql, converted.params);

        // Build a result object that mirrors mysql2's structure
        const rows = pgResult.rows || [];

        // Support result.insertId for INSERT ... RETURNING id
        const insertId = rows.length > 0 && rows[0].id != null ? rows[0].id : null;

        // Support result.affectedRows (maps to rowCount)
        const affectedRows = pgResult.rowCount != null ? pgResult.rowCount : rows.length;

        // Attach mysql2-compat properties to rows array
        rows.insertId = insertId;
        rows.affectedRows = affectedRows;
        rows.rowCount = pgResult.rowCount;

        // Return [rows] to match mysql2 destructuring: const [rows] = await db.query(...)
        // For const [[single]] = await db.query(...), rows[0] gives the single row.
        return [rows];
    } catch (err) {
        // Re-throw with original SQL for debugging
        err.originalSql = converted.sql;
        throw err;
    }
}

/**
 * Wrap a pg PoolClient to provide mysql2-compatible interface.
 * Used by code that calls db.getConnection() for transactions.
 */
function wrapConnection(client) {
    return {
        query: async (sql, params) => {
            const converted = convertPlaceholders(sql, params || []);
            const pgResult = await client.query(converted.sql, converted.params);
            const rows = pgResult.rows || [];
            rows.insertId = rows.length > 0 && rows[0].id != null ? rows[0].id : null;
            rows.affectedRows = pgResult.rowCount != null ? pgResult.rowCount : rows.length;
            rows.rowCount = pgResult.rowCount;
            return [rows];
        },
        beginTransaction: () => client.query('BEGIN'),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release()
    };
}

/**
 * Provide pool.getConnection() compatible API.
 */
pgPool.getConnection = async function () {
    const client = await pgPool.connect();
    return wrapConnection(client);
};

/**
 * Attach the query wrapper to the pool export so callers can do:
 *   const db = require('./db');
 *   const [rows] = await db.query(sql, params);
 */
pgPool.query = wrappedQuery;

/**
 * ensureSchema - run on startup to create missing tables / columns.
 * PostgreSQL equivalents of the MySQL-specific DDL.
 */
async function ensureSchema() {
    try {
        // Tabla de pagos por factura (pago mixto)
        await pgPool.query(`
            CREATE TABLE IF NOT EXISTS factura_pagos (
                id SERIAL PRIMARY KEY,
                factura_id INT NOT NULL,
                metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta')),
                monto DECIMAL(10,2) NOT NULL,
                referencia VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE
            )
        `);

        // Verificar columna forma_pago en facturas (PostgreSQL usa information_schema)
        const [cols] = await pgPool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'facturas'
              AND column_name = 'forma_pago'
            LIMIT 1
        `);
        // No ALTER TYPE in PostgreSQL for CHECK constraints without dropping/recreating;
        // we skip the ENUM alteration — the column type in Postgres will be VARCHAR or TEXT.

        // Agregar columna imagen a productos si no existe
        try {
            await pgPool.query(`ALTER TABLE productos ADD COLUMN imagen TEXT NULL`);
        } catch (_ignore) {
            // Column already exists, ignore
        }
    } catch (err) {
        console.error('ensureSchema() falló:', err.message || err);
    }
}

// Verify connection on startup
pgPool.connect()
    .then(client => {
        const modeLabel = IS_LOCAL ? 'LOCAL (postgresql://localhost/dignita_local)' : 'Supabase (nube)';
        console.log(`Conexion exitosa a PostgreSQL - modo: ${modeLabel}`);
        client.release();
        ensureSchema();
    })
    .catch(err => {
        console.error('Error al conectar a la base de datos PostgreSQL:', err.message || err);
        if (IS_LOCAL) {
            console.error('Asegurate de que PostgreSQL este corriendo localmente.');
            console.error('Inicia con: brew services start postgresql@15');
        }
    });

// Expose current mode for other modules (e.g. routes/sync.js)
pgPool.MODO      = MODO;
pgPool.IS_LOCAL  = IS_LOCAL;

module.exports = pgPool;
