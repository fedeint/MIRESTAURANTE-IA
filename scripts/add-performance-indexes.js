/**
 * add-performance-indexes.js
 *
 * Creates PostgreSQL indexes that accelerate the most frequent dashboard,
 * kitchen, and warehouse queries in this restaurant management system.
 *
 * Safe to run multiple times — all statements use IF NOT EXISTS.
 *
 * Usage:
 *   node scripts/add-performance-indexes.js
 */

require('dotenv').config();
const db = require('../db');

const indexes = [
    // facturas: dashboard date-range filters (fecha::date = CURRENT_DATE, last 30 days)
    'CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha)',
    'CREATE INDEX IF NOT EXISTS idx_facturas_fecha_date ON facturas((fecha::date))',

    // pedidos: kitchen view filters by mesa + estado; dashboard estado + created_at
    'CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_estado ON pedidos(mesa_id, estado)',
    'CREATE INDEX IF NOT EXISTS idx_pedidos_estado_created ON pedidos(estado, created_at)',

    // pedido_items: kitchen polling (items by pedido and estado)
    'CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido_estado ON pedido_items(pedido_id, estado)',

    // mesas: floor-plan status queries
    'CREATE INDEX IF NOT EXISTS idx_mesas_estado ON mesas(estado)',

    // productos: category-grouped catalog queries
    'CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria)',

    // almacen_ingredientes: stock alert queries (tenant-scoped, activo filter, stock comparison)
    'CREATE INDEX IF NOT EXISTS idx_almacen_ingredientes_tenant_activo ON almacen_ingredientes(tenant_id, activo)',
    'CREATE INDEX IF NOT EXISTS idx_almacen_ingredientes_stock ON almacen_ingredientes(tenant_id, activo, stock_actual, stock_minimo)',

    // detalle_factura: JOIN on factura_id and producto_id (top-products aggregation)
    'CREATE INDEX IF NOT EXISTS idx_detalle_factura_factura ON detalle_factura(factura_id)',
    'CREATE INDEX IF NOT EXISTS idx_detalle_factura_producto ON detalle_factura(producto_id)',
];

async function run() {
    console.log('Adding performance indexes to PostgreSQL (Supabase)...\n');
    let ok = 0;
    let failed = 0;

    for (const sql of indexes) {
        // Extract index name for readable output
        const match = sql.match(/idx_\w+/);
        const name = match ? match[0] : sql.substring(0, 60);
        try {
            await db.query(sql);
            console.log(`  OK   ${name}`);
            ok++;
        } catch (err) {
            console.error(`  FAIL ${name}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\nDone. ${ok} indexes created/verified, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Unexpected error:', err.message);
    process.exit(1);
});
