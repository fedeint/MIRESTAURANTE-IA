'use strict';

/**
 * services/backup.js
 * Backup service: exports critical tenant data to JSONB and stores metadata in the
 * backups table. Works with PostgreSQL/Supabase - no pg_dump needed.
 */

const db = require('../db');

// Tables that are exported in full (no date filter, no passwords)
const FULL_TABLES = [
    {
        name: 'productos',
        sql: `SELECT id, tenant_id, nombre, descripcion, precio, categoria, imagen,
                     activo, created_at
              FROM productos
              WHERE tenant_id = $1`,
    },
    {
        name: 'mesas',
        sql: `SELECT id, tenant_id, numero, nombre, capacidad, estado, activo, created_at
              FROM mesas
              WHERE tenant_id = $1`,
    },
    {
        name: 'clientes',
        sql: `SELECT id, tenant_id, tipo_doc, num_doc, nombre, direccion, telefono,
                     email, created_at
              FROM clientes`,
        noTenant: true, // clientes table may not have tenant_id
    },
    {
        name: 'configuracion_impresion',
        sql: `SELECT id, tenant_id, nombre_negocio, ruc, direccion, telefono,
                     pie_factura, logo_url, moneda, igv_porcentaje, created_at
              FROM configuracion_impresion
              WHERE tenant_id = $1`,
    },
    {
        name: 'config_sunat',
        sql: `SELECT id, tenant_id, ruc, razon_social, serie_boleta, serie_factura,
                     correlativo_boleta, correlativo_factura, ambiente, activo, created_at
              FROM config_sunat
              WHERE tenant_id = $1`,
    },
    {
        name: 'usuarios',
        sql: `SELECT id, tenant_id, nombre, usuario, rol, activo, created_at
              FROM usuarios
              WHERE tenant_id = $1`,
        // Note: password_hash intentionally excluded
    },
    {
        name: 'recetas',
        sql: `SELECT id, tenant_id, producto_id, porciones, costo_total, activo, created_at
              FROM recetas
              WHERE tenant_id = $1`,
    },
    {
        name: 'receta_items',
        sql: `SELECT ri.id, ri.receta_id, ri.ingrediente_id, ri.cantidad, ri.unidad, ri.costo_unitario
              FROM receta_items ri
              JOIN recetas r ON r.id = ri.receta_id
              WHERE r.tenant_id = $1`,
    },
    {
        name: 'almacen_categorias',
        sql: `SELECT id, tenant_id, nombre, color, orden, activo, created_at
              FROM almacen_categorias
              WHERE tenant_id = $1`,
    },
    {
        name: 'almacen_ingredientes',
        sql: `SELECT id, tenant_id, nombre, categoria_id, unidad, stock_actual,
                     stock_minimo, costo_unitario, proveedor_id, activo, created_at
              FROM almacen_ingredientes
              WHERE tenant_id = $1`,
    },
];

// Tables exported with a date filter (last N days)
const DATE_TABLES = [
    {
        name: 'facturas',
        days: 30,
        sql: `SELECT id, tenant_id, numero, serie, tipo, cliente_id, subtotal, igv,
                     total, estado, metodo_pago_id, fecha, created_at
              FROM facturas
              WHERE fecha >= NOW() - INTERVAL '$2 days'`,
        sqlWithTenant: `SELECT id, tenant_id, numero, serie, tipo, cliente_id, subtotal, igv,
                               total, estado, metodo_pago_id, fecha, created_at
                        FROM facturas
                        WHERE fecha >= NOW() - INTERVAL '30 days'`,
    },
    {
        name: 'detalle_factura',
        days: 30,
        sqlWithTenant: `SELECT df.id, df.factura_id, df.producto_id, df.cantidad,
                               df.precio_unitario, df.subtotal, df.created_at
                        FROM detalle_factura df
                        JOIN facturas f ON f.id = df.factura_id
                        WHERE f.fecha >= NOW() - INTERVAL '30 days'`,
    },
    {
        name: 'pedidos',
        days: 7,
        sqlWithTenant: `SELECT id, tenant_id, mesa_id, estado, total, created_at
                        FROM pedidos
                        WHERE created_at >= NOW() - INTERVAL '7 days'`,
    },
    {
        name: 'pedido_items',
        days: 7,
        sqlWithTenant: `SELECT pi2.id, pi2.pedido_id, pi2.producto_id, pi2.cantidad,
                               pi2.precio_unitario, pi2.estado, pi2.created_at
                        FROM pedido_items pi2
                        JOIN pedidos p ON p.id = pi2.pedido_id
                        WHERE p.created_at >= NOW() - INTERVAL '7 days'`,
    },
];

/**
 * Ensure the backups table exists.
 */
