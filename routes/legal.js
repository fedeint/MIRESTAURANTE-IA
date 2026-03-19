'use strict';

/**
 * routes/legal.js
 * Legal routes for dignita.tech restaurant management SaaS.
 *
 * PUBLIC routes - no authentication required.
 *
 * Mounted in server.js:
 *   app.use('/libro-reclamaciones', legalRoutes);
 *   app.use('/api/legal', legalRoutes);
 *
 * Complies with:
 *   - Ley 32495 (Libro de Reclamaciones, Peru)
 *   - Codigo de Proteccion al Consumidor (Ley 29571)
 *   - INDECOPI resolution on libro de reclamaciones electronico
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

// ---------------------------------------------------------------------------
// Ensure the libro_reclamaciones table exists on first use
// ---------------------------------------------------------------------------
async function ensureReclamacionesTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS libro_reclamaciones (
                id                SERIAL PRIMARY KEY,
                numero            VARCHAR(20)  UNIQUE NOT NULL,
                tipo              VARCHAR(20)  NOT NULL CHECK (tipo IN ('queja', 'reclamo')),
                nombre            VARCHAR(200) NOT NULL,
                documento_tipo    VARCHAR(10)  DEFAULT 'DNI',
                documento_numero  VARCHAR(20)  NOT NULL,
                direccion         TEXT,
                telefono          VARCHAR(20),
                email             VARCHAR(200),
                detalle           TEXT         NOT NULL,
                pedido_consumidor TEXT         NOT NULL,
                monto_reclamado   NUMERIC(10,2),
                estado            VARCHAR(20)  DEFAULT 'recibido',
                respuesta         TEXT,
                fecha_respuesta   TIMESTAMP,
                created_at        TIMESTAMP    DEFAULT NOW()
            )
        `);

        // Index for fast lookups by numero
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_libro_reclamos_numero
            ON libro_reclamaciones (numero)
        `);
    } catch (err) {
        console.error('[legal] ensureReclamacionesTable error:', err.message);
    }
}

// Run once on module load
ensureReclamacionesTable();

// ---------------------------------------------------------------------------
// Helper: generate claim number RC-YYYY-NNNN
// ---------------------------------------------------------------------------
async function generarNumeroReclamo() {
    const year = new Date().getFullYear();
    const prefix = `RC-${year}-`;

    // Count existing records for this year to determine next sequential number
    const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM libro_reclamaciones
         WHERE numero LIKE ?`,
        [`${prefix}%`]
    );

    const count = Number(rows[0]?.cnt || 0) + 1;
    const seq   = String(count).padStart(4, '0');
    return `${prefix}${seq}`;
}

// ---------------------------------------------------------------------------
// GET /libro-reclamaciones  (shown when mounted at /libro-reclamaciones)
// GET /                     (shown when mounted at /libro-reclamaciones via app.use)
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
    res.render('libro-reclamaciones', {
        submitted:    false,
        numeroClaim:  null,
        error:        null,
        claimStatus:  null,
        statusError:  null
    });
});

// ---------------------------------------------------------------------------
// POST /api/legal/reclamo  — Submit a new reclamo/queja
// ---------------------------------------------------------------------------
router.post('/reclamo', async (req, res) => {
    try {
        const {
            tipo,
            nombre,
            documento_tipo,
            documento_numero,
            direccion,
            telefono,
            email,
            detalle,
            pedido_consumidor,
            monto_reclamado
        } = req.body;

        // Basic validation
        const errors = [];
        if (!tipo || !['queja', 'reclamo'].includes(tipo))       errors.push('Tipo debe ser "queja" o "reclamo".');
        if (!nombre || nombre.trim().length < 2)                  errors.push('Nombre es obligatorio.');
        if (!documento_numero || documento_numero.trim().length < 7) errors.push('Numero de documento invalido.');
        if (!detalle || detalle.trim().length < 10)               errors.push('Detalle del hecho es obligatorio (minimo 10 caracteres).');
        if (!pedido_consumidor || pedido_consumidor.trim().length < 5) errors.push('Debe indicar lo que solicita como consumidor.');

        if (errors.length > 0) {
            return res.status(400).json({ ok: false, errors });
        }

        const numero = await generarNumeroReclamo();
        const monto  = monto_reclamado ? parseFloat(monto_reclamado) : null;

        await db.query(
            `INSERT INTO libro_reclamaciones
                (numero, tipo, nombre, documento_tipo, documento_numero,
                 direccion, telefono, email, detalle, pedido_consumidor, monto_reclamado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                numero,
                tipo.trim(),
                nombre.trim(),
                (documento_tipo || 'DNI').trim(),
                documento_numero.trim(),
                (direccion || '').trim() || null,
                (telefono  || '').trim() || null,
                (email     || '').trim() || null,
                detalle.trim(),
                pedido_consumidor.trim(),
                monto
            ]
        );

        return res.status(201).json({
            ok:     true,
            numero,
            mensaje: `Su ${tipo} ha sido registrado exitosamente con el numero ${numero}. Recibirá una respuesta en un plazo maximo de 15 dias habiles.`
        });

    } catch (err) {
        console.error('[legal] POST /reclamo error:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno. Por favor intente nuevamente.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/legal/reclamo/:numero  — Check claim status by claim number
// ---------------------------------------------------------------------------
router.get('/reclamo/:numero', async (req, res) => {
    try {
        const numero = String(req.params.numero || '').toUpperCase().trim();

        if (!numero.match(/^RC-\d{4}-\d{4}$/)) {
            return res.status(400).json({ ok: false, error: 'Formato de numero invalido. Use: RC-YYYY-NNNN' });
        }

        const [rows] = await db.query(
            `SELECT numero, tipo, nombre, estado, created_at, fecha_respuesta, respuesta
             FROM libro_reclamaciones
             WHERE numero = ?`,
            [numero]
        );

        if (!rows || rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Numero de reclamo no encontrado.' });
        }

        const r = rows[0];

        // Calculate business days elapsed
        const createdAt = new Date(r.created_at);
        const now       = new Date();
        const diffMs    = now - createdAt;
        const diffDays  = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        return res.json({
            ok: true,
            reclamo: {
                numero:          r.numero,
                tipo:            r.tipo,
                nombre:          r.nombre,
                estado:          r.estado,
                fecha_registro:  r.created_at,
                dias_transcurridos: diffDays,
                plazo_maximo_dias: 15,
                plazo_vence:     diffDays >= 15,
                respuesta:       r.respuesta || null,
                fecha_respuesta: r.fecha_respuesta || null
            }
        });

    } catch (err) {
        console.error('[legal] GET /reclamo/:numero error:', err.message);
        return res.status(500).json({ ok: false, error: 'Error interno. Por favor intente nuevamente.' });
    }
});

module.exports = router;
