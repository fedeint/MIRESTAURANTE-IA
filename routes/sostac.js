/**
 * routes/sostac.js
 * SOSTAC strategic framework: Brief Express wizard + dashboard
 *
 * Mounts at: /sostac  (requireAuth + requireRole(['administrador']) applied in server.js)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return the active brief for the current tenant, or null.
 */
async function getActiveBrief(tenantId) {
  const [rows] = await db.query(
    `SELECT * FROM sostac_briefs WHERE tenant_id = ? AND activo = true ORDER BY id DESC LIMIT 1`,
    [tenantId]
  );
  return rows[0] || null;
}

/**
 * Return objectives for the current tenant.
 */
async function getObjetivos(tenantId) {
  const [rows] = await db.query(
    `SELECT * FROM sostac_objetivos WHERE tenant_id = ? AND estado != 'cancelado' ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

/**
 * Return the latest situacion record for the current tenant.
 */
async function getLatestSituacion(tenantId) {
  const [rows] = await db.query(
    `SELECT * FROM sostac_situacion WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`,
    [tenantId]
  );
  return rows[0] || null;
}

// ── GET /sostac ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const brief = await getActiveBrief(tenantId);

    if (!brief) {
      return res.redirect('/sostac/brief');
    }

    const [objetivos, situacion] = await Promise.all([
      getObjetivos(tenantId),
      getLatestSituacion(tenantId),
    ]);

    res.render('sostac/index', { brief, objetivos, situacion, title: 'SOSTAC — Estrategia' });
  } catch (err) {
    console.error('[SOSTAC] GET / error:', err.message);
    res.status(500).render('error', { message: 'Error al cargar el módulo SOSTAC.' });
  }
});

// ── GET /sostac/brief ────────────────────────────────────────────────────────
router.get('/brief', async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const brief = await getActiveBrief(tenantId);
    res.render('sostac/brief', { brief, title: 'Brief Express — SOSTAC' });
  } catch (err) {
    console.error('[SOSTAC] GET /brief error:', err.message);
    res.status(500).render('error', { message: 'Error al cargar el Brief Express.' });
  }
});

// ── POST /sostac/brief ───────────────────────────────────────────────────────
router.post('/brief', async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const datos    = req.body.datos || req.body;  // accept both wrapped and flat

    // Deactivate old briefs
    await db.query(
      `UPDATE sostac_briefs SET activo = false WHERE tenant_id = ?`,
      [tenantId]
    );

    // Insert new brief
    const [result] = await db.query(
      `INSERT INTO sostac_briefs (tenant_id, datos, generado_por, version, activo)
       VALUES (?, ?::jsonb, 'delfino', 1, true)
       RETURNING id`,
      [tenantId, JSON.stringify(datos)]
    );

    const briefId = result.insertId || result[0]?.id;

    res.json({ ok: true, briefId });
  } catch (err) {
    console.error('[SOSTAC] POST /brief error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /sostac/situacion ────────────────────────────────────────────────────
router.get('/situacion', async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const brief     = await getActiveBrief(tenantId);
    const situacion = await getLatestSituacion(tenantId);
    res.render('sostac/situacion', { brief, situacion, title: 'Situación — SOSTAC' });
  } catch (err) {
    console.error('[SOSTAC] GET /situacion error:', err.message);
    res.status(500).render('error', { message: 'Error al cargar el análisis situacional.' });
  }
});

// ── GET /api/sostac/brief ────────────────────────────────────────────────────
router.get('/api/brief', async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const brief = await getActiveBrief(tenantId);
    if (!brief) return res.json({ ok: false, brief: null });
    res.json({ ok: true, brief });
  } catch (err) {
    console.error('[SOSTAC] GET /api/brief error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/sostac/brief/generate ─────────────────────────────────────────
// Calls Claude AI to generate situational insights from the brief data.
router.post('/api/brief/generate', async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const brief = await getActiveBrief(tenantId);

    if (!brief) {
      return res.status(404).json({ ok: false, error: 'No hay un brief activo. Completa primero el Brief Express.' });
    }

    // Build AI prompt from brief data
    const datos   = brief.datos || {};
    const negocio = datos.negocio || {};
    const clientes = datos.clientes || {};
    const finanzas = datos.finanzas || {};
    const competencia = datos.competencia || {};
    const objetivos   = datos.objetivos || {};

    const prompt = `Eres Delfino, un consultor estratégico de restaurantes con enfoque en el framework SOSTAC.
Analiza el siguiente brief de negocio y genera un análisis situacional completo en JSON con esta estructura exacta:

{
  "resumen_ejecutivo": "2-3 oraciones sobre el estado actual del negocio",
  "fortalezas": ["array de 3-5 fortalezas clave"],
  "debilidades": ["array de 3-5 debilidades a mejorar"],
  "oportunidades": ["array de 3-4 oportunidades del mercado"],
  "amenazas": ["array de 3-4 amenazas externas"],
  "posicion_competitiva": "párrafo sobre posición vs competidores",
  "recomendacion_principal": "La recomendación número 1 para este negocio",
  "indicadores_clave": [
    { "nombre": "Food Cost", "valor_actual": "X%", "benchmark": "30%", "estado": "ok|alerta|critico" }
  ]
}

Brief del negocio:
- Nombre: ${negocio.nombre || 'N/A'}
- Tipo de cocina: ${negocio.tipo_cocina || 'N/A'}
- Años operando: ${negocio.años_operando || 'N/A'}
- Empleados: ${negocio.num_empleados || 'N/A'}
- Sedes: ${negocio.num_sedes || 'N/A'}
- Cliente ideal: ${clientes.cliente_ideal || 'N/A'}
- Ticket promedio: ${clientes.ticket_promedio || 'N/A'}
- Frecuencia de visita: ${clientes.frecuencia_visita || 'N/A'}
- Cómo llegan: ${clientes.como_llegan || 'N/A'}
- Ventas mensuales aprox: ${finanzas.ventas_mensuales || 'N/A'}
- Food cost actual: ${finanzas.food_cost || 'N/A'}
- Margen objetivo: ${finanzas.margen_objetivo || 'N/A'}
- Gastos fijos: ${finanzas.gastos_fijos || 'N/A'}
- Competidores: ${competencia.principales || 'N/A'}
- Diferenciador: ${competencia.diferenciador || 'N/A'}
- Amenazas: ${competencia.amenazas || 'N/A'}
- Objetivo principal: ${objetivos.objetivo_principal || 'N/A'}
- Meta de ventas: ${objetivos.meta_ventas || 'N/A'}
- Expansión planificada: ${objetivos.expansion || 'N/A'}
- Áreas a mejorar: ${objetivos.areas_mejorar || 'N/A'}

Responde ÚNICAMENTE con el JSON, sin markdown ni texto adicional.`;

    // Use Anthropic SDK if available, otherwise return a structured fallback
    let analisis;
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0]?.text || '{}';
      // Strip any accidental markdown fences
      const clean = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
      analisis = JSON.parse(clean);
    } catch (aiErr) {
      console.warn('[SOSTAC] AI generation failed, using fallback:', aiErr.message);
      // Structured fallback when AI is unavailable
      analisis = {
        resumen_ejecutivo: `${negocio.nombre || 'El negocio'} opera en el sector de ${negocio.tipo_cocina || 'restauración'} con ${negocio.años_operando || 'varios'} años de experiencia. El análisis de la información proporcionada permite identificar oportunidades de mejora en rentabilidad y captación de clientes.`,
        fortalezas: [
          'Experiencia en el sector gastronómico',
          `Diferenciador claro: ${competencia.diferenciador || 'propuesta de valor definida'}`,
          'Equipo operativo establecido',
        ],
        debilidades: [
          `Food cost a revisar: ${finanzas.food_cost || 'sin dato'}`,
          'Necesidad de sistematizar procesos de marketing',
          'Captación de nuevos clientes a optimizar',
        ],
        oportunidades: [
          'Crecimiento del mercado de delivery y experiencias gastronómicas',
          'Fidelización de clientes existentes',
          `Meta de ventas alcanzable: ${objetivos.meta_ventas || 'por definir'}`,
        ],
        amenazas: [
          `Competidores directos: ${competencia.principales || 'mercado competitivo'}`,
          `Amenazas identificadas: ${competencia.amenazas || 'presión de costos'}`,
          'Volatilidad en costos de insumos',
        ],
        posicion_competitiva: `Frente a competidores como ${competencia.principales || 'el mercado local'}, el negocio se diferencia por ${competencia.diferenciador || 'su propuesta de valor'}. Hay espacio para fortalecer el posicionamiento en el segmento de ${clientes.cliente_ideal || 'clientes objetivo'}.`,
        recomendacion_principal: `Implementar un plan estructurado para alcanzar la meta de ventas de ${objetivos.meta_ventas || 'los objetivos definidos'}, priorizando la retención de clientes actuales y mejorando el food cost hasta el benchmark del 30%.`,
        indicadores_clave: [
          { nombre: 'Food Cost', valor_actual: finanzas.food_cost || 'N/A', benchmark: '30%', estado: 'alerta' },
          { nombre: 'Ticket Promedio', valor_actual: clientes.ticket_promedio || 'N/A', benchmark: 'sector', estado: 'ok' },
          { nombre: 'Margen Objetivo', valor_actual: finanzas.margen_objetivo || 'N/A', benchmark: '15-20%', estado: 'ok' },
        ],
      };
    }

    // Persist the analysis
    const periodo = new Date().toISOString().slice(0, 7);   // '2026-03'
    await db.query(
      `INSERT INTO sostac_situacion (tenant_id, brief_id, datos, periodo)
       VALUES (?, ?, ?::jsonb, ?)`,
      [tenantId, brief.id, JSON.stringify(analisis), periodo]
    );

    res.json({ ok: true, analisis });
  } catch (err) {
    console.error('[SOSTAC] POST /api/brief/generate error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /sostac/api/situacion/datos ──────────────────────────────────────────
// Returns real operational data from the POS for the situational analysis dashboard.
router.get('/api/situacion/datos', async (req, res) => {
  const tenantId = req.tenantId || 1;

  // Helper: run a query and return the first row's first numeric column, or 0 on error.
  async function safeScalar(sql, params) {
    try {
      const [rows] = await db.query(sql, params);
      if (!rows || rows.length === 0) return 0;
      const val = Object.values(rows[0])[0];
      return val === null || val === undefined ? 0 : Number(val);
    } catch (_) { return 0; }
  }

  // Helper: run a query and return rows array, or [] on error.
  async function safeRows(sql, params) {
    try {
      const [rows] = await db.query(sql, params);
      return rows || [];
    } catch (_) { return []; }
  }

  try {
    // ── Ventas ────────────────────────────────────────────────────────────────
    const [ventasHoy, ventasSemana, ventasMes, ventasMesAnterior] = await Promise.all([
      safeScalar(
        `SELECT COALESCE(SUM(total), 0) AS total FROM facturas
         WHERE tenant_id = ? AND DATE(created_at) = CURRENT_DATE AND anulada = false`,
        [tenantId]
      ),
      safeScalar(
        `SELECT COALESCE(SUM(total), 0) AS total FROM facturas
         WHERE tenant_id = ? AND created_at >= NOW() - INTERVAL '7 days' AND anulada = false`,
        [tenantId]
      ),
      safeScalar(
        `SELECT COALESCE(SUM(total), 0) AS total FROM facturas
         WHERE tenant_id = ? AND created_at >= DATE_TRUNC('month', NOW()) AND anulada = false`,
        [tenantId]
      ),
      safeScalar(
        `SELECT COALESCE(SUM(total), 0) AS total FROM facturas
         WHERE tenant_id = ?
           AND created_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
           AND created_at <  DATE_TRUNC('month', NOW())
           AND anulada = false`,
        [tenantId]
      ),
    ]);

    const variacionPct = ventasMesAnterior > 0
      ? Number((((ventasMes - ventasMesAnterior) / ventasMesAnterior) * 100).toFixed(1))
      : null;

    // ── Productos ─────────────────────────────────────────────────────────────
    const [totalProductos, top5, bajo5] = await Promise.all([
      safeScalar(
        `SELECT COUNT(*) AS total FROM productos WHERE tenant_id = ? AND activo = true`,
        [tenantId]
      ),
      safeRows(
        `SELECT p.nombre, COALESCE(SUM(df.cantidad), 0) AS vendidos
         FROM productos p
         LEFT JOIN detalle_factura df ON df.producto_id = p.id
           AND df.created_at >= NOW() - INTERVAL '30 days'
         WHERE p.tenant_id = ?
         GROUP BY p.id, p.nombre
         ORDER BY vendidos DESC
         LIMIT 5`,
        [tenantId]
      ),
      safeRows(
        `SELECT p.nombre, COALESCE(SUM(df.cantidad), 0) AS vendidos
         FROM productos p
         LEFT JOIN detalle_factura df ON df.producto_id = p.id
           AND df.created_at >= NOW() - INTERVAL '30 days'
         WHERE p.tenant_id = ?
         GROUP BY p.id, p.nombre
         ORDER BY vendidos ASC
         LIMIT 5`,
        [tenantId]
      ),
    ]);

    // ── Inventario ────────────────────────────────────────────────────────────
    const [totalIngredientes, bajoMinimo, porVencer] = await Promise.all([
      safeScalar(
        `SELECT COUNT(*) AS total FROM almacen_ingredientes WHERE tenant_id = ?`,
        [tenantId]
      ),
      safeRows(
        `SELECT nombre, stock_actual, stock_minimo, unidad
         FROM almacen_ingredientes
         WHERE tenant_id = ? AND stock_actual < stock_minimo
         ORDER BY (stock_actual::float / NULLIF(stock_minimo, 0)) ASC
         LIMIT 10`,
        [tenantId]
      ),
      safeRows(
        `SELECT ai.nombre, al.fecha_vencimiento, al.cantidad, al.unidad
         FROM almacen_lotes al
         JOIN almacen_ingredientes ai ON ai.id = al.ingrediente_id
         WHERE ai.tenant_id = ?
           AND al.fecha_vencimiento IS NOT NULL
           AND al.fecha_vencimiento <= NOW() + INTERVAL '7 days'
           AND al.fecha_vencimiento >= CURRENT_DATE
         ORDER BY al.fecha_vencimiento ASC
         LIMIT 10`,
        [tenantId]
      ),
    ]);

    // ── Gastos ────────────────────────────────────────────────────────────────
    const [gastosMes, gastosPorCategoria] = await Promise.all([
      safeScalar(
        `SELECT COALESCE(SUM(monto), 0) AS total FROM gastos
         WHERE tenant_id = ? AND created_at >= DATE_TRUNC('month', NOW())`,
        [tenantId]
      ),
      safeRows(
        `SELECT categoria, COALESCE(SUM(monto), 0) AS total
         FROM gastos
         WHERE tenant_id = ? AND created_at >= DATE_TRUNC('month', NOW())
         GROUP BY categoria
         ORDER BY total DESC
         LIMIT 8`,
        [tenantId]
      ),
    ]);

    // ── Personal ──────────────────────────────────────────────────────────────
    const [totalPersonal, personalPorRol] = await Promise.all([
      safeScalar(
        `SELECT COUNT(*) AS total FROM personal WHERE tenant_id = ? AND activo = true`,
        [tenantId]
      ),
      safeRows(
        `SELECT rol, COUNT(*) AS total FROM personal
         WHERE tenant_id = ? AND activo = true
         GROUP BY rol ORDER BY total DESC`,
        [tenantId]
      ),
    ]);

    // ── Clientes ──────────────────────────────────────────────────────────────
    const [totalClientes, clientesNuevosMes] = await Promise.all([
      safeScalar(
        `SELECT COUNT(*) AS total FROM clientes WHERE tenant_id = ?`,
        [tenantId]
      ),
      safeScalar(
        `SELECT COUNT(*) AS total FROM clientes
         WHERE tenant_id = ? AND created_at >= DATE_TRUNC('month', NOW())`,
        [tenantId]
      ),
    ]);

    // ── Mesas ─────────────────────────────────────────────────────────────────
    const totalMesas = await safeScalar(
      `SELECT COUNT(*) AS total FROM mesas WHERE tenant_id = ?`,
      [tenantId]
    );

    const datos = {
      ventas: {
        hoy: ventasHoy,
        semana: ventasSemana,
        mes: ventasMes,
        mes_anterior: ventasMesAnterior,
        variacion_pct: variacionPct,
      },
      productos: {
        total: totalProductos,
        top_5: top5.map(r => ({ nombre: r.nombre, vendidos: Number(r.vendidos) })),
        bajo_5: bajo5.map(r => ({ nombre: r.nombre, vendidos: Number(r.vendidos) })),
      },
      inventario: {
        total_items: totalIngredientes,
        bajo_minimo: bajoMinimo.map(r => ({
          nombre: r.nombre,
          stock_actual: Number(r.stock_actual),
          stock_minimo: Number(r.stock_minimo),
          unidad: r.unidad || '',
        })),
        por_vencer: porVencer.map(r => ({
          nombre: r.nombre,
          fecha_vencimiento: r.fecha_vencimiento,
          cantidad: Number(r.cantidad),
          unidad: r.unidad || '',
        })),
      },
      gastos: {
        mes: gastosMes,
        por_categoria: gastosPorCategoria.map(r => ({
          categoria: r.categoria || 'Sin categoría',
          total: Number(r.total),
        })),
      },
      personal: {
        total: totalPersonal,
        por_rol: personalPorRol.map(r => ({ rol: r.rol || 'Sin rol', total: Number(r.total) })),
      },
      clientes: {
        total: totalClientes,
        nuevos_mes: clientesNuevosMes,
      },
      mesas: {
        total: totalMesas,
      },
    };

    res.json({ ok: true, datos });
  } catch (err) {
    console.error('[SOSTAC] GET /api/situacion/datos error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
