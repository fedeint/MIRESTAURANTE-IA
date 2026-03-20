-- Performance indexes for restaurant management system
-- Run manually against the database for existing deployments.
-- On new deployments these are created automatically by ensureSchema() in db.js.
-- Uses IF NOT EXISTS so it is safe to run multiple times.
-- CONCURRENTLY cannot be used inside a transaction block; omit it here so the
-- file can be executed as a plain script (e.g. psql -f add_performance_indexes.sql).

-- Core query performance indexes
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_id ON pedidos(mesa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_estado ON pedidos(mesa_id, estado);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido_id ON pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_items_estado ON pedido_items(estado);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente_id ON facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol_activo ON usuarios(rol, activo);
CREATE INDEX IF NOT EXISTS idx_mesas_estado ON mesas(estado);
CREATE INDEX IF NOT EXISTS idx_mesas_tenant ON mesas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_detalle_factura_factura ON detalle_factura(factura_id);
CREATE INDEX IF NOT EXISTS idx_detalle_factura_producto ON detalle_factura(producto_id);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);
CREATE INDEX IF NOT EXISTS idx_mesas_mesero_asignado ON mesas(mesero_asignado_id);
