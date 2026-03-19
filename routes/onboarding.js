'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const multer = require('multer');

// Multer: store logo in memory during onboarding
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imagenes'));
        }
    }
});

// -----------------------------------------------------------------------
// GET /onboarding  – render the wizard
// -----------------------------------------------------------------------
router.get('/', (_req, res) => {
    res.render('onboarding');
});

// -----------------------------------------------------------------------
// POST /onboarding/setup  – process all wizard data in one shot
//
// Body (multipart/form-data):
//   nombre_empresa, direccion, telefono, ruc
//   moneda, igv_porcentaje, zona_horaria, formato_papel
//   mesero_nombre, mesero_usuario, mesero_password   (optional)
//   cocinero_nombre, cocinero_usuario, cocinero_password (optional)
//   cajero_nombre, cajero_usuario, cajero_password   (optional)
// File: logo
// -----------------------------------------------------------------------
router.post('/setup', upload.single('logo'), async (req, res) => {
    const tid = req.tenantId || 1;

    try {
        const {
            nombre_empresa,
            direccion,
            telefono,
            ruc,
            moneda,
            igv_porcentaje,
            zona_horaria,
            formato_papel,
            mesero_nombre,
            mesero_usuario,
            mesero_password,
            cocinero_nombre,
            cocinero_usuario,
            cocinero_password,
            cajero_nombre,
            cajero_usuario,
            cajero_password
        } = req.body;

        // Validate required fields
        const nombreEmpresa = String(nombre_empresa || '').trim();
        if (!nombreEmpresa) {
            return res.status(400).json({ error: 'El nombre del restaurante es requerido' });
        }

        // ----------------------------------------------------------------
        // 1. Update / insert configuracion_impresion
        // ----------------------------------------------------------------
        const logoBuffer = req.file ? req.file.buffer : null;
        const logoTipo   = req.file ? (req.file.mimetype.split('/')[1] || 'png') : null;
        const ancho      = String(formato_papel || '80') === 'A4' ? 210 : 80;

        const [[existeConfig]] = await db.query(
            'SELECT id FROM configuracion_impresion WHERE tenant_id=? LIMIT 1',
            [tid]
        );

        if (existeConfig) {
            if (logoBuffer) {
                await db.query(
                    `UPDATE configuracion_impresion
                     SET nombre_negocio=?, direccion=?, telefono=?,
                         ancho_papel=?, logo_data=?, logo_tipo=?, updated_at=NOW()
                     WHERE tenant_id=?`,
                    [nombreEmpresa, direccion || null, telefono || null,
                     ancho, logoBuffer, logoTipo, tid]
                );
            } else {
                await db.query(
                    `UPDATE configuracion_impresion
                     SET nombre_negocio=?, direccion=?, telefono=?,
                         ancho_papel=?, updated_at=NOW()
                     WHERE tenant_id=?`,
                    [nombreEmpresa, direccion || null, telefono || null, ancho, tid]
                );
            }
        } else {
            if (logoBuffer) {
                await db.query(
                    `INSERT INTO configuracion_impresion
                     (tenant_id, nombre_negocio, direccion, telefono, ancho_papel, logo_data, logo_tipo)
                     VALUES (?,?,?,?,?,?,?)`,
                    [tid, nombreEmpresa, direccion || null, telefono || null,
                     ancho, logoBuffer, logoTipo]
                );
            } else {
                await db.query(
                    `INSERT INTO configuracion_impresion
                     (tenant_id, nombre_negocio, direccion, telefono, ancho_papel)
                     VALUES (?,?,?,?,?)`,
                    [tid, nombreEmpresa, direccion || null, telefono || null, ancho]
                );
            }
        }

        // ----------------------------------------------------------------
        // 2. Update / insert config_sunat  (RUC + IGV)
        // ----------------------------------------------------------------
        const igv   = parseFloat(igv_porcentaje) || 18;
        const rucVal = String(ruc || '').trim() || null;

        const [[existeSunat]] = await db.query(
            'SELECT id FROM config_sunat WHERE tenant_id=? LIMIT 1',
            [tid]
        );

        if (existeSunat) {
            await db.query(
                `UPDATE config_sunat
                 SET ruc_emisor=?, razon_social_emisor=?, igv_porcentaje=?
                 WHERE tenant_id=?`,
                [rucVal, nombreEmpresa, igv, tid]
            );
        } else {
            await db.query(
                `INSERT INTO config_sunat
                 (tenant_id, ruc_emisor, razon_social_emisor, igv_porcentaje, serie_boleta, serie_factura)
                 VALUES (?,?,?,?,'B001','F001')`,
                [tid, rucVal, nombreEmpresa, igv]
            );
        }

        // ----------------------------------------------------------------
        // 3. Create staff users  (skip blank ones)
        // ----------------------------------------------------------------
        const staffDefinitions = [
            { rol: 'mesero',   nombre: mesero_nombre,   usuario: mesero_usuario,   password: mesero_password },
            { rol: 'cocinero', nombre: cocinero_nombre, usuario: cocinero_usuario, password: cocinero_password },
            { rol: 'cajero',   nombre: cajero_nombre,   usuario: cajero_usuario,   password: cajero_password }
        ];

        const staffCreated = [];
        const staffErrors  = [];

        for (const s of staffDefinitions) {
            const usuarioStr  = String(s.usuario  || '').trim();
            const passwordStr = String(s.password || '').trim();
            const nombreStr   = String(s.nombre   || '').trim();

            if (!usuarioStr || !passwordStr) continue; // optional – skip blanks

            try {
                // Check if the username already exists
                const [[existing]] = await db.query(
                    'SELECT id FROM usuarios WHERE usuario=? LIMIT 1',
                    [usuarioStr]
                );
                if (existing) {
                    staffErrors.push(`Usuario "${usuarioStr}" ya existe, no se creo.`);
                    continue;
                }

                const hash = await bcrypt.hash(passwordStr, 10);
                await db.query(
                    `INSERT INTO usuarios (usuario, nombre, password_hash, rol, activo, tenant_id)
                     VALUES (?,?,?,?,1,?)`,
                    [usuarioStr, nombreStr || usuarioStr, hash, s.rol, tid]
                );
                staffCreated.push({ rol: s.rol, usuario: usuarioStr, nombre: nombreStr || usuarioStr });
            } catch (userErr) {
                console.error('Error creando usuario staff:', userErr.message);
                staffErrors.push(`Error al crear "${usuarioStr}": ${userErr.message}`);
            }
        }

        // ----------------------------------------------------------------
        // 4. Mark onboarding complete in session so the check won't fire again
        //    (the real guard is nombre_empresa being set in the DB)
        // ----------------------------------------------------------------
        if (req.session) {
            req.session.onboardingCompleted = true;
        }

        return res.json({
            ok: true,
            message: 'Restaurante configurado correctamente',
            staffCreated,
            staffErrors
        });

    } catch (err) {
        console.error('Onboarding setup error:', err);
        return res.status(500).json({ error: 'Error al guardar la configuracion: ' + err.message });
    }
});

module.exports = router;