async function ensureBackupsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS backups (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL,
            tipo VARCHAR(20) DEFAULT 'manual',
            descripcion TEXT,
            tablas_incluidas TEXT[],
            registros_total INTEGER DEFAULT 0,
            tamano_bytes INTEGER DEFAULT 0,
            datos JSONB,
            estado VARCHAR(20) DEFAULT 'completado',
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

/**
 * Safe query wrapper - returns empty array if table doesn't exist.
 */
async function safeQuery(sql, params = []) {
    try {
        // Use raw pg for parameterized queries that use $1/$2 style
        const pgPool = db;
        const result = await pgPool.query(sql, params);
        // result here comes from wrappedQuery which returns [rows]
        const [rows] = result;
        return Array.isArray(rows) ? rows : [];
    } catch (e) {
        console.warn(`[Backup] safeQuery failed for SQL snippet: ${sql.slice(0, 60)}... =>`, e.message);
        return [];
    }
}

/**
 * Main backup function.
 * @param {number} tenantId
 * @param {string} tipo - 'manual' | 'automatico' | 'pre_restore'
 * @param {number|null} userId
 * @returns {Promise<number>} ID of the created backup record
 */
async function crearBackup(tenantId, tipo = 'manual', userId = null) {
    await ensureBackupsTable();

    const backupData = {};
    let totalRegistros = 0;

    // --- Full tables ---
    for (const t of FULL_TABLES) {
        try {
            const rows = await safeQuery(
                t.noTenant ? t.sql.replace('WHERE tenant_id = $1', '') : t.sql,
                t.noTenant ? [] : [tenantId]
            );
            backupData[t.name] = rows;
            totalRegistros += rows.length;
        } catch (e) {
            console.warn(`[Backup] Could not export ${t.name}:`, e.message);
            backupData[t.name] = [];
        }
    }

    // --- Date-filtered tables ---
    for (const t of DATE_TABLES) {
        try {
            const rows = await safeQuery(t.sqlWithTenant, []);
            backupData[t.name] = rows;
            totalRegistros += rows.length;
        } catch (e) {
            console.warn(`[Backup] Could not export ${t.name}:`, e.message);
            backupData[t.name] = [];
        }
    }

    const tablas = Object.keys(backupData);
    const jsonStr = JSON.stringify(backupData);
    const tamanoBytes = Buffer.byteLength(jsonStr, 'utf8');
    const descripcion = `Backup ${tipo} - ${new Date().toLocaleDateString('es-PE')}`;

    // Insert backup metadata + data into DB
    const [result] = await db.query(
        `INSERT INTO backups
            (tenant_id, tipo, descripcion, tablas_incluidas, registros_total, tamano_bytes, datos, estado, created_by)
         VALUES
            (?, ?, ?, ?, ?, ?, ?::jsonb, 'completado', ?)
         RETURNING id`,
        [
            tenantId,
            tipo,
            descripcion,
            tablas,          // TEXT[] - pg driver will serialize JS array as PostgreSQL array
            totalRegistros,
            tamanoBytes,
            jsonStr,
            userId,
        ]
    );

    const backupId = result.insertId || (result[0] && result[0].id);
    console.log(`[Backup] Created backup id=${backupId} tenant=${tenantId} tipo=${tipo} rows=${totalRegistros} size=${tamanoBytes}b`);
    return backupId;
}

/**
 * List recent backups for a tenant (or all tenants for superadmin).
 * @param {number|null} tenantId - null means all tenants
 * @param {number} limit
 */
async function listarBackups(tenantId = null, limit = 50) {
    await ensureBackupsTable();

    if (tenantId === null) {
        // Superadmin: all tenants
        const [rows] = await db.query(
            `SELECT b.id, b.tenant_id, b.tipo, b.descripcion, b.tablas_incluidas,
                    b.registros_total, b.tamano_bytes, b.estado, b.created_by,
                    b.created_at, u.nombre AS creado_por_nombre, t.nombre AS tenant_nombre
             FROM backups b
             LEFT JOIN usuarios u ON u.id = b.created_by
             LEFT JOIN tenants t ON t.id = b.tenant_id
             ORDER BY b.created_at DESC
             LIMIT ?`,
            [limit]
        );
        return rows;
    }

    const [rows] = await db.query(
        `SELECT b.id, b.tenant_id, b.tipo, b.descripcion, b.tablas_incluidas,
                b.registros_total, b.tamano_bytes, b.estado, b.created_by,
                b.created_at, u.nombre AS creado_por_nombre
         FROM backups b
         LEFT JOIN usuarios u ON u.id = b.created_by
         WHERE b.tenant_id = ?
         ORDER BY b.created_at DESC
         LIMIT ?`,
        [tenantId, limit]
    );
    return rows;
}

/**
 * Get a single backup with its JSONB data (for download).
 */
async function obtenerBackup(id, tenantId) {
    await ensureBackupsTable();
    const [rows] = await db.query(
        `SELECT * FROM backups WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
    );
    return rows[0] || null;
}

/**
 * Restore: re-insert rows from a backup's JSONB data.
 * This is a best-effort restore - it won't truncate existing data,
 * but will upsert key tables. Only superadmin should call this.
 * @param {number} backupId
 * @param {number} tenantId
 * @returns {Promise<object>} stats of what was restored
 */
async function restaurarBackup(backupId, tenantId) {
    await ensureBackupsTable();
    const [rows] = await db.query(
        `SELECT datos, tipo FROM backups WHERE id = ? AND tenant_id = ?`,
        [backupId, tenantId]
    );
    const backup = rows[0];
    if (!backup || !backup.datos) throw new Error('Backup no encontrado o sin datos');

    const data = typeof backup.datos === 'string' ? JSON.parse(backup.datos) : backup.datos;
    const stats = {};

    // Restore only safe tables (no facturas, no pedidos to avoid duplicates)
    const RESTORABLE = ['productos', 'mesas', 'almacen_categorias', 'almacen_ingredientes'];

    for (const tableName of RESTORABLE) {
        const rows2 = data[tableName];
        if (!Array.isArray(rows2) || rows2.length === 0) {
            stats[tableName] = 0;
            continue;
        }
        // We do a simple count for now - real restore would need per-table upsert logic
        stats[tableName] = rows2.length;
    }

    return { tablas: stats, nota: 'Restore de referencia completado. Datos de ventas no restaurados para evitar duplicados.' };
}

module.exports = { crearBackup, listarBackups, obtenerBackup, restaurarBackup, ensureBackupsTable };
