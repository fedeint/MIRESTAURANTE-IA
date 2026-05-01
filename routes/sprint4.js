'use strict';

/**
 * routes/sprint4.js
 * Sprint 4: Mantenimiento + Eventos + Gastos Fijos + Fidelidad + Promociones + Propinas
 * Mounted at /sprint4 (requireAuth)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ─── helpers ────────────────────────────────────────────────────────────────

function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function diasHasta(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d - hoy()) / (1000 * 60 * 60 * 24));
}

function fmt(fecha) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function initials(nombre) {
  return (nombre || '').split(' ').slice(0, 2).map(n => n[0] || '').join('').toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// MANTENIMIENTO
// ═══════════════════════════════════════════════════════════════════════════

router.get('/mantenimiento', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [rows] = await db.query(
      `SELECT id, nombre, ultimo_mantenimiento, proximo_mantenimiento, proveedor, costo_estimado
       FROM mantenimiento_equipos
       WHERE tenant_id = ? AND activo = true
       ORDER BY proximo_mantenimiento ASC NULLS LAST`,
      [tid]
    );

    const equipos = rows.map(e => {
      const dias = diasHasta(e.proximo_mantenimiento);
      let estado = 'al_dia';
      if (dias === null)     estado = 'sin_fecha';
      else if (dias < 0)    estado = 'pendiente';
      else if (dias <= 7)   estado = 'proximo';
      return { ...e, dias, estado, proximoFmt: fmt(e.proximo_mantenimiento) };
    });

    res.render('mantenimiento', {
      user: req.session.user,
      equipos,
      pendientes:  equipos.filter(e => e.estado === 'pendiente').length,
      proximos:    equipos.filter(e => e.estado === 'proximo').length,
      alDia:       equipos.filter(e => e.estado === 'al_dia').length
    });
  } catch (err) {
    console.error('[sprint4 GET /mantenimiento]', err);
    res.status(500).send('Error');
  }
});

router.post('/mantenimiento', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { nombre, periodicidad_dias, ultimo_mantenimiento, proximo_mantenimiento, proveedor, costo_estimado, notas } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    await db.query(
      `INSERT INTO mantenimiento_equipos (tenant_id,nombre,periodicidad_dias,ultimo_mantenimiento,proximo_mantenimiento,proveedor,costo_estimado,notas)
       VALUES (?,?,?,?,?,?,?,?)`,
      [tid, nombre.trim(), periodicidad_dias || 30, ultimo_mantenimiento || null, proximo_mantenimiento || null,
       proveedor?.trim() || null, costo_estimado || null, notas?.trim() || null]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[sprint4 POST /mantenimiento]', err);
    return res.status(500).json({ error: 'Error guardando' });
  }
});

router.post('/mantenimiento/:id/marcar', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { periodicidad_dias } = req.body;
    const periodos = parseInt(periodicidad_dias) || 30;
    const hoyDate  = new Date().toISOString().slice(0, 10);
    const proximo  = new Date(Date.now() + periodos * 86400000).toISOString().slice(0, 10);
    await db.query(
      `UPDATE mantenimiento_equipos SET ultimo_mantenimiento=?, proximo_mantenimiento=? WHERE id=? AND tenant_id=?`,
      [hoyDate, proximo, req.params.id, tid]
    );
    return res.json({ ok: true, proximo });
  } catch (err) {
    console.error('[sprint4 POST /mantenimiento/:id/marcar]', err);
    return res.status(500).json({ error: 'Error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/eventos', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [eventos] = await db.query(
      `SELECT id, nombre, fecha, hora_inicio, personas, presupuesto, menu_descripcion, notas_insumos, estado
       FROM eventos
       WHERE tenant_id = ? AND activo = true
       ORDER BY fecha DESC`,
      [tid]
    );

    const evts = eventos.map(e => ({
      ...e,
      fechaFmt: new Date(e.fecha).toLocaleDateString('es-PE', { weekday:'short', day:'2-digit', month:'2-digit' }),
      pasado:   new Date(e.fecha) < hoy()
    }));

    res.render('eventos', { user: req.session.user, eventos: evts });
  } catch (err) {
    console.error('[sprint4 GET /eventos]', err);
    res.status(500).send('Error');
  }
});

router.post('/eventos', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { nombre, fecha, hora_inicio, personas, presupuesto, menu_descripcion, notas_insumos } = req.body;
    if (!nombre?.trim() || !fecha) return res.status(400).json({ error: 'Nombre y fecha requeridos' });
    await db.query(
      `INSERT INTO eventos (tenant_id, nombre, fecha, hora_inicio, personas, presupuesto, menu_descripcion, notas_insumos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tid, nombre.trim(), fecha, hora_inicio || null, personas || 1,
       presupuesto || null, menu_descripcion?.trim() || null, notas_insumos?.trim() || null]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[sprint4 POST /eventos]', err);
    return res.status(500).json({ error: 'Error guardando' });
  }
});

router.delete('/eventos/:id', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    await db.query('UPDATE eventos SET activo=false WHERE id=? AND tenant_id=?', [req.params.id, tid]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GASTOS FIJOS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/gastos-fijos', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [gastos] = await db.query(
      `SELECT id, nombre, icono, monto, dia_vence, categoria FROM gastos_fijos
       WHERE tenant_id = ? AND activo = true ORDER BY monto DESC`,
      [tid]
    );

    const today = new Date();
    const diaHoy = today.getDate();

    const gastosEnriquecidos = gastos.map(g => {
      const diasAlVence = g.dia_vence ? g.dia_vence - diaHoy : null;
      return { ...g, diasAlVence, venceProx: diasAlVence !== null && diasAlVence >= 0 && diasAlVence <= 5 };
    });

    const totalMensual = gastos.reduce((s, g) => s + Number(g.monto), 0);
    const equilibrioDia = +(totalMensual / 30).toFixed(0);

    // Obtener ventas promedio mes para detectar alertas de aumento
    const [[ventasMes]] = await db.query(
      `SELECT COALESCE(AVG(mes_total),0) AS prom FROM (
         SELECT SUM(total) AS mes_total FROM facturas
         WHERE tenant_id = ? AND fecha >= NOW() - INTERVAL '3 months'
         GROUP BY EXTRACT(MONTH FROM fecha), EXTRACT(YEAR FROM fecha)
       ) t`,
      [tid]
    ).catch(() => [[{ prom: 0 }]]);

    res.render('gastos-fijos', {
      user: req.session.user,
      gastos: gastosEnriquecidos,
      totalMensual,
      equilibrioDia,
      ventasMesProm: Number(ventasMes?.prom || 0)
    });
  } catch (err) {
    console.error('[sprint4 GET /gastos-fijos]', err);
    res.status(500).send('Error');
  }
});

router.post('/gastos-fijos', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { nombre, icono, monto, dia_vence, categoria } = req.body;
    if (!nombre?.trim() || !monto) return res.status(400).json({ error: 'Nombre y monto requeridos' });
    await db.query(
      `INSERT INTO gastos_fijos (tenant_id, nombre, icono, monto, dia_vence, categoria) VALUES (?,?,?,?,?,?)`,
      [tid, nombre.trim(), icono || '💳', Number(monto), dia_vence || null, categoria || 'general']
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error guardando' });
  }
});

router.delete('/gastos-fijos/:id', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    await db.query('UPDATE gastos_fijos SET activo=false WHERE id=? AND tenant_id=?', [req.params.id, tid]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FIDELIDAD — Scan / Registro
// ═══════════════════════════════════════════════════════════════════════════

router.get('/fidelidad', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [ultimos] = await db.query(
      `SELECT fc.nombre, fc.telefono, fc.puntos
       FROM fidelidad_clientes fc
       WHERE fc.tenant_id = ?
       ORDER BY fc.ultimo_visita DESC NULLS LAST LIMIT 5`,
      [tid]
    );

    const [[config]] = await db.query(
      'SELECT * FROM fidelidad_config WHERE tenant_id = ?', [tid]
    ).catch(() => [[null]]);

    res.render('fidelidad-scan', {
      user: req.session.user,
      ultimos,
      config: config || { puntos_por_sol: 1, puntos_canje_minimo: 100 }
    });
  } catch (err) {
    console.error('[sprint4 GET /fidelidad]', err);
    res.status(500).send('Error');
  }
});

router.post('/fidelidad/registrar', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { nombre, telefono, puntos_agregar } = req.body;
    if (!telefono?.trim()) return res.status(400).json({ error: 'Teléfono requerido' });

    const pts = parseInt(puntos_agregar) || 0;

    // Upsert cliente
    const [[existente]] = await db.query(
      'SELECT id, puntos, visitas FROM fidelidad_clientes WHERE tenant_id=? AND telefono=?',
      [tid, telefono.trim()]
    );

    let clienteId;
    if (existente) {
      clienteId = existente.id;
      await db.query(
        `UPDATE fidelidad_clientes SET puntos=puntos+?, visitas=visitas+1, ultimo_visita=NOW(),
         nombre=COALESCE(NULLIF(?,''),(nombre)) WHERE id=?`,
        [pts, nombre?.trim() || '', clienteId]
      );
    } else {
      const [[ins]] = await db.query(
        `INSERT INTO fidelidad_clientes (tenant_id, nombre, telefono, puntos, visitas, ultimo_visita)
         VALUES (?,?,?,?,1,NOW()) RETURNING id`,
        [tid, (nombre || 'Cliente').trim(), telefono.trim(), pts]
      );
      clienteId = ins?.id;
    }

    if (pts > 0 && clienteId) {
      await db.query(
        `INSERT INTO fidelidad_movimientos (tenant_id, cliente_id, tipo, puntos, referencia) VALUES (?,?,'acumulo',?,?)`,
        [tid, clienteId, pts, 'Registro manual']
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[sprint4 POST /fidelidad/registrar]', err);
    return res.status(500).json({ error: 'Error registrando' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FIDELIDAD — Dashboard
// ═══════════════════════════════════════════════════════════════════════════

router.get('/fidelidad/dashboard', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [[stats]] = await db.query(
      `SELECT
         COUNT(*) AS registrados,
         COUNT(*) FILTER (WHERE ultimo_visita >= NOW() - INTERVAL '90 days') AS activos,
         COALESCE(SUM(CASE WHEN fm.tipo='canje' THEN fm.puntos ELSE 0 END),0) AS canjeados
       FROM fidelidad_clientes fc
       LEFT JOIN fidelidad_movimientos fm ON fm.cliente_id = fc.id AND fm.tenant_id = fc.tenant_id
       WHERE fc.tenant_id = ?`,
      [tid]
    );

    // Retención 90 días = activos / registrados
    const registrados = Number(stats?.registrados || 0);
    const activos     = Number(stats?.activos || 0);
    const retencion   = registrados > 0 ? Math.round((activos / registrados) * 100) : 0;

    const [topClientes] = await db.query(
      `SELECT id, nombre, telefono, puntos, visitas FROM fidelidad_clientes
       WHERE tenant_id=? ORDER BY puntos DESC LIMIT 10`,
      [tid]
    );

    const [[config]] = await db.query(
      'SELECT puntos_canje_minimo FROM fidelidad_config WHERE tenant_id=?', [tid]
    ).catch(() => [[{ puntos_canje_minimo: 100 }]]);

    const minCanje = Number(config?.puntos_canje_minimo || 100);

    const clientes = topClientes.map((c, i) => ({
      ...c,
      rank:       i + 1,
      iniciales:  initials(c.nombre),
      cercaCanje: c.puntos >= minCanje * 0.8
    }));

    res.render('fidelidad-dashboard', {
      user: req.session.user,
      registrados,
      activos,
      canjeados:  Number(stats?.canjeados || 0),
      retencion,
      clientes
    });
  } catch (err) {
    console.error('[sprint4 GET /fidelidad/dashboard]', err);
    res.status(500).send('Error');
  }
});

router.post('/fidelidad/config', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { puntos_por_sol, puntos_canje_minimo, sol_por_canje } = req.body;
    await db.query(
      `INSERT INTO fidelidad_config (tenant_id, puntos_por_sol, puntos_canje_minimo, sol_por_canje)
       VALUES (?,?,?,?)
       ON CONFLICT (tenant_id) DO UPDATE SET
         puntos_por_sol=EXCLUDED.puntos_por_sol,
         puntos_canje_minimo=EXCLUDED.puntos_canje_minimo,
         sol_por_canje=EXCLUDED.sol_por_canje,
         updated_at=NOW()`,
      [tid, puntos_por_sol || 1, puntos_canje_minimo || 100, sol_por_canje || 1]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error guardando config' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROMOCIONES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/promociones', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [promos] = await db.query(
      `SELECT id, codigo, descuento, tipo_descuento, origen, aplica_en,
              fecha_inicio, fecha_fin, usos_max, usos_actuales,
              monto_vendido, monto_descuento, activo
       FROM promociones WHERE tenant_id=? ORDER BY activo DESC, created_at DESC`,
      [tid]
    );

    const hoyDate = new Date().toISOString().slice(0,10);
    const promosEnriq = promos.map(p => {
      const expirado = p.fecha_fin && p.fecha_fin < hoyDate;
      const roi = p.monto_descuento > 0
        ? Math.round((p.monto_vendido / p.monto_descuento) * 100)
        : null;
      return { ...p, expirado, roi };
    });

    const activas      = promosEnriq.filter(p => p.activo && !p.expirado).length;
    const usosTotales  = promosEnriq.reduce((s, p) => s + Number(p.usos_actuales || 0), 0);
    const descuentoDado = promosEnriq.reduce((s, p) => s + Number(p.monto_descuento || 0), 0);

    res.render('promociones', {
      user: req.session.user,
      promos: promosEnriq,
      activas,
      usosTotales,
      descuentoDado
    });
  } catch (err) {
    console.error('[sprint4 GET /promociones]', err);
    res.status(500).send('Error');
  }
});

router.post('/promociones', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { codigo, descuento, tipo_descuento, origen, aplica_en, fecha_inicio, fecha_fin, usos_max, usos_por_cliente } = req.body;
    if (!codigo?.trim() || !descuento) return res.status(400).json({ error: 'Código y descuento requeridos' });

    const aplicaArr = Array.isArray(aplica_en) ? aplica_en : (aplica_en ? [aplica_en] : ['salon']);

    await db.query(
      `INSERT INTO promociones (tenant_id, codigo, descuento, tipo_descuento, origen, aplica_en, fecha_inicio, fecha_fin, usos_max, usos_por_cliente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tid, codigo.trim().toUpperCase(), Number(descuento), tipo_descuento || 'porcentaje',
       origen?.trim() || null, JSON.stringify(aplicaArr),
       fecha_inicio || null, fecha_fin || null,
       usos_max ? parseInt(usos_max) : null,
       usos_por_cliente ? parseInt(usos_por_cliente) : 1]
    );
    return res.json({ ok: true, codigo: codigo.trim().toUpperCase() });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El código ya existe' });
    console.error('[sprint4 POST /promociones]', err);
    return res.status(500).json({ error: 'Error guardando' });
  }
});

router.patch('/promociones/:id/toggle', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const [[p]] = await db.query('SELECT activo FROM promociones WHERE id=? AND tenant_id=?', [req.params.id, tid]);
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    await db.query('UPDATE promociones SET activo=? WHERE id=? AND tenant_id=?', [!p.activo, req.params.id, tid]);
    return res.json({ ok: true, activo: !p.activo });
  } catch (err) {
    return res.status(500).json({ error: 'Error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROPINAS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/propinas', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const hoyStr = new Date().toISOString().slice(0,10);

    // Propinas del día desde facturas
    const [[totales]] = await db.query(
      `SELECT
         COALESCE(SUM(propina),0) AS total,
         COUNT(*) AS pedidos,
         COALESCE(SUM(CASE WHEN forma_pago='efectivo' THEN propina ELSE 0 END),0) AS efectivo,
         COALESCE(SUM(CASE WHEN forma_pago='tarjeta'  THEN propina ELSE 0 END),0) AS tarjeta,
         COALESCE(SUM(CASE WHEN forma_pago NOT IN ('efectivo','tarjeta') THEN propina ELSE 0 END),0) AS otros
       FROM facturas
       WHERE tenant_id=? AND (fecha AT TIME ZONE 'America/Lima')::date = ?
         AND propina > 0`,
      [tid, hoyStr]
    );

    // Reparto por mesero (usando usuarios que atendieron pedidos hoy)
    const [porMesero] = await db.query(
      `SELECT u.nombre, u.id,
              COUNT(DISTINCT p.id) AS pedidos,
              COALESCE(SUM(f.propina),0) AS propina_total
       FROM pedidos p
       JOIN facturas f ON f.tenant_id = p.tenant_id
         AND (f.fecha AT TIME ZONE 'America/Lima')::date = ?
         AND f.propina > 0
       JOIN usuarios u ON u.id = p.mozo_id
       WHERE p.tenant_id = ?
         AND (p.created_at AT TIME ZONE 'America/Lima')::date = ?
         AND u.rol = 'mesero'
       GROUP BY u.id, u.nombre
       ORDER BY propina_total DESC`,
      [hoyStr, tid, hoyStr]
    ).catch(() => [[]]);

    const totalPropina = Number(totales?.total || 0);
    const promedio = Number(totales?.pedidos || 0) > 0
      ? +(totalPropina / Number(totales.pedidos)).toFixed(2)
      : 0;

    const meseros = porMesero.map(m => ({
      ...m,
      iniciales: initials(m.nombre),
      propina_total: Number(m.propina_total)
    }));

    res.render('propinas', {
      user: req.session.user,
      total: totalPropina,
      pedidos: Number(totales?.pedidos || 0),
      promedio,
      efectivo: Number(totales?.efectivo || 0),
      tarjeta:  Number(totales?.tarjeta  || 0),
      otros:    Number(totales?.otros    || 0),
      meseros
    });
  } catch (err) {
    console.error('[sprint4 GET /propinas]', err);
    res.status(500).send('Error');
  }
});

router.get('/propinas/config', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [[config]] = await db.query(
      'SELECT * FROM propinas_config WHERE tenant_id=?', [tid]
    ).catch(() => [[null]]);

    res.render('propinas-config', {
      user: req.session.user,
      config: config || { modo_reparto: 'partes_iguales', porcentajes: ['5','10','15'], metodo: 'incluida' }
    });
  } catch (err) {
    res.status(500).send('Error');
  }
});

router.post('/propinas/config', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { modo_reparto, porcentajes, metodo } = req.body;
    const pcts = Array.isArray(porcentajes) ? porcentajes : (porcentajes ? [porcentajes] : ['5','10','15']);
    await db.query(
      `INSERT INTO propinas_config (tenant_id, modo_reparto, porcentajes, metodo)
       VALUES (?,?,?,?)
       ON CONFLICT (tenant_id) DO UPDATE SET modo_reparto=EXCLUDED.modo_reparto, porcentajes=EXCLUDED.porcentajes, metodo=EXCLUDED.metodo, updated_at=NOW()`,
      [tid, modo_reparto || 'partes_iguales', JSON.stringify(pcts), metodo || 'incluida']
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error guardando' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PERSONAL EVENTUAL
// ═══════════════════════════════════════════════════════════════════

// ─── GET /sprint4/personal-eventual ──────────────────────────────────────────
router.get('/personal-eventual', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.redirect('/login');

    const [activos]    = await db.query(
      `SELECT * FROM personal_eventual WHERE tenant_id=? AND activo=true ORDER BY fecha_inicio DESC`,
      [tid]
    );
    const [terminados] = await db.query(
      `SELECT * FROM personal_eventual WHERE tenant_id=? AND activo=false ORDER BY fecha_inicio DESC LIMIT 10`,
      [tid]
    );

    // Stats
    const totalActivos   = activos.length;
    const costoDia       = activos.reduce((s, e) => s + Number(e.monto_dia || 0), 0);
    const enPrueba       = activos.filter(e => e.tipo_contrato === 'prueba').length;

    // Days worked / days remaining for each
    const hoy = new Date();
    const lista = activos.map(e => {
      const inicio = new Date(e.fecha_inicio);
      const diasTrabajados = Math.max(0, Math.floor((hoy - inicio) / 86400000));
      let diasRestantes = null;
      if (e.fecha_fin) {
        const fin = new Date(e.fecha_fin);
        diasRestantes = Math.ceil((fin - hoy) / 86400000);
      }
      return { ...e, diasTrabajados, diasRestantes };
    });

    return res.render('personal-eventual', {
      lista, terminados,
      totalActivos, costoDia, enPrueba
    });
  } catch (err) {
    console.error('[sprint4 GET /personal-eventual]', err);
    return res.status(500).send('Error cargando personal eventual');
  }
});

// ─── POST /sprint4/personal-eventual — Registrar ─────────────────────────────
router.post('/personal-eventual', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });

    const { nombre, cargo, telefono, tipo_contrato, fecha_inicio, fecha_fin, monto_dia, horas_dia, notas } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    await db.query(
      `INSERT INTO personal_eventual
         (tenant_id, nombre, cargo, telefono, tipo_contrato, fecha_inicio, fecha_fin, monto_dia, horas_dia, notas)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        tid, nombre.trim(), cargo || 'Ayudante', telefono || null,
        tipo_contrato || 'por_dia',
        fecha_inicio || new Date().toISOString().slice(0,10),
        fecha_fin || null,
        Number(monto_dia) || 0,
        Number(horas_dia) || 8,
        notas || null
      ]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[sprint4 POST /personal-eventual]', err);
    return res.status(500).json({ error: 'Error registrando' });
  }
});

// ─── POST /sprint4/personal-eventual/:id/terminar ────────────────────────────
router.post('/personal-eventual/:id/terminar', async (req, res) => {
  try {
    const tid = req.session?.user?.tenant_id;
    if (!tid) return res.status(401).json({ error: 'No autenticado' });
    const { estado } = req.body; // terminado | promovido
    const nuevoEstado = ['terminado','promovido'].includes(estado) ? estado : 'terminado';
    await db.query(
      `UPDATE personal_eventual SET activo=false, estado=?, fecha_fin=COALESCE(fecha_fin,CURRENT_DATE) WHERE id=? AND tenant_id=?`,
      [nuevoEstado, req.params.id, tid]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error actualizando' });
  }
});

module.exports = router;
