const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /canales - Lista de canales
router.get('/', async (req, res) => {
    const tid = req.tenantId || 1;
    const rol = req.session?.user?.rol || '';
    const [canales] = await db.query('SELECT * FROM canales WHERE tenant_id=?', [tid]);

    // Filtrar por permisos de rol
    const canalesFiltrados = canales.filter(c => {
        if (!c.roles_permitidos) return true;
        const roles = typeof c.roles_permitidos === 'string' ? JSON.parse(c.roles_permitidos) : c.roles_permitidos;
        return roles.includes(rol);
    });

    res.render('canales', { canales: canalesFiltrados });
});

// GET /api/canales/:id/mensajes
router.get('/:id/mensajes', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const [mensajes] = await db.query(`
            SELECT cm.*, u.usuario as usuario_nombre
            FROM canal_mensajes cm
            LEFT JOIN usuarios u ON u.id = cm.usuario_id
            WHERE cm.canal_id=? AND cm.tenant_id=?
            ORDER BY cm.pinned DESC, cm.created_at DESC
            LIMIT 100
        `, [req.params.id, tid]);
        res.json(mensajes);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/canales/:id/mensajes
router.post('/:id/mensajes', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;
        const { mensaje, prioridad } = req.body;
        if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });

        await db.query(
            'INSERT INTO canal_mensajes (tenant_id, canal_id, usuario_id, tipo, mensaje, prioridad) VALUES (?,?,?,?,?,?)',
            [tid, req.params.id, uid, 'texto', mensaje, prioridad || 'normal']
        );
        res.status(201).json({ message: 'Mensaje enviado' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Funcion para enviar mensaje del sistema (usada por otros modulos)
async function enviarMensajeSistema(tenantId, canalNombre, mensaje, prioridad = 'normal') {
    try {
        const [[canal]] = await db.query('SELECT id FROM canales WHERE tenant_id=? AND nombre=?', [tenantId, canalNombre]);
        if (!canal) return;
        await db.query(
            'INSERT INTO canal_mensajes (tenant_id, canal_id, usuario_id, tipo, mensaje, prioridad) VALUES (?,?,NULL,"sistema",?,?)',
            [tenantId, canal.id, mensaje, prioridad]
        );
    } catch (e) { console.error('Canal sistema error:', e.message); }
}

router.enviarMensajeSistema = enviarMensajeSistema;
module.exports = router;
