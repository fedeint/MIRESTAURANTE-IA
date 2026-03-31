// routes/onboarding-dallia.js
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Compute modo_sistema and disabled modules from a complete perfil_operativo.
 */
function computarModo(perfil) {
  const personal = perfil.num_personal || 'solo_yo';
  const regimen  = perfil.regimen_tributario || 'informal';

  let modo    = 'pequeño';
  let modulos = {
    gestion_personal:   true,
    planilla:           true,
    planilla_formal:    true,
    sunat:              true,
    sunat_completo:     true,
    igv:                true,
    facturas:           true
  };

  if (personal === 'solo_yo' && ['informal', 'nrus'].includes(regimen)) {
    modo = 'ultra_simple';
    modulos.gestion_personal = false;
    modulos.planilla          = false;
    modulos.sunat             = false;
    modulos.igv               = false;
    modulos.facturas          = false;
  } else if (personal === '2-3') {
    modo = 'pequeño';
    modulos.planilla_formal = false;
    modulos.sunat_completo  = false;
  } else if (personal === '4-7') {
    modo = 'mediano';
  } else if (personal === '8+') {
    modo = 'profesional';
  }

  return { modo, modulos };
}

/**
 * Map raw block datos into structured tenant columns.
 */
function mapDatosToColumns(paso, datos) {
  const cols = {};

  if (paso === 1) {
    if (datos.num_personal)    cols.num_personal    = datos.num_personal;
    if (datos.dispositivo)     cols.dispositivo     = datos.dispositivo;   // stored in perfil_operativo only
    if (datos.tiene_impresora) cols.tiene_impresora = datos.tiene_impresora;
  }

  if (paso === 2) {
    if (datos.tipo_local !== undefined) {
      const mixtos = ['si_mesas', 'mixto'];
      cols.tiene_mesas = mixtos.includes(datos.tipo_local) ? true : datos.tipo_local === 'si_mesas';
    }
    if (datos.num_mesas) {
      const mapaM = { '1-5': 3, '6-10': 8, '11-20': 15, '20+': 25 };
      cols.num_mesas = mapaM[datos.num_mesas] || 0;
    }
    if (datos.canales_venta) cols.canales_venta = Array.isArray(datos.canales_venta) ? datos.canales_venta : [datos.canales_venta];
  }

  if (paso === 3) {
    if (datos.regimen_tributario) cols.regimen_tributario = datos.regimen_tributario;
    if (datos.metodos_pago)       cols.metodos_pago       = Array.isArray(datos.metodos_pago) ? datos.metodos_pago : [datos.metodos_pago];
  }

  if (paso === 4) {
    if (datos.principal_problema) cols.principal_problema = datos.principal_problema;
    if (datos.meta_ventas) {
      const mapaV = {
        'menos_5k': 3000,
        '5k_15k':   10000,
        '15k_30k':  22000,
        'mas_30k':  35000
      };
      cols.meta_ventas_mensual = mapaV[datos.meta_ventas] || null;
    }
  }

  if (paso === 5) {
    if (datos.hora_apertura) cols.hora_apertura = datos.hora_apertura;
    if (datos.hora_cierre)   cols.hora_cierre   = datos.hora_cierre;
  }

  return cols;
}

// ─── GET / ───────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.redirect('/login');

    const [[tenant]] = await db.query(
      'SELECT onboarding_completado, onboarding_paso, perfil_operativo FROM tenants WHERE id = ?',
      [tenantId]
    );

    if (!tenant) return res.redirect('/login');

    if (tenant.onboarding_completado) return res.redirect('/');

    const perfilRaw = tenant.perfil_operativo;
    const perfil = typeof perfilRaw === 'string'
      ? JSON.parse(perfilRaw || '{}')
      : (perfilRaw || {});

    res.render('onboarding-dallia', {
      user:           req.session.user,
      onboarding_paso: tenant.onboarding_paso || 0,
      perfil_operativo: perfil
    });
  } catch (err) {
    console.error('[onboarding-dallia GET /]', err);
    res.status(500).send('Error cargando el onboarding');
  }
});

// ─── POST /api/guardar-paso ──────────────────────────────────────────────────

