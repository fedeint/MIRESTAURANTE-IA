const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/recetas/:productoId - Obtener receta activa de un producto
router.get('/:productoId', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const pid = req.params.productoId;

        // Receta activa
        const [[receta]] = await db.query(
            'SELECT * FROM recetas WHERE tenant_id=? AND producto_id=? AND activa=1 ORDER BY version DESC LIMIT 1',
            [tid, pid]
        );
        if (!receta) return res.json({ receta: null, items: [], costo_total: 0 });

        // Items con nombre del ingrediente y costo
        const [items] = await db.query(`
            SELECT ri.*,
                   ai.nombre as ingrediente_nombre, ai.costo_unitario as ingrediente_costo,
                   ai.unidad_medida as ingrediente_unidad, ai.stock_actual,
                   ai.merma_preparacion_pct
            FROM receta_items ri
            LEFT JOIN almacen_ingredientes ai ON ai.id = ri.ingrediente_id
            WHERE ri.receta_id = ?
            ORDER BY ri.id
        `, [receta.id]);

        // Calcular costo total
        let costoTotal = 0;
        items.forEach(item => {
            if (item.ingrediente_id) {
                const costoBase = Number(item.ingrediente_costo) || 0; // costo por kg/lt/und
                const merma = Number(item.merma_preparacion_pct) || 0;
                const costoConMerma = merma > 0 ? costoBase / (1 - merma) : costoBase;
                const cant = Number(item.cantidad) || 0;
                const unidad = String(item.unidad_medida || '').toLowerCase();
                const ingUnidad = String(item.ingrediente_unidad || '').toLowerCase();

                // Convertir: si receta usa g/ml pero costo es por kg/lt
                let costoUnitConvertido = costoConMerma;
                if ((unidad === 'g' || unidad === 'ml') && (ingUnidad === 'kg' || ingUnidad === 'lt')) {
                    costoUnitConvertido = costoConMerma / 1000;
                }

                item.costo_item = costoUnitConvertido * cant;
                costoTotal += item.costo_item;
            }
        });

        res.json({ receta, items, costo_total: costoTotal });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/recetas/:productoId - Crear/actualizar receta
router.post('/:productoId', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const pid = req.params.productoId;
        const { items, rendimiento_porciones, tiempo_preparacion_min, food_cost_objetivo_pct } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'La receta necesita al menos 1 ingrediente' });
        }

        // Desactivar receta anterior
        await db.query('UPDATE recetas SET activa=0 WHERE tenant_id=? AND producto_id=?', [tid, pid]);

        // Obtener siguiente version
        const [[maxVer]] = await db.query('SELECT COALESCE(MAX(version),0) as v FROM recetas WHERE tenant_id=? AND producto_id=?', [tid, pid]);
        const newVersion = (maxVer.v || 0) + 1;

        // Crear nueva receta
        const [recetaResult] = await db.query(
            `INSERT INTO recetas (tenant_id, producto_id, version, rendimiento_porciones, tiempo_preparacion_min, food_cost_objetivo_pct, activa)
             VALUES (?,?,?,?,?,?,1)`,
            [tid, pid, newVersion, rendimiento_porciones || 1, tiempo_preparacion_min || null, food_cost_objetivo_pct || null]
        );
        const recetaId = recetaResult.insertId;

        // Insertar items
        for (const item of items) {
            await db.query(
                `INSERT INTO receta_items (receta_id, ingrediente_id, sub_receta_id, cantidad, unidad_medida, es_opcional, notas)
                 VALUES (?,?,?,?,?,?,?)`,
                [recetaId, item.ingrediente_id || null, item.sub_receta_id || null, item.cantidad, item.unidad_medida || 'g', item.es_opcional || false, item.notas || null]
            );
        }

        res.status(201).json({ receta_id: recetaId, version: newVersion, message: 'Receta guardada' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/recetas/:productoId/versiones - Historial de versiones
router.get('/:productoId/versiones', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [versiones] = await db.query(
            'SELECT id, version, nombre_version, activa, created_at FROM recetas WHERE tenant_id=? AND producto_id=? ORDER BY version DESC',
            [tid, req.params.productoId]
        );
        res.json(versiones);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/recetas/descontar-stock - Descontar ingredientes al facturar (llamado internamente)
router.post('/descontar-stock', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;
        const { producto_id, cantidad_vendida, factura_id } = req.body;

        // Buscar receta activa
        const [[receta]] = await db.query(
            'SELECT id FROM recetas WHERE tenant_id=? AND producto_id=? AND activa=1 LIMIT 1',
            [tid, producto_id]
        );
        if (!receta) return res.json({ descontado: false, motivo: 'Sin receta configurada' });

        // Items de la receta
        const [items] = await db.query('SELECT * FROM receta_items WHERE receta_id=?', [receta.id]);

        const errores = [];
        for (const item of items) {
            if (!item.ingrediente_id) continue;
            const cantNecesaria = Number(item.cantidad) * Number(cantidad_vendida);

            // Descuento atomico
            const [result] = await db.query(
                `UPDATE almacen_ingredientes SET stock_actual = stock_actual - ? WHERE id = ? AND tenant_id = ?`,
                [cantNecesaria, item.ingrediente_id, tid]
            );

            if (result.affectedRows > 0) {
                // Registrar movimiento
                const [[ingr]] = await db.query('SELECT stock_actual, costo_unitario FROM almacen_ingredientes WHERE id=?', [item.ingrediente_id]);
                await db.query(
                    `INSERT INTO almacen_movimientos (tenant_id, ingrediente_id, tipo, cantidad, stock_anterior, stock_posterior, costo_unitario, costo_total, motivo, referencia_tipo, referencia_id, usuario_id)
                     VALUES (?,?,'salida',?,?,?,?,?,'venta_platillo','factura',?,?)`,
                    [tid, item.ingrediente_id, cantNecesaria, Number(ingr.stock_actual) + cantNecesaria, Number(ingr.stock_actual), Number(ingr.costo_unitario), cantNecesaria * Number(ingr.costo_unitario), factura_id || null, uid]
                );
            } else {
                errores.push({ ingrediente_id: item.ingrediente_id, cantidad: cantNecesaria, error: 'No se pudo descontar' });
            }
        }

        res.json({ descontado: true, errores });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
