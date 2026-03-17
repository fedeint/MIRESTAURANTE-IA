const express = require('express');
const router = express.Router();
const db = require('../db');
const { registrarAudit } = require('../services/audit');

// GET /almacen - Dashboard
router.get('/', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [[totalIngr]] = await db.query('SELECT COUNT(*) as t FROM almacen_ingredientes WHERE tenant_id=? AND activo=1', [tid]);
        const [[alertas]] = await db.query('SELECT COUNT(*) as t FROM almacen_ingredientes WHERE tenant_id=? AND activo=1 AND stock_actual <= stock_minimo', [tid]);
        const [[valorInv]] = await db.query('SELECT COALESCE(SUM(stock_actual * costo_unitario),0) as v FROM almacen_ingredientes WHERE tenant_id=? AND activo=1', [tid]);
        const [categorias] = await db.query('SELECT * FROM almacen_categorias WHERE tenant_id=? AND activo=1 ORDER BY orden', [tid]);

        res.render('almacen/dashboard', {
            stats: {
                totalIngredientes: totalIngr.t,
                alertas: alertas.t,
                valorInventario: Number(valorInv.v).toFixed(2),
                categorias
            }
        });
    } catch (e) {
        console.error('Almacen dashboard error:', e.message);
        res.render('almacen/dashboard', { stats: { totalIngredientes: 0, alertas: 0, valorInventario: '0.00', categorias: [] } });
    }
});

// GET /almacen/inventario - Stock actual
router.get('/inventario', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [ingredientes] = await db.query(`
            SELECT i.*, c.nombre as categoria_nombre, c.color as categoria_color,
                   p.nombre as proveedor_nombre,
                   ult.created_at as ultimo_ingreso_fecha,
                   u_ult.usuario as ultimo_ingreso_usuario
            FROM almacen_ingredientes i
            LEFT JOIN almacen_categorias c ON c.id = i.categoria_id
            LEFT JOIN proveedores p ON p.id = i.proveedor_id
            LEFT JOIN (
                SELECT ingrediente_id, MAX(id) as max_id
                FROM almacen_movimientos WHERE tipo='entrada'
                GROUP BY ingrediente_id
            ) last_mov ON last_mov.ingrediente_id = i.id
            LEFT JOIN almacen_movimientos ult ON ult.id = last_mov.max_id
            LEFT JOIN usuarios u_ult ON u_ult.id = ult.usuario_id
            WHERE i.tenant_id = ? AND i.activo = 1
            ORDER BY c.orden, i.nombre
        `, [tid]);
        const [categorias] = await db.query('SELECT * FROM almacen_categorias WHERE tenant_id=? AND activo=1 ORDER BY orden', [tid]);
        res.render('almacen/inventario', { ingredientes, categorias });
    } catch (e) {
        console.error('Inventario error:', e.message);
        res.render('almacen/inventario', { ingredientes: [], categorias: [] });
    }
});

