const express = require('express');
const router = express.Router();
const db = require('../db');
const { registrarAudit } = require('../services/audit');

// Auto-ensure mesero columns exist
(async () => {
  try {
    await db.query(`ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_asignado_id INTEGER REFERENCES usuarios(id)`);
    await db.query(`ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_asignado_nombre VARCHAR(100)`);
  } catch(e) { /* columns may already exist */ }
})();

// GET /caja - Vista principal
router.get('/', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        // Caja abierta actual
        const [[cajaAbierta]] = await db.query(
            "SELECT * FROM cajas WHERE tenant_id=? AND estado='abierta' ORDER BY fecha_apertura DESC LIMIT 1", [tid]
        );

        let movimientos = [];
        let totales = { ingresos: 0, egresos: 0, efectivo_actual: 0 };

        if (cajaAbierta) {
            const [movs] = await db.query(`
                SELECT cm.*, mp.nombre as metodo_nombre, u.usuario as usuario_nombre
                FROM caja_movimientos cm
                LEFT JOIN metodos_pago mp ON mp.id = cm.metodo_pago_id
                LEFT JOIN usuarios u ON u.id = cm.usuario_id
                WHERE cm.caja_id = ? AND cm.anulado = false
                ORDER BY cm.created_at DESC
            `, [cajaAbierta.id]);
            movimientos = movs;

            const [[tots]] = await db.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE 0 END), 0) as ingresos,
                    COALESCE(SUM(CASE WHEN tipo='egreso' THEN monto ELSE 0 END), 0) as egresos
                FROM caja_movimientos WHERE caja_id=? AND anulado=false
            `, [cajaAbierta.id]);
            totales.ingresos = Number(tots.ingresos);
            totales.egresos = Number(tots.egresos);
            totales.efectivo_actual = Number(cajaAbierta.monto_apertura) + totales.ingresos - totales.egresos;
        }

        const [turnos] = await db.query('SELECT * FROM turnos WHERE tenant_id=? AND activo=true', [tid]);
        const [metodos] = await db.query('SELECT * FROM metodos_pago WHERE tenant_id=? AND activo=true', [tid]);

        const [meseros] = await db.query(`SELECT id, nombre, usuario FROM usuarios WHERE rol = 'mesero' AND activo = true AND tenant_id = ? ORDER BY nombre`, [tid]);

        const [mesasAll] = await db.query(`SELECT id, numero, descripcion, mesero_asignado_id, mesero_asignado_nombre FROM mesas WHERE tenant_id = ? ORDER BY numero`, [tid]);

        const [productosPorMesero] = await db.query(`
          SELECT m.mesero_asignado_id as mesero_id, COALESCE(SUM(pi.cantidad), 0) as productos
          FROM pedidos p
          JOIN mesas m ON m.id = p.mesa_id
          JOIN pedido_items pi ON pi.pedido_id = p.id
          WHERE m.mesero_asignado_id IS NOT NULL
            AND m.tenant_id = ?
            AND (p.created_at AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
            AND pi.estado NOT IN ('cancelado', 'rechazado')
          GROUP BY m.mesero_asignado_id
        `, [tid]);

        res.render('caja', { cajaAbierta, movimientos, totales, turnos, metodos, meseros, mesasAll, productosPorMesero });
    } catch (e) {
        console.error('Caja error:', e.message);
        res.render('caja', { cajaAbierta: null, movimientos: [], totales: { ingresos: 0, egresos: 0, efectivo_actual: 0 }, turnos: [], metodos: [], meseros: [], mesasAll: [], productosPorMesero: [] });
    }
});

// POST /api/caja/abrir
router.post('/abrir', async (req, res) => {
    const tid = req.tenantId || 1;
    const uid = req.session?.user?.id || 0;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Lock to prevent race condition — any concurrent open attempt will wait here
        const [[abierta]] = await connection.query(
            "SELECT id FROM cajas WHERE tenant_id=? AND estado='abierta' LIMIT 1 FOR UPDATE",
            [tid]
        );
        if (abierta) {
            await connection.rollback();
            return res.status(400).json({ error: 'Ya hay una caja abierta. Cierra la actual primero.' });
        }

        const { monto_apertura, turno_id, nombre_caja } = req.body;
        const [result] = await connection.query(
            `INSERT INTO cajas (tenant_id, turno_id, usuario_id, nombre_caja, fecha_apertura, monto_apertura, estado)
             VALUES (?,?,?,?,NOW(),?,'abierta') RETURNING id`,
            [tid, turno_id || null, uid, nombre_caja || 'Caja 1', monto_apertura || 0]
        );

        // Movimiento de fondo inicial
        await connection.query(
            `INSERT INTO caja_movimientos (tenant_id, caja_id, tipo, concepto, monto, usuario_id)
             VALUES (?,?,'ingreso','fondo_inicial',?,?)`,
            [tid, result.insertId, monto_apertura || 0, uid]
        );

        await connection.commit();

        // Asignar mesas a meseros (outside transaction — non-critical)
        const asignaciones = req.body.asignaciones;
        if (asignaciones && Array.isArray(asignaciones) && asignaciones.length > 0) {
          await db.query(`UPDATE mesas SET mesero_asignado_id = NULL, mesero_asignado_nombre = NULL WHERE tenant_id = ?`, [tid]);
          for (const a of asignaciones) {
            if (!a.mesa_id || !a.mesero_id) continue;
            const [[mesero]] = await db.query(`SELECT id, nombre FROM usuarios WHERE id = ? AND activo = true`, [a.mesero_id]);
            if (mesero) {
              await db.query(`UPDATE mesas SET mesero_asignado_id = ?, mesero_asignado_nombre = ? WHERE id = ? AND tenant_id = ?`,
                [mesero.id, mesero.nombre, a.mesa_id, tid]);
            }
          }
        }

        registrarAudit({ tenantId: tid, usuarioId: uid, accion: 'INSERT', modulo: 'caja', tabla: 'cajas', registroId: result.insertId, ip: req.ip });
        res.status(201).json({ caja_id: result.insertId, message: 'Caja abierta' });
    } catch (e) {
        await connection.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        connection.release();
    }
});

// POST /api/caja/cerrar
router.post('/cerrar', async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;

        const [[caja]] = await db.query("SELECT * FROM cajas WHERE tenant_id=? AND estado='abierta' ORDER BY fecha_apertura DESC LIMIT 1", [tid]);
        if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });

        // Verificar que no haya mesas ocupadas
        const [mesasOcupadas] = await db.query("SELECT id, numero, descripcion FROM mesas WHERE tenant_id=? AND estado = 'ocupada'", [tid]);
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
            FROM caja_movimientos WHERE caja_id=? AND anulado=false
        `, [caja.id]);

        const montoSistema = Number(caja.monto_apertura) + Number(tots.ingresos) - Number(tots.egresos);
        const montoReal = Number(monto_cierre_real) || 0;
        const diferencia = montoReal - montoSistema;

        await db.query(
            `UPDATE cajas SET estado='cerrada', fecha_cierre=NOW(), monto_cierre_sistema=?, monto_cierre_real=?, diferencia=?, denominacion_cierre=?, notas=?
             WHERE id=?`,
            [montoSistema, montoReal, diferencia, denominacion_cierre ? JSON.stringify(denominacion_cierre) : null, notas || null, caja.id]
        );

        // Limpiar asignaciones de meseros al cerrar caja
        await db.query(`UPDATE mesas SET mesero_asignado_id = NULL, mesero_asignado_nombre = NULL WHERE tenant_id = ?`, [tid]);

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

        const [[caja]] = await db.query("SELECT id FROM cajas WHERE tenant_id=? AND estado='abierta' LIMIT 1", [tid]);
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

