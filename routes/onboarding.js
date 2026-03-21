'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { validateMagicBytes, extractExifSafe, distanciaKm } = require('../services/file-upload');
const { crearSolicitud } = require('../services/verificacion');

// Multer: store files in memory (logo, fotos, video)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max (video)
    fileFilter: (_req, file, cb) => {
        if (/\.(jpg|jpeg|png|mp4|webm)$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de archivo no permitido'));
        }
    }
});

const uploadFields = upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'fotos', maxCount: 10 },
    { name: 'video', maxCount: 1 }
]);

// -----------------------------------------------------------------------
// GET /onboarding  – render the wizard
// -----------------------------------------------------------------------
router.get('/', (_req, res) => {
    res.render('onboarding-wizard', {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
    });
});

// -----------------------------------------------------------------------
// POST /onboarding/setup  – process all wizard data in one shot
// -----------------------------------------------------------------------
router.post('/setup', uploadFields, async (req, res) => {
    const tid = req.tenantId || req.session?.user?.tenant_id;
    const userId = req.session?.user?.id;

    try {
        const {
            nombre_empresa, direccion, telefono, ruc,
            moneda, igv_porcentaje, zona_horaria, formato_papel,
            latitud, longitud, distrito, departamento,
            num_mesas, num_trabajadores, antiguedad,
            mesero_nombre, mesero_usuario, mesero_password,
            cocinero_nombre, cocinero_usuario, cocinero_password,
            cajero_nombre, cajero_usuario, cajero_password,
            almacenero_nombre, almacenero_usuario, almacenero_password
        } = req.body;

        // Validate required fields
        const nombreEmpresa = String(nombre_empresa || '').trim();
        if (!nombreEmpresa) {
            return res.status(400).json({ error: 'El nombre del restaurante es requerido' });
        }

        // Validate fotos (min 2)
        const fotosFiles = req.files?.fotos || [];
        const videoFiles = req.files?.video || [];
        if (fotosFiles.length < 2) {
            return res.status(400).json({ error: 'Debes subir al menos 2 fotos de tu fachada' });
        }
        if (videoFiles.length === 0) {
            return res.status(400).json({ error: 'Debes subir un video de tu local' });
        }

        // Validate magic bytes for each photo
        for (const foto of fotosFiles) {
            if (!validateMagicBytes(foto.buffer, foto.mimetype)) {
                return res.status(400).json({ error: `El archivo "${foto.originalname}" no es una imagen válida` });
            }
        }

        // Validate video magic bytes
        const videoFile = videoFiles[0];
        if (!validateMagicBytes(videoFile.buffer, videoFile.mimetype)) {
            return res.status(400).json({ error: 'El archivo de video no es válido' });
        }

        // ----------------------------------------------------------------
        // 1. Extract EXIF from photos + check GPS distance
        // ----------------------------------------------------------------
        const fotosData = [];
        const declaredLat = parseFloat(latitud);
        const declaredLng = parseFloat(longitud);

        for (const foto of fotosFiles) {
            const exif = extractExifSafe(foto.buffer);
            let sospechoso = false;

            if (exif.lat && exif.lng && !isNaN(declaredLat) && !isNaN(declaredLng)) {
                const dist = distanciaKm(exif.lat, exif.lng, declaredLat, declaredLng);
                if (dist > 2) sospechoso = true;
            }

            // TODO: Upload to Supabase Storage and get URL
            // For now, store as base64 (will be replaced with Supabase Storage URLs)
            fotosData.push({
                filename: foto.originalname,
                size: foto.size,
                exif: exif,
                sospechoso: sospechoso,
                url: null // Replace with Supabase Storage URL
            });
        }

        // Video duration estimated from file metadata (real validation would need ffprobe)
        const videoDuracion = null; // Will be validated on frontend

        // ----------------------------------------------------------------
        // 2. Update / insert configuracion_impresion
        // ----------------------------------------------------------------
        const logoFile = req.files?.logo?.[0];
        const logoBuffer = logoFile ? logoFile.buffer : null;
        const logoTipo = logoFile ? (logoFile.mimetype.split('/')[1] || 'png') : null;
        const ancho = String(formato_papel || '80') === 'A4' ? 210 : 80;

        const [[existeConfig]] = await db.query(
            'SELECT id FROM configuracion_impresion WHERE tenant_id=? LIMIT 1', [tid]
        );

        if (existeConfig) {
            if (logoBuffer) {
                await db.query(
                    `UPDATE configuracion_impresion SET nombre_negocio=?, direccion=?, telefono=?,
                     ancho_papel=?, logo_data=?, logo_tipo=?, updated_at=NOW() WHERE tenant_id=?`,
                    [nombreEmpresa, direccion || null, telefono || null, ancho, logoBuffer, logoTipo, tid]
                );
            } else {
                await db.query(
                    `UPDATE configuracion_impresion SET nombre_negocio=?, direccion=?, telefono=?,
                     ancho_papel=?, updated_at=NOW() WHERE tenant_id=?`,
                    [nombreEmpresa, direccion || null, telefono || null, ancho, tid]
                );
            }
        } else {
            if (logoBuffer) {
                await db.query(
                    `INSERT INTO configuracion_impresion (tenant_id, nombre_negocio, direccion, telefono, ancho_papel, logo_data, logo_tipo)
                     VALUES (?,?,?,?,?,?,?)`,
                    [tid, nombreEmpresa, direccion || null, telefono || null, ancho, logoBuffer, logoTipo]
                );
            } else {
                await db.query(
                    `INSERT INTO configuracion_impresion (tenant_id, nombre_negocio, direccion, telefono, ancho_papel)
                     VALUES (?,?,?,?,?)`,
                    [tid, nombreEmpresa, direccion || null, telefono || null, ancho]
                );
            }
        }

        // ----------------------------------------------------------------
        // 3. Update config_sunat
        // ----------------------------------------------------------------
        const igv = parseFloat(igv_porcentaje) || 18;
        const rucVal = String(ruc || '').trim() || null;

        const [[existeSunat]] = await db.query(
            'SELECT id FROM config_sunat WHERE tenant_id=? LIMIT 1', [tid]
        );

        if (existeSunat) {
            await db.query(
                `UPDATE config_sunat SET ruc_emisor=?, razon_social_emisor=?, igv_porcentaje=? WHERE tenant_id=?`,
                [rucVal, nombreEmpresa, igv, tid]
            );
        } else {
            await db.query(
                `INSERT INTO config_sunat (tenant_id, ruc_emisor, razon_social_emisor, igv_porcentaje, serie_boleta, serie_factura)
                 VALUES (?,?,?,?,'B001','F001')`,
                [tid, rucVal, nombreEmpresa, igv]
            );
        }

        // ----------------------------------------------------------------
        // 4. Update tenant with location + operational data
        // ----------------------------------------------------------------
        await db.query(
            `UPDATE tenants SET nombre=?, latitud=?, longitud=?, direccion=?,
             distrito=?, departamento=?, num_mesas=?, num_trabajadores=?, antiguedad=?
             WHERE id=?`,
            [nombreEmpresa,
             declaredLat || null, declaredLng || null, direccion || null,
             distrito || null, departamento || null,
             parseInt(num_mesas) || null, parseInt(num_trabajadores) || null,
             antiguedad || null, tid]
        );

        // ----------------------------------------------------------------
        // 5. Create verification request
        // ----------------------------------------------------------------
        const videoUrl = null; // TODO: Supabase Storage URL
        const result = await crearSolicitud(tid, userId, fotosData, videoUrl, videoDuracion);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        // ----------------------------------------------------------------
        // 6. Create staff users (skip blank ones)
        // ----------------------------------------------------------------
        const staffDefinitions = [
            { rol: 'mesero', nombre: mesero_nombre, usuario: mesero_usuario, password: mesero_password },
            { rol: 'cocinero', nombre: cocinero_nombre, usuario: cocinero_usuario, password: cocinero_password },
            { rol: 'cajero', nombre: cajero_nombre, usuario: cajero_usuario, password: cajero_password },
            { rol: 'almacenero', nombre: almacenero_nombre, usuario: almacenero_usuario, password: almacenero_password }
        ];

        for (const s of staffDefinitions) {
            const usuarioStr = String(s.usuario || '').trim();
            const passwordStr = String(s.password || '').trim();
            const nombreStr = String(s.nombre || '').trim();
            if (!usuarioStr || !passwordStr) continue;

            try {
                const [[existing]] = await db.query(
                    'SELECT id FROM usuarios WHERE usuario=? LIMIT 1', [usuarioStr]
                );
                if (existing) continue;

                const hash = await bcrypt.hash(passwordStr, 10);
                await db.query(
                    `INSERT INTO usuarios (usuario, nombre, password_hash, rol, activo, tenant_id)
                     VALUES (?,?,?,?,1,?)`,
                    [usuarioStr, nombreStr || usuarioStr, hash, s.rol, tid]
                );
            } catch (userErr) {
                console.error('Error creando usuario staff:', userErr.message);
            }
        }

        // ----------------------------------------------------------------
        // 7. Notify superadmin
        // ----------------------------------------------------------------
        try {
            const { notificarSuperadminWhatsApp, notificarSuperadminEmail } = require('../services/notificaciones-trial');
            notificarSuperadminWhatsApp(nombreEmpresa, distrito || '', `${process.env.BASE_URL || ''}/superadmin`);
            notificarSuperadminEmail({ tenant_nombre: nombreEmpresa, google_email: req.session?.user?.google_email, distrito: distrito || '' });
        } catch (notifErr) {
            console.error('Error notificando superadmin:', notifErr.message);
        }

        if (req.session) req.session.onboardingCompleted = true;

        return res.json({ ok: true, message: 'Solicitud enviada correctamente' });

    } catch (err) {
        console.error('Onboarding setup error:', err);
        return res.status(500).json({ error: 'Error al guardar la configuración: ' + err.message });
    }
});

