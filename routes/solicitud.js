'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { notificarSuperadminWhatsApp, notificarSuperadminEmail } = require('../services/notificaciones-trial');
const { uploadFile } = require('../services/supabase-storage');

// ── Single-file multer for the /upload endpoint (browser uploads one file at a time) ──
const singleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max
  fileFilter: (_req, file, cb) => {
    if (/\.(jpg|jpeg|png|webp)$/i.test(file.originalname)) cb(null, true);
    else if (/\.(mp4|mov|webm)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Formato no permitido. Solo JPG/PNG/WebP o MP4/MOV/WebM'));
  }
}).single('file');

// Fallback: disk storage for when Supabase is not configured
const fallbackDir = process.env.VERCEL
  ? path.join('/tmp', 'uploads', 'solicitudes')
  : path.join(__dirname, '../public/uploads/solicitudes');
try { if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true }); } catch (_) {}

// POST /solicitud/upload — upload a single file (photo or video) to Supabase Storage
// The browser sends files one at a time; we return the public URL.
router.post('/upload', (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  singleUpload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo es demasiado grande. Maximo 30 MB.'
        : 'Error al subir archivo.';
      return res.status(400).json({ error: msg });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibio archivo' });

    try {
      const file = req.file;
      const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
      const storagePath = `solicitudes/tenant-${user.tenant_id}/${safeName}`;

      // Try Supabase Storage first
      let publicUrl = null;
      try {
        publicUrl = await uploadFile(file.buffer, storagePath, file.mimetype);
      } catch (uploadErr) {
        console.warn('[Solicitud/upload] Supabase upload failed, using fallback:', uploadErr.message);
      }

      // Fallback: save to disk if Supabase is not configured or failed
      if (!publicUrl) {
        const localPath = path.join(fallbackDir, safeName);
        fs.writeFileSync(localPath, file.buffer);
        publicUrl = '/uploads/solicitudes/' + safeName;
      }

      return res.json({ url: publicUrl });
    } catch (e) {
      console.error('[Solicitud/upload] Error:', e.message);
      return res.status(500).json({ error: 'Error al subir archivo. Intenta nuevamente.' });
    }
  });
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

// POST /solicitud — save form (now accepts JSON body with pre-uploaded file URLs)
router.post('/', express.json(), async (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: 'No autenticado' });

  const tenantId = user.tenant_id;
  const userId = user.id;

  try {
    const {
      nombre_representante, dni, cargo, nombre_restaurante, ruc, tipo_negocio,
      direccion, latitud, longitud, telefono_solicitante,
      foto_urls, video_url
    } = req.body;

    // Helper to return JSON errors
    const jsonError = (msg) => res.status(400).json({ error: msg });

    // Validations
    if (!nombre_representante || nombre_representante.trim().length < 2) {
      return jsonError('Ingresa el nombre del representante');
    }
    if (!dni || !/^\d{8}$/.test(dni.trim())) {
      return jsonError('El DNI debe tener 8 digitos');
    }
    if (!cargo) {
      return jsonError('Selecciona tu cargo');
    }
    if (!nombre_restaurante || nombre_restaurante.trim().length < 2) {
      return jsonError('Ingresa el nombre del restaurante');
    }
    if (ruc && !/^\d{11}$/.test(ruc.trim())) {
      return jsonError('El RUC debe tener 11 digitos');
    }
    if (!tipo_negocio) {
      return jsonError('Selecciona el tipo de negocio');
    }

    // Validate file URLs (already uploaded via POST /solicitud/upload)
    if (!Array.isArray(foto_urls) || foto_urls.length < 2) {
      return jsonError('Debes subir al menos 2 fotos de tu local');
    }
    if (foto_urls.length > 3) {
      return jsonError('Maximo 3 fotos permitidas');
    }
    if (!video_url || typeof video_url !== 'string') {
      return jsonError('Debes subir un video de tu local (15-30 segundos)');
    }

    const fotosUrls = foto_urls;
    const foto_local_url = fotosUrls[0]; // primary
    const fotosJson = JSON.stringify(fotosUrls);
    const video_local_url = video_url;

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

    res.json({ ok: true, redirect: '/solicitud/confirmacion' });
  } catch (err) {
    console.error('[Solicitud] Error saving solicitud:', err.message, err.stack);
    res.status(500).json({ error: 'Error al guardar. Intenta nuevamente.' });
  }
});

// GET /solicitud/confirmacion
router.get('/confirmacion', (req, res) => {
  const user = req.session?.user;
  if (!user) return res.redirect('/login');
  res.render('solicitud-confirmacion', { user });
});

module.exports = router;
