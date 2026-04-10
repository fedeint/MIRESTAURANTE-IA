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
        max: Number(process.env.DB_POOL_SIZE) || 3,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
    };
} else {
    // Cloud mode with individual env vars (legacy / manual Supabase setup)
    poolConfig = {
        host:     process.env.DB_HOST,
        port:     Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE || 'postgres',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: { rejectUnauthorized: false },
        max: Number(process.env.DB_POOL_SIZE) || 3,
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
        const _t0 = Date.now();
        const pgResult = await pgNativeQuery(converted.sql, converted.params);
        const _dur = Date.now() - _t0;
        if (_dur > 500) {
            console.warn(`[SLOW QUERY] ${_dur}ms — ${sql.substring(0, 120)}`);
        }

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

        // Performance indexes — each wrapped individually so a missing table
        // (e.g. session) never blocks the rest of startup.
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_estado ON pedidos(mesa_id, estado)',
            'CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido_id ON pedido_items(pedido_id)',
            'CREATE INDEX IF NOT EXISTS idx_pedido_items_estado ON pedido_items(estado)',
            'CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha)',
            'CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario)',
            'CREATE INDEX IF NOT EXISTS idx_mesas_estado ON mesas(estado)',
            'CREATE INDEX IF NOT EXISTS idx_mesas_mesero ON mesas(mesero_asignado_id)',
            'CREATE INDEX IF NOT EXISTS idx_detalle_factura_factura ON detalle_factura(factura_id)',
            'CREATE INDEX IF NOT EXISTS idx_detalle_factura_producto ON detalle_factura(producto_id)',
            'CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire)',
            'CREATE INDEX IF NOT EXISTS idx_facturas_tenant_fecha ON facturas(tenant_id, fecha)',
            'CREATE INDEX IF NOT EXISTS idx_cajas_tenant_estado ON cajas(tenant_id, estado)',
            'CREATE INDEX IF NOT EXISTS idx_pedido_items_estado_created ON pedido_items(estado, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_caja_movimientos_caja ON caja_movimientos(caja_id, anulado)',
        ];
        for (const sql of indexes) {
            try { await pgNativeQuery(sql); } catch (_) {}
        }

        // Observability tables
        try {
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS audit_log (
                id BIGSERIAL PRIMARY KEY, tenant_id INT NOT NULL, user_id INT,
                action VARCHAR(50) NOT NULL, entity VARCHAR(50) NOT NULL, entity_id INT,
                old_data JSONB, new_data JSONB, ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS login_history (
                id SERIAL PRIMARY KEY, tenant_id INT NOT NULL, user_id INT NOT NULL,
                ip_address VARCHAR(45), country VARCHAR(5), city VARCHAR(100),
                user_agent VARCHAR(300), success BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery('CREATE INDEX IF NOT EXISTS idx_audit_tenant_date ON audit_log(tenant_id, created_at DESC)');
            await pgNativeQuery('CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at DESC)');
        } catch (_) {}

        // ── Observability tables (012_observabilidad safety net) ──────────────
        try {
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS modulo_usage (
                id SERIAL PRIMARY KEY,
                tenant_id INT NOT NULL,
                modulo VARCHAR(50) NOT NULL,
                fecha DATE NOT NULL,
                hits INT DEFAULT 1,
                UNIQUE(tenant_id, modulo, fecha)
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS kpi_snapshots (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(50) NOT NULL UNIQUE,
                datos JSONB,
                calculado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS alertas_estado (
                id SERIAL PRIMARY KEY,
                regla VARCHAR(80) NOT NULL UNIQUE,
                ultimo_envio TIMESTAMP,
                conteo INT DEFAULT 0,
                silenciado_hasta TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS alertas_configuracion (
                id SERIAL PRIMARY KEY,
                regla VARCHAR(80) NOT NULL UNIQUE,
                umbral JSONB,
                severidad VARCHAR(20) DEFAULT 'media',
                canal VARCHAR(30) DEFAULT 'email',
                activa BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS ip_blacklist (
                id SERIAL PRIMARY KEY,
                ip VARCHAR(45) NOT NULL UNIQUE,
                razon VARCHAR(200),
                tipo VARCHAR(30) DEFAULT 'auto',
                bloqueado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expira_en TIMESTAMP,
                hits_bloqueados INT DEFAULT 0
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS ip_whitelist (
                id SERIAL PRIMARY KEY,
                ip VARCHAR(45) NOT NULL UNIQUE,
                descripcion VARCHAR(200),
                agregado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS ataques_log (
                id SERIAL PRIMARY KEY,
                ip VARCHAR(45) NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                ruta VARCHAR(300),
                requests_por_minuto INT,
                pais VARCHAR(5),
                ciudad VARCHAR(100),
                lat DECIMAL(10,7),
                lon DECIMAL(10,7),
                accion_tomada VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE UNLOGGED TABLE IF NOT EXISTS request_counts (
                id BIGSERIAL PRIMARY KEY,
                ip VARCHAR(45) NOT NULL,
                ruta VARCHAR(300),
                status_code SMALLINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS session_geo (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(128) NOT NULL UNIQUE,
                tenant_id INT,
                usuario_id INT,
                ip VARCHAR(45),
                pais VARCHAR(5),
                ciudad VARCHAR(100),
                lat DECIMAL(10,7),
                lon DECIMAL(10,7),
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
        } catch (_) {}

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

        // ALTER tenants — add geo columns (ignore if already exist)
        try { await pgNativeQuery(`ALTER TABLE tenants ADD COLUMN geo_lat DECIMAL(10,7)`); } catch (_) {}
        try { await pgNativeQuery(`ALTER TABLE tenants ADD COLUMN geo_lon DECIMAL(10,7)`); } catch (_) {}

        // Observability indexes
        const obsIndexes = [
            'CREATE INDEX IF NOT EXISTS idx_facturas_fecha_tenant ON facturas(fecha, tenant_id)',
            'CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_tenant ON pedidos(fecha, tenant_id)',
            'CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_request_counts_ip_created ON request_counts(ip, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_request_counts_created ON request_counts(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_ataques_log_ip ON ataques_log(ip, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_modulo_usage_tenant_fecha ON modulo_usage(tenant_id, fecha)',
            'CREATE INDEX IF NOT EXISTS idx_session_geo_tenant ON session_geo(tenant_id, last_seen)',
            'CREATE INDEX IF NOT EXISTS idx_ip_blacklist_expira ON ip_blacklist(expira_en)',
        ];
        for (const sql of obsIndexes) {
            try { await pgNativeQuery(sql); } catch (_) {}
        }

        // ── Knowledge Base table (agentes_knowledge_base) ─────────────────
        try {
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS agentes_knowledge_base (
                id SERIAL PRIMARY KEY,
                tenant_id INT NOT NULL,
                categoria VARCHAR(50) NOT NULL,
                clave VARCHAR(100) NOT NULL,
                valor TEXT,
                datos JSONB DEFAULT '{}',
                fuente VARCHAR(50) DEFAULT 'sistema',
                updated_at TIMESTAMP DEFAULT NOW()
            )`);
            await pgNativeQuery(`CREATE INDEX IF NOT EXISTS idx_kb_tenant ON agentes_knowledge_base(tenant_id)`);
        } catch (_) {}

        // ── SOSTAC tables (014_sostac safety net) ─────────────────────────
        try {
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS sostac_briefs (
                id SERIAL PRIMARY KEY,
                tenant_id INT NOT NULL,
                datos JSONB NOT NULL DEFAULT '{}',
                generado_por VARCHAR(50) DEFAULT 'delfino',
                version INT DEFAULT 1,
                activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS sostac_situacion (
                id SERIAL PRIMARY KEY,
                tenant_id INT NOT NULL,
                brief_id INT REFERENCES sostac_briefs(id) ON DELETE SET NULL,
                datos JSONB NOT NULL DEFAULT '{}',
                periodo VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS sostac_objetivos (
                id SERIAL PRIMARY KEY,
                tenant_id INT NOT NULL,
                brief_id INT REFERENCES sostac_briefs(id) ON DELETE SET NULL,
                titulo VARCHAR(200) NOT NULL,
                tipo VARCHAR(20) DEFAULT 'smart',
                metrica VARCHAR(100),
                valor_actual DECIMAL(12,2),
                valor_objetivo DECIMAL(12,2),
                fecha_limite DATE,
                estado VARCHAR(20) DEFAULT 'activo',
                progreso INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgNativeQuery(`CREATE INDEX IF NOT EXISTS idx_sostac_briefs_tenant ON sostac_briefs(tenant_id, activo)`);
            await pgNativeQuery(`CREATE INDEX IF NOT EXISTS idx_sostac_situacion_brief ON sostac_situacion(brief_id, tenant_id)`);
            await pgNativeQuery(`CREATE INDEX IF NOT EXISTS idx_sostac_objetivos_brief ON sostac_objetivos(brief_id, tenant_id)`);
        } catch (_) {}

        // ── Config PWA tables (5 pantallas de configuración mobile) ──────
        try {
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS tenant_dallia_config (
                tenant_id   INT          NOT NULL PRIMARY KEY,
                config_json JSONB        NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS tenant_alertas_config (
                tenant_id   INT          NOT NULL PRIMARY KEY,
                config_json JSONB        NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS tenant_modulos (
                tenant_id   INT          NOT NULL PRIMARY KEY,
                config_json JSONB        NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS tenant_horarios (
                tenant_id   INT          NOT NULL PRIMARY KEY,
                config_json JSONB        NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )`);
            await pgNativeQuery(`CREATE TABLE IF NOT EXISTS tenant_tour_estado (
                tenant_id   INT          NOT NULL PRIMARY KEY,
                completados SMALLINT     NOT NULL DEFAULT 0,
                updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            )`);
        } catch (_) {}

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
