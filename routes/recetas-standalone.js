const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const uploadRecetas = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
let ExcelJS;

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
                stack: process.env.NODE_ENV !== 'production' ? error.stack : null
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

// GET /api/recetas-standalone/plantilla — Download Excel template for recipes
router.get('/plantilla', async (req, res) => {
  try {
    try { ExcelJS = ExcelJS || require('exceljs'); } catch (e) { return res.status(500).send('Instale exceljs'); }
    const tid = req.tenantId || 1;

    const wb = new ExcelJS.Workbook();

    // Hoja Instrucciones
    const wsInstr = wb.addWorksheet('Instrucciones');
    wsInstr.getColumn(1).width = 90;
    wsInstr.addRow(['PLANTILLA DE RECETAS']).font = { bold: true, size: 16 };
    wsInstr.addRow(['']).font = { size: 10 };
    wsInstr.addRow(['1) En la hoja "Recetas" llene una fila por cada ingrediente de cada producto.']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['2) Si un producto tiene 3 ingredientes, tendrá 3 filas con el mismo nombre de producto.']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['3) El nombre del producto debe coincidir exactamente con un producto existente.']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['4) El nombre del ingrediente debe coincidir exactamente con un ingrediente del almacén.']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['5) Unidades válidas: g, kg, ml, lt, und']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['6) Si el producto ya tiene receta, se creará una nueva versión.']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['7) Porciones: cuántas porciones rinde la receta (default: 1).']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['']).font = { size: 10 };
    wsInstr.addRow(['EJEMPLO:']).font = { bold: true };
    wsInstr.addRow(['Producto: "Aji de Gallina" con 3 ingredientes:']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['  Fila 1: Aji de Gallina | Arroz | 300 | g | 1']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['  Fila 2: Aji de Gallina | Pollo deshilachado | 250 | g | 1']).font = { color: { argb: 'FF495057' } };
    wsInstr.addRow(['  Fila 3: Aji de Gallina | Aji amarillo | 50 | g | 1']).font = { color: { argb: 'FF495057' } };

    // Hoja Recetas
    const wsRecetas = wb.addWorksheet('Recetas');
    wsRecetas.columns = [
      { header: 'producto', key: 'producto', width: 30 },
      { header: 'ingrediente', key: 'ingrediente', width: 30 },
      { header: 'cantidad', key: 'cantidad', width: 12 },
      { header: 'unidad', key: 'unidad', width: 10 },
      { header: 'porciones', key: 'porciones', width: 12 }
    ];
    const headerRow = wsRecetas.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsRecetas.views = [{ state: 'frozen', ySplit: 1 }];

    // Ejemplos
    wsRecetas.addRow({ producto: 'Aji de Gallina', ingrediente: 'Arroz', cantidad: 300, unidad: 'g', porciones: 1 });
    wsRecetas.addRow({ producto: 'Aji de Gallina', ingrediente: 'Pollo deshilachado', cantidad: 250, unidad: 'g', porciones: 1 });
    wsRecetas.addRow({ producto: 'Aji de Gallina', ingrediente: 'Aji amarillo', cantidad: 50, unidad: 'g', porciones: 1 });
    wsRecetas.addRow({ producto: 'Ceviche', ingrediente: 'Pescado', cantidad: 200, unidad: 'g', porciones: 1 });
    wsRecetas.addRow({ producto: 'Ceviche', ingrediente: 'Limon', cantidad: 100, unidad: 'ml', porciones: 1 });
    wsRecetas.addRow({ producto: 'Ceviche', ingrediente: 'Cebolla', cantidad: 80, unidad: 'g', porciones: 1 });

    // Hoja Referencia: productos e ingredientes actuales
    const wsRef = wb.addWorksheet('Referencia');
    wsRef.getColumn(1).width = 35;
    wsRef.getColumn(2).width = 35;
    wsRef.getColumn(3).width = 12;
    wsRef.addRow(['PRODUCTOS DISPONIBLES', 'INGREDIENTES DISPONIBLES', 'UNIDAD']).font = { bold: true };

    const [productos] = await db.query('SELECT nombre FROM productos WHERE tenant_id=? ORDER BY nombre', [tid]);
    const [ingredientes] = await db.query('SELECT nombre, unidad_medida FROM almacen_ingredientes WHERE tenant_id=? AND activo=true ORDER BY nombre', [tid]);

    const maxRows = Math.max(productos.length, ingredientes.length);
    for (let i = 0; i < maxRows; i++) {
      wsRef.addRow([
        productos[i]?.nombre || '',
        ingredientes[i]?.nombre || '',
        ingredientes[i]?.unidad_medida || ''
      ]);
    }

    // Validación de unidad
    wsRecetas.dataValidations.add('D2:D10000', {
      type: 'list', allowBlank: false,
      formulae: ['"g,kg,ml,lt,und"'],
      showErrorMessage: true, errorTitle: 'Unidad inválida', error: 'Use: g, kg, ml, lt, und'
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_recetas.xlsx"');
    await wb.xlsx.write(res); res.end();
  } catch (e) {
    console.error('Error generando plantilla recetas:', e);
    res.status(500).send('No se pudo generar la plantilla');
  }
});

// POST /api/recetas-standalone/importar — Import recipes from Excel
router.post('/importar', uploadRecetas.single('archivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    try { ExcelJS = ExcelJS || require('exceljs'); } catch (e) { return res.status(500).json({ error: 'Instale exceljs' }); }

    const tid = req.tenantId || 1;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);

    const ws = wb.getWorksheet('Recetas');
    if (!ws) return res.status(400).json({ error: 'No se encontró la hoja "Recetas" en el archivo' });

    // Cargar productos e ingredientes del tenant
    const [productos] = await db.query('SELECT id, nombre FROM productos WHERE tenant_id=?', [tid]);
    const [ingredientes] = await db.query('SELECT id, nombre FROM almacen_ingredientes WHERE tenant_id=? AND activo=true', [tid]);

    const prodMap = {};
    productos.forEach(p => { prodMap[p.nombre.toLowerCase().trim()] = p.id; });
    const ingMap = {};
    ingredientes.forEach(i => { ingMap[i.nombre.toLowerCase().trim()] = i.id; });

    // Agrupar filas por producto
    const recetasPorProducto = {};
    const errores = [];
    let filaNum = 0;

    ws.eachRow(function(row, rowNumber) {
      if (rowNumber === 1) return; // skip header
      filaNum++;
      const productoNombre = String(row.getCell(1).value || '').trim();
      const ingredienteNombre = String(row.getCell(2).value || '').trim();
      const cantidad = Number(row.getCell(3).value) || 0;
      const unidad = String(row.getCell(4).value || 'g').trim().toLowerCase();
      const porciones = Number(row.getCell(5).value) || 1;

      if (!productoNombre || !ingredienteNombre) {
        if (productoNombre || ingredienteNombre) errores.push(`Fila ${rowNumber}: producto o ingrediente vacío`);
        return;
      }

      const prodId = prodMap[productoNombre.toLowerCase()];
      if (!prodId) {
        errores.push(`Fila ${rowNumber}: producto "${productoNombre}" no encontrado`);
        return;
      }

      const ingId = ingMap[ingredienteNombre.toLowerCase()];
      if (!ingId) {
        errores.push(`Fila ${rowNumber}: ingrediente "${ingredienteNombre}" no encontrado en almacén`);
        return;
      }

      if (cantidad <= 0) {
        errores.push(`Fila ${rowNumber}: cantidad debe ser mayor a 0`);
        return;
      }

      if (!['g', 'kg', 'ml', 'lt', 'und'].includes(unidad)) {
        errores.push(`Fila ${rowNumber}: unidad "${unidad}" inválida (use g, kg, ml, lt, und)`);
        return;
      }

      if (!recetasPorProducto[prodId]) {
        recetasPorProducto[prodId] = { nombre: productoNombre, porciones, items: [] };
      }
      recetasPorProducto[prodId].items.push({ ingrediente_id: ingId, cantidad, unidad_medida: unidad });
    });

    // Crear recetas
    let creadas = 0;
    for (const [prodId, recetaData] of Object.entries(recetasPorProducto)) {
      if (recetaData.items.length === 0) continue;

      // Desactivar receta anterior
      await db.query('UPDATE recetas SET activa=false WHERE tenant_id=? AND producto_id=?', [tid, prodId]);

      // Nueva versión
      const [[maxVer]] = await db.query('SELECT COALESCE(MAX(version),0) as v FROM recetas WHERE tenant_id=? AND producto_id=?', [tid, prodId]);
      const newVersion = (maxVer.v || 0) + 1;

      const [recetaResult] = await db.query(
        `INSERT INTO recetas (tenant_id, producto_id, version, rendimiento_porciones, activa)
         VALUES (?,?,?,?,true) RETURNING id`,
        [tid, prodId, newVersion, recetaData.porciones || 1]
      );
      const recetaId = recetaResult.insertId || recetaResult?.[0]?.id;

      for (const item of recetaData.items) {
        await db.query(
          `INSERT INTO receta_items (receta_id, ingrediente_id, tipo, cantidad, unidad_medida)
           VALUES (?,?, 'ingrediente', ?,?)`,
          [recetaId, item.ingrediente_id, item.cantidad, item.unidad_medida]
        );
      }

      // Trigger costeo
      try {
        const { recalcularCostoReceta } = require('../services/costeo-recetas');
        await recalcularCostoReceta(tid, recetaId);
      } catch (_) {}

      creadas++;
    }

    res.json({
      message: `${creadas} receta(s) importada(s) exitosamente`,
      creadas,
      errores: errores.length > 0 ? errores : undefined
    });
  } catch (e) {
    console.error('Error importando recetas:', e);
    res.status(500).json({ error: e.message });
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
