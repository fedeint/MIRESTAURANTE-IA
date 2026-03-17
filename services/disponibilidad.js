const db = require('../db');

/**
 * Calcula cuantas porciones de un plato se pueden hacer
 * basado en el ingrediente mas escaso de su receta.
 *
 * Ejemplo: Ceviche necesita 150g pescado y 200g cebolla
 * Si hay 600g de pescado y 1000g de cebolla:
 * - Pescado: 600/150 = 4 platos
 * - Cebolla: 1000/200 = 5 platos
 * - Disponible: 4 (el minimo)
 */
async function calcularDisponibilidadProducto(productoId) {
    try {
        // Buscar receta activa
        const [[receta]] = await db.query(
            'SELECT id FROM recetas WHERE producto_id=? AND activa=1 LIMIT 1', [productoId]
        );
        if (!receta) return { disponible: -1, sinReceta: true }; // -1 = sin receta

        // Items de la receta con stock actual
        const [items] = await db.query(`
            SELECT ri.ingrediente_id, ri.cantidad, ri.unidad_medida,
                   ai.nombre as ingrediente_nombre, ai.stock_actual, ai.stock_minimo,
                   ai.unidad_medida as ingrediente_unidad
            FROM receta_items ri
            JOIN almacen_ingredientes ai ON ai.id = ri.ingrediente_id
            WHERE ri.receta_id = ?
        `, [receta.id]);

        if (items.length === 0) return { disponible: -1, sinReceta: true };

        let minPlatos = Infinity;
        let ingredienteLimitante = null;
        const detalles = [];

        for (const item of items) {
            const stockDisponible = Number(item.stock_actual) || 0;
            const cantidadPorPlato = Number(item.cantidad) || 1;
            const platosConEste = Math.floor(stockDisponible / cantidadPorPlato);

            detalles.push({
                ingrediente: item.ingrediente_nombre,
                stock: stockDisponible,
                necesita: cantidadPorPlato,
                alcanza_para: platosConEste,
                bajo_minimo: stockDisponible <= Number(item.stock_minimo)
            });

            if (platosConEste < minPlatos) {
                minPlatos = platosConEste;
                ingredienteLimitante = item.ingrediente_nombre;
            }
        }

        return {
            disponible: minPlatos === Infinity ? 0 : minPlatos,
            ingrediente_limitante: ingredienteLimitante,
            detalles,
            sinReceta: false
        };
    } catch (e) {
        console.error('Error calculando disponibilidad:', e.message);
        return { disponible: -1, sinReceta: true };
    }
}

/**
 * Calcula disponibilidad de TODOS los productos con receta
 * Retorna ranking ordenado por disponibilidad
 */
async function rankingDisponibilidad() {
    try {
        const [productos] = await db.query(`
            SELECT p.id, p.nombre, p.precio_unidad, p.imagen,
                   r.id as receta_id, r.tiempo_preparacion_min
            FROM productos p
            JOIN recetas r ON r.producto_id = p.id AND r.activa = 1
            ORDER BY p.nombre
        `);

        const resultado = [];

        for (const prod of productos) {
            const [items] = await db.query(`
                SELECT ri.cantidad, ai.stock_actual, ai.nombre as ingrediente_nombre
                FROM receta_items ri
                JOIN almacen_ingredientes ai ON ai.id = ri.ingrediente_id
                WHERE ri.receta_id = ?
            `, [prod.receta_id]);

            let minPlatos = Infinity;
            let limitante = null;

            for (const item of items) {
                const platosConEste = Math.floor(Number(item.stock_actual) / Number(item.cantidad));
                if (platosConEste < minPlatos) {
                    minPlatos = platosConEste;
                    limitante = item.ingrediente_nombre;
                }
            }

            resultado.push({
                id: prod.id,
                nombre: prod.nombre,
                precio: prod.precio_unidad,
                disponible: minPlatos === Infinity ? 0 : minPlatos,
                ingrediente_limitante: limitante,
                ingredientes_total: items.length,
                tiempo_min: prod.tiempo_preparacion_min
            });
        }

        // Ordenar por disponibilidad descendente
        resultado.sort((a, b) => b.disponible - a.disponible);
        return resultado;
    } catch (e) {
        console.error('Error ranking disponibilidad:', e.message);
        return [];
    }
}

module.exports = { calcularDisponibilidadProducto, rankingDisponibilidad };
