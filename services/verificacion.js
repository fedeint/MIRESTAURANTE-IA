// services/verificacion.js
'use strict';

const db = require('../db');
const { registrarAudit } = require('./audit');

async function crearSolicitud(tenantId, usuarioId, fotos, videoUrl, videoDuracion) {
  // Contar intentos previos
  const [[prev]] = await db.query(
    'SELECT MAX(intento) as max_intento FROM solicitudes_registro WHERE tenant_id = ?',
    [tenantId]
  );
  const intento = (prev?.max_intento || 0) + 1;

  if (intento > 3) {
    // Bloquear email
    const [[user]] = await db.query(
      'SELECT google_email FROM usuarios WHERE id = ?', [usuarioId]
    );
    if (user?.google_email) {
      await db.query(
        'INSERT INTO google_emails_bloqueados (email, motivo) VALUES (?, ?) ON CONFLICT (email) DO NOTHING',
        [user.google_email, 'Máximo de intentos de verificación alcanzado']
      );
    }
    return { error: 'Has alcanzado el máximo de intentos. Contacta soporte.' };
  }

  const [[solicitud]] = await db.query(
    `INSERT INTO solicitudes_registro (tenant_id, usuario_id, estado, fotos, video_url, video_duracion, intento)
     VALUES (?, ?, 'pendiente', ?::jsonb, ?, ?, ?) RETURNING id`,
    [tenantId, usuarioId, JSON.stringify(fotos), videoUrl, videoDuracion, intento]
  );

  return { id: solicitud.id, intento };
}

async function aprobarSolicitud(solicitudId, revisadoPor) {
  const [[sol]] = await db.query(
    'SELECT tenant_id, usuario_id FROM solicitudes_registro WHERE id = ? AND estado = ?',
    [solicitudId, 'pendiente']
  );
  if (!sol) return { error: 'Solicitud no encontrada o ya procesada' };

  await db.query(
    `UPDATE solicitudes_registro SET estado = 'aprobado', revisado_por = ?, revisado_at = NOW() WHERE id = ?`,
    [revisadoPor, solicitudId]
  );

  await db.query(
    `UPDATE tenants SET estado_trial = 'activo', trial_inicio = NOW(), trial_fin = NOW() + INTERVAL '5 days' WHERE id = ?`,
    [sol.tenant_id]
  );

  const [[user]] = await db.query(
    'SELECT google_email, nombre FROM usuarios WHERE id = ?', [sol.usuario_id]
  );

  await registrarAudit({
    usuarioId: revisadoPor,
    tenantId: sol.tenant_id,
    accion: 'solicitud_aprobada',
    modulo: 'superadmin',
    tabla: 'solicitudes_registro',
    registroId: solicitudId,
    ip: null
  });

  return { ok: true, email: user?.google_email, nombre: user?.nombre, tenant_id: sol.tenant_id };
}

async function rechazarSolicitud(solicitudId, revisadoPor, motivo) {
  if (!motivo || !motivo.trim()) return { error: 'El motivo de rechazo es obligatorio' };

  const [[sol]] = await db.query(
    'SELECT tenant_id, usuario_id, intento FROM solicitudes_registro WHERE id = ? AND estado = ?',
    [solicitudId, 'pendiente']
  );
  if (!sol) return { error: 'Solicitud no encontrada o ya procesada' };

  await db.query(
    `UPDATE solicitudes_registro SET estado = 'rechazado', motivo_rechazo = ?, revisado_por = ?, revisado_at = NOW() WHERE id = ?`,
    [motivo.trim(), revisadoPor, solicitudId]
  );

  // Si es el 3er intento, bloquear email
  if (sol.intento >= 3) {
    const [[blockedUser]] = await db.query(
      'SELECT google_email FROM usuarios WHERE id = ?', [sol.usuario_id]
    );
    if (blockedUser?.google_email) {
      await db.query(
        'INSERT INTO google_emails_bloqueados (email, motivo) VALUES (?, ?) ON CONFLICT (email) DO NOTHING',
        [blockedUser.google_email, 'Rechazado 3 veces en verificación']
      );
    }
  }

  const [[user]] = await db.query(
    'SELECT google_email, nombre FROM usuarios WHERE id = ?', [sol.usuario_id]
  );

  return { ok: true, email: user?.google_email, nombre: user?.nombre, intento: sol.intento };
}

async function getSolicitudesPendientes() {
  const [rows] = await db.query(
    `SELECT sr.*, u.nombre as usuario_nombre, u.google_email,
            t.nombre as tenant_nombre, t.direccion, t.distrito, t.departamento,
            t.latitud, t.longitud, t.num_mesas, t.num_trabajadores, t.antiguedad
     FROM solicitudes_registro sr
     JOIN usuarios u ON u.id = sr.usuario_id
     JOIN tenants t ON t.id = sr.tenant_id
     WHERE sr.estado = 'pendiente'
     ORDER BY sr.created_at ASC`
  );
  return rows || [];
}

module.exports = { crearSolicitud, aprobarSolicitud, rechazarSolicitud, getSolicitudesPendientes };
