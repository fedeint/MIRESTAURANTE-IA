'use strict';
const db = require('../db');

async function up() {
  // 1. Delivery config per platform per tenant
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_config (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      plataforma VARCHAR(20) NOT NULL CHECK (plataforma IN ('rappi', 'pedidosya', 'llamafood')),
      activo BOOLEAN DEFAULT false,
      client_id VARCHAR(255),
      client_secret TEXT,
      access_token TEXT,
      token_expira_at TIMESTAMPTZ,
      store_id VARCHAR(100),
      chain_id VARCHAR(100),
      webhook_secret TEXT,
      comision_pct DECIMAL(5,2),
      config_extra JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, plataforma)
    )
  `);

  // 2. Delivery orders
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_pedidos (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      plataforma VARCHAR(20) NOT NULL,
      pedido_externo_id VARCHAR(100),
      pedido_interno_id INT,
      factura_id INT,
      estado_externo VARCHAR(30),
      estado_interno VARCHAR(30) DEFAULT 'recibido' CHECK (estado_interno IN ('recibido','aceptado','preparando','listo','despachado','entregado','cancelado')),
      cliente_nombre VARCHAR(150),
      cliente_telefono VARCHAR(20),
      cliente_direccion TEXT,
      cliente_notas TEXT,
      items JSONB NOT NULL DEFAULT '[]',
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      descuento DECIMAL(10,2) DEFAULT 0,
      comision_plataforma DECIMAL(10,2),
      costo_envio DECIMAL(10,2) DEFAULT 0,
      propina DECIMAL(10,2) DEFAULT 0,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      metodo_pago VARCHAR(30),
      tiempo_aceptacion_seg INT,
      tiempo_preparacion_min INT,
      repartidor_nombre VARCHAR(100),
      repartidor_telefono VARCHAR(20),
      tracking_url TEXT,
      payload_original JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, plataforma, pedido_externo_id)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_tenant ON delivery_pedidos(tenant_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_estado ON delivery_pedidos(tenant_id, estado_interno)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_delivery_pedidos_plataforma ON delivery_pedidos(tenant_id, plataforma)`);

  // 3. Webhook log
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_webhook_log (
      id SERIAL PRIMARY KEY,
      tenant_id INT,
      plataforma VARCHAR(20) NOT NULL,
      evento VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      signature_valida BOOLEAN,
      procesado BOOLEAN DEFAULT false,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_webhook_log_fecha ON delivery_webhook_log(created_at DESC)`);

  // 4. Menu sync
  await db.query(`
    CREATE TABLE IF NOT EXISTS delivery_menu_sync (
      id SERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      plataforma VARCHAR(20) NOT NULL,
      producto_id INT NOT NULL,
      producto_externo_id VARCHAR(100),
      precio_plataforma DECIMAL(10,2),
      disponible BOOLEAN DEFAULT true,
      ultimo_sync_at TIMESTAMPTZ,
      estado_sync VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_sync IN ('pendiente','sincronizado','error','aprobacion')),
      error_sync TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, plataforma, producto_id)
    )
  `);

  console.log('Migration 018_delivery: OK');
}

module.exports = { up };
