// scripts/seed-dallia-actions-demo.js
// Seed one tenant, one proveedor, and 3 insumos bajo minimo
// for demoing the DallIA Actions 'Almacen por Conversacion' flow.
//
// USAGE: MODO=local DEMO_PROVEEDOR_PHONE=51987654321 node scripts/seed-dallia-actions-demo.js

'use strict';
const db = require('../db');

async function seed() {
    const tenantId = 1;  // assume tenant 1 exists

    // 1. Proveedor de prueba (con telefono) — use a real number you can receive WhatsApp on
    const TEST_PHONE = process.env.DEMO_PROVEEDOR_PHONE || '51987654321';
    const [existing] = await db.query(
        "SELECT id FROM proveedores WHERE tenant_id=? AND nombre='Proveedor Demo DallIA'",
        [tenantId]
    );
    let proveedorId;
    if (existing.length > 0) {
        proveedorId = existing[0].id;
        console.log('Proveedor demo ya existe, id=', proveedorId);
    } else {
        const [rows] = await db.query(`
            INSERT INTO proveedores (tenant_id, nombre, ruc, telefono, contacto_nombre, tipo, calificacion, activo)
            VALUES (?, 'Proveedor Demo DallIA', '20100000000', ?, 'Contacto Demo', 'mayorista', 5, true)
            RETURNING id
        `, [tenantId, TEST_PHONE]);
        proveedorId = rows[0].id;
        console.log('Proveedor demo creado, id=', proveedorId);
    }

    // 2. Categoria (si no existe)
    const [cats] = await db.query("SELECT id FROM almacen_categorias WHERE tenant_id=? LIMIT 1", [tenantId]);
    let categoriaId = cats[0]?.id;
    if (!categoriaId) {
        const [catRows] = await db.query(`
            INSERT INTO almacen_categorias (tenant_id, nombre) VALUES (?, 'Demo') RETURNING id
        `, [tenantId]);
        categoriaId = catRows[0].id;
    }

    // 3. Insumos bajo minimo para el proveedor de prueba
    const insumos = [
        { nombre: 'Tomate DEMO', codigo: 'T-DEMO', unidad: 'kg', stock: 2, minimo: 10 },
        { nombre: 'Cebolla DEMO', codigo: 'C-DEMO', unidad: 'kg', stock: 0.5, minimo: 5 },
        { nombre: 'Aji amarillo DEMO', codigo: 'A-DEMO', unidad: 'kg', stock: 0, minimo: 3 }
    ];
    for (const i of insumos) {
        const [ex] = await db.query(
            "SELECT id FROM almacen_ingredientes WHERE tenant_id=? AND codigo=?",
            [tenantId, i.codigo]
        );
        if (ex.length > 0) {
            await db.query(
                "UPDATE almacen_ingredientes SET stock_actual=?, stock_minimo=?, proveedor_id=?, activo=true WHERE id=?",
                [i.stock, i.minimo, proveedorId, ex[0].id]
            );
            console.log(`Updated ${i.nombre} (id=${ex[0].id})`);
        } else {
            await db.query(`
                INSERT INTO almacen_ingredientes
                (tenant_id, categoria_id, proveedor_id, codigo, nombre, unidad_medida, unidad_compra,
                 stock_actual, stock_minimo, costo_unitario, activo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, true)
            `, [tenantId, categoriaId, proveedorId, i.codigo, i.nombre, i.unidad, i.unidad, i.stock, i.minimo]);
            console.log(`Created ${i.nombre}`);
        }
    }

    console.log('');
    console.log('Seed complete. Login as admin, open the chat, and type:');
    console.log('  "DallIA, revisa mi stock"');
    console.log('');
    console.log('WhatsApp number:', TEST_PHONE);
    console.log('  -> Send succeeds only if you have an open 24h conversation with this number');
    console.log('  -> Otherwise expect a "ventana cerrada" failure (correct v1 behavior)');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