router.post('/api/guardar-paso', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.status(401).json({ error: 'No autenticado' });

    const { paso, datos } = req.body;
    if (typeof paso !== 'number' || !datos || typeof datos !== 'object') {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    // Load current perfil_operativo
    const [[tenant]] = await db.query(
      'SELECT perfil_operativo, onboarding_paso FROM tenants WHERE id = ?',
      [tenantId]
    );
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const perfilActual = typeof tenant.perfil_operativo === 'string'
      ? JSON.parse(tenant.perfil_operativo || '{}')
      : (tenant.perfil_operativo || {});

    // Merge new datos into perfil_operativo
    const perfilMerged = Object.assign({}, perfilActual, datos);

    // Map datos to direct tenant columns
    const cols = mapDatosToColumns(paso, datos);

    // Build dynamic SET clause for direct columns
    const setClauses = ['perfil_operativo = ?', 'onboarding_paso = ?'];
    const values     = [JSON.stringify(perfilMerged), Math.max(tenant.onboarding_paso || 0, paso)];

    for (const [col, val] of Object.entries(cols)) {
      // Only map known safe columns
      const safe = [
        'num_personal', 'tiene_mesas', 'num_mesas', 'canales_venta',
        'metodos_pago', 'regimen_tributario', 'meta_ventas_mensual',
        'hora_apertura', 'hora_cierre'
      ];
      if (safe.includes(col)) {
        setClauses.push(`${col} = ?`);
        values.push(Array.isArray(val) ? JSON.stringify(val) : val);
      }
    }

    values.push(tenantId);
    await db.query(`UPDATE tenants SET ${setClauses.join(', ')} WHERE id = ?`, values);

    // Produce DallIA next messages based on paso
    const nextMessages = buildNextMessages(paso, datos);

    return res.json({ ok: true, nextMessages });
  } catch (err) {
    console.error('[onboarding-dallia POST /api/guardar-paso]', err);
    return res.status(500).json({ error: 'Error guardando paso' });
  }
});

// ─── POST /api/completar ─────────────────────────────────────────────────────

router.post('/api/completar', async (req, res) => {
  try {
    const tenantId = req.session?.user?.tenant_id;
    if (!tenantId) return res.status(401).json({ error: 'No autenticado' });

    const [[tenant]] = await db.query(
      'SELECT perfil_operativo FROM tenants WHERE id = ?',
      [tenantId]
    );
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const perfil = typeof tenant.perfil_operativo === 'string'
      ? JSON.parse(tenant.perfil_operativo || '{}')
      : (tenant.perfil_operativo || {});

    const { modo, modulos } = computarModo(perfil);

    await db.query(
      `UPDATE tenants SET
         onboarding_completado = true,
         onboarding_paso       = 5,
         modo_sistema          = ?,
         config_notificaciones = ?,
         perfil_operativo      = ?
       WHERE id = ?`,
      [
        modo,
        JSON.stringify({ modulos }),
        JSON.stringify(perfil),
        tenantId
      ]
    );

    return res.json({ ok: true, redirect: '/setup-sistema' });
  } catch (err) {
    console.error('[onboarding-dallia POST /api/completar]', err);
    return res.status(500).json({ error: 'Error completando onboarding' });
  }
});

// ─── buildNextMessages ───────────────────────────────────────────────────────

function buildNextMessages(pasoCompletado, datos) {
  switch (pasoCompletado) {
    case 1:
      return [{
        text: '¡Perfecto! Ahora cuéntame sobre tu operación. ¿Tienes mesas en tu local?',
        chips: [
          { label: 'Sí, tengo mesas',    value: 'si_mesas' },
          { label: 'No, solo delivery',  value: 'solo_delivery' },
          { label: 'Solo para llevar',   value: 'para_llevar' },
          { label: 'Mixto',              value: 'mixto' }
        ],
        field: 'tipo_local',
        bloque: 2
      }];
    case 2:
      return [{
        text: 'Ahora lo importante: el dinero 💰 ¿Cuál es tu situación tributaria?',
        chips: [
          { label: 'Soy informal',            value: 'informal' },
          { label: 'Tengo RUC - NRUS',        value: 'nrus' },
          { label: 'Tengo RUC - RER',         value: 'rer' },
          { label: 'Régimen MYPE/General',    value: 'mype' }
        ],
        field: 'regimen_tributario',
        bloque: 3
      }];
    case 3:
      return [{
        text: '¡Ya casi terminamos! ¿Qué es lo que más tiempo te quita ahora mismo?',
        chips: [
          { label: 'Tomar pedidos',       value: 'pedidos' },
          { label: 'Controlar caja',      value: 'caja' },
          { label: 'Saber el inventario', value: 'inventario' },
          { label: 'Todo me quita tiempo',value: 'todo' }
        ],
        field: 'principal_problema',
        bloque: 4
      }];
    case 4:
      return [{
        text: 'Por último, ¿a qué hora abres tu restaurante?',
        chips: [
          { label: '6am',  value: '06:00' },
          { label: '7am',  value: '07:00' },
          { label: '8am',  value: '08:00' },
          { label: '9am',  value: '09:00' },
          { label: '10am', value: '10:00' },
          { label: '11am', value: '11:00' }
        ],
        field: 'hora_apertura',
        bloque: 5
      }];
    default:
      return [];
  }
}

module.exports = router;
