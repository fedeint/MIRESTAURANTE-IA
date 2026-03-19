const express = require('express');
const router = express.Router();
const db = require('../db');
const { registrarAudit } = require('../services/audit');
const { rankingDisponibilidad } = require('../services/disponibilidad');

// GET /almacen - Dashboard
router.get('/', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [[totalIngr]] = await db.query('SELECT COUNT(*) as t FROM almacen_ingredientes WHERE tenant_id=? AND activo=true', [tid]);
        const [[alertas]] = await db.query('SELECT COUNT(*) as t FROM almacen_ingredientes WHERE tenant_id=? AND activo=true AND stock_actual <= stock_minimo', [tid]);
        const [[valorInv]] = await db.query('SELECT COALESCE(SUM(stock_actual * costo_unitario),0) as v FROM almacen_ingredientes WHERE tenant_id=? AND activo=true', [tid]);
        const [categorias] = await db.query('SELECT * FROM almacen_categorias WHERE tenant_id=? AND activo=true ORDER BY orden', [tid]);

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
            WHERE i.tenant_id = ? AND i.activo = true
            ORDER BY c.orden, i.nombre
        `, [tid]);
        const [categorias] = await db.query('SELECT * FROM almacen_categorias WHERE tenant_id=? AND activo=true ORDER BY orden', [tid]);
        // Ranking de platos disponibles
        let rankingPlatos = [];
        try { rankingPlatos = await rankingDisponibilidad(); } catch(e) {}

        res.render('almacen/inventario', { ingredientes, categorias, rankingPlatos });
    } catch (e) {
        console.error('Inventario error:', e.message);
        res.render('almacen/inventario', { ingredientes: [], categorias: [], rankingPlatos: [] });
    }
});

// API: Listar ingredientes (para selects en recetas, etc.)
router.get('/api/ingredientes', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [ingredientes] = await db.query(
            'SELECT id, nombre, unidad_medida, costo_unitario, stock_actual FROM almacen_ingredientes WHERE tenant_id=? AND activo=true ORDER BY nombre',
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
             VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
            [tid, categoria_id||null, nombre, codigo||null, unidad_medida||'kg', stock_minimo||0, costo_unitario||0, ubicacion||null, proveedor_id||null]
        );

        registrarAudit({ tenantId: tid, usuarioId: req.session?.user?.id || 0, accion: 'INSERT', modulo: 'almacen', tabla: 'almacen_ingredientes', registroId: result?.insertId, datosNuevos: req.body, ip: req.ip });
        res.status(201).json({ id: result?.insertId, message: 'Ingrediente creado' });
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
        if (desde) { sql += ' AND m.created_at::date >= ?'; params.push(desde); }
        if (hasta) { sql += ' AND m.created_at::date <= ?'; params.push(hasta); }

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
            WHERE i.tenant_id = ? AND i.activo = true AND i.stock_actual <= i.stock_minimo
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
    const [ingredientes] = await db.query('SELECT id, codigo, nombre, unidad_medida, stock_actual, costo_unitario FROM almacen_ingredientes WHERE tenant_id=? AND activo=true ORDER BY nombre', [tid]);
    const [proveedores] = await db.query('SELECT id, nombre FROM proveedores WHERE tenant_id=? AND deleted_at IS NULL ORDER BY nombre', [tid]);
    res.render('almacen/entradas', { ingredientes, proveedores });
});
router.get('/salidas', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const [ingredientes] = await db.query('SELECT id, codigo, nombre, unidad_medida, stock_actual FROM almacen_ingredientes WHERE tenant_id=? AND activo=true ORDER BY nombre', [tid]);
    const hoy = new Date().toISOString().split('T')[0];

    // Caja abierta hoy (quien abrio, a que hora)
    let cajaInfo = null;
    try {
        const [[caja]] = await db.query(`
            SELECT c.*, u.usuario as usuario_nombre, u.nombre as usuario_nombre_completo
            FROM cajas c
            LEFT JOIN usuarios u ON u.id = c.usuario_id
            WHERE c.tenant_id=? AND c.fecha_apertura::date=?
            ORDER BY c.fecha_apertura DESC LIMIT 1
        `, [tid, hoy]);
        cajaInfo = caja || null;
    } catch(e) {}

    // Salidas agrupadas por pedido_item (plato) con mesa
    const [salidasVenta] = await db.query(`
        SELECT m.*, i.nombre as ingrediente_nombre, u.usuario as usuario_nombre,
               m.referencia_id as pedido_item_id
        FROM almacen_movimientos m
        LEFT JOIN almacen_ingredientes i ON i.id=m.ingrediente_id
        LEFT JOIN usuarios u ON u.id=m.usuario_id
        WHERE m.tenant_id=? AND m.motivo='venta_platillo' AND m.created_at::date=?
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
    let ranking = [];
    try {
        const [rankRows] = await db.query(`
            SELECT p.nombre, COUNT(DISTINCT m.referencia_id) as veces, SUM(m.costo_total) as costo_total
            FROM almacen_movimientos m
            JOIN pedido_items pi ON pi.id=m.referencia_id
            JOIN productos p ON p.id=pi.producto_id
            WHERE m.tenant_id=? AND m.motivo='venta_platillo' AND m.created_at::date=?
            GROUP BY p.id
            ORDER BY veces DESC
            LIMIT 10
        `, [tid, hoy]);
        ranking = rankRows || [];
    } catch(e) { console.error('Ranking salidas error:', e.message); }

    res.render('almacen/salidas', { ingredientes, salidasVenta, platos, ranking, cajaInfo });
  } catch(e) {
    console.error('Salidas error:', e.message);
    res.render('almacen/salidas', { ingredientes: [], salidasVenta: [], platos: [], ranking: [], cajaInfo: null });
  }
});
// GET /almacen/que-comprar - Prediccion basada en consumo semana pasada
router.get('/que-comprar', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const hoy = new Date();
        // Mismo dia de la semana pasada
        const semanaPasada = new Date(hoy);
        semanaPasada.setDate(semanaPasada.getDate() - 7);
        const fechaRef = semanaPasada.toISOString().split('T')[0];

        // Consumo del mismo dia la semana pasada
        const [consumoSemPasada] = await db.query(`
            SELECT m.ingrediente_id, ai.nombre, ai.unidad_medida, ai.stock_actual, ai.stock_minimo,
                   ai.costo_unitario, p.nombre as proveedor_nombre,
                   SUM(m.cantidad) as consumido_semana_pasada
            FROM almacen_movimientos m
            JOIN almacen_ingredientes ai ON ai.id = m.ingrediente_id
            LEFT JOIN proveedores p ON p.id = ai.proveedor_id
            WHERE m.tenant_id=? AND m.motivo='venta_platillo' AND m.created_at::date=?
            GROUP BY m.ingrediente_id
            ORDER BY consumido_semana_pasada DESC
        `, [tid, fechaRef]);

        // Calcular cuanto falta
        const listaCompras = consumoSemPasada.map(item => {
            const stock = Number(item.stock_actual) || 0;
            const consumo = Number(item.consumido_semana_pasada) || 0;
            const minimo = Number(item.stock_minimo) || 0;
            const necesita = Math.max(0, consumo - stock + minimo); // lo que necesitas comprar
            const diasStock = consumo > 0 ? Math.floor(stock / consumo) : 999;
            return {
                ...item,
                consumo,
                necesita: necesita > 0 ? necesita : 0,
                dias_stock: diasStock,
                costo_estimado: necesita > 0 ? (necesita * Number(item.costo_unitario)).toFixed(2) : '0.00',
                urgente: stock <= minimo
            };
        }).filter(i => i.consumo > 0);

        // Ingredientes bajo minimo que no se consumieron la semana pasada
        const [bajoMinimo] = await db.query(`
            SELECT ai.id as ingrediente_id, ai.nombre, ai.unidad_medida, ai.stock_actual, ai.stock_minimo,
                   ai.costo_unitario, p.nombre as proveedor_nombre
            FROM almacen_ingredientes ai
            LEFT JOIN proveedores p ON p.id = ai.proveedor_id
            WHERE ai.tenant_id=? AND ai.activo=true AND ai.stock_actual <= ai.stock_minimo
        `, [tid]);

        const diaSemana = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'][hoy.getDay()];

        res.render('almacen/que-comprar', { listaCompras, bajoMinimo, fechaRef, diaSemana });
    } catch(e) {
        console.error('Que comprar error:', e.message);
        res.render('almacen/que-comprar', { listaCompras: [], bajoMinimo: [], fechaRef: '', diaSemana: '' });
    }
});

router.get('/historial', (req, res) => res.render('almacen/historial'));
router.get('/alertas', (req, res) => res.render('almacen/alertas'));
// conteo-fisico eliminado - se maneja desde ingreso diario

// API: CRUD proveedores
router.post('/api/proveedores', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const { nombre, ruc, telefono, email, direccion, contacto_nombre, tipo, dias_credito } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
        const [result] = await db.query(
            'INSERT INTO proveedores (tenant_id, nombre, ruc, telefono, email, direccion, contacto_nombre, tipo, dias_credito) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
            [tid, nombre, ruc||null, telefono||null, email||null, direccion||null, contacto_nombre||null, tipo||'mayorista', dias_credito||0]
        );
        res.status(201).json({ id: result?.insertId, message: 'Proveedor creado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
