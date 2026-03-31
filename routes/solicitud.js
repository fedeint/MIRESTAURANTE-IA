'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { notificarSuperadminWhatsApp, notificarSuperadminEmail } = require('../services/notificaciones-trial');

// Multer for foto_local
const uploadDir = path.join(__dirname, '../public/uploads/solicitudes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'))
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(jpg|jpeg|png|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPG/PNG'));
  }
});

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
router.post('/', upload.single('foto_local'), async (req, res) => {
  const user = req.session?.user;
  if (!user) return res.redirect('/login');

  const tenantId = user.tenant_id;
  const userId = user.id;

  try {
    const {
      dni, cargo, nombre_restaurante, ruc, tipo_negocio,
      direccion, latitud, longitud, telefono_solicitante
    } = req.body;

    // Validations
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

    const foto_local_url = req.file ? '/uploads/solicitudes/' + req.file.filename : null;

    // Check for existing pending solicitud
    const [[existing]] = await db.query(
      'SELECT id FROM solicitudes_registro WHERE tenant_id = ? AND estado IN (\'pendiente\', \'revision\') ORDER BY created_at DESC LIMIT 1',
      [tenantId]
    );

    if (existing) {
      // Update existing
      await db.query(
        `UPDATE solicitudes_registro SET
           dni = ?, cargo = ?, nombre_restaurante = ?, ruc = ?, tipo_negocio = ?,
           foto_local_url = COALESCE(?, foto_local_url), latitud = ?, longitud = ?,
           direccion = ?, telefono_solicitante = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          dni.trim(), cargo, nombre_restaurante.trim(), ruc ? ruc.trim() : null, tipo_negocio,
          foto_local_url, latitud || null, longitud || null,
          direccion || null, telefono_solicitante || null, existing.id
        ]
      );
    } else {
      // Insert new
      await db.query(
        `INSERT INTO solicitudes_registro
           (tenant_id, usuario_id, estado, dni, cargo, nombre_restaurante, ruc, tipo_negocio,
            foto_local_url, latitud, longitud, direccion, telefono_solicitante, intento)
         VALUES (?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          tenantId, userId, dni.trim(), cargo, nombre_restaurante.trim(),
          ruc ? ruc.trim() : null, tipo_negocio, foto_local_url,
          latitud || null, longitud || null, direccion || null, telefono_solicitante || null
        ]
      );
    }

    // Update tenant nombre with restaurant name
    await db.query('UPDATE tenants SET nombre = ? WHERE id = ?', [nombre_restaurante.trim(), tenantId]);

    // Notify superadmin
    try {
      const linkPanel = (process.env.APP_URL || '') + '/superadmin/solicitudes';
      await notificarSuperadminWhatsApp(nombre_restaurante.trim(), direccion || '', linkPanel);
      await notificarSuperadminEmail({
        tenant_nombre: nombre_restaurante.trim(),
        google_email: user.google_email || user.usuario,
        distrito: direccion || ''
      });
    } catch (_) {}

    res.redirect('/solicitud/confirmacion');
  } catch (err) {
    console.error('Solicitud error:', err.message);
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
