const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /clientes - Mostrar página de clientes
router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenantId || req.session?.user?.tenant_id;
        if (!tenantId) return res.status(403).render('error', { error: { message: 'tenant no resuelto' } });

        const [clientes] = await db.query('SELECT * FROM clientes WHERE tenant_id = ? ORDER BY nombre', [tenantId]);
        res.render('clientes', { clientes: clientes || [] });
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).render('error', {
            error: {
                message: 'Error al obtener clientes',
                stack: process.env.NODE_ENV !== 'production' ? error.stack : null
            }
        });
    }
});

// GET /clientes/buscar - Buscar clientes
router.get('/buscar', async (req, res) => {
    try {
        const tenantId = req.tenantId || req.session?.user?.tenant_id;
        if (!tenantId) return res.status(403).json({ error: 'tenant no resuelto' });

        const query = req.query.q || '';
        const sql = `
            SELECT * FROM clientes
            WHERE tenant_id = ? AND (nombre LIKE ? OR telefono LIKE ?)
            ORDER BY nombre
            LIMIT 10
        `;
        const searchTerm = `%${query}%`;
        const [clientes] = await db.query(sql, [tenantId, searchTerm, searchTerm]);
        res.json(clientes);
    } catch (error) {
        console.error('Error al buscar clientes:', error);
        res.status(500).json({ error: 'Error al buscar clientes' });
    }
});

// GET /clientes/:id - Obtener un cliente específico
router.get('/:id', async (req, res) => {
    try {
        const tenantId = req.tenantId || req.session?.user?.tenant_id;
        if (!tenantId) return res.status(403).json({ error: 'tenant no resuelto' });

        const [clientes] = await db.query('SELECT * FROM clientes WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        const cliente = clientes[0];
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        res.json(cliente);
    } catch (error) {
        console.error('Error al obtener cliente:', error);
        res.status(500).json({ error: 'Error al obtener cliente' });
    }
});

// POST /clientes - Crear nuevo cliente
router.post('/', async (req, res) => {
    try {
        const tenantId = req.tenantId || req.session?.user?.tenant_id;
        if (!tenantId) return res.status(403).json({ error: 'tenant no resuelto' });

        console.log('Datos recibidos:', req.body);
        const { nombre, direccion, telefono, tipo_documento, numero_documento, email } = req.body;

        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        const [result] = await db.query(
            'INSERT INTO clientes (tenant_id, nombre, direccion, telefono, tipo_documento, numero_documento, email) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
            [tenantId, nombre, direccion || null, telefono || null, tipo_documento || 'DNI', numero_documento || null, email || null]
        );

        console.log('Cliente creado:', result);

        res.status(201).json({
            id: result.insertId,
            message: 'Cliente creado exitosamente'
        });
    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
});

// PUT /clientes/:id - Actualizar cliente
router.put('/:id', async (req, res) => {
    try {
        const tenantId = req.tenantId || req.session?.user?.tenant_id;
        if (!tenantId) return res.status(403).json({ error: 'tenant no resuelto' });

        const { nombre, direccion, telefono, tipo_documento, numero_documento, email } = req.body;

        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        const [result] = await db.query(
            'UPDATE clientes SET nombre = ?, direccion = ?, telefono = ?, tipo_documento = ?, numero_documento = ?, email = ? WHERE id = ? AND tenant_id = ?',
            [nombre, direccion || null, telefono || null, tipo_documento || 'DNI', numero_documento || null, email || null, req.params.id, tenantId]
        );

        if ((result?.affectedRows || 0) === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({ message: 'Cliente actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
});

// DELETE /clientes/:id - Eliminar cliente
router.delete('/:id', async (req, res) => {
    try {
        const tenantId = req.tenantId || req.session?.user?.tenant_id;
        if (!tenantId) return res.status(403).json({ error: 'tenant no resuelto' });

        const [result] = await db.query('DELETE FROM clientes WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);

        if ((result?.affectedRows || 0) === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({ message: 'Cliente eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ error: 'No se puede eliminar el cliente porque tiene facturas asociadas' });
        }
        res.status(500).json({ error: 'Error al eliminar cliente' });
    }
});

module.exports = router;
