const express = require('express');
const router = express.Router();
const db = require('../db');

// ============ RESERVAS ============

router.get('/reservas', async (req, res) => {
    const tid = req.tenantId || 1;
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
    const [reservas] = await db.query(`
        SELECT r.*, m.numero as mesa_numero FROM reservas r
        LEFT JOIN mesas m ON m.id=r.mesa_id
        WHERE r.tenant_id=? AND r.fecha=? ORDER BY r.hora
    `, [tid, fecha]);
    const [mesas] = await db.query('SELECT id, numero, estado FROM mesas');
    res.render('features/reservas', { reservas, mesas, fecha });
});

router.post('/reservas', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { fecha, hora, cantidad_personas, mesa_id, nombre_cliente, telefono_cliente, canal_origen, notas } = req.body;
        if (!fecha || !hora || !cantidad_personas) return res.status(400).json({ error: 'Fecha, hora y personas requeridos' });
        const [result] = await db.query(
            `INSERT INTO reservas (tenant_id, fecha, hora, cantidad_personas, mesa_id, nombre_cliente, telefono_cliente, canal_origen, notas, usuario_id)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [tid, fecha, hora, cantidad_personas, mesa_id||null, nombre_cliente||null, telefono_cliente||null, canal_origen||'telefono', notas||null, req.session?.user?.id||0]
        );
        res.status(201).json({ id: result.insertId, message: 'Reserva creada' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/reservas/:id/estado', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        await db.query('UPDATE reservas SET estado=? WHERE id=? AND tenant_id=?', [req.body.estado, req.params.id, tid]);
        res.json({ message: 'Estado actualizado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ DELIVERY ============

router.get('/delivery', async (req, res) => {
    const tid = req.tenantId || 1;
    const [pedidos] = await db.query(`
        SELECT pd.*, f.total FROM pedidos_delivery pd
        LEFT JOIN facturas f ON f.id=pd.factura_id
        WHERE pd.tenant_id=? ORDER BY pd.created_at DESC LIMIT 50
    `, [tid]);
    res.render('features/delivery', { pedidos });
});

router.post('/delivery', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { tipo, plataforma, direccion, telefono, nombre_cliente, tiempo_estimado_min, comision_plataforma, notas } = req.body;
        const [result] = await db.query(
            `INSERT INTO pedidos_delivery (tenant_id, tipo, plataforma, direccion, telefono, nombre_cliente, tiempo_estimado_min, comision_plataforma, notas)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [tid, tipo||'delivery', plataforma||'propio', direccion||null, telefono||null, nombre_cliente||null, tiempo_estimado_min||null, comision_plataforma||0, notas||null]
        );
        res.status(201).json({ id: result.insertId, message: 'Pedido delivery creado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/delivery/:id/estado', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        await db.query('UPDATE pedidos_delivery SET estado_entrega=? WHERE id=? AND tenant_id=?', [req.body.estado, req.params.id, tid]);
        res.json({ message: 'Estado delivery actualizado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ PROMOCIONES ============

router.get('/promociones', async (req, res) => {
    const tid = req.tenantId || 1;
    const [promociones] = await db.query('SELECT * FROM promociones WHERE tenant_id=? ORDER BY activa DESC, created_at DESC', [tid]);
    res.render('features/promociones', { promociones });
});

router.post('/promociones', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { nombre, tipo, valor, codigo_cupon, fecha_inicio, fecha_fin, hora_inicio, hora_fin, usos_maximo } = req.body;
        if (!nombre || !tipo) return res.status(400).json({ error: 'Nombre y tipo requeridos' });
        await db.query(
            `INSERT INTO promociones (tenant_id, nombre, tipo, valor, codigo_cupon, fecha_inicio, fecha_fin, hora_inicio, hora_fin, usos_maximo)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [tid, nombre, tipo, valor||null, codigo_cupon||null, fecha_inicio||null, fecha_fin||null, hora_inicio||null, hora_fin||null, usos_maximo||null]
        );
        res.status(201).json({ message: 'Promocion creada' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ FIDELIDAD ============

router.get('/fidelidad', async (req, res) => {
    const tid = req.tenantId || 1;
    const [clientes] = await db.query(`
        SELECT fp.*, c.nombre as cliente_nombre FROM fidelidad_puntos fp
        JOIN clientes c ON c.id=fp.cliente_id
        WHERE fp.tenant_id=? ORDER BY fp.puntos_disponibles DESC
    `, [tid]);
    res.render('features/fidelidad', { clientes });
});

router.post('/fidelidad/acumular', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { cliente_id, puntos, factura_id } = req.body;
        if (!cliente_id || !puntos) return res.status(400).json({ error: 'Cliente y puntos requeridos' });

        // Upsert puntos
        await db.query(`
            INSERT INTO fidelidad_puntos (tenant_id, cliente_id, puntos_acumulados, puntos_disponibles)
            VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE puntos_acumulados=puntos_acumulados+?, puntos_disponibles=puntos_disponibles+?
        `, [tid, cliente_id, puntos, puntos, puntos, puntos]);

        // Movimiento
        await db.query(
            'INSERT INTO fidelidad_movimientos (tenant_id, cliente_id, tipo, puntos, factura_id, descripcion) VALUES (?,?,"acumulacion",?,?,?)',
            [tid, cliente_id, puntos, factura_id||null, `Acumulacion por compra`]
        );

        // Actualizar nivel
        const [[fp]] = await db.query('SELECT puntos_acumulados FROM fidelidad_puntos WHERE tenant_id=? AND cliente_id=?', [tid, cliente_id]);
        const total = Number(fp.puntos_acumulados);
        const nivel = total >= 10000 ? 'platino' : total >= 5000 ? 'oro' : total >= 2000 ? 'plata' : 'bronce';
        await db.query('UPDATE fidelidad_puntos SET nivel=? WHERE tenant_id=? AND cliente_id=?', [nivel, tid, cliente_id]);

        res.json({ message: 'Puntos acumulados', nivel });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ MENU DIGITAL QR ============

router.get('/menu', async (req, res) => {
    const tid = req.tenantId || 1;
    const [productos] = await db.query(`
        SELECT p.*, (SELECT COUNT(*) FROM almacen_ingredientes ai
            JOIN receta_items ri ON ri.ingrediente_id=ai.id
            JOIN recetas r ON r.id=ri.receta_id
            WHERE r.producto_id=p.id AND r.activa=1 AND ai.stock_actual<=0) as ingredientes_agotados
        FROM productos p WHERE p.id > 0 ORDER BY p.categoria, p.nombre
    `, []);
    const [[config]] = await db.query('SELECT nombre_negocio, logo_src FROM configuracion_impresion LIMIT 1');
    res.render('features/menu-digital', { productos, config: config || {}, layout: false });
});

module.exports = router;
