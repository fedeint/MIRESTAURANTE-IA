// scripts/seed-demo-pedidos.js
// Seed active pedidos for the consolidated /pedidos view (3 tabs).
// Idempotent: skip if there are already >= 3 active pedidos with notas LIKE 'DEMO_PEDIDO%'.
//
// USAGE: node -r dotenv/config scripts/seed-demo-pedidos.js dotenv_config_path=/tmp/prod.env

'use strict';
const db = require('../db');

const TENANT_ID = 1;

async function seed() {
    const [[exists]] = await db.query(
        `SELECT COUNT(*) as c FROM pedidos
         WHERE tenant_id=? AND notas LIKE 'DEMO_PEDIDO%'
         AND estado NOT IN ('cerrado','cancelado','rechazado')`,
        [TENANT_ID]
    );
    if (Number(exists.c) >= 7) {
        console.log(`Skipping: already have ${exists.c} active demo pedidos (target is 7: 3 mesa + 2 delivery + 2 llevar).`);
        process.exit(0);
    }
    if (Number(exists.c) > 0) {
        console.log(`Found ${exists.c} existing demo pedidos. Cleaning up before reseed...`);
        await db.query(
            `DELETE FROM pedidos_delivery WHERE pedido_id IN (
                SELECT id FROM pedidos WHERE tenant_id=? AND notas LIKE 'DEMO_PEDIDO%'
            )`,
            [TENANT_ID]
        );
        await db.query(
            `DELETE FROM pedido_items WHERE pedido_id IN (
                SELECT id FROM pedidos WHERE tenant_id=? AND notas LIKE 'DEMO_PEDIDO%'
            )`,
            [TENANT_ID]
        );
        const [delRes] = await db.query(
            `DELETE FROM pedidos WHERE tenant_id=? AND notas LIKE 'DEMO_PEDIDO%'`,
            [TENANT_ID]
        );
        console.log(`  deleted ${delRes.affectedRows || delRes.rowCount || 0} pedidos`);
    }

    // Pick productos
    const [productos] = await db.query(
        `SELECT id, nombre, precio_unidad FROM productos
         WHERE tenant_id=? AND precio_unidad > 0 ORDER BY precio_unidad DESC LIMIT 6`,
        [TENANT_ID]
    );
    if (productos.length === 0) {
        console.error('No productos found'); process.exit(1);
    }

    // ===== 1) MESA pedidos: 3 active orders attached to occupied mesas =====
    const [mesasOcupadas] = await db.query(
        `SELECT id, numero FROM mesas WHERE tenant_id=? AND estado='ocupada' ORDER BY numero LIMIT 3`,
        [TENANT_ID]
    );
    console.log(`Found ${mesasOcupadas.length} mesas ocupadas to attach pedidos to`);

    let mesaCount = 0;
    for (const mesa of mesasOcupadas) {
        const items = pickItems(productos, 2);
        const total = items.reduce((s, i) => s + i.subtotal, 0);

        const [pedRes] = await db.query(
            `INSERT INTO pedidos (mesa_id, mesero_nombre, estado, total, notas, tenant_id)
             VALUES (?, 'Mesero Demo', 'en_cocina', ?, 'DEMO_PEDIDO mesa', ?)
             RETURNING id`,
            [mesa.id, total, TENANT_ID]
        );
        const pedidoId = pedRes[0].id;

        for (const it of items) {
            await db.query(
                `INSERT INTO pedido_items
                  (pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, tenant_id)
                 VALUES (?, ?, ?, 'UND', ?, ?, 'preparando', ?)`,
                [pedidoId, it.producto_id, it.cantidad, it.precio_unitario, it.subtotal, TENANT_ID]
            );
        }
        console.log(`  mesa ${mesa.numero}: pedido ${pedidoId}, ${items.length} items, S/${total.toFixed(2)}`);
        mesaCount++;
    }

    // ===== 2) DELIVERY pedidos: 2 (1 Rappi, 1 PedidosYa) =====
    // mesa_id is NOT NULL in pedidos table; use the first mesa as a placeholder.
    // The /pedidos consolidated view filters by pedidos_delivery membership, so
    // these won't show up in the Mesa tab.
    const [[placeholderMesa]] = await db.query(
        `SELECT id FROM mesas WHERE tenant_id=? ORDER BY id LIMIT 1`,
        [TENANT_ID]
    );
    const PLACEHOLDER_MESA_ID = placeholderMesa.id;

    const deliveryClientes = [
        { nombre: 'Carlos Mendoza', tel: '987654321', dir: 'Av. Larco 1234, Miraflores', plat: 'rappi', mins: 35 },
        { nombre: 'Maria Quispe',   tel: '912345678', dir: 'Jr. Lima 567, San Isidro',    plat: 'pedidosya', mins: 28 },
    ];

    let delivCount = 0;
    for (const c of deliveryClientes) {
        const items = pickItems(productos, 3);
        const total = items.reduce((s, i) => s + i.subtotal, 0);

        const [pedRes] = await db.query(
            `INSERT INTO pedidos (mesa_id, mesero_nombre, estado, total, notas, tenant_id)
             VALUES (?, NULL, 'en_cocina', ?, 'DEMO_PEDIDO delivery', ?)
             RETURNING id`,
            [PLACEHOLDER_MESA_ID, total, TENANT_ID]
        );
        const pedidoId = pedRes[0].id;

        for (const it of items) {
            await db.query(
                `INSERT INTO pedido_items
                  (pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, tenant_id)
                 VALUES (?, ?, ?, 'UND', ?, ?, 'preparando', ?)`,
                [pedidoId, it.producto_id, it.cantidad, it.precio_unitario, it.subtotal, TENANT_ID]
            );
        }

        await db.query(
            `INSERT INTO pedidos_delivery
              (tenant_id, pedido_id, tipo, plataforma, direccion, telefono, nombre_cliente,
               estado_entrega, tiempo_estimado_min, comision_plataforma)
             VALUES (?, ?, 'delivery', ?, ?, ?, ?, 'preparando', ?, ?)`,
            [TENANT_ID, pedidoId, c.plat, c.dir, c.tel, c.nombre, c.mins, total * 0.15]
        );
        console.log(`  delivery (${c.plat}): pedido ${pedidoId}, S/${total.toFixed(2)} -> ${c.nombre}`);
        delivCount++;
    }

    // ===== 3) PARA LLEVAR pedidos: 2 (1 walk-in, 1 phone) =====
    const llevarClientes = [
        { nombre: 'Juan Perez',  tel: '999111222', mins: 15 },
        { nombre: 'Ana Torres',  tel: '999333444', mins: 25 },
    ];

    let llevarCount = 0;
    for (const c of llevarClientes) {
        const items = pickItems(productos, 2);
        const total = items.reduce((s, i) => s + i.subtotal, 0);

        const [pedRes] = await db.query(
            `INSERT INTO pedidos (mesa_id, mesero_nombre, estado, total, notas, tenant_id)
             VALUES (?, NULL, 'preparando', ?, 'DEMO_PEDIDO para_llevar', ?)
             RETURNING id`,
            [PLACEHOLDER_MESA_ID, total, TENANT_ID]
        );
        const pedidoId = pedRes[0].id;

        for (const it of items) {
            await db.query(
                `INSERT INTO pedido_items
                  (pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, tenant_id)
                 VALUES (?, ?, ?, 'UND', ?, ?, 'preparando', ?)`,
                [pedidoId, it.producto_id, it.cantidad, it.precio_unitario, it.subtotal, TENANT_ID]
            );
        }

        await db.query(
            `INSERT INTO pedidos_delivery
              (tenant_id, pedido_id, tipo, plataforma, direccion, telefono, nombre_cliente,
               estado_entrega, tiempo_estimado_min, comision_plataforma)
             VALUES (?, ?, 'para_llevar', 'propio', NULL, ?, ?, 'preparando', ?, 0)`,
            [TENANT_ID, pedidoId, c.tel, c.nombre, c.mins]
        );
        console.log(`  para_llevar: pedido ${pedidoId}, S/${total.toFixed(2)} -> ${c.nombre}`);
        llevarCount++;
    }

    console.log('');
    console.log('=== seed-demo-pedidos DONE ===');
    console.log(`  mesa pedidos    : ${mesaCount}`);
    console.log(`  delivery        : ${delivCount}`);
    console.log(`  para llevar     : ${llevarCount}`);
    process.exit(0);
}

function pickItems(productos, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const p = productos[Math.floor(Math.random() * productos.length)];
        const cantidad = 1 + Math.floor(Math.random() * 2);
        const precio = Number(p.precio_unidad);
        out.push({
            producto_id: p.id,
            nombre: p.nombre,
            cantidad,
            precio_unitario: precio,
            subtotal: +(precio * cantidad).toFixed(2),
        });
    }
    return out;
}

seed().catch(err => {
    console.error('Seed failed:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
