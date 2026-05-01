'use strict';

/**
 * routes/soporte.js
 * Support ticket system.
 * Mounted at /soporte and /api/soporte by server.js.
 * Protected by requireAuth at mount point.
 *
 * Role rules:
 *   - All authenticated users: can view and create their own tickets
 *   - administrador: sees all tickets for their tenant, can respond as support
 *   - superadmin: sees ALL tickets across all tenants, can respond as support
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

const CATEGORIAS = ['general', 'facturacion', 'mesas', 'cocina', 'almacen', 'sunat', 'whatsapp', 'otro'];
const PRIORIDADES = ['baja', 'normal', 'alta', 'urgente'];
const ESTADOS = ['abierto', 'en_progreso', 'respondido', 'cerrado'];

// ---------------------------------------------------------------------------
// Ensure tables exist on first use
// ---------------------------------------------------------------------------
async function ensureSoporteTables() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS soporte_tickets (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            asunto VARCHAR(200) NOT NULL,
            descripcion TEXT NOT NULL,
            categoria VARCHAR(50) DEFAULT 'general',
            prioridad VARCHAR(20) DEFAULT 'normal',
            estado VARCHAR(20) DEFAULT 'abierto',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS soporte_respuestas (
            id SERIAL PRIMARY KEY,
            ticket_id INTEGER NOT NULL,
            usuario_id INTEGER,
            es_soporte BOOLEAN DEFAULT false,
            mensaje TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Add foreign key if not already added (best effort, ignore if exists)
    try {
        await db.query(`
            ALTER TABLE soporte_respuestas
            ADD CONSTRAINT fk_soporte_respuestas_ticket
            FOREIGN KEY (ticket_id) REFERENCES soporte_tickets(id) ON DELETE CASCADE
        `);
    } catch (_) { /* constraint already exists */ }
}

// ---------------------------------------------------------------------------
// Helper: build ticket query filter based on role
// ---------------------------------------------------------------------------
function buildTicketFilter(user, tenantId) {
    const rol = user?.rol;
    if (rol === 'superadmin') {
        // Superadmin sees everything
        return { where: '1=1', params: [] };
    }
    if (rol === 'administrador') {
        // Admin sees all tickets from their tenant
        return { where: 't.tenant_id = ?', params: [tenantId] };
    }
    // Regular users see only their own tickets
    return { where: 't.tenant_id = ? AND t.usuario_id = ?', params: [tenantId, user.id] };
}

// ---------------------------------------------------------------------------
// GET /soporte - HTML page
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        await ensureSoporteTables();

        const user = req.session?.user;
        const tenantId = req.tenantId || 1;
        const rol = user?.rol;
        const isSuperadmin = rol === 'superadmin';
        const isAdminOrSuper = rol === 'administrador' || isSuperadmin;

        const { where, params } = buildTicketFilter(user, tenantId);

        const [tickets] = await db.query(
            `SELECT t.id, t.tenant_id, t.usuario_id, t.asunto, t.categoria,
                    t.prioridad, t.estado, t.created_at, t.updated_at,
                    u.nombre AS usuario_nombre, u.usuario AS usuario_login,
                    ten.nombre AS tenant_nombre,
                    (SELECT COUNT(*) FROM soporte_respuestas r WHERE r.ticket_id = t.id) AS respuestas_count
             FROM soporte_tickets t
             LEFT JOIN usuarios u ON u.id = t.usuario_id
             LEFT JOIN tenants ten ON ten.id = t.tenant_id
             WHERE ${where}
             ORDER BY
               CASE t.prioridad WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
               t.updated_at DESC`,
            params
        );

        res.render('soporte', {
            tickets: tickets || [],
            categorias: CATEGORIAS,
            prioridades: PRIORIDADES,
            estados: ESTADOS,
            isAdminOrSuper,
            isSuperadmin,
        });
    } catch (e) {
        console.error('[GET /soporte]', e.message);
        res.render('soporte', {
            tickets: [],
            categorias: CATEGORIAS,
            prioridades: PRIORIDADES,
            estados: ESTADOS,
            isAdminOrSuper: false,
            isSuperadmin: false,
        });
    }
});

// ---------------------------------------------------------------------------
// GET /api/soporte - JSON list of tickets
// ---------------------------------------------------------------------------
router.get('/api', async (req, res) => {
    // This path won't match since we mount at /api/soporte — handled below
    res.redirect('/api/soporte');
});