// -----------------------------------------------------------------------
// POST /onboarding/chat  – DalIA chat during onboarding
// -----------------------------------------------------------------------
router.post('/chat', async (req, res) => {
    const { message, step } = req.body;
    if (!message || !message.trim()) return res.json({ response: '' });

    // Rate limit: 20 messages per session
    if (!req.session.onboardingChatCount) req.session.onboardingChatCount = 0;
    req.session.onboardingChatCount++;

    if (req.session.onboardingChatCount > 20) {
        return res.json({
            response: 'Has alcanzado el límite de consultas. Completa el registro y podrás chatear conmigo sin límites.'
        });
    }

    // Build system prompt for onboarding context
    const systemPrompt = `Eres DalIA, la asistente del sistema MiRest con IA.
El usuario está en el paso ${step || 1} del wizard de onboarding (registro de su restaurante).
Solo responde preguntas sobre:
- El proceso de registro y configuración del sistema
- Qué datos necesita completar y por qué
- Cómo usar el sistema después del registro
- Tips para restaurantes

NO respondas sobre temas fuera de estos. Sé breve y amigable. Usa lenguaje peruano natural.
Máximo 3 oraciones por respuesta.`;

    try {
        // Try Claude API first, then KIMI
        const apiKey = process.env.ANTHROPIC_API_KEY || process.env.KIMI_API_KEY;
        if (!apiKey) {
            return res.json({ response: 'El servicio de chat no está disponible en este momento.' });
        }

        if (process.env.ANTHROPIC_API_KEY) {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            const completion = await client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 300,
                system: systemPrompt,
                messages: [{ role: 'user', content: message.trim() }]
            });
            const text = completion.content?.[0]?.text || 'No pude procesar tu consulta.';
            return res.json({ response: text });
        }

        // Fallback to generic response
        return res.json({ response: 'Completa los campos del paso actual. Si tienes dudas, lee las instrucciones de DalIA.' });

    } catch (err) {
        console.error('Onboarding chat error:', err.message);
        return res.json({ response: 'Error al procesar tu consulta. Intenta de nuevo.' });
    }
});

