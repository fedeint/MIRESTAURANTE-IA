'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── helpers ────────────────────────────────────────────────────────────────

function mesAnioActual() {
  const now = new Date();
  return { mes: now.getMonth() + 1, anio: now.getFullYear() };
}

function nombreMes(mes) {
  return ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
          'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes];
}

// Día de vencimiento SUNAT según último dígito del RUC (tabla general simplificada)
function diasVencimientoPorDigito(digito) {
  const tabla = { 0: 10, 1: 11, 2: 12, 3: 13, 4: 14, 5: 15, 6: 16, 7: 17, 8: 18, 9: 9 };
  return tabla[digito] ?? 15;
}

// ─── GET /sunat-pwa — Calendario de vencimientos ─────────────────────────────

router.get('/', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [[config]] = await db.query(
      'SELECT ruc_emisor, razon_social_emisor, regimen_tributario FROM config_sunat cs LEFT JOIN tenants t ON t.id = cs.tenant_id WHERE cs.tenant_id = ?',
      [tid]
    );

    const ruc     = config?.ruc_emisor || null;
    const razon   = config?.razon_social_emisor || req.session.user.nombre || '';
    const digito  = ruc ? parseInt(ruc.slice(-1)) : null;
    const diaVenc = digito !== null ? diasVencimientoPorDigito(digito) : 15;

    const now  = new Date();
    const mes  = now.getMonth() + 1;
    const anio = now.getFullYear();

    // Calcular fechas de vencimiento del mes actual
    function fechaVenc(dia, m, a) {
      return new Date(a, m - 1, dia);
    }

    function diasRestantes(fecha) {
      const diff = fecha - now;
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    const vencIGV    = fechaVenc(diaVenc, mes + 1 > 12 ? 1 : mes + 1, mes + 1 > 12 ? anio + 1 : anio);
    const vencPLAME  = fechaVenc(diaVenc + 2 > 28 ? 28 : diaVenc + 2, mes + 1 > 12 ? 1 : mes + 1, mes + 1 > 12 ? anio + 1 : anio);
    const vencCTS    = fechaVenc(15, 5, anio);      // CTS mayo
    const vencGrat   = fechaVenc(15, 7, anio);      // Gratificación julio

    // IGV del mes para mostrar monto estimado
    const [[igvRow]] = await db.query(
      `SELECT COALESCE(SUM(igv),0) as total_igv FROM facturas
       WHERE tenant_id = ? AND EXTRACT(MONTH FROM fecha) = ? AND EXTRACT(YEAR FROM fecha) = ?`,
      [tid, mes, anio]
    );

    const vencimientos = [
      {
        titulo:       `IGV ${nombreMes(mes)}`,
        subtitulo:    `S/ ${Number(igvRow.total_igv || 0).toFixed(2)} estimado`,
        fecha:        vencIGV.toLocaleDateString('es-PE', { day:'2-digit', month:'short' }),
        diasRestantes: diasRestantes(vencIGV),
        tipo:         'igv',
        url:          '/sunat-pwa/igv'
      },
      {
        titulo:       `PLAME ${nombreMes(mes)}`,
        subtitulo:    'ESSALUD + AFP',
        fecha:        vencPLAME.toLocaleDateString('es-PE', { day:'2-digit', month:'short' }),
        diasRestantes: diasRestantes(vencPLAME),
        tipo:         'plame',
        url:          '/sunat-pwa/planilla'
      },
      {
        titulo:       'CTS Semestral',
        subtitulo:    'Abono mayo',
        fecha:        '15 May',
        diasRestantes: diasRestantes(vencCTS),
        tipo:         'cts',
        url:          null
      },
      {
        titulo:       'Gratificación Jul',
        subtitulo:    'Abono julio',
        fecha:        '15 Jul',
        diasRestantes: diasRestantes(vencGrat),
        tipo:         'grat',
        url:          null
      }
    ];

    const urgente = vencimientos.filter(v => v.diasRestantes > 0 && v.diasRestantes <= 15);

    res.render('sunat-calendario', {
      user: req.session.user,
      ruc,
      digito,
      razon,
      vencimientos,
      urgente,
      mes,
      anio,
      nombreMes: nombreMes(mes)
    });
  } catch (err) {
    console.error('[sunat-pwa GET /]', err);
    res.status(500).send('Error cargando SUNAT');
  }
});