// GET /api/caja/ranking-meseros
router.get('/ranking-meseros', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const periodo = req.query.periodo || 'hoy';

    let dateFilter = '';
    if (periodo === 'hoy') {
      dateFilter = `AND (p.created_at AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date`;
    } else if (periodo === 'semana') {
      dateFilter = `AND p.created_at >= (NOW() AT TIME ZONE 'America/Lima')::date - INTERVAL '7 days'`;
    } else if (periodo === 'mes') {
      dateFilter = `AND p.created_at >= (NOW() AT TIME ZONE 'America/Lima')::date - INTERVAL '30 days'`;
    }

    const [ranking] = await db.query(`
      SELECT
        m.mesero_asignado_id as mesero_id,
        COALESCE(m.mesero_asignado_nombre, u.nombre) as nombre,
        COUNT(DISTINCT p.mesa_id) as mesas_atendidas,
        COALESCE(SUM(pi.cantidad), 0) as productos_servidos
      FROM pedidos p
      JOIN mesas m ON m.id = p.mesa_id
      JOIN pedido_items pi ON pi.pedido_id = p.id
      LEFT JOIN usuarios u ON u.id = m.mesero_asignado_id
      WHERE m.mesero_asignado_id IS NOT NULL
        AND m.tenant_id = ?
        AND pi.estado NOT IN ('cancelado', 'rechazado')
        ${dateFilter}
      GROUP BY m.mesero_asignado_id, nombre
      ORDER BY productos_servidos DESC
    `, [tid]);

    const rankingConPromedio = ranking.map(r => ({
      ...r,
      productos_servidos: Number(r.productos_servidos),
      promedio_por_mesa: r.mesas_atendidas > 0
        ? Math.round((Number(r.productos_servidos) / r.mesas_atendidas) * 10) / 10
        : 0
    }));

    res.json({ ranking: rankingConPromedio, periodo });
  } catch (err) {
    console.error('Error ranking meseros:', err);
    res.status(500).json({ error: 'Error al obtener ranking' });
  }
});

// Reasignar mesas a meseros (caja abierta)
router.post('/reasignar-mesas', async (req, res) => {
  try {
    const tid = req.tenantId || 1;
    const [[caja]] = await db.query(`SELECT id FROM cajas WHERE estado = 'abierta' AND tenant_id = ? LIMIT 1`, [tid]);
    if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });

    const asignaciones = req.body.asignaciones;
    if (!asignaciones || !Array.isArray(asignaciones)) {
      return res.status(400).json({ error: 'Formato invalido' });
    }

    await db.query(`UPDATE mesas SET mesero_asignado_id = NULL, mesero_asignado_nombre = NULL WHERE tenant_id = ?`, [tid]);

    for (const a of asignaciones) {
      if (!a.mesa_id || !a.mesero_id) continue;
      const [[mesero]] = await db.query(`SELECT id, nombre FROM usuarios WHERE id = ? AND activo = true`, [a.mesero_id]);
      if (mesero) {
        await db.query(`UPDATE mesas SET mesero_asignado_id = ?, mesero_asignado_nombre = ? WHERE id = ? AND tenant_id = ?`,
          [mesero.id, mesero.nombre, a.mesa_id, tid]);
      }
    }

    res.json({ message: 'Asignaciones actualizadas' });
  } catch (err) {
    console.error('Error reasignar mesas:', err);
    res.status(500).json({ error: 'Error al reasignar mesas' });
  }
});

module.exports = router;