// -----------------------------------------------------------------------
// POST /onboarding/retry  – Re-upload photos/video after rejection
// -----------------------------------------------------------------------
router.post('/retry', uploadFields, async (req, res) => {
    const tid = req.tenantId || req.session?.user?.tenant_id;
    const userId = req.session?.user?.id;

    try {
        const fotosFiles = req.files?.fotos || [];
        const videoFiles = req.files?.video || [];

        if (fotosFiles.length < 2) {
            return res.status(400).json({ error: 'Debes subir al menos 2 fotos' });
        }
        if (videoFiles.length === 0) {
            return res.status(400).json({ error: 'Debes subir un video' });
        }

        // Validate magic bytes
        for (const foto of fotosFiles) {
            if (!validateMagicBytes(foto.buffer, foto.mimetype)) {
                return res.status(400).json({ error: `Archivo "${foto.originalname}" no es una imagen válida` });
            }
        }
        if (!validateMagicBytes(videoFiles[0].buffer, videoFiles[0].mimetype)) {
            return res.status(400).json({ error: 'El video no es válido' });
        }

        const fotosData = fotosFiles.map(f => ({
            filename: f.originalname,
            size: f.size,
            exif: extractExifSafe(f.buffer),
            url: null
        }));

        const result = await crearSolicitud(tid, userId, fotosData, null, null);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        return res.json({ ok: true, message: 'Solicitud reenviada', intento: result.intento });

    } catch (err) {
        console.error('Onboarding retry error:', err);
        return res.status(500).json({ error: 'Error al reenviar: ' + err.message });
    }
});

module.exports = router;