// API: Listar ingredientes (para selects en recetas, etc.)
router.get('/api/ingredientes', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [ingredientes] = await db.query(
            'SELECT id, nombre, unidad_medida, costo_unitario, stock_actual FROM almacen_ingredientes WHERE tenant_id=? AND activo=1 ORDER BY nombre',
            [tid]
        );
        res.json(ingredientes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: CRUD ingredientes
router.post('/api/ingredientes', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { categoria_id, nombre, codigo, unidad_medida, stock_minimo, costo_unitario, ubicacion, proveedor_id } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

        const [result] = await db.query(
            `INSERT INTO almacen_ingredientes (tenant_id, categoria_id, nombre, codigo, unidad_medida, stock_minimo, costo_unitario, ubicacion, proveedor_id)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [tid, categoria_id||null, nombre, codigo||null, unidad_medida||'kg', stock_minimo||0, costo_unitario||0, ubicacion||null, proveedor_id||null]
        );

        registrarAudit({ tenantId: tid, usuarioId: req.session?.user?.id || 0, accion: 'INSERT', modulo: 'almacen', tabla: 'almacen_ingredientes', registroId: result[0]?.insertId, datosNuevos: req.body, ip: req.ip });
        res.status(201).json({ id: result[0]?.insertId, message: 'Ingrediente creado' });
    } catch (e) {
        console.error('Crear ingrediente error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.put('/api/ingredientes/:id', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { categoria_id, nombre, codigo, unidad_medida, stock_minimo, stock_maximo, costo_unitario, ubicacion, proveedor_id, merma_preparacion_pct } = req.body;
        await db.query(
            `UPDATE almacen_ingredientes SET categoria_id=?, nombre=?, codigo=?, unidad_medida=?, stock_minimo=?, stock_maximo=?, costo_unitario=?, ubicacion=?, proveedor_id=?, merma_preparacion_pct=?
             WHERE id=? AND tenant_id=?`,
            [categoria_id||null, nombre, codigo||null, unidad_medida||'kg', stock_minimo||0, stock_maximo||null, costo_unitario||0, ubicacion||null, proveedor_id||null, merma_preparacion_pct||0, req.params.id, tid]
        );
        res.json({ message: 'Ingrediente actualizado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/api/ingredientes/:id', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        await db.query('UPDATE almacen_ingredientes SET activo=0, deleted_at=NOW() WHERE id=? AND tenant_id=?', [req.params.id, tid]);
        res.json({ message: 'Ingrediente desactivado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Entrada rapida de stock
router.post('/api/entrada', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;
        const { ingrediente_id, cantidad, costo_unitario, proveedor_id, comprobante, notas } = req.body;

        if (!ingrediente_id || !cantidad || cantidad <= 0) return res.status(400).json({ error: 'Ingrediente y cantidad requeridos' });

        // Obtener stock actual
        const [[ingr]] = await db.query('SELECT stock_actual, costo_promedio FROM almacen_ingredientes WHERE id=? AND tenant_id=?', [ingrediente_id, tid]);
        if (!ingr) return res.status(404).json({ error: 'Ingrediente no encontrado' });

        const stockAnterior = Number(ingr.stock_actual);
        const cant = Number(cantidad);
        const costo = Number(costo_unitario) || 0;
        const stockPosterior = stockAnterior + cant;

        // Costo promedio ponderado
        const costoPromAnterior = Number(ingr.costo_promedio) || 0;
        const nuevoCostoProm = stockAnterior > 0
            ? ((costoPromAnterior * stockAnterior) + (costo * cant)) / stockPosterior
            : costo;

        // UPDATE atomico
        await db.query(
            `UPDATE almacen_ingredientes SET stock_actual = stock_actual + ?, costo_promedio = ?, ultimo_costo = ?, updated_at = NOW()
             WHERE id = ? AND tenant_id = ?`,
            [cant, nuevoCostoProm, costo, ingrediente_id, tid]
        );

        // Registrar movimiento
        await db.query(
            `INSERT INTO almacen_movimientos (tenant_id, ingrediente_id, tipo, cantidad, stock_anterior, stock_posterior, costo_unitario, costo_total, motivo, comprobante, notas, usuario_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [tid, ingrediente_id, 'entrada', cant, stockAnterior, stockPosterior, costo, costo * cant, 'compra_proveedor', comprobante||null, notas||null, uid]
        );

        res.json({ message: 'Entrada registrada', stock_actual: stockPosterior });
    } catch (e) {
        console.error('Entrada error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// API: Salida manual
router.post('/api/salida', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;
        const { ingrediente_id, cantidad, motivo, notas } = req.body;

        if (!ingrediente_id || !cantidad || cantidad <= 0) return res.status(400).json({ error: 'Ingrediente y cantidad requeridos' });
        if (!motivo) return res.status(400).json({ error: 'Motivo requerido para salidas manuales' });

        const [[ingr]] = await db.query('SELECT stock_actual, costo_unitario FROM almacen_ingredientes WHERE id=? AND tenant_id=?', [ingrediente_id, tid]);
        if (!ingr) return res.status(404).json({ error: 'Ingrediente no encontrado' });

        const stockAnterior = Number(ingr.stock_actual);
        const cant = Number(cantidad);
        const stockPosterior = stockAnterior - cant;

        await db.query(
            `UPDATE almacen_ingredientes SET stock_actual = stock_actual - ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
            [cant, ingrediente_id, tid]
        );

        await db.query(
            `INSERT INTO almacen_movimientos (tenant_id, ingrediente_id, tipo, cantidad, stock_anterior, stock_posterior, costo_unitario, costo_total, motivo, notas, usuario_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [tid, ingrediente_id, motivo.startsWith('merma') ? 'merma' : 'salida', cant, stockAnterior, stockPosterior, Number(ingr.costo_unitario), cant * Number(ingr.costo_unitario), motivo, notas||null, uid]
        );

        res.json({ message: 'Salida registrada', stock_actual: stockPosterior });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Historial de movimientos
router.get('/api/movimientos', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { ingrediente_id, tipo, desde, hasta, limit: lim } = req.query;
        let sql = `SELECT m.*, i.nombre as ingrediente_nombre, u.usuario as usuario_nombre
                    FROM almacen_movimientos m
                    LEFT JOIN almacen_ingredientes i ON i.id = m.ingrediente_id
                    LEFT JOIN usuarios u ON u.id = m.usuario_id
                    WHERE m.tenant_id = ?`;
        const params = [tid];

        if (ingrediente_id) { sql += ' AND m.ingrediente_id = ?'; params.push(ingrediente_id); }
        if (tipo) { sql += ' AND m.tipo = ?'; params.push(tipo); }
        if (desde) { sql += ' AND DATE(m.created_at) >= ?'; params.push(desde); }
        if (hasta) { sql += ' AND DATE(m.created_at) <= ?'; params.push(hasta); }

        sql += ' ORDER BY m.created_at DESC LIMIT ?';
        params.push(Number(lim) || 100);

        const [movimientos] = await db.query(sql, params);
        res.json(movimientos);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Alertas (stock bajo minimo)
router.get('/api/alertas', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [alertas] = await db.query(`
            SELECT i.*, c.nombre as categoria_nombre
            FROM almacen_ingredientes i
            LEFT JOIN almacen_categorias c ON c.id = i.categoria_id
            WHERE i.tenant_id = ? AND i.activo = 1 AND i.stock_actual <= i.stock_minimo
            ORDER BY (i.stock_actual / NULLIF(i.stock_minimo, 0)) ASC
        `, [tid]);
        res.json(alertas);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET vistas
router.get('/proveedores', async (req, res) => {
    const [proveedores] = await db.query('SELECT * FROM proveedores WHERE tenant_id=? AND deleted_at IS NULL ORDER BY nombre', [req.tenantId||1]);
    res.render('almacen/proveedores', { proveedores });
});

router.get('/entradas', async (req, res) => {
    const tid = req.tenantId || 1;
    const [ingredientes] = await db.query('SELECT id, codigo, nombre, unidad_medida, stock_actual, costo_unitario FROM almacen_ingredientes WHERE tenant_id=? AND activo=1 ORDER BY nombre', [tid]);
    const [proveedores] = await db.query('SELECT id, nombre FROM proveedores WHERE tenant_id=? AND deleted_at IS NULL ORDER BY nombre', [tid]);
    res.render('almacen/entradas', { ingredientes, proveedores });
});
router.get('/salidas', async (req, res) => {
    const tid = req.tenantId || 1;
    const [ingredientes] = await db.query('SELECT id, codigo, nombre, unidad_medida, stock_actual FROM almacen_ingredientes WHERE tenant_id=? AND activo=1 ORDER BY nombre', [tid]);
    const hoy = new Date().toISOString().split('T')[0];

    // Salidas agrupadas por pedido_item (plato) con mesa
    const [salidasVenta] = await db.query(`
        SELECT m.*, i.nombre as ingrediente_nombre, u.usuario as usuario_nombre,
               m.referencia_id as pedido_item_id
        FROM almacen_movimientos m
        LEFT JOIN almacen_ingredientes i ON i.id=m.ingrediente_id
        LEFT JOIN usuarios u ON u.id=m.usuario_id
        WHERE m.tenant_id=? AND m.motivo='venta_platillo' AND DATE(m.created_at)=?
        ORDER BY m.created_at DESC
    `, [tid, hoy]);

    // Agrupar por pedido_item para mostrar por plato
    const platosMap = {};
    for (const s of salidasVenta) {
        const key = s.pedido_item_id || s.id;
        if (!platosMap[key]) platosMap[key] = { items: [], hora: s.created_at, pedido_item_id: key };
        platosMap[key].items.push(s);
    }

    // Obtener nombre del plato y mesa para cada pedido_item
    const platos = [];
    for (const [key, val] of Object.entries(platosMap)) {
        try {
            const [[pi]] = await db.query(`
                SELECT pi.producto_id, pi.cantidad, p.nombre as producto_nombre,
                       pe.mesa_id, m.numero as mesa_numero
                FROM pedido_items pi
                JOIN productos p ON p.id=pi.producto_id
                LEFT JOIN pedidos pe ON pe.id=pi.pedido_id
                LEFT JOIN mesas m ON m.id=pe.mesa_id
                WHERE pi.id=?
            `, [key]);
            platos.push({
                ...val,
                producto_nombre: pi ? pi.producto_nombre : 'Producto',
                cantidad: pi ? pi.cantidad : 1,
                mesa_numero: pi ? pi.mesa_numero : '-'
            });
        } catch(e) {
            platos.push({ ...val, producto_nombre: 'Producto', cantidad: 1, mesa_numero: '-' });
        }
    }

    // Ranking top 10 productos mas vendidos hoy
    const [ranking] = await db.query(`
        SELECT p.nombre, COUNT(DISTINCT m.referencia_id) as veces, SUM(m.cantidad) as total_insumos,
               SUM(m.costo_total) as costo_total
        FROM almacen_movimientos m
        JOIN pedido_items pi ON pi.id=m.referencia_id
        JOIN productos p ON p.id=pi.producto_id
        WHERE m.tenant_id=? AND m.motivo='venta_platillo' AND DATE(m.created_at)=?
        GROUP BY p.id
        ORDER BY veces DESC
        LIMIT 10
    `, [tid, hoy]);

    res.render('almacen/salidas', { ingredientes, salidasVenta, platos, ranking });
});
router.get('/historial', (req, res) => res.render('almacen/historial'));
router.get('/alertas', (req, res) => res.render('almacen/alertas'));
router.get('/conteo-fisico', (req, res) => res.render('almacen/conteo-fisico'));

// API: CRUD proveedores
router.post('/api/proveedores', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { nombre, ruc, telefono, email, direccion, contacto_nombre, tipo, dias_credito } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
        const [result] = await db.query(
            'INSERT INTO proveedores (tenant_id, nombre, ruc, telefono, email, direccion, contacto_nombre, tipo, dias_credito) VALUES (?,?,?,?,?,?,?,?,?)',
            [tid, nombre, ruc||null, telefono||null, email||null, direccion||null, contacto_nombre||null, tipo||'mayorista', dias_credito||0]
        );
        res.status(201).json({ id: result[0]?.insertId, message: 'Proveedor creado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
