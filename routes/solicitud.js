'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { notificarSuperadminWhatsApp, notificarSuperadminEmail } = require('../services/notificaciones-trial');

// Multer for foto_local + video_local — use /tmp on Vercel (read-only filesystem)
const uploadDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads', 'solicitudes')
  : path.join(__dirname, '../public/uploads/solicitudes');
try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }); } catch (_) {}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'))
});
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max per file
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'foto_local') {
      if (/\.(jpg|jpeg|png|webp)$/i.test(file.originalname)) cb(null, true);
      else cb(new Error('Solo se permiten imágenes JPG/PNG/WebP'));
    } else if (file.fieldname === 'video_local') {
      if (/\.(mp4|mov|webm)$/i.test(file.originalname)) cb(null, true);
      else cb(new Error('Solo se permiten videos MP4/MOV/WebM'));
    } else {
      cb(null, false);
    }
  }
});

// Accept multiple fotos (2-3) and 1 video
const uploadFields = upload.fields([
  { name: 'foto_local', maxCount: 3 },
  { name: 'video_local', maxCount: 1 }
]);

// GET /solicitud — show form
router.get('/', (req, res) => {
  const user = req.session?.user;
  if (!user) return res.redirect('/login');
  res.render('solicitud', {
    user,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    error: null
  });
});

// POST /solicitud — save form
router.post('/', (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err.message, err.code);
      const user = req.session?.user;
      if (!user) return res.redirect('/login');
      let msg = 'Error al subir archivo.';
      if (err.code === 'LIMIT_FILE_SIZE') msg = 'El archivo es demasiado grande. Máximo 100 MB.';
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: msg });
    } else if (err) {
      console.error('Upload error:', err.message);
      const user = req.session?.user;
      if (!user) return res.redirect('/login');
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const user = req.session?.user;
  if (!user) return res.redirect('/login');

  const tenantId = user.tenant_id;
  const userId = user.id;

  try {
    const {
      nombre_representante, dni, cargo, nombre_restaurante, ruc, tipo_negocio,
      direccion, latitud, longitud, telefono_solicitante
    } = req.body;

    // Validations
    if (!nombre_representante || nombre_representante.trim().length < 2) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'Ingresa el nombre del representante' });
    }
    if (!dni || !/^\d{8}$/.test(dni.trim())) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'El DNI debe tener 8 dígitos' });
    }
    if (!cargo) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'Selecciona tu cargo' });
    }
    if (!nombre_restaurante || nombre_restaurante.trim().length < 2) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'Ingresa el nombre del restaurante' });
    }
    if (ruc && !/^\d{11}$/.test(ruc.trim())) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'El RUC debe tener 11 dígitos' });
    }
    if (!tipo_negocio) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'Selecciona el tipo de negocio' });
    }

    // File uploads — 2-3 fotos + 1 video
    const fotoFiles = req.files?.foto_local || [];
    const videoFile = req.files?.video_local?.[0];

    if (fotoFiles.length === 0) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'Debes subir al menos 2 fotos de tu local' });
    }
    if (fotoFiles.length < 2) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'Sube entre 2 y 3 fotos de tu local' });
    }
    if (!videoFile) {
      return res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'Debes subir un video de tu local (15-30 segundos)' });
    }

    const fotosUrls = fotoFiles.map(f => '/uploads/solicitudes/' + f.filename);
    const foto_local_url = fotosUrls[0]; // primary
    const fotosJson = JSON.stringify(fotosUrls);
    const video_local_url = '/uploads/solicitudes/' + videoFile.filename;

    // Check for existing pending solicitud
    const [[existing]] = await db.query(
      'SELECT id FROM solicitudes_registro WHERE tenant_id = ? AND estado IN (\'pendiente\', \'revision\') ORDER BY created_at DESC LIMIT 1',
      [tenantId]
    );

    if (existing) {
      await db.query(
        `UPDATE solicitudes_registro SET
           nombre_representante = ?, dni = ?, cargo = ?, nombre_restaurante = ?, ruc = ?, tipo_negocio = ?,
           foto_local_url = ?, fotos = ?::jsonb, video_local_url = ?,
           latitud = ?, longitud = ?, direccion = ?, telefono_solicitante = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          nombre_representante.trim(), dni.trim(), cargo, nombre_restaurante.trim(),
          ruc ? ruc.trim() : null, tipo_negocio,
          foto_local_url, fotosJson, video_local_url,
          latitud || null, longitud || null,
          direccion || null, telefono_solicitante || null, existing.id
        ]
      );
      console.log(`[Solicitud] Updated solicitud id=${existing.id} for tenant=${tenantId}`);
    } else {
      const [result] = await db.query(
        `INSERT INTO solicitudes_registro
           (tenant_id, usuario_id, estado, nombre_representante, dni, cargo, nombre_restaurante, ruc, tipo_negocio,
            foto_local_url, fotos, video_local_url, latitud, longitud, direccion, telefono_solicitante, intento)
         VALUES (?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, 1)`,
        [
          tenantId, userId, nombre_representante.trim(), dni.trim(), cargo, nombre_restaurante.trim(),
          ruc ? ruc.trim() : null, tipo_negocio, foto_local_url, fotosJson, video_local_url,
          latitud || null, longitud || null, direccion || null, telefono_solicitante || null
        ]
      );
      console.log(`[Solicitud] Created solicitud id=${result.insertId} for tenant=${tenantId}`);
    }

    // Update tenant nombre with restaurant name
    await db.query('UPDATE tenants SET nombre = ? WHERE id = ?', [nombre_restaurante.trim(), tenantId]);

    // Send confirmation email to user
    try {
      const { enviarEmailSolicitudRecibida } = require('../services/notificaciones-trial');
      await enviarEmailSolicitudRecibida(user.google_email || user.usuario, nombre_representante.trim());
    } catch (emailErr) {
      console.warn('[Solicitud] User email failed (non-blocking):', emailErr.message);
    }

    // Notify superadmin
    try {
      const linkPanel = (process.env.APP_URL || '') + '/superadmin/solicitudes';
      await notificarSuperadminWhatsApp(nombre_restaurante.trim(), direccion || '', linkPanel);
      await notificarSuperadminEmail({
        tenant_nombre: nombre_restaurante.trim(),
        google_email: user.google_email || user.usuario,
        distrito: direccion || ''
      });
    } catch (notifErr) {
      console.warn('[Solicitud] Superadmin notification failed (non-blocking):', notifErr.message);
    }

    res.redirect('/solicitud/confirmacion');
  } catch (err) {
    console.error('[Solicitud] Error saving solicitud:', err.message, err.stack);
    res.render('solicitud', { user, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', error: 'Error al guardar. Intenta nuevamente.' });
  }
});

// GET /solicitud/confirmacion
router.get('/confirmacion', (req, res) => {
  const user = req.session?.user;
  if (!user) return res.redirect('/login');
  res.render('solicitud-confirmacion', { user });
});

module.exports = router;