// ─── GET /sunat-pwa/igv — IGV del mes ────────────────────────────────────────

router.get('/igv', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const { mes, anio } = mesAnioActual();

    // Ventas del mes
    const [[ventas]] = await db.query(
      `SELECT
         COALESCE(SUM(total),0)             AS total_ventas,
         COALESCE(SUM(igv),0)               AS igv_ventas,
         COALESCE(SUM(subtotal_sin_igv),0)  AS subtotal
       FROM facturas
       WHERE tenant_id = ?
         AND EXTRACT(MONTH FROM fecha) = ?
         AND EXTRACT(YEAR  FROM fecha) = ?`,
      [tid, mes, anio]
    );

    // Compras del mes (si existe tabla compras/gastos)
    let igvCompras = 0;
    let totalCompras = 0;
    try {
      const [[compras]] = await db.query(
        `SELECT COALESCE(SUM(monto_igv),0) AS igv_c, COALESCE(SUM(total),0) AS total_c
         FROM gastos
         WHERE tenant_id = ? AND EXTRACT(MONTH FROM fecha) = ? AND EXTRACT(YEAR FROM fecha) = ?`,
        [tid, mes, anio]
      );
      igvCompras   = Number(compras?.igv_c   || 0);
      totalCompras = Number(compras?.total_c  || 0);
    } catch (_) { /* tabla gastos puede no existir */ }

    const igvVentas = Number(ventas.igv_ventas || 0);
    const igvNeto   = Math.max(0, igvVentas - igvCompras);

    res.render('sunat-igv', {
      user: req.session.user,
      mes,
      anio,
      nombreMes: nombreMes(mes),
      totalVentas:  Number(ventas.total_ventas || 0),
      igvVentas,
      totalCompras,
      igvCompras,
      igvNeto
    });
  } catch (err) {
    console.error('[sunat-pwa GET /igv]', err);
    res.status(500).send('Error cargando IGV');
  }
});

// ─── GET /sunat-pwa/planilla — Planilla del mes ───────────────────────────────

router.get('/planilla', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const { mes, anio } = mesAnioActual();

    const [empleados] = await db.query(
      `SELECT p.id, p.nombre, p.cargo, p.monto_pago, p.regimen_pension,
              pp.monto_neto, pp.estado
       FROM personal p
       LEFT JOIN planilla_pagos pp
         ON pp.personal_id = p.id
        AND EXTRACT(MONTH FROM pp.periodo_inicio) = ?
        AND EXTRACT(YEAR  FROM pp.periodo_inicio) = ?
       WHERE p.tenant_id = ? AND p.activo = true
       ORDER BY p.nombre`,
      [mes, anio, tid]
    );

    const totalBruto  = empleados.reduce((s, e) => s + Number(e.monto_pago || 0), 0);
    const essalud     = +(totalBruto * 0.09).toFixed(2);
    const afp         = +(totalBruto * 0.13).toFixed(2);  // AFP promedio simple
    const totalNeto   = +(totalBruto - afp).toFixed(2);

    res.render('sunat-planilla', {
      user: req.session.user,
      mes,
      anio,
      nombreMes: nombreMes(mes),
      empleados,
      totalBruto,
      essalud,
      afp,
      totalNeto
    });
  } catch (err) {
    console.error('[sunat-pwa GET /planilla]', err);
    res.status(500).send('Error cargando planilla');
  }
});

// ─── GET /sunat-pwa/nota-credito — Lista facturas para NC ────────────────────

