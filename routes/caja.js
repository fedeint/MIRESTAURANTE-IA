const express = require('express');
const router = express.Router();
const db = require('../db');
const { registrarAudit } = require('../services/audit');

// GET /caja - Vista principal
router.get('/', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        // Caja abierta actual
        const [[cajaAbierta]] = await db.query(
            'SELECT * FROM cajas WHERE tenant_id=? AND estado="abierta" ORDER BY fecha_apertura DESC LIMIT 1', [tid]
        );

        let movimientos = [];
        let totales = { ingresos: 0, egresos: 0, efectivo_actual: 0 };

        if (cajaAbierta) {
            const [movs] = await db.query(`
                SELECT cm.*, mp.nombre as metodo_nombre, u.usuario as usuario_nombre
                FROM caja_movimientos cm
                LEFT JOIN metodos_pago mp ON mp.id = cm.metodo_pago_id
                LEFT JOIN usuarios u ON u.id = cm.usuario_id
                WHERE cm.caja_id = ? AND cm.anulado = 0
                ORDER BY cm.created_at DESC
            `, [cajaAbierta.id]);
            movimientos = movs;

            const [[tots]] = await db.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE 0 END), 0) as ingresos,
                    COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE 0 END), 0) as egresos
                FROM caja_movimientos WHERE caja_id=? AND anulado=0
            `, [cajaAbierta.id]);
            totales.ingresos = Number(tots.ingresos);
            totales.egresos = Number(tots.egresos);
            totales.efectivo_actual = Number(cajaAbierta.monto_apertura) + totales.ingresos - totales.egresos;
        }

        const [turnos] = await db.query('SELECT * FROM turnos WHERE tenant_id=? AND activo=1', [tid]);
        const [metodos] = await db.query('SELECT * FROM metodos_pago WHERE tenant_id=? AND activo=1', [tid]);

        res.render('caja', { cajaAbierta, movimientos, totales, turnos, metodos });
    } catch (e) {
        console.error('Caja error:', e.message);
        res.render('caja', { cajaAbierta: null, movimientos: [], totales: { ingresos: 0, egresos: 0, efectivo_actual: 0 }, turnos: [], metodos: [] });
    }
});

// POST /api/caja/abrir
router.post('/abrir', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;

        // Verificar que no hay caja abierta
        const [[abierta]] = await db.query('SELECT id FROM cajas WHERE tenant_id=? AND estado="abierta" LIMIT 1', [tid]);
        if (abierta) return res.status(400).json({ error: 'Ya hay una caja abierta. Cierra la actual primero.' });

        const { monto_apertura, turno_id, nombre_caja } = req.body;
        const [result] = await db.query(
            `INSERT INTO cajas (tenant_id, turno_id, usuario_id, nombre_caja, fecha_apertura, monto_apertura, estado)
             VALUES (?,?,?,?,NOW(),?,'abierta')`,
            [tid, turno_id || null, uid, nombre_caja || 'Caja 1', monto_apertura || 0]
        );

        // Movimiento de fondo inicial
        await db.query(
            `INSERT INTO caja_movimientos (tenant_id, caja_id, tipo, concepto, monto, usuario_id)
             VALUES (?,?,'ingreso','fondo_inicial',?,?)`,
            [tid, result.insertId, monto_apertura || 0, uid]
        );

        registrarAudit({ tenantId: tid, usuarioId: uid, accion: 'INSERT', modulo: 'caja', tabla: 'cajas', registroId: result.insertId, ip: req.ip });
        res.status(201).json({ caja_id: result.insertId, message: 'Caja abierta' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/caja/cerrar
router.post('/cerrar', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;

        const [[caja]] = await db.query('SELECT * FROM cajas WHERE tenant_id=? AND estado="abierta" ORDER BY fecha_apertura DESC LIMIT 1', [tid]);
        if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });

        // Verificar que no haya mesas ocupadas
        const [mesasOcupadas] = await db.query("SELECT id, numero, descripcion FROM mesas WHERE estado = 'ocupada'");
        if (mesasOcupadas && mesasOcupadas.length > 0) {
            return res.status(400).json({
                error: 'No se puede cerrar caja con mesas ocupadas',
                mesas_ocupadas: mesasOcupadas.map(m => ({ id: m.id, numero: m.numero, descripcion: m.descripcion || '' }))
            });
        }

        const { monto_cierre_real, denominacion_cierre, notas } = req.body;

        // Calcular total sistema
        const [[tots]] = await db.query(`
            SELECT
                COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE 0 END), 0) as ingresos,
                COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE 0 END), 0) as egresos
            FROM caja_movimientos WHERE caja_id=? AND anulado=0
        `, [caja.id]);

        const montoSistema = Number(caja.monto_apertura) + Number(tots.ingresos) - Number(tots.egresos);
        const montoReal = Number(monto_cierre_real) || 0;
        const diferencia = montoReal - montoSistema;

        await db.query(
            `UPDATE cajas SET estado='cerrada', fecha_cierre=NOW(), monto_cierre_sistema=?, monto_cierre_real=?, diferencia=?, denominacion_cierre=?, notas=?
             WHERE id=?`,
            [montoSistema, montoReal, diferencia, denominacion_cierre ? JSON.stringify(denominacion_cierre) : null, notas || null, caja.id]
        );

        registrarAudit({ tenantId: tid, usuarioId: uid, accion: 'UPDATE', modulo: 'caja', tabla: 'cajas', registroId: caja.id, datosNuevos: { monto_sistema: montoSistema, monto_real: montoReal, diferencia }, ip: req.ip });
        res.json({ message: 'Caja cerrada', monto_sistema: montoSistema, monto_real: montoReal, diferencia });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/caja/movimiento - Registrar movimiento manual
router.post('/movimiento', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;

        const [[caja]] = await db.query('SELECT id FROM cajas WHERE tenant_id=? AND estado="abierta" LIMIT 1', [tid]);
        if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });

        const { tipo, concepto, monto, metodo_pago_id, notas } = req.body;
        if (!tipo || !concepto || !monto) return res.status(400).json({ error: 'Tipo, concepto y monto requeridos' });

        await db.query(
            `INSERT INTO caja_movimientos (tenant_id, caja_id, tipo, concepto, monto, metodo_pago_id, usuario_id)
             VALUES (?,?,?,?,?,?,?)`,
            [tid, caja.id, tipo, concepto, monto, metodo_pago_id || null, uid]
        );

        res.status(201).json({ message: 'Movimiento registrado' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
