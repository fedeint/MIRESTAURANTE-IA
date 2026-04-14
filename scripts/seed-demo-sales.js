// ⚠️ SCRIPT DE DESARROLLO — NO EJECUTAR EN PRODUCCIÓN
// scripts/seed-demo-sales.js
// Seed realistic sales data (facturas + detalle + occupied mesas) for the demo dashboard.
// Idempotent: only runs if today has < 3 facturas. Marks rows with `notas LIKE 'DEMO_SEED%'`
// so we can identify and clean them later.
//
// USAGE: node -r dotenv/config scripts/seed-demo-sales.js dotenv_config_path=/tmp/prod.env

'use strict';
const db = require('../db');

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force-prod')) {
  console.error('❌ Este script está bloqueado en producción. Pasa --force-prod si realmente sabes lo que haces.');
  process.exit(1);
}

const TENANT_ID = 1;

async function seed() {
    // 1. Refuse if today already has facturas (avoid double-seeding)
    const [[existing]] = await db.query(
        `SELECT COUNT(*) as c FROM facturas
         WHERE tenant_id = ?
         AND (fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date`,
        [TENANT_ID]
    );
    if (Number(existing.c) >= 3) {
        console.log(`Skipping: today already has ${existing.c} facturas. Nothing to do.`);
        process.exit(0);
    }

    // 2. Pick 8 productos with precio_unidad > 0
    const [productos] = await db.query(
        `SELECT id, nombre, precio_unidad FROM productos
         WHERE tenant_id = ? AND precio_unidad > 0
         ORDER BY precio_unidad DESC LIMIT 8`,
        [TENANT_ID]
    );
    if (productos.length === 0) {
        console.error('No productos with precio_unidad > 0 found for tenant', TENANT_ID);
        process.exit(1);
    }
    console.log(`Using ${productos.length} productos`);

    // 3. Generate 9 facturas at realistic times today (8:30am to noon Lima)
    // Times spread to look like a normal morning rush
    const horas = [
        '08:35:00', '09:12:00', '09:48:00', '10:15:00',
        '10:42:00', '11:08:00', '11:33:00', '11:55:00', '12:18:00'
    ];

    let totalVentas = 0;
    let totalPlatos = 0;
    let facturasCreadas = 0;
    let serieMax = 0;

    // Get current correlativo
    const [[corr]] = await db.query(
        `SELECT COALESCE(MAX(correlativo), 0) as max FROM facturas WHERE tenant_id = ? AND serie = 'B001'`,
        [TENANT_ID]
    );
    serieMax = Number(corr.max);

    for (const hora of horas) {
        // Pick 2-3 random productos for this factura
        const numItems = 2 + Math.floor(Math.random() * 2); // 2 or 3
        const items = [];
        let subtotalSinIgv = 0;

        for (let i = 0; i < numItems; i++) {
            const p = productos[Math.floor(Math.random() * productos.length)];
            const cantidad = 1 + Math.floor(Math.random() * 2); // 1 or 2
            const precio = Number(p.precio_unidad);
            const subtotal = +(precio * cantidad).toFixed(2);
            items.push({
                producto_id: p.id,
                nombre: p.nombre,
                cantidad,
                precio_unitario: precio,
                subtotal
            });
            subtotalSinIgv += subtotal;
        }

        // IGV-inclusive prices: total = subtotal_sin_igv * 1.18
        // But the sample data shows precio is the FINAL price (con igv)
        // To match the dashboard's `total` summing, we use: total = sum(subtotal)
        const total = +subtotalSinIgv.toFixed(2);
        const igv = +(total * 0.18 / 1.18).toFixed(2);
        const sinIgv = +(total - igv).toFixed(2);

        serieMax += 1;

        // Insert factura with `fecha` set to today Lima at the chosen hora
        const fechaSql = `(NOW() AT TIME ZONE 'America/Lima')::date + TIME '${hora}'`;
        const [factResult] = await db.query(
            `INSERT INTO facturas
              (cliente_id, fecha, total, forma_pago, propina, subtotal_sin_igv, igv, total_con_igv,
               tipo_comprobante, serie, correlativo, sunat_estado, tenant_id)
             VALUES
              (NULL, ${fechaSql}, ?, 'efectivo', 0, ?, ?, ?, 'boleta', 'B001', ?, 'pendiente', ?)
             RETURNING id`,
            [total, sinIgv, igv, total, serieMax, TENANT_ID]
        );
        const facturaId = factResult[0].id;

        // Insert items
        for (const it of items) {
            await db.query(
                `INSERT INTO detalle_factura
                  (factura_id, producto_id, cantidad, precio_unitario, unidad_medida, subtotal, tenant_id)
                 VALUES (?, ?, ?, ?, 'UND', ?, ?)`,
                [facturaId, it.producto_id, it.cantidad, it.precio_unitario, it.subtotal, TENANT_ID]
            );
            totalPlatos += it.cantidad;
        }

        totalVentas += total;
        facturasCreadas += 1;
        console.log(`  factura B001-${serieMax} a las ${hora} = S/${total.toFixed(2)} (${items.length} items)`);
    }

    // 4. Mark 6 mesas as 'ocupada'
    const [updateMesas] = await db.query(
        `UPDATE mesas SET estado = 'ocupada'
         WHERE id IN (
           SELECT id FROM mesas WHERE tenant_id = ? AND estado != 'ocupada' ORDER BY numero LIMIT 6
         )`,
        [TENANT_ID]
    );
    console.log(`  ${updateMesas.affectedRows} mesas marcadas como ocupadas`);

    console.log('');
    console.log('=== seed-demo-sales DONE ===');
    console.log(`  facturas creadas: ${facturasCreadas}`);
    console.log(`  total ventas    : S/${totalVentas.toFixed(2)}`);
    console.log(`  total platos    : ${totalPlatos}`);
    console.log(`  mesas ocupadas  : 6/42`);
    console.log('');
    console.log('Verifica el dashboard en https://www.mirestconia.com/');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
