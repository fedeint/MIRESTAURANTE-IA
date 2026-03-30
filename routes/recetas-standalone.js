const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /recetas - Render standalone recipes page
router.get('/', async (req, res) => {
    try {
        const tid = req.tenantId || 1;

        const [recetas] = await db.query(`
            SELECT
                r.id,
                r.producto_id,
                p.nombre AS producto_nombre,
                COALESCE(p.categoria, 'Sin categoría') AS categoria,
                r.version,
                r.nombre_version,
                r.rendimiento_porciones,
                r.tiempo_preparacion_min,
                r.food_cost_objetivo_pct,
                r.activa,
                r.created_at,
                COUNT(ri.id) AS num_ingredientes
            FROM recetas r
            JOIN productos p ON p.id = r.producto_id
            LEFT JOIN receta_items ri ON ri.receta_id = r.id
            WHERE r.tenant_id = ?
            GROUP BY r.id, r.producto_id, p.nombre, p.categoria,
                     r.version, r.nombre_version, r.rendimiento_porciones,
                     r.tiempo_preparacion_min, r.food_cost_objetivo_pct,
                     r.activa, r.created_at
            ORDER BY p.nombre ASC, r.version DESC
        `, [tid]);

        // Collect distinct categories for filter
        const categorias = [...new Set((recetas || []).map(r => r.categoria))].sort();

        res.render('recetas-standalone', { recetas: recetas || [], categorias });
    } catch (error) {
        console.error('Error al obtener recetas:', error);
        res.status(500).render('error', {
            error: {
                message: 'Error al obtener recetas',
                stack: error.stack
            }
        });
    }
});

// GET /api/recetas-standalone/list - JSON list for AJAX refresh
router.get('/list', async (req, res) => {
    try {
        const tid = req.tenantId || 1;

        const [recetas] = await db.query(`
            SELECT
                r.id,
                r.producto_id,
                p.nombre AS producto_nombre,
                COALESCE(p.categoria, 'Sin categoría') AS categoria,
                r.version,
                r.nombre_version,
                r.rendimiento_porciones,
                r.tiempo_preparacion_min,
                r.food_cost_objetivo_pct,
                r.activa,
                r.created_at,
                COUNT(ri.id) AS num_ingredientes
            FROM recetas r
            JOIN productos p ON p.id = r.producto_id
            LEFT JOIN receta_items ri ON ri.receta_id = r.id
            WHERE r.tenant_id = ?
            GROUP BY r.id, r.producto_id, p.nombre, p.categoria,
                     r.version, r.nombre_version, r.rendimiento_porciones,
                     r.tiempo_preparacion_min, r.food_cost_objetivo_pct,
                     r.activa, r.created_at
            ORDER BY p.nombre ASC, r.version DESC
        `, [tid]);

        res.json(recetas || []);
    } catch (error) {
        console.error('Error al listar recetas:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/recetas-standalone/:id/items - Items of a specific recipe for inline expand
router.get('/:id/items', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const recetaId = Number(req.params.id);

        // Verify receta belongs to tenant
        const [[receta]] = await db.query(
            'SELECT id FROM recetas WHERE id = ? AND tenant_id = ?',
            [recetaId, tid]
        );
        if (!receta) return res.status(404).json({ error: 'Receta no encontrada' });

        const [items] = await db.query(`
            SELECT
                ri.id,
                ri.cantidad,
                ri.unidad_medida,
                ri.es_opcional,
                ri.notas,
                ai.nombre AS ingrediente_nombre,
                ai.costo_unitario AS ingrediente_costo,
                ai.unidad_medida AS ingrediente_unidad,
                ai.stock_actual,
                ai.merma_preparacion_pct
            FROM receta_items ri
            LEFT JOIN almacen_ingredientes ai ON ai.id = ri.ingrediente_id
            WHERE ri.receta_id = ?
            ORDER BY ri.id ASC
        `, [recetaId]);

        // Calculate cost per item
        let costoTotal = 0;
        const itemsConCosto = (items || []).map(item => {
            let costoItem = 0;
            if (item.ingrediente_costo != null) {
                const costoBase = Number(item.ingrediente_costo) || 0;
                const merma = Number(item.merma_preparacion_pct) || 0;
                const costoConMerma = merma > 0 ? costoBase / (1 - merma) : costoBase;
                const cant = Number(item.cantidad) || 0;
                const unidad = String(item.unidad_medida || '').toLowerCase();
                const ingUnidad = String(item.ingrediente_unidad || '').toLowerCase();

                let costoUnitConvertido = costoConMerma;
                if ((unidad === 'g' || unidad === 'ml') && (ingUnidad === 'kg' || ingUnidad === 'lt')) {
                    costoUnitConvertido = costoConMerma / 1000;
                }
                costoItem = costoUnitConvertido * cant;
                costoTotal += costoItem;
            }
            return { ...item, costo_item: costoItem };
        });

        res.json({ items: itemsConCosto, costo_total: costoTotal });
    } catch (error) {
        console.error('Error al obtener items de receta:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/recetas-standalone/recalcular-costos — Recalculate all recipe costs
router.post('/recalcular-costos', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const { recalcularTodas } = require('../services/costeo-recetas');
    await recalcularTodas(tid);
    res.json({ message: 'Costos recalculados para todas las recetas' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