router.get('/nota-credito', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const { periodo = 'hoy', q = '' } = req.query;

    let filtroFecha = `(f.fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date`;
    if (periodo === 'ayer') {
      filtroFecha = `(f.fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date - INTERVAL '1 day'`;
    } else if (periodo === 'semana') {
      filtroFecha = `f.fecha >= NOW() - INTERVAL '7 days'`;
    }

    const searchParam = q ? `%${q}%` : null;
    const searchClause = searchParam
      ? `AND (f.serie || '-' || LPAD(f.correlativo::text, 8, '0') ILIKE ? OR f.total::text LIKE ?)`
      : '';
    const searchValues = searchParam ? [searchParam, searchParam] : [];

    const [facturas] = await db.query(
      `SELECT f.id, f.serie, f.correlativo, f.total, f.fecha, f.tipo_comprobante,
              m.numero AS mesa_numero,
              pd.tipo  AS delivery_tipo,
              (SELECT COUNT(*) FROM notas_credito nc WHERE nc.factura_id = f.id AND nc.tenant_id = f.tenant_id) AS nc_count
       FROM facturas f
       LEFT JOIN pedidos p   ON p.id = (SELECT pedido_id FROM detalle_factura df WHERE df.factura_id = f.id LIMIT 1)
       LEFT JOIN mesas m     ON m.id = p.mesa_id
       LEFT JOIN pedidos_delivery pd ON pd.pedido_id = p.id
       WHERE f.tenant_id = ? AND ${filtroFecha} ${searchClause}
       ORDER BY f.fecha DESC
       LIMIT 50`,
      [tid, ...searchValues]
    );

    res.render('nota-credito', {
      user: req.session.user,
      facturas,
      periodo,
      q
    });
  } catch (err) {
    console.error('[sunat-pwa GET /nota-credito]', err);
    res.status(500).send('Error cargando facturas');
  }
});

// ─── GET /sunat-pwa/nota-credito/:facturaId — Emitir NC ──────────────────────

router.get('/nota-credito/:facturaId', async (req, res) => {
  try {
    const tid       = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const facturaId = parseInt(req.params.facturaId);
    if (!facturaId) return res.redirect('/sunat-pwa/nota-credito');

    const [[factura]] = await db.query(
      `SELECT f.id, f.serie, f.correlativo, f.total, f.fecha, f.tipo_comprobante,
              m.numero AS mesa_numero
       FROM facturas f
       LEFT JOIN pedidos p ON p.id = (SELECT pedido_id FROM detalle_factura df WHERE df.factura_id = f.id LIMIT 1)
       LEFT JOIN mesas m   ON m.id = p.mesa_id
       WHERE f.id = ? AND f.tenant_id = ?`,
      [facturaId, tid]
    );
    if (!factura) return res.redirect('/sunat-pwa/nota-credito');

    const [items] = await db.query(
      `SELECT df.id, df.cantidad, df.precio_unitario, df.subtotal, p.nombre
       FROM detalle_factura df
       LEFT JOIN productos p ON p.id = df.producto_id
       WHERE df.factura_id = ? AND df.tenant_id = ?
       ORDER BY df.id`,
      [facturaId, tid]
    );

    res.render('nota-credito-emitir', {
      user: req.session.user,
      factura,
      items
    });
  } catch (err) {
    console.error('[sunat-pwa GET /nota-credito/:id]', err);
    res.status(500).send('Error cargando factura');
  }
});

// ─── POST /sunat-pwa/nota-credito/:facturaId — Guardar NC ────────────────────

router.post('/nota-credito/:facturaId', async (req, res) => {
  try {
    const tid       = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });

    const facturaId = parseInt(req.params.facturaId);
    const { motivo, items_ids, monto_total } = req.body;

    if (!motivo || !['devolucion','error_precio','anulacion'].includes(motivo)) {
      return res.status(400).json({ error: 'Motivo inválido' });
    }
    if (!monto_total || isNaN(Number(monto_total))) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    // Map UI value to DB enum value
    const motivoDB = motivo === 'error_precio' ? 'error_facturacion' : motivo;

    const [[factura]] = await db.query(
      'SELECT id FROM facturas WHERE id = ? AND tenant_id = ?',
      [facturaId, tid]
    );
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });

    const itemsArray = Array.isArray(items_ids) ? items_ids.map(Number) : [];
    const userId = req.session.user.id;

    await db.query(
      `INSERT INTO notas_credito (tenant_id, factura_id, motivo, monto, items, estado, usuario_id)
       VALUES (?, ?, ?, ?, ?, 'emitida', ?)`,
      [tid, facturaId, motivoDB, Number(monto_total), JSON.stringify(itemsArray), userId]
    );

    return res.json({ ok: true, redirect: '/sunat-pwa/nota-credito' });
  } catch (err) {
    console.error('[sunat-pwa POST /nota-credito/:id]', err);
    return res.status(500).json({ error: 'Error emitiendo nota de crédito' });
  }
});

module.exports = router;
