'use strict';

/**
 * routes/backups.js
 * Backup management endpoints.
 * Mounted at /api/backups by server.js
 * Protected by requireAuth + requireRole(['administrador','superadmin']) at mount point.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { crearBackup, listarBackups, obtenerBackup, restaurarBackup, ensureBackupsTable } = require('../services/backup');

// ---------------------------------------------------------------------------
// GET /api/backups - List recent backups
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        await ensureBackupsTable();
        const user = req.session?.user;
        const isSuperadmin = user?.rol === 'superadmin';
        const tenantId = isSuperadmin ? null : (req.tenantId || 1);

        const backups = await listarBackups(tenantId, 50);
        res.json({ backups });
    } catch (e) {
        console.error('[GET /api/backups]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/backups/create - Trigger a manual backup
// ---------------------------------------------------------------------------
router.post('/create', async (req, res) => {
    try {
        const user = req.session?.user;
        const tenantId = req.tenantId || 1;
        const userId = user?.id || null;

        const backupId = await crearBackup(tenantId, 'manual', userId);

        // Fetch the created record (without datos JSONB to keep response small)
        const [rows] = await db.query(
            `SELECT id, tenant_id, tipo, descripcion, tablas_incluidas,
                    registros_total, tamano_bytes, estado, created_at
             FROM backups WHERE id = ?`,
            [backupId]
        );
        res.status(201).json({ ok: true, backup: rows[0] || { id: backupId } });
    } catch (e) {
        console.error('[POST /api/backups/create]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/backups/:id/download - Download backup as JSON file
// ---------------------------------------------------------------------------
router.get('/:id/download', async (req, res) => {
    try {
        const user = req.session?.user;
        const isSuperadmin = user?.rol === 'superadmin';
        const tenantId = isSuperadmin ? null : (req.tenantId || 1);
        const backupId = Number(req.params.id);

        // For superadmin allow cross-tenant, for admin restrict to own tenant
        let backup;
        if (isSuperadmin) {
            const [rows] = await db.query(`SELECT * FROM backups WHERE id = ?`, [backupId]);
            backup = rows[0];
        } else {
            backup = await obtenerBackup(backupId, tenantId);
        }

        if (!backup) {
            return res.status(404).json({ error: 'Backup no encontrado' });
        }

        const jsonData = typeof backup.datos === 'string'
            ? backup.datos
            : JSON.stringify(backup.datos, null, 2);

        const fecha = new Date(backup.created_at).toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `backup_${backup.tenant_id}_${fecha}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(jsonData);
    } catch (e) {
        console.error('[GET /api/backups/:id/download]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/backups/restore/:id - Restore from a backup (superadmin only)
// ---------------------------------------------------------------------------
router.post('/restore/:id', async (req, res) => {
    try {
        const user = req.session?.user;
        if (user?.rol !== 'superadmin') {
            return res.status(403).json({ error: 'Solo superadmin puede restaurar backups' });
        }

        const backupId = Number(req.params.id);

        // Find the backup first to know its tenant
        const [rows] = await db.query(
            `SELECT id, tenant_id FROM backups WHERE id = ?`,
            [backupId]
        );
        const backupRow = rows[0];
        if (!backupRow) return res.status(404).json({ error: 'Backup no encontrado' });

        // Create a pre-restore backup of current state
        try {
            await crearBackup(backupRow.tenant_id, 'pre_restore', user.id);
        } catch (preErr) {
            console.warn('[Restore] Could not create pre-restore backup:', preErr.message);
        }

        const stats = await restaurarBackup(backupId, backupRow.tenant_id);
        res.json({ ok: true, stats });
    } catch (e) {
        console.error('[POST /api/backups/restore/:id]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/backups/view - HTML view page (admin panel)
// ---------------------------------------------------------------------------
router.get('/view', async (req, res) => {
    try {
        await ensureBackupsTable();
        const user = req.session?.user;
        const isSuperadmin = user?.rol === 'superadmin';
        const tenantId = isSuperadmin ? null : (req.tenantId || 1);
        const backups = await listarBackups(tenantId, 30);
        res.render('backups', { backups, isSuperadmin });
    } catch (e) {
        console.error('[GET /api/backups/view]', e.message);
        res.render('backups', { backups: [], isSuperadmin: false });
    }
});

module.exports = router;