router.get('/list', async (req, res) => {
    try {
        await ensureSoporteTables();

        const user = req.session?.user;
        const tenantId = req.tenantId || 1;
        const { where, params } = buildTicketFilter(user, tenantId);

        const [tickets] = await db.query(
            `SELECT t.id, t.tenant_id, t.usuario_id, t.asunto, t.categoria,
                    t.prioridad, t.estado, t.created_at, t.updated_at,
                    u.nombre AS usuario_nombre,
                    ten.nombre AS tenant_nombre,
                    (SELECT COUNT(*) FROM soporte_respuestas r WHERE r.ticket_id = t.id) AS respuestas_count
             FROM soporte_tickets t
             LEFT JOIN usuarios u ON u.id = t.usuario_id
             LEFT JOIN tenants ten ON ten.id = t.tenant_id
             WHERE ${where}
             ORDER BY t.updated_at DESC`,
            params
        );
        res.json({ tickets: tickets || [] });
    } catch (e) {
        console.error('[GET /api/soporte/list]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/soporte - Create ticket
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
    try {
        await ensureSoporteTables();

        const user = req.session?.user;
        const tenantId = req.tenantId || 1;
        const userId = user?.id;

        const asunto = String(req.body.asunto || '').trim();
        const descripcion = String(req.body.descripcion || '').trim();
        const categoria = CATEGORIAS.includes(req.body.categoria) ? req.body.categoria : 'general';
        const prioridad = PRIORIDADES.includes(req.body.prioridad) ? req.body.prioridad : 'normal';

        if (!asunto) return res.status(400).json({ error: 'El asunto es requerido' });
        if (!descripcion) return res.status(400).json({ error: 'La descripcion es requerida' });

        const [result] = await db.query(
            `INSERT INTO soporte_tickets (tenant_id, usuario_id, asunto, descripcion, categoria, prioridad, estado)
             VALUES (?, ?, ?, ?, ?, ?, 'abierto')
             RETURNING id`,
            [tenantId, userId, asunto, descripcion, categoria, prioridad]
        );

        const ticketId = result.insertId;
        res.status(201).json({ ok: true, id: ticketId });
    } catch (e) {
        console.error('[POST /api/soporte]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/soporte/:id - Get ticket detail with responses
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        await ensureSoporteTables();

        const user = req.session?.user;
        const tenantId = req.tenantId || 1;
        const ticketId = Number(req.params.id);
        const rol = user?.rol;

        // Build access check
        let ticketQuery, ticketParams;
        if (rol === 'superadmin') {
            ticketQuery = `SELECT t.*, u.nombre AS usuario_nombre, ten.nombre AS tenant_nombre
                           FROM soporte_tickets t
                           LEFT JOIN usuarios u ON u.id = t.usuario_id
                           LEFT JOIN tenants ten ON ten.id = t.tenant_id
                           WHERE t.id = ?`;
            ticketParams = [ticketId];
        } else if (rol === 'administrador') {
            ticketQuery = `SELECT t.*, u.nombre AS usuario_nombre
                           FROM soporte_tickets t
                           LEFT JOIN usuarios u ON u.id = t.usuario_id
                           WHERE t.id = ? AND t.tenant_id = ?`;
            ticketParams = [ticketId, tenantId];
        } else {
            ticketQuery = `SELECT t.*, u.nombre AS usuario_nombre
                           FROM soporte_tickets t
                           LEFT JOIN usuarios u ON u.id = t.usuario_id
                           WHERE t.id = ? AND t.tenant_id = ? AND t.usuario_id = ?`;
            ticketParams = [ticketId, tenantId, user.id];
        }

        const [ticketRows] = await db.query(ticketQuery, ticketParams);
        const ticket = ticketRows[0];
        if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

        const [respuestas] = await db.query(
            `SELECT r.id, r.ticket_id, r.es_soporte, r.mensaje, r.created_at,
                    u.nombre AS usuario_nombre, u.usuario AS usuario_login, u.rol AS usuario_rol
             FROM soporte_respuestas r
             LEFT JOIN usuarios u ON u.id = r.usuario_id
             WHERE r.ticket_id = ?
             ORDER BY r.created_at ASC`,
            [ticketId]
        );

        res.json({ ticket, respuestas: respuestas || [] });
    } catch (e) {
        console.error('[GET /api/soporte/:id]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// PUT /api/soporte/:id - Update ticket (add response, change status)
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
    try {
        await ensureSoporteTables();

        const user = req.session?.user;
        const tenantId = req.tenantId || 1;
        const ticketId = Number(req.params.id);
        const rol = user?.rol;
        const isAdminOrSuper = rol === 'administrador' || rol === 'superadmin';

        // Verify access to ticket
        let ticketCheck, checkParams;
        if (rol === 'superadmin') {
            ticketCheck = `SELECT id, estado FROM soporte_tickets WHERE id = ?`;
            checkParams = [ticketId];
        } else if (rol === 'administrador') {
            ticketCheck = `SELECT id, estado FROM soporte_tickets WHERE id = ? AND tenant_id = ?`;
            checkParams = [ticketId, tenantId];
        } else {
            ticketCheck = `SELECT id, estado FROM soporte_tickets WHERE id = ? AND tenant_id = ? AND usuario_id = ?`;
            checkParams = [ticketId, tenantId, user.id];
        }

        const [ticketRows] = await db.query(ticketCheck, checkParams);
        const ticket = ticketRows[0];
        if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado o sin acceso' });

        // Add a response message if provided
        const mensaje = String(req.body.mensaje || '').trim();
        if (mensaje) {
            const esSoporte = isAdminOrSuper ? true : false;
            await db.query(
                `INSERT INTO soporte_respuestas (ticket_id, usuario_id, es_soporte, mensaje)
                 VALUES (?, ?, ?, ?)`,
                [ticketId, user.id, esSoporte, mensaje]
            );
        }

        // Change status if provided and user has permission
        const nuevoEstado = req.body.estado;
        if (nuevoEstado && ESTADOS.includes(nuevoEstado) && isAdminOrSuper) {
            await db.query(
                `UPDATE soporte_tickets SET estado = ?, updated_at = NOW() WHERE id = ?`,
                [nuevoEstado, ticketId]
            );
        } else if (mensaje) {
            // Update updated_at on reply
            // Auto-change status to 'respondido' if admin replies to an open/in_progress ticket
            if (isAdminOrSuper && ['abierto', 'en_progreso'].includes(ticket.estado)) {
                await db.query(
                    `UPDATE soporte_tickets SET estado = 'respondido', updated_at = NOW() WHERE id = ?`,
                    [ticketId]
                );
            } else {
                await db.query(
                    `UPDATE soporte_tickets SET updated_at = NOW() WHERE id = ?`,
                    [ticketId]
                );
            }
        }

        res.json({ ok: true });
    } catch (e) {
        console.error('[PUT /api/soporte/:id]', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
