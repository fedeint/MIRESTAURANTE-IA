/**
 * setup-supabase.js
 * Creates the full restaurant management schema on Supabase PostgreSQL.
 * Run with: node scripts/setup-supabase.js
 */

'use strict';

const { Client } = require('pg');

const client = new Client({
  host: 'db.vfltsjcktxgmqbrzwthn.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'SUPAAAAAAHHHHCOCACOLA',
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function run(label, sql) {
  try {
    await client.query(sql);
    console.log(`  OK  ${label}`);
  } catch (err) {
    // "already exists" errors are harmless – log and continue
    if (
      err.code === '42710' || // duplicate_object (type/enum already exists)
      err.code === '42P07' || // duplicate_table
      err.code === '42P16' || // invalid_table_definition (constraint already)
      err.message.includes('already exists')
    ) {
      console.log(`  --  ${label} (already exists, skipped)`);
    } else {
      console.error(`  ERR ${label}:`);
      console.error(`      ${err.message}`);
      throw err;
    }
  }
}

async function runIndex(label, sql) {
  try {
    await client.query(sql);
    console.log(`  OK  ${label}`);
  } catch (err) {
    if (err.code === '42P07' || err.message.includes('already exists')) {
      console.log(`  --  ${label} (already exists, skipped)`);
    } else {
      console.error(`  WARN ${label}: ${err.message}`);
      // Non-fatal for indexes
    }
  }
}

// ---------------------------------------------------------------------------
// ENUM TYPES
// ---------------------------------------------------------------------------

async function createEnumTypes() {
  console.log('\n--- ENUM TYPES ---');

  await run('enum forma_pago_enum', `
    CREATE TYPE forma_pago_enum AS ENUM ('efectivo','transferencia','tarjeta','mixto')
  `);
  await run('enum metodo_pago_enum', `
    CREATE TYPE metodo_pago_enum AS ENUM ('efectivo','transferencia','tarjeta')
  `);
  await run('enum unidad_medida_enum', `
    CREATE TYPE unidad_medida_enum AS ENUM ('KG','UND','LB')
  `);
  await run('enum rol_usuario_enum', `
    CREATE TYPE rol_usuario_enum AS ENUM ('administrador','mesero','cocinero')
  `);
  await run('enum estado_mesa_enum', `
    CREATE TYPE estado_mesa_enum AS ENUM ('libre','ocupada','reservada','bloqueada')
  `);
  await run('enum estado_pedido_enum', `
    CREATE TYPE estado_pedido_enum AS ENUM ('abierto','en_cocina','preparando','listo','servido','cerrado','cancelado','rechazado')
  `);
  await run('enum estado_item_enum', `
    CREATE TYPE estado_item_enum AS ENUM ('pendiente','enviado','preparando','listo','servido','cancelado','rechazado')
  `);
  await run('enum audit_accion_enum', `
    CREATE TYPE audit_accion_enum AS ENUM ('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','ERROR')
  `);
  await run('enum unidad_medida_alm_enum', `
    CREATE TYPE unidad_medida_alm_enum AS ENUM ('kg','g','lt','ml','und','docena','saco','caja')
  `);
  await run('enum proveedor_tipo_enum', `
    CREATE TYPE proveedor_tipo_enum AS ENUM ('mayorista','minorista','productor','distribuidor')
  `);
  await run('enum lote_estado_enum', `
    CREATE TYPE lote_estado_enum AS ENUM ('disponible','agotado','vencido','descartado')
  `);
  await run('enum oc_estado_enum', `
    CREATE TYPE oc_estado_enum AS ENUM ('borrador','enviada','parcial','recibida','cancelada')
  `);
  await run('enum oc_comprobante_enum', `
    CREATE TYPE oc_comprobante_enum AS ENUM ('boleta','factura','sin_comprobante')
  `);
  await run('enum oc_estado_pago_enum', `
    CREATE TYPE oc_estado_pago_enum AS ENUM ('pendiente','pagado','parcial','vencido')
  `);
  await run('enum oci_estado_enum', `
    CREATE TYPE oci_estado_enum AS ENUM ('pendiente','recibido','parcial','rechazado')
  `);
  await run('enum insp_visual_enum', `
    CREATE TYPE insp_visual_enum AS ENUM ('excelente','bueno','aceptable','rechazado')
  `);
  await run('enum mov_tipo_enum', `
    CREATE TYPE mov_tipo_enum AS ENUM ('entrada','salida','ajuste','merma','devolucion','transferencia')
  `);
  await run('enum mov_motivo_enum', `
    CREATE TYPE mov_motivo_enum AS ENUM (
      'compra_proveedor','venta_platillo','merma_vencimiento',
      'merma_dano','merma_preparacion','consumo_interno',
      'ajuste_inventario','devolucion_proveedor','regalo',
      'robo_perdida','transferencia_sucursal'
    )
  `);
  await run('enum unidad_receta_enum', `
    CREATE TYPE unidad_receta_enum AS ENUM ('kg','g','lt','ml','und')
  `);
  await run('enum metodo_tipo_enum', `
    CREATE TYPE metodo_tipo_enum AS ENUM ('efectivo','tarjeta','transferencia','digital','credito')
  `);
  await run('enum caja_estado_enum', `
    CREATE TYPE caja_estado_enum AS ENUM ('abierta','cerrada')
  `);
  await run('enum cajamov_tipo_enum', `
    CREATE TYPE cajamov_tipo_enum AS ENUM ('ingreso','egreso')
  `);
  await run('enum cajamov_concepto_enum', `
    CREATE TYPE cajamov_concepto_enum AS ENUM (
      'venta_factura','propina',
      'retiro_caja_fuerte','retiro_banco','retiro_propietario',
      'gasto_compra_almacen','gasto_servicio','gasto_otro',
      'pago_planilla','devolucion_cliente',
      'fondo_inicial','ajuste'
    )
  `);
  await run('enum cpe_tipo_enum', `
    CREATE TYPE cpe_tipo_enum AS ENUM ('boleta','factura','nota_credito','nota_debito')
  `);
  await run('enum cpe_estado_enum', `
    CREATE TYPE cpe_estado_enum AS ENUM ('pendiente','aceptado','rechazado','anulado')
  `);
  await run('enum nc_motivo_enum', `
    CREATE TYPE nc_motivo_enum AS ENUM ('devolucion','error_facturacion','descuento_posterior','anulacion')
  `);
  await run('enum nc_estado_enum', `
    CREATE TYPE nc_estado_enum AS ENUM ('emitida','anulada')
  `);
  await run('enum ose_proveedor_enum', `
    CREATE TYPE ose_proveedor_enum AS ENUM ('nubefact','sunat_directo','efact','bizlinks')
  `);
  await run('enum contrato_enum', `
    CREATE TYPE contrato_enum AS ENUM ('planilla','recibo_honorarios','informal')
  `);
  await run('enum tipo_pago_per_enum', `
    CREATE TYPE tipo_pago_per_enum AS ENUM ('diario','semanal','quincenal','mensual')
  `);
  await run('enum pension_enum', `
    CREATE TYPE pension_enum AS ENUM ('onp','afp_integra','afp_prima','afp_profuturo','afp_habitat','ninguno')
  `);
  await run('enum gasto_tipo_enum', `
    CREATE TYPE gasto_tipo_enum AS ENUM ('fijo','variable')
  `);
  await run('enum gasto_grupo_enum', `
    CREATE TYPE gasto_grupo_enum AS ENUM ('compras','servicios','marketing','sueldos','inmovilizado','legal','otros')
  `);
  await run('enum gasto_frec_enum', `
    CREATE TYPE gasto_frec_enum AS ENUM ('diario','semanal','mensual','anual')
  `);
  await run('enum canal_tipo_enum', `
    CREATE TYPE canal_tipo_enum AS ENUM ('texto','alerta','sistema')
  `);
  await run('enum canal_prioridad_enum', `
    CREATE TYPE canal_prioridad_enum AS ENUM ('normal','alta','urgente')
  `);
  await run('enum reserva_estado_enum', `
    CREATE TYPE reserva_estado_enum AS ENUM ('pendiente','confirmada','sentada','completada','no_show','cancelada')
  `);
  await run('enum reserva_canal_enum', `
    CREATE TYPE reserva_canal_enum AS ENUM ('telefono','whatsapp','web','presencial','app')
  `);
  await run('enum delivery_tipo_enum', `
    CREATE TYPE delivery_tipo_enum AS ENUM ('delivery','para_llevar')
  `);
  await run('enum delivery_plataforma_enum', `
    CREATE TYPE delivery_plataforma_enum AS ENUM ('propio','rappi','pedidosya','ubereats','otro')
  `);
  await run('enum delivery_estado_enum', `
    CREATE TYPE delivery_estado_enum AS ENUM ('preparando','en_camino','entregado','cancelado')
  `);
  await run('enum promo_tipo_enum', `
    CREATE TYPE promo_tipo_enum AS ENUM ('porcentaje','monto_fijo','2x1','happy_hour','combo')
  `);
  await run('enum fidelidad_nivel_enum', `
    CREATE TYPE fidelidad_nivel_enum AS ENUM ('bronce','plata','oro','platino')
  `);
  await run('enum fidelidad_mov_enum', `
    CREATE TYPE fidelidad_mov_enum AS ENUM ('acumulacion','canje','vencimiento','ajuste')
  `);
  await run('enum modif_tipo_enum', `
    CREATE TYPE modif_tipo_enum AS ENUM ('unico','multiple')
  `);
  await run('enum plan_enum', `
    CREATE TYPE plan_enum AS ENUM ('free','pro','enterprise')
  `);
  await run('enum suscripcion_estado_enum', `
    CREATE TYPE suscripcion_estado_enum AS ENUM ('activa','vencida','cancelada','prueba')
  `);
}

// ---------------------------------------------------------------------------
// CORE TABLES (database.sql)
// ---------------------------------------------------------------------------

async function createCoreTables() {
  console.log('\n--- CORE TABLES ---');

  // 1. productos
  await run('table: productos', `
    CREATE TABLE IF NOT EXISTS productos (
      id              SERIAL PRIMARY KEY,
      codigo          VARCHAR(50)     NOT NULL UNIQUE,
      nombre          VARCHAR(100)    NOT NULL,
      precio_kg       DECIMAL(10,2)   NOT NULL DEFAULT 0,
      precio_unidad   DECIMAL(10,2)   NOT NULL DEFAULT 0,
      precio_libra    DECIMAL(10,2)   NOT NULL DEFAULT 0,
      imagen          TEXT            NULL,
      categoria       VARCHAR(100)    NULL,
      tenant_id       INTEGER         NOT NULL DEFAULT 1,
      created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. producto_hijos
  await run('table: producto_hijos', `
    CREATE TABLE IF NOT EXISTS producto_hijos (
      producto_padre_id  INTEGER  NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      producto_hijo_id   INTEGER  NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      tenant_id          INTEGER  NOT NULL DEFAULT 1,
      created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (producto_padre_id, producto_hijo_id)
    )
  `);

  // 3. producto_hijos_items
  await run('table: producto_hijos_items', `
    CREATE TABLE IF NOT EXISTS producto_hijos_items (
      id                 SERIAL PRIMARY KEY,
      producto_padre_id  INTEGER      NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      nombre             VARCHAR(120) NOT NULL,
      orden              INTEGER      NOT NULL DEFAULT 0,
      tenant_id          INTEGER      NOT NULL DEFAULT 1,
      created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (producto_padre_id, nombre)
    )
  `);

  // 4. clientes
  await run('table: clientes', `
    CREATE TABLE IF NOT EXISTS clientes (
      id               SERIAL PRIMARY KEY,
      nombre           VARCHAR(100) NOT NULL,
      direccion        TEXT,
      telefono         VARCHAR(20),
      tipo_documento   VARCHAR(20)  NULL,
      numero_documento VARCHAR(20)  NULL,
      email            VARCHAR(150) NULL,
      razon_social     VARCHAR(200) NULL,
      tenant_id        INTEGER      NOT NULL DEFAULT 1,
      created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 5. facturas
  await run('table: facturas', `
    CREATE TABLE IF NOT EXISTS facturas (
      id                SERIAL PRIMARY KEY,
      cliente_id        INTEGER,
      fecha             TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
      total             DECIMAL(10,2)   NOT NULL,
      forma_pago        forma_pago_enum NOT NULL DEFAULT 'efectivo',
      propina           DECIMAL(10,2)   DEFAULT 0,
      subtotal_sin_igv  DECIMAL(12,2)   NULL,
      igv               DECIMAL(12,2)   NULL,
      total_con_igv     DECIMAL(12,2)   NULL,
      tipo_comprobante  VARCHAR(50)     NULL,
      serie             VARCHAR(50)     NULL,
      correlativo       INTEGER         NULL,
      sunat_estado      VARCHAR(50)     NULL,
      tenant_id         INTEGER         NOT NULL DEFAULT 1,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  // 6. factura_pagos
  await run('table: factura_pagos', `
    CREATE TABLE IF NOT EXISTS factura_pagos (
      id          SERIAL PRIMARY KEY,
      factura_id  INTEGER          NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      metodo      metodo_pago_enum NOT NULL,
      monto       DECIMAL(10,2)    NOT NULL,
      referencia  VARCHAR(100)     NULL,
      tenant_id   INTEGER          NOT NULL DEFAULT 1,
      created_at  TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 7. detalle_factura
  await run('table: detalle_factura', `
    CREATE TABLE IF NOT EXISTS detalle_factura (
      id               SERIAL PRIMARY KEY,
      factura_id       INTEGER              REFERENCES facturas(id),
      producto_id      INTEGER              REFERENCES productos(id),
      cantidad         DECIMAL(10,2)        NOT NULL,
      precio_unitario  DECIMAL(10,2)        NOT NULL,
      unidad_medida    unidad_medida_enum   DEFAULT 'KG',
      subtotal         DECIMAL(10,2)        NOT NULL,
      costo_receta     DECIMAL(10,4)        NULL,
      receta_version   INTEGER              NULL,
      tenant_id        INTEGER              NOT NULL DEFAULT 1,
      created_at       TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 8. configuracion_impresion
  await run('table: configuracion_impresion', `
    CREATE TABLE IF NOT EXISTS configuracion_impresion (
      id                        SERIAL PRIMARY KEY,
      nombre_negocio            VARCHAR(100) NOT NULL,
      direccion                 TEXT,
      telefono                  VARCHAR(20),
      nit                       VARCHAR(50),
      pie_pagina                TEXT,
      ancho_papel               INTEGER      DEFAULT 80,
      font_size                 INTEGER      DEFAULT 1,
      logo_data                 BYTEA,
      logo_tipo                 VARCHAR(50),
      qr_data                   BYTEA,
      qr_tipo                   VARCHAR(50),
      cocina_auto_listo_comanda BOOLEAN      NOT NULL DEFAULT FALSE,
      cocina_imprime_servidor   BOOLEAN      NOT NULL DEFAULT FALSE,
      impresora_comandas        VARCHAR(150) NULL,
      impresora_facturas        VARCHAR(150) NULL,
      factura_imprime_servidor  BOOLEAN      NOT NULL DEFAULT FALSE,
      factura_copias            INTEGER      NOT NULL DEFAULT 1,
      factura_auto_print        BOOLEAN      NOT NULL DEFAULT FALSE,
      tenant_id                 INTEGER      NOT NULL DEFAULT 1,
      created_at                TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at                TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 9. usuarios
  await run('table: usuarios', `
    CREATE TABLE IF NOT EXISTS usuarios (
      id             SERIAL PRIMARY KEY,
      usuario        VARCHAR(50)      NOT NULL UNIQUE,
      nombre         VARCHAR(100)     NULL,
      password_hash  VARCHAR(255)     NOT NULL,
      rol            rol_usuario_enum NOT NULL DEFAULT 'mesero',
      activo         SMALLINT         NOT NULL DEFAULT 1,
      permisos       TEXT             NULL,
      last_login     TIMESTAMP        NULL,
      tenant_id      INTEGER          NOT NULL DEFAULT 1,
      created_at     TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 10. mesas
  await run('table: mesas', `
    CREATE TABLE IF NOT EXISTS mesas (
      id          SERIAL PRIMARY KEY,
      numero      VARCHAR(20)       NOT NULL UNIQUE,
      descripcion VARCHAR(100),
      estado      estado_mesa_enum  DEFAULT 'libre',
      tenant_id   INTEGER           NOT NULL DEFAULT 1,
      created_at  TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP         DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 11. pedidos
  await run('table: pedidos', `
    CREATE TABLE IF NOT EXISTS pedidos (
      id            SERIAL PRIMARY KEY,
      mesa_id       INTEGER              NOT NULL REFERENCES mesas(id),
      cliente_id    INTEGER              REFERENCES clientes(id),
      mesero_nombre VARCHAR(100)         NULL,
      estado        estado_pedido_enum   DEFAULT 'abierto',
      total         DECIMAL(10,2)        NOT NULL DEFAULT 0,
      notas         TEXT,
      tenant_id     INTEGER              NOT NULL DEFAULT 1,
      created_at    TIMESTAMP            DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 12. pedido_items
  await run('table: pedido_items', `
    CREATE TABLE IF NOT EXISTS pedido_items (
      id                SERIAL PRIMARY KEY,
      pedido_id         INTEGER            NOT NULL REFERENCES pedidos(id),
      producto_id       INTEGER            NOT NULL REFERENCES productos(id),
      cantidad          DECIMAL(10,2)      NOT NULL,
      unidad_medida     unidad_medida_enum DEFAULT 'UND',
      precio_unitario   DECIMAL(10,2)      NOT NULL,
      subtotal          DECIMAL(10,2)      NOT NULL,
      estado            estado_item_enum   DEFAULT 'pendiente',
      nota              TEXT               NULL,
      enviado_at        TIMESTAMP          NULL,
      preparado_at      TIMESTAMP          NULL,
      listo_at          TIMESTAMP          NULL,
      servido_at        TIMESTAMP          NULL,
      comanda_impresa_at TIMESTAMP         NULL,
      tenant_id         INTEGER            NOT NULL DEFAULT 1,
      created_at        TIMESTAMP          DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP          DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------------------------------------------------------------------------
// MIGRATION 001 – audit_log
// ---------------------------------------------------------------------------

async function createAuditLog() {
  console.log('\n--- MIGRATION 001: audit_log ---');

  await run('table: audit_log', `
    CREATE TABLE IF NOT EXISTS audit_log (
      id               BIGSERIAL PRIMARY KEY,
      tenant_id        INTEGER          NOT NULL DEFAULT 1,
      usuario_id       INTEGER          NOT NULL,
      accion           audit_accion_enum NOT NULL,
      modulo           VARCHAR(50)      NOT NULL,
      tabla_afectada   VARCHAR(100)     NOT NULL,
      registro_id      INTEGER          NULL,
      datos_anteriores JSONB            NULL,
      datos_nuevos     JSONB            NULL,
      ip_address       VARCHAR(45)      NULL,
      user_agent       VARCHAR(300)     NULL,
      created_at       TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------------------------------------------------------------------------
// MIGRATION 002 – almacen completo
// ---------------------------------------------------------------------------

async function createAlmacen() {
  console.log('\n--- MIGRATION 002: almacen ---');

  await run('table: almacen_categorias', `
    CREATE TABLE IF NOT EXISTS almacen_categorias (
      id         SERIAL PRIMARY KEY,
      tenant_id  INTEGER      NOT NULL DEFAULT 1,
      nombre     VARCHAR(100) NOT NULL,
      icono      VARCHAR(50)  NULL,
      color      VARCHAR(20)  NULL,
      orden      INTEGER      DEFAULT 0,
      activo     BOOLEAN      DEFAULT TRUE,
      created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, nombre)
    )
  `);

  await run('table: proveedores', `
    CREATE TABLE IF NOT EXISTS proveedores (
      id               SERIAL PRIMARY KEY,
      tenant_id        INTEGER              NOT NULL DEFAULT 1,
      nombre           VARCHAR(200)         NOT NULL,
      ruc              VARCHAR(20)          NULL,
      telefono         VARCHAR(20)          NULL,
      email            VARCHAR(100)         NULL,
      direccion        VARCHAR(300)         NULL,
      contacto_nombre  VARCHAR(100)         NULL,
      tipo             proveedor_tipo_enum  DEFAULT 'mayorista',
      calificacion     INTEGER              NULL,
      dias_credito     INTEGER              DEFAULT 0,
      activo           BOOLEAN              DEFAULT TRUE,
      deleted_at       TIMESTAMP            NULL,
      created_at       TIMESTAMP            DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: almacen_ingredientes', `
    CREATE TABLE IF NOT EXISTS almacen_ingredientes (
      id                       SERIAL PRIMARY KEY,
      tenant_id                INTEGER                NOT NULL DEFAULT 1,
      categoria_id             INTEGER                NULL REFERENCES almacen_categorias(id),
      proveedor_id             INTEGER                NULL REFERENCES proveedores(id),
      codigo                   VARCHAR(50)            NULL,
      nombre                   VARCHAR(150)           NOT NULL,
      descripcion              VARCHAR(300)           NULL,
      unidad_medida            unidad_medida_alm_enum DEFAULT 'kg',
      unidad_compra            unidad_medida_alm_enum DEFAULT 'kg',
      factor_conversion        DECIMAL(10,4)          DEFAULT 1,
      stock_actual             DECIMAL(12,3)          DEFAULT 0,
      stock_minimo             DECIMAL(12,3)          DEFAULT 0,
      stock_maximo             DECIMAL(12,3)          NULL,
      costo_unitario           DECIMAL(10,4)          DEFAULT 0,
      costo_promedio           DECIMAL(10,4)          DEFAULT 0,
      ultimo_costo             DECIMAL(10,4)          NULL,
      merma_preparacion_pct    DECIMAL(5,2)           DEFAULT 0,
      ubicacion                VARCHAR(100)           NULL,
      perecible                BOOLEAN                DEFAULT TRUE,
      dias_vencimiento         INTEGER                NULL,
      temperatura_almacen      VARCHAR(50)            NULL,
      ingrediente_sustituto_id INTEGER                NULL,
      factor_sustitucion       DECIMAL(10,4)          NULL,
      alergenos                JSONB                  NULL,
      activo                   BOOLEAN                DEFAULT TRUE,
      deleted_at               TIMESTAMP              NULL,
      created_at               TIMESTAMP              DEFAULT CURRENT_TIMESTAMP,
      updated_at               TIMESTAMP              DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: almacen_lotes', `
    CREATE TABLE IF NOT EXISTS almacen_lotes (
      id                  SERIAL PRIMARY KEY,
      tenant_id           INTEGER          NOT NULL DEFAULT 1,
      ingrediente_id      INTEGER          NOT NULL REFERENCES almacen_ingredientes(id),
      numero_lote         VARCHAR(50)      NULL,
      fecha_ingreso       DATE             NOT NULL,
      fecha_vencimiento   DATE             NULL,
      cantidad_inicial    DECIMAL(12,3)    NOT NULL,
      cantidad_disponible DECIMAL(12,3)    NOT NULL,
      costo_unitario      DECIMAL(10,4)    NOT NULL,
      proveedor_id        INTEGER          NULL REFERENCES proveedores(id),
      orden_compra_id     INTEGER          NULL,
      estado              lote_estado_enum DEFAULT 'disponible',
      created_at          TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: ordenes_compra', `
    CREATE TABLE IF NOT EXISTS ordenes_compra (
      id                     SERIAL PRIMARY KEY,
      tenant_id              INTEGER              NOT NULL DEFAULT 1,
      proveedor_id           INTEGER              NOT NULL REFERENCES proveedores(id),
      numero_orden           VARCHAR(50)          NULL,
      fecha_orden            DATE                 NOT NULL,
      fecha_entrega_esperada DATE                 NULL,
      fecha_recibida         DATE                 NULL,
      estado                 oc_estado_enum       DEFAULT 'borrador',
      subtotal               DECIMAL(12,2)        DEFAULT 0,
      igv                    DECIMAL(12,2)        DEFAULT 0,
      total                  DECIMAL(12,2)        DEFAULT 0,
      comprobante_tipo       oc_comprobante_enum  DEFAULT 'sin_comprobante',
      comprobante_numero     VARCHAR(50)          NULL,
      estado_pago            oc_estado_pago_enum  DEFAULT 'pendiente',
      fecha_vencimiento_pago DATE                 NULL,
      monto_pagado           DECIMAL(12,2)        DEFAULT 0,
      notas                  TEXT                 NULL,
      usuario_id             INTEGER              NOT NULL,
      recibido_por           INTEGER              NULL,
      created_at             TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: orden_compra_items', `
    CREATE TABLE IF NOT EXISTS orden_compra_items (
      id                SERIAL PRIMARY KEY,
      orden_id          INTEGER         NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
      ingrediente_id    INTEGER         NOT NULL REFERENCES almacen_ingredientes(id),
      cantidad_pedida   DECIMAL(12,3)   NOT NULL,
      cantidad_recibida DECIMAL(12,3)   NULL,
      costo_unitario    DECIMAL(10,4)   NOT NULL,
      subtotal          DECIMAL(12,2)   NOT NULL,
      estado            oci_estado_enum DEFAULT 'pendiente',
      lote_id           INTEGER         NULL,
      notas             VARCHAR(200)    NULL
    )
  `);

  await run('table: inspeccion_recepcion', `
    CREATE TABLE IF NOT EXISTS inspeccion_recepcion (
      id                INTEGER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id         INTEGER          NOT NULL DEFAULT 1,
      orden_compra_id   INTEGER          NULL,
      ingrediente_id    INTEGER          NOT NULL REFERENCES almacen_ingredientes(id),
      temperatura_recibida DECIMAL(4,1)  NULL,
      estado_visual     insp_visual_enum NOT NULL,
      peso_declarado    DECIMAL(12,3)    NULL,
      peso_verificado   DECIMAL(12,3)    NULL,
      foto_url          VARCHAR(500)     NULL,
      notas_inspeccion  TEXT             NULL,
      aprobado          BOOLEAN          DEFAULT TRUE,
      inspector_id      INTEGER          NOT NULL,
      created_at        TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: almacen_movimientos', `
    CREATE TABLE IF NOT EXISTS almacen_movimientos (
      id                    SERIAL PRIMARY KEY,
      tenant_id             INTEGER          NOT NULL DEFAULT 1,
      ingrediente_id        INTEGER          NOT NULL REFERENCES almacen_ingredientes(id),
      lote_id               INTEGER          NULL REFERENCES almacen_lotes(id),
      tipo                  mov_tipo_enum    NOT NULL,
      cantidad              DECIMAL(12,3)    NOT NULL,
      stock_anterior        DECIMAL(12,3)    NOT NULL,
      stock_posterior       DECIMAL(12,3)    NOT NULL,
      costo_unitario        DECIMAL(10,4)    NULL,
      costo_total           DECIMAL(12,2)    NULL,
      motivo                mov_motivo_enum  NOT NULL,
      referencia_tipo       VARCHAR(50)      NULL,
      referencia_id         INTEGER          NULL,
      comprobante           VARCHAR(100)     NULL,
      notas                 TEXT             NULL,
      requiere_aprobacion   BOOLEAN          DEFAULT FALSE,
      aprobado_por          INTEGER          NULL,
      aprobado_at           TIMESTAMP        NULL,
      usuario_id            INTEGER          NOT NULL,
      turno_id              INTEGER          NULL,
      created_at            TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: almacen_historial_diario', `
    CREATE TABLE IF NOT EXISTS almacen_historial_diario (
      id                    SERIAL PRIMARY KEY,
      tenant_id             INTEGER       NOT NULL DEFAULT 1,
      fecha                 DATE          NOT NULL,
      ingrediente_id        INTEGER       NOT NULL REFERENCES almacen_ingredientes(id),
      stock_inicio_dia      DECIMAL(12,3) NOT NULL,
      total_entradas        DECIMAL(12,3) DEFAULT 0,
      total_salidas_venta   DECIMAL(12,3) DEFAULT 0,
      total_salidas_merma   DECIMAL(12,3) DEFAULT 0,
      total_salidas_otros   DECIMAL(12,3) DEFAULT 0,
      stock_fin_dia         DECIMAL(12,3) NOT NULL,
      costo_total_entradas  DECIMAL(12,2) DEFAULT 0,
      costo_total_salidas   DECIMAL(12,2) DEFAULT 0,
      usuario_cierre        INTEGER       NULL,
      UNIQUE (tenant_id, fecha, ingrediente_id)
    )
  `);

  await run('table: almacen_conteo_fisico', `
    CREATE TABLE IF NOT EXISTS almacen_conteo_fisico (
      id             SERIAL PRIMARY KEY,
      tenant_id      INTEGER       NOT NULL DEFAULT 1,
      fecha          DATE          NOT NULL,
      ingrediente_id INTEGER       NOT NULL REFERENCES almacen_ingredientes(id),
      stock_sistema  DECIMAL(12,3) NOT NULL,
      stock_contado  DECIMAL(12,3) NOT NULL,
      diferencia     DECIMAL(12,3) NOT NULL,
      ajustado       BOOLEAN       DEFAULT FALSE,
      notas          VARCHAR(200)  NULL,
      usuario_id     INTEGER       NOT NULL,
      created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: almacen_temperaturas', `
    CREATE TABLE IF NOT EXISTS almacen_temperaturas (
      id             SERIAL PRIMARY KEY,
      tenant_id      INTEGER      NOT NULL DEFAULT 1,
      ubicacion      VARCHAR(100) NOT NULL,
      temperatura    DECIMAL(4,1) NOT NULL,
      alerta         BOOLEAN      DEFAULT FALSE,
      registrado_por INTEGER      NOT NULL,
      created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed almacen_categorias
  const catCheck = await client.query(`SELECT COUNT(*) FROM almacen_categorias WHERE tenant_id = 1`);
  if (parseInt(catCheck.rows[0].count) === 0) {
    await run('seed: almacen_categorias', `
      INSERT INTO almacen_categorias (tenant_id, nombre, icono, color, orden) VALUES
        (1,'Pescados y mariscos','bi-water','#3b82f6',1),
        (1,'Carnes','bi-egg-fried','#ef4444',2),
        (1,'Vegetales','bi-flower1','#10b981',3),
        (1,'Tuberculos','bi-circle-fill','#a16207',4),
        (1,'Legumbres','bi-circle','#65a30d',5),
        (1,'Frutas','bi-apple','#f59e0b',6),
        (1,'Condimentos y especias','bi-fire','#dc2626',7),
        (1,'Cremas, salsas y vinagres','bi-droplet-fill','#f97316',8),
        (1,'Lacteos y huevos','bi-cup-straw','#fbbf24',9),
        (1,'Granos, harinas y pastas','bi-grain','#d4a017',10),
        (1,'Aceites, grasas y azucar','bi-droplet','#eab308',11),
        (1,'Bebidas','bi-cup-hot','#6366f1',12),
        (1,'Descartables','bi-box','#9ca3af',13),
        (1,'Limpieza','bi-stars','#06b6d4',14)
    `);
  } else {
    console.log('  --  seed: almacen_categorias (already seeded, skipped)');
  }
}

// ---------------------------------------------------------------------------
// MIGRATION 003 – recetas
// ---------------------------------------------------------------------------

async function createRecetas() {
  console.log('\n--- MIGRATION 003: recetas ---');

  await run('table: recetas', `
    CREATE TABLE IF NOT EXISTS recetas (
      id                       SERIAL PRIMARY KEY,
      tenant_id                INTEGER       NOT NULL DEFAULT 1,
      producto_id              INTEGER       NOT NULL,
      version                  INTEGER       NOT NULL DEFAULT 1,
      nombre_version           VARCHAR(100)  NULL,
      rendimiento_porciones    DECIMAL(6,2)  DEFAULT 1,
      tiempo_preparacion_min   INTEGER       NULL,
      food_cost_objetivo_pct   DECIMAL(5,2)  NULL,
      activa                   BOOLEAN       DEFAULT TRUE,
      created_at               TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, producto_id, version)
    )
  `);

  await run('table: receta_items', `
    CREATE TABLE IF NOT EXISTS receta_items (
      id             SERIAL PRIMARY KEY,
      receta_id      INTEGER            NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
      ingrediente_id INTEGER            NULL,
      sub_receta_id  INTEGER            NULL,
      cantidad       DECIMAL(10,3)      NOT NULL,
      unidad_medida  unidad_receta_enum DEFAULT 'g',
      es_opcional    BOOLEAN            DEFAULT FALSE,
      notas          VARCHAR(200)       NULL
    )
  `);

  await run('table: combos', `
    CREATE TABLE IF NOT EXISTS combos (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER      NOT NULL DEFAULT 1,
      nombre       VARCHAR(100) NOT NULL,
      precio       DECIMAL(10,2) NOT NULL,
      activo       BOOLEAN      DEFAULT TRUE,
      fecha_inicio DATE         NULL,
      fecha_fin    DATE         NULL,
      hora_inicio  TIME         NULL,
      hora_fin     TIME         NULL,
      created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: combo_items', `
    CREATE TABLE IF NOT EXISTS combo_items (
      id          SERIAL PRIMARY KEY,
      combo_id    INTEGER NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL,
      cantidad    INTEGER DEFAULT 1
    )
  `);
}

// ---------------------------------------------------------------------------
// MIGRATION 004 – caja
// ---------------------------------------------------------------------------

async function createCaja() {
  console.log('\n--- MIGRATION 004: caja ---');

  await run('table: turnos', `
    CREATE TABLE IF NOT EXISTS turnos (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER      NOT NULL DEFAULT 1,
      nombre       VARCHAR(50)  NOT NULL,
      hora_inicio  TIME         NOT NULL,
      hora_fin     TIME         NOT NULL,
      activo       BOOLEAN      DEFAULT TRUE
    )
  `);

  const turnosCheck = await client.query(`SELECT COUNT(*) FROM turnos WHERE tenant_id = 1`);
  if (parseInt(turnosCheck.rows[0].count) === 0) {
    await run('seed: turnos', `
      INSERT INTO turnos (tenant_id, nombre, hora_inicio, hora_fin) VALUES
        (1,'Manana','06:00','14:00'),
        (1,'Tarde','14:00','22:00')
    `);
  } else {
    console.log('  --  seed: turnos (already seeded, skipped)');
  }

  await run('table: metodos_pago', `
    CREATE TABLE IF NOT EXISTS metodos_pago (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER          NOT NULL DEFAULT 1,
      nombre        VARCHAR(50)      NOT NULL,
      tipo          metodo_tipo_enum NOT NULL,
      comision_pct  DECIMAL(5,2)     DEFAULT 0,
      activo        BOOLEAN          DEFAULT TRUE,
      UNIQUE (tenant_id, nombre)
    )
  `);

  const mpCheck = await client.query(`SELECT COUNT(*) FROM metodos_pago WHERE tenant_id = 1`);
  if (parseInt(mpCheck.rows[0].count) === 0) {
    await run('seed: metodos_pago', `
      INSERT INTO metodos_pago (tenant_id, nombre, tipo, comision_pct) VALUES
        (1,'Efectivo','efectivo',0),
        (1,'Visa POS','tarjeta',3.50),
        (1,'Mastercard POS','tarjeta',3.50),
        (1,'Yape','digital',0),
        (1,'Plin','digital',0),
        (1,'Transferencia BCP','transferencia',0),
        (1,'Transferencia Interbank','transferencia',0),
        (1,'Credito casa','credito',0)
    `);
  } else {
    console.log('  --  seed: metodos_pago (already seeded, skipped)');
  }

  await run('table: cajas', `
    CREATE TABLE IF NOT EXISTS cajas (
      id                     SERIAL PRIMARY KEY,
      tenant_id              INTEGER          NOT NULL DEFAULT 1,
      turno_id               INTEGER          NULL REFERENCES turnos(id),
      usuario_id             INTEGER          NOT NULL,
      nombre_caja            VARCHAR(50)      DEFAULT 'Caja 1',
      fecha_apertura         TIMESTAMP        NOT NULL,
      fecha_cierre           TIMESTAMP        NULL,
      monto_apertura         DECIMAL(10,2)    DEFAULT 0,
      monto_cierre_sistema   DECIMAL(10,2)    NULL,
      monto_cierre_real      DECIMAL(10,2)    NULL,
      diferencia             DECIMAL(10,2)    NULL,
      denominacion_cierre    JSONB            NULL,
      estado                 caja_estado_enum DEFAULT 'abierta',
      umbral_efectivo        DECIMAL(10,2)    DEFAULT 1500,
      notas                  TEXT             NULL,
      created_at             TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: caja_movimientos', `
    CREATE TABLE IF NOT EXISTS caja_movimientos (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER               NOT NULL DEFAULT 1,
      caja_id         INTEGER               NOT NULL REFERENCES cajas(id),
      tipo            cajamov_tipo_enum     NOT NULL,
      concepto        cajamov_concepto_enum NOT NULL,
      monto           DECIMAL(10,2)         NOT NULL,
      metodo_pago_id  INTEGER               NULL REFERENCES metodos_pago(id),
      referencia_tipo VARCHAR(50)           NULL,
      referencia_id   INTEGER               NULL,
      es_propina      BOOLEAN               DEFAULT FALSE,
      anulado         BOOLEAN               DEFAULT FALSE,
      anulado_por     INTEGER               NULL,
      anulado_motivo  VARCHAR(200)          NULL,
      autorizado_por  INTEGER               NULL,
      usuario_id      INTEGER               NOT NULL,
      created_at      TIMESTAMP             DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------------------------------------------------------------------------
// MIGRATION 005 – sunat / comprobantes
// ---------------------------------------------------------------------------

async function createSunat() {
  console.log('\n--- MIGRATION 005: sunat ---');

  await run('table: comprobantes_electronicos', `
    CREATE TABLE IF NOT EXISTS comprobantes_electronicos (
      id                   SERIAL PRIMARY KEY,
      tenant_id            INTEGER          NOT NULL DEFAULT 1,
      factura_id           INTEGER          NOT NULL,
      tipo                 cpe_tipo_enum    NOT NULL,
      serie                VARCHAR(10)      NOT NULL,
      correlativo          INTEGER          NOT NULL,
      fecha_emision        TIMESTAMP        NOT NULL,
      cliente_tipo_doc     VARCHAR(5)       NOT NULL,
      cliente_num_doc      VARCHAR(20)      NOT NULL,
      cliente_razon_social VARCHAR(200)     NOT NULL,
      subtotal_sin_igv     DECIMAL(12,2)    NOT NULL,
      igv                  DECIMAL(12,2)    NOT NULL,
      total_con_igv        DECIMAL(12,2)    NOT NULL,
      xml_firmado          TEXT             NULL,
      hash_cpe             VARCHAR(100)     NULL,
      qr_data              TEXT             NULL,
      codigo_sunat         VARCHAR(10)      NULL,
      mensaje_sunat        TEXT             NULL,
      pdf_url              VARCHAR(300)     NULL,
      estado               cpe_estado_enum  DEFAULT 'pendiente',
      enviado_sunat_at     TIMESTAMP        NULL,
      created_at           TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, tipo, serie, correlativo)
    )
  `);

  await run('table: notas_credito', `
    CREATE TABLE IF NOT EXISTS notas_credito (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER         NOT NULL DEFAULT 1,
      factura_id      INTEGER         NOT NULL,
      comprobante_id  INTEGER         NULL,
      motivo          nc_motivo_enum  NOT NULL,
      monto           DECIMAL(10,2)   NOT NULL,
      items           JSONB           NULL,
      estado          nc_estado_enum  DEFAULT 'emitida',
      usuario_id      INTEGER         NOT NULL,
      notas           TEXT            NULL,
      created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: config_sunat', `
    CREATE TABLE IF NOT EXISTS config_sunat (
      id                        SERIAL PRIMARY KEY,
      tenant_id                 INTEGER              NOT NULL DEFAULT 1,
      ruc_emisor                VARCHAR(11)          NULL,
      razon_social_emisor       VARCHAR(200)         NULL,
      direccion_emisor          VARCHAR(300)         NULL,
      serie_boleta              VARCHAR(10)          DEFAULT 'B001',
      correlativo_boleta        INTEGER              DEFAULT 0,
      serie_factura             VARCHAR(10)          DEFAULT 'F001',
      correlativo_factura       INTEGER              DEFAULT 0,
      serie_nota_credito        VARCHAR(10)          DEFAULT 'BC01',
      correlativo_nota_credito  INTEGER              DEFAULT 0,
      proveedor_ose             ose_proveedor_enum   DEFAULT 'nubefact',
      ose_token                 VARCHAR(500)         NULL,
      ose_ruta                  VARCHAR(300)         NULL,
      produccion                BOOLEAN              DEFAULT FALSE,
      igv_porcentaje            DECIMAL(5,2)         DEFAULT 18.00,
      created_at                TIMESTAMP            DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id)
    )
  `);

  const sunatCheck = await client.query(`SELECT COUNT(*) FROM config_sunat WHERE tenant_id = 1`);
  if (parseInt(sunatCheck.rows[0].count) === 0) {
    await run('seed: config_sunat', `
      INSERT INTO config_sunat (tenant_id, igv_porcentaje, serie_boleta, serie_factura)
      VALUES (1, 18.00, 'B001', 'F001')
    `);
  } else {
    console.log('  --  seed: config_sunat (already seeded, skipped)');
  }
}

// ---------------------------------------------------------------------------
// MIGRATION 006 – administracion (personal, gastos)
// ---------------------------------------------------------------------------

async function createAdministracion() {
  console.log('\n--- MIGRATION 006: administracion ---');

  await run('table: personal', `
    CREATE TABLE IF NOT EXISTS personal (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER          NOT NULL DEFAULT 1,
      usuario_id      INTEGER          NULL,
      nombre          VARCHAR(150)     NOT NULL,
      dni             VARCHAR(8)       NULL,
      cargo           VARCHAR(100)     NOT NULL,
      tipo_contrato   contrato_enum    DEFAULT 'planilla',
      tipo_pago       tipo_pago_per_enum DEFAULT 'diario',
      monto_pago      DECIMAL(10,2)    NOT NULL,
      regimen_pension pension_enum     DEFAULT 'onp',
      fecha_ingreso   DATE             NULL,
      activo          BOOLEAN          DEFAULT TRUE,
      deleted_at      TIMESTAMP        NULL,
      created_at      TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: planilla_pagos', `
    CREATE TABLE IF NOT EXISTS planilla_pagos (
      id                  SERIAL PRIMARY KEY,
      tenant_id           INTEGER       NOT NULL DEFAULT 1,
      personal_id         INTEGER       NOT NULL REFERENCES personal(id),
      fecha               DATE          NOT NULL,
      monto_bruto         DECIMAL(10,2) NOT NULL,
      deduccion_onp_afp   DECIMAL(10,2) DEFAULT 0,
      deduccion_ir_5ta    DECIMAL(10,2) DEFAULT 0,
      monto_neto          DECIMAL(10,2) NOT NULL,
      aporte_essalud      DECIMAL(10,2) DEFAULT 0,
      aporte_sctr         DECIMAL(10,2) DEFAULT 0,
      horas_trabajadas    DECIMAL(5,2)  NULL,
      notas               VARCHAR(200)  NULL,
      pagado              BOOLEAN       DEFAULT FALSE,
      caja_id             INTEGER       NULL,
      created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: gastos_categorias', `
    CREATE TABLE IF NOT EXISTS gastos_categorias (
      id         SERIAL PRIMARY KEY,
      tenant_id  INTEGER          NOT NULL DEFAULT 1,
      nombre     VARCHAR(100)     NOT NULL,
      tipo       gasto_tipo_enum  DEFAULT 'variable',
      grupo      gasto_grupo_enum DEFAULT 'otros',
      created_at TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const gcCheck = await client.query(`SELECT COUNT(*) FROM gastos_categorias WHERE tenant_id = 1`);
  if (parseInt(gcCheck.rows[0].count) === 0) {
    await run('seed: gastos_categorias', `
      INSERT INTO gastos_categorias (tenant_id, nombre, tipo, grupo) VALUES
        (1,'Alquiler local','fijo','inmovilizado'),
        (1,'Luz','fijo','inmovilizado'),
        (1,'Agua','fijo','inmovilizado'),
        (1,'Internet','fijo','inmovilizado'),
        (1,'Gas','variable','inmovilizado'),
        (1,'Seguro','fijo','inmovilizado'),
        (1,'Alarma','fijo','inmovilizado'),
        (1,'Suministros','variable','inmovilizado'),
        (1,'Contador/Gestoria','fijo','legal'),
        (1,'Abogados','variable','legal'),
        (1,'Comisiones bancarias','variable','legal'),
        (1,'Facebook Ads','variable','marketing'),
        (1,'Instagram Ads','variable','marketing'),
        (1,'Google Ads','variable','marketing'),
        (1,'Transporte','variable','otros'),
        (1,'Mantenimiento','variable','otros'),
        (1,'Otros gastos','variable','otros')
    `);
  } else {
    console.log('  --  seed: gastos_categorias (already seeded, skipped)');
  }

  await run('table: gastos', `
    CREATE TABLE IF NOT EXISTS gastos (
      id            SERIAL PRIMARY KEY,
      tenant_id     INTEGER          NOT NULL DEFAULT 1,
      categoria_id  INTEGER          NOT NULL REFERENCES gastos_categorias(id),
      concepto      VARCHAR(200)     NOT NULL,
      monto         DECIMAL(10,2)    NOT NULL,
      fecha         DATE             NOT NULL,
      periodo_mes   INTEGER          NULL,
      periodo_anio  INTEGER          NULL,
      recurrente    BOOLEAN          DEFAULT FALSE,
      frecuencia    gasto_frec_enum  NULL,
      comprobante   VARCHAR(200)     NULL,
      notas         TEXT             NULL,
      usuario_id    INTEGER          NULL,
      created_at    TIMESTAMP        DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: presupuestos', `
    CREATE TABLE IF NOT EXISTS presupuestos (
      id                    SERIAL PRIMARY KEY,
      tenant_id             INTEGER       NOT NULL DEFAULT 1,
      categoria_id          INTEGER       NOT NULL REFERENCES gastos_categorias(id),
      mes                   INTEGER       NOT NULL,
      anio                  INTEGER       NOT NULL,
      monto_presupuestado   DECIMAL(10,2) NOT NULL,
      UNIQUE (tenant_id, categoria_id, mes, anio)
    )
  `);
}

// ---------------------------------------------------------------------------
// MIGRATION 007 – canales de mensajes
// ---------------------------------------------------------------------------

async function createCanales() {
  console.log('\n--- MIGRATION 007: canales ---');

  await run('table: canales', `
    CREATE TABLE IF NOT EXISTS canales (
      id              SERIAL PRIMARY KEY,
      tenant_id       INTEGER      NOT NULL DEFAULT 1,
      nombre          VARCHAR(50)  NOT NULL,
      descripcion     VARCHAR(200) NULL,
      roles_permitidos JSONB       NULL,
      created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, nombre)
    )
  `);

  await run('table: canal_mensajes', `
    CREATE TABLE IF NOT EXISTS canal_mensajes (
      id          SERIAL PRIMARY KEY,
      tenant_id   INTEGER               NOT NULL DEFAULT 1,
      canal_id    INTEGER               NOT NULL REFERENCES canales(id),
      usuario_id  INTEGER               NULL,
      tipo        canal_tipo_enum       DEFAULT 'texto',
      mensaje     TEXT                  NOT NULL,
      prioridad   canal_prioridad_enum  DEFAULT 'normal',
      pinned      BOOLEAN               DEFAULT FALSE,
      pinned_until TIMESTAMP            NULL,
      created_at  TIMESTAMP             DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: canal_mensajes_leidos', `
    CREATE TABLE IF NOT EXISTS canal_mensajes_leidos (
      mensaje_id  INTEGER   NOT NULL,
      usuario_id  INTEGER   NOT NULL,
      leido_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mensaje_id, usuario_id)
    )
  `);

  const canalesCheck = await client.query(`SELECT COUNT(*) FROM canales WHERE tenant_id = 1`);
  if (parseInt(canalesCheck.rows[0].count) === 0) {
    await run('seed: canales', `
      INSERT INTO canales (tenant_id, nombre, descripcion, roles_permitidos) VALUES
        (1,'#inventario','Alertas de stock y compras','["administrador","cocinero"]'),
        (1,'#meseros','Avisos del dia, platos disponibles','["administrador","mesero"]'),
        (1,'#cocina','Comunicacion cocina','["administrador","cocinero"]'),
        (1,'#administracion','Alertas financieras, cierres','["administrador"]'),
        (1,'#soporte','Problemas y sugerencias',null)
    `);
  } else {
    console.log('  --  seed: canales (already seeded, skipped)');
  }
}

// ---------------------------------------------------------------------------
// MIGRATION 008 – features (reservas, delivery, promos, fidelidad, modificadores)
// ---------------------------------------------------------------------------

async function createFeatures() {
  console.log('\n--- MIGRATION 008: features ---');

  await run('table: reservas', `
    CREATE TABLE IF NOT EXISTS reservas (
      id                INTEGER              GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id         INTEGER              NOT NULL DEFAULT 1,
      cliente_id        INTEGER              NULL,
      mesa_id           INTEGER              NULL,
      fecha             DATE                 NOT NULL,
      hora              TIME                 NOT NULL,
      cantidad_personas INTEGER              NOT NULL,
      estado            reserva_estado_enum  DEFAULT 'pendiente',
      canal_origen      reserva_canal_enum   DEFAULT 'telefono',
      nombre_cliente    VARCHAR(150)         NULL,
      telefono_cliente  VARCHAR(20)          NULL,
      notas             VARCHAR(300)         NULL,
      confirmada_at     TIMESTAMP            NULL,
      usuario_id        INTEGER              NULL,
      created_at        TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: pedidos_delivery', `
    CREATE TABLE IF NOT EXISTS pedidos_delivery (
      id                    INTEGER                  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id             INTEGER                  NOT NULL DEFAULT 1,
      pedido_id             INTEGER                  NULL,
      factura_id            INTEGER                  NULL,
      tipo                  delivery_tipo_enum       NOT NULL,
      plataforma            delivery_plataforma_enum DEFAULT 'propio',
      direccion             TEXT                     NULL,
      telefono              VARCHAR(20)              NULL,
      nombre_cliente        VARCHAR(150)             NULL,
      repartidor            VARCHAR(100)             NULL,
      estado_entrega        delivery_estado_enum     DEFAULT 'preparando',
      tiempo_estimado_min   INTEGER                  NULL,
      comision_plataforma   DECIMAL(10,2)            DEFAULT 0,
      notas                 VARCHAR(300)             NULL,
      created_at            TIMESTAMP                DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: promociones', `
    CREATE TABLE IF NOT EXISTS promociones (
      id                   INTEGER              GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id            INTEGER              NOT NULL DEFAULT 1,
      nombre               VARCHAR(100)         NOT NULL,
      tipo                 promo_tipo_enum      NOT NULL,
      valor                DECIMAL(10,2)        NULL,
      codigo_cupon         VARCHAR(50)          NULL,
      fecha_inicio         DATE                 NULL,
      fecha_fin            DATE                 NULL,
      hora_inicio          TIME                 NULL,
      hora_fin             TIME                 NULL,
      productos_aplicables JSONB                NULL,
      usos_maximo          INTEGER              NULL,
      usos_actual          INTEGER              DEFAULT 0,
      activa               BOOLEAN              DEFAULT TRUE,
      created_at           TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: descuentos_aplicados', `
    CREATE TABLE IF NOT EXISTS descuentos_aplicados (
      id               INTEGER       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id        INTEGER       NOT NULL DEFAULT 1,
      factura_id       INTEGER       NOT NULL,
      promocion_id     INTEGER       NULL REFERENCES promociones(id),
      tipo             VARCHAR(50)   NOT NULL,
      monto_descuento  DECIMAL(10,2) NOT NULL,
      created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: fidelidad_puntos', `
    CREATE TABLE IF NOT EXISTS fidelidad_puntos (
      id                  SERIAL PRIMARY KEY,
      tenant_id           INTEGER              NOT NULL DEFAULT 1,
      cliente_id          INTEGER              NOT NULL,
      puntos_acumulados   INTEGER              DEFAULT 0,
      puntos_canjeados    INTEGER              DEFAULT 0,
      puntos_disponibles  INTEGER              DEFAULT 0,
      nivel               fidelidad_nivel_enum DEFAULT 'bronce',
      created_at          TIMESTAMP            DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, cliente_id)
    )
  `);

  await run('table: fidelidad_movimientos', `
    CREATE TABLE IF NOT EXISTS fidelidad_movimientos (
      id           SERIAL PRIMARY KEY,
      tenant_id    INTEGER              NOT NULL DEFAULT 1,
      cliente_id   INTEGER              NOT NULL,
      tipo         fidelidad_mov_enum   NOT NULL,
      puntos       INTEGER              NOT NULL,
      factura_id   INTEGER              NULL,
      descripcion  VARCHAR(200)         NULL,
      created_at   TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: modificadores_grupo', `
    CREATE TABLE IF NOT EXISTS modificadores_grupo (
      id          SERIAL PRIMARY KEY,
      tenant_id   INTEGER          NOT NULL DEFAULT 1,
      nombre      VARCHAR(100)     NOT NULL,
      tipo        modif_tipo_enum  DEFAULT 'unico',
      obligatorio BOOLEAN          DEFAULT FALSE,
      activo      BOOLEAN          DEFAULT TRUE
    )
  `);

  await run('table: modificadores', `
    CREATE TABLE IF NOT EXISTS modificadores (
      id               SERIAL PRIMARY KEY,
      grupo_id         INTEGER       NOT NULL REFERENCES modificadores_grupo(id) ON DELETE CASCADE,
      nombre           VARCHAR(100)  NOT NULL,
      precio_adicional DECIMAL(10,2) DEFAULT 0,
      activo           BOOLEAN       DEFAULT TRUE
    )
  `);

  await run('table: producto_modificadores', `
    CREATE TABLE IF NOT EXISTS producto_modificadores (
      producto_id INTEGER NOT NULL,
      grupo_id    INTEGER NOT NULL REFERENCES modificadores_grupo(id),
      PRIMARY KEY (producto_id, grupo_id)
    )
  `);

  // Seed modificadores
  const modCheck = await client.query(`SELECT COUNT(*) FROM modificadores_grupo WHERE tenant_id = 1`);
  if (parseInt(modCheck.rows[0].count) === 0) {
    const g1 = await client.query(
      `INSERT INTO modificadores_grupo (tenant_id, nombre, tipo) VALUES (1,'Termino de coccion','unico') RETURNING id`
    );
    const g1id = g1.rows[0].id;
    await client.query(`
      INSERT INTO modificadores (grupo_id, nombre) VALUES
        (${g1id},'Crudo'),(${g1id},'Termino medio'),(${g1id},'Tres cuartos'),(${g1id},'Bien cocido')
    `);
    console.log('  OK  seed: modificadores_grupo Termino de coccion');

    const g2 = await client.query(
      `INSERT INTO modificadores_grupo (tenant_id, nombre, tipo) VALUES (1,'Extras','multiple') RETURNING id`
    );
    const g2id = g2.rows[0].id;
    await client.query(`
      INSERT INTO modificadores (grupo_id, nombre, precio_adicional) VALUES
        (${g2id},'Extra aji',1.00),(${g2id},'Extra arroz',3.00),(${g2id},'Extra salsa criolla',2.00)
    `);
    console.log('  OK  seed: modificadores_grupo Extras');

    const g3 = await client.query(
      `INSERT INTO modificadores_grupo (tenant_id, nombre, tipo) VALUES (1,'Sin ingrediente','multiple') RETURNING id`
    );
    const g3id = g3.rows[0].id;
    await client.query(`
      INSERT INTO modificadores (grupo_id, nombre) VALUES
        (${g3id},'Sin cebolla'),(${g3id},'Sin aji'),(${g3id},'Sin culantro'),(${g3id},'Sin sal')
    `);
    console.log('  OK  seed: modificadores_grupo Sin ingrediente');
  } else {
    console.log('  --  seed: modificadores (already seeded, skipped)');
  }
}

// ---------------------------------------------------------------------------
// MIGRATION 009 – multitenant
// ---------------------------------------------------------------------------

async function createMultitenant() {
  console.log('\n--- MIGRATION 009: multitenant ---');

  await run('table: tenants', `
    CREATE TABLE IF NOT EXISTS tenants (
      id               SERIAL PRIMARY KEY,
      nombre           VARCHAR(200) NOT NULL,
      subdominio       VARCHAR(100) NOT NULL UNIQUE,
      plan             plan_enum    DEFAULT 'free',
      ruc              VARCHAR(20)  NULL,
      email_admin      VARCHAR(150) NOT NULL DEFAULT 'admin@restaurante.com',
      telefono         VARCHAR(20)  NULL,
      logo_url         VARCHAR(500) NULL,
      config           JSONB        NULL,
      activo           BOOLEAN      DEFAULT TRUE,
      fecha_inicio     DATE         NOT NULL,
      fecha_vencimiento DATE        NULL,
      created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run('table: tenant_suscripciones', `
    CREATE TABLE IF NOT EXISTS tenant_suscripciones (
      id               SERIAL PRIMARY KEY,
      tenant_id        INTEGER               NOT NULL REFERENCES tenants(id),
      plan             plan_enum             NOT NULL,
      precio_mensual   DECIMAL(10,2)         NOT NULL,
      fecha_inicio     DATE                  NOT NULL,
      fecha_fin        DATE                  NULL,
      estado           suscripcion_estado_enum DEFAULT 'prueba',
      metodo_pago      VARCHAR(50)           NULL,
      referencia_pago  VARCHAR(100)          NULL,
      created_at       TIMESTAMP             DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed tenant
  const tenantCheck = await client.query(`SELECT COUNT(*) FROM tenants WHERE subdominio = 'elmarineritopicante'`);
  if (parseInt(tenantCheck.rows[0].count) === 0) {
    // Check if id=1 exists already (from a different seed)
    const t1Check = await client.query(`SELECT id FROM tenants WHERE id = 1`);
    if (t1Check.rows.length > 0) {
      await client.query(`
        UPDATE tenants SET
          nombre = 'El Marinerito Picante',
          subdominio = 'elmarineritopicante',
          plan = 'pro',
          activo = true,
          fecha_inicio = CURRENT_DATE
        WHERE id = 1
      `);
      console.log('  OK  seed: tenants (updated existing id=1 to El Marinerito Picante)');
    } else {
      // Insert with explicit id so FK from other tables pointing to tenant_id=1 work
      await client.query(`
        INSERT INTO tenants (id, nombre, subdominio, plan, activo, fecha_inicio)
        VALUES (1,'El Marinerito Picante','elmarineritopicante','pro',true,CURRENT_DATE)
      `);
      // Sync sequence
      await client.query(`SELECT setval(pg_get_serial_sequence('tenants','id'), MAX(id)) FROM tenants`);
      console.log('  OK  seed: tenants (El Marinerito Picante)');
    }
  } else {
    console.log('  --  seed: tenants (already seeded, skipped)');
  }

  const susCheck = await client.query(`SELECT COUNT(*) FROM tenant_suscripciones WHERE tenant_id = 1`);
  if (parseInt(susCheck.rows[0].count) === 0) {
    await run('seed: tenant_suscripciones', `
      INSERT INTO tenant_suscripciones (tenant_id, plan, precio_mensual, fecha_inicio, estado)
      VALUES (1,'pro',0,CURRENT_DATE,'activa')
    `);
  } else {
    console.log('  --  seed: tenant_suscripciones (already seeded, skipped)');
  }
}

// ---------------------------------------------------------------------------
// admin_tareas (custom table from requirements)
// ---------------------------------------------------------------------------

async function createAdminTareas() {
  console.log('\n--- admin_tareas ---');

  await run('table: admin_tareas', `
    CREATE TABLE IF NOT EXISTS admin_tareas (
      id             SERIAL PRIMARY KEY,
      tenant_id      INTEGER      NOT NULL DEFAULT 1,
      usuario_id     INTEGER      NULL,
      tipo           VARCHAR(50)  NULL,
      titulo         VARCHAR(200) NOT NULL,
      descripcion    TEXT         NULL,
      color          VARCHAR(30)  NULL,
      href           VARCHAR(300) NULL,
      btn_texto      VARCHAR(100) NULL,
      urgente        BOOLEAN      NOT NULL DEFAULT FALSE,
      completada     BOOLEAN      NOT NULL DEFAULT FALSE,
      completada_at  TIMESTAMP    NULL,
      created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------------------------------------------------------------------------
// MIGRATION 010 – indexes
// ---------------------------------------------------------------------------

async function createIndexes() {
  console.log('\n--- MIGRATION 010: indexes ---');

  const indexes = [
    // facturas
    ['idx_facturas_fecha',          'facturas',                '(fecha)'],
    ['idx_facturas_cliente',        'facturas',                '(cliente_id)'],
    ['idx_facturas_formapago',      'facturas',                '(forma_pago)'],
    // detalle_factura
    ['idx_detfact_factura',         'detalle_factura',         '(factura_id)'],
    ['idx_detfact_producto',        'detalle_factura',         '(producto_id)'],
    // factura_pagos
    ['idx_factpagos_factura',       'factura_pagos',           '(factura_id)'],
    // mesas
    ['idx_mesas_estado',            'mesas',                   '(estado)'],
    // pedidos
    ['idx_pedidos_mesa_estado',     'pedidos',                 '(mesa_id, estado)'],
    ['idx_pedidos_estado',          'pedidos',                 '(estado)'],
    // pedido_items
    ['idx_peditems_pedido_estado',  'pedido_items',            '(pedido_id, estado)'],
    ['idx_peditems_producto',       'pedido_items',            '(producto_id)'],
    ['idx_peditems_estado',         'pedido_items',            '(estado)'],
    ['idx_peditems_enviado_at',     'pedido_items',            '(enviado_at)'],
    ['idx_peditems_servido_at',     'pedido_items',            '(servido_at)'],
    // clientes
    ['idx_clientes_nombre',         'clientes',                '(nombre)'],
    // productos
    ['idx_productos_nombre',        'productos',               '(nombre)'],
    // producto_hijos_items
    ['idx_phitems_padre_orden',     'producto_hijos_items',    '(producto_padre_id, orden)'],
    // usuarios
    ['idx_usuarios_rol_activo',     'usuarios',                '(rol, activo)'],
    // almacen_ingredientes
    ['idx_alming_tenant_activo',    'almacen_ingredientes',    '(tenant_id, activo)'],
    ['idx_stock',                   'almacen_ingredientes',    '(tenant_id, stock_actual, stock_minimo)'],
    ['idx_categoria',               'almacen_ingredientes',    '(tenant_id, categoria_id)'],
    // almacen_movimientos
    ['idx_almmov_tenant_created',   'almacen_movimientos',     '(tenant_id, created_at)'],
    ['idx_almmov_ingrediente',      'almacen_movimientos',     '(ingrediente_id)'],
    ['idx_mov_ingr',                'almacen_movimientos',     '(tenant_id, ingrediente_id, created_at)'],
    ['idx_mov_tipo',                'almacen_movimientos',     '(tenant_id, tipo, motivo, created_at)'],
    ['idx_mov_ref',                 'almacen_movimientos',     '(tenant_id, referencia_tipo, referencia_id)'],
    // almacen_lotes
    ['idx_vencimiento',             'almacen_lotes',           '(tenant_id, fecha_vencimiento, estado)'],
    ['idx_fifo',                    'almacen_lotes',           '(tenant_id, ingrediente_id, fecha_ingreso)'],
    // almacen_temperaturas
    ['idx_temp_ubic',               'almacen_temperaturas',    '(tenant_id, ubicacion, created_at)'],
    // cajas
    ['idx_cajas_tenant_estado',     'cajas',                   '(tenant_id, estado)'],
    ['idx_caja_estado',             'cajas',                   '(tenant_id, estado, fecha_apertura)'],
    // caja_movimientos
    ['idx_cajamov_caja_anulado',    'caja_movimientos',        '(caja_id, anulado)'],
    ['idx_cajamov_tenant_created',  'caja_movimientos',        '(tenant_id, created_at)'],
    ['idx_cajamov_caja',            'caja_movimientos',        '(tenant_id, caja_id, created_at)'],
    ['idx_cajamov_tipo',            'caja_movimientos',        '(tenant_id, tipo, concepto)'],
    // recetas
    ['idx_recetas_producto_activa', 'recetas',                 '(producto_id, activa)'],
    ['idx_recetas_tenant_producto', 'recetas',                 '(tenant_id, producto_id)'],
    ['idx_receta_prod',             'recetas',                 '(tenant_id, producto_id, activa)'],
    // receta_items
    ['idx_recitems_receta',         'receta_items',            '(receta_id)'],
    ['idx_recitems_ingrediente',    'receta_items',            '(ingrediente_id)'],
    // gastos
    ['idx_gastos_tenant_fecha',     'gastos',                  '(tenant_id, fecha)'],
    ['idx_gastos_categoria',        'gastos',                  '(categoria_id)'],
    ['idx_gastos_fecha',            'gastos',                  '(tenant_id, fecha)'],
    ['idx_gastos_cat',              'gastos',                  '(tenant_id, categoria_id)'],
    // gastos_categorias
    ['idx_gastoscat_tenant_grupo',  'gastos_categorias',       '(tenant_id, grupo)'],
    // planilla_pagos
    ['idx_planilla_tenant_fecha',   'planilla_pagos',          '(tenant_id, fecha)'],
    ['idx_planilla_personal',       'planilla_pagos',          '(personal_id)'],
    ['idx_planilla_fecha',          'planilla_pagos',          '(tenant_id, fecha)'],
    // personal
    ['idx_personal_tenant_activo',  'personal',                '(tenant_id, activo)'],
    // presupuestos
    ['idx_presup_tenant_periodo',   'presupuestos',            '(tenant_id, anio, mes)'],
    // ordenes_compra
    ['idx_ordcompra_tenant_fecha',  'ordenes_compra',          '(tenant_id, fecha_orden, estado)'],
    ['idx_oc_estado',               'ordenes_compra',          '(tenant_id, estado, fecha_orden)'],
    ['idx_oc_prov',                 'ordenes_compra',          '(tenant_id, proveedor_id)'],
    // reservas
    ['idx_reservas_tenant_fecha',   'reservas',                '(tenant_id, fecha)'],
    ['idx_reserva_fecha',           'reservas',                '(tenant_id, fecha, hora)'],
    // pedidos_delivery
    ['idx_delivery_tenant_created', 'pedidos_delivery',        '(tenant_id, created_at)'],
    ['idx_delivery_estado',         'pedidos_delivery',        '(tenant_id, estado_entrega)'],
    // promociones
    ['idx_promos_tenant_activa',    'promociones',             '(tenant_id, activa)'],
    // fidelidad_puntos
    ['idx_fidelidad_tenant_cliente','fidelidad_puntos',        '(tenant_id, cliente_id)'],
    // audit_log
    ['idx_audit_tenant_created',    'audit_log',               '(tenant_id, created_at)'],
    ['idx_audit_usuario',           'audit_log',               '(usuario_id)'],
    ['idx_audit_tenant',            'audit_log',               '(tenant_id, created_at)'],
    ['idx_audit_modulo',            'audit_log',               '(modulo, tabla_afectada, created_at)'],
    // proveedores
    ['idx_proveedores_tenant_deleted','proveedores',           '(tenant_id, deleted_at)'],
    // canal_mensajes
    ['idx_canal_msg',               'canal_mensajes',          '(tenant_id, canal_id, created_at)'],
    // comprobantes_electronicos
    ['idx_cpe_fecha',               'comprobantes_electronicos','(tenant_id, fecha_emision)'],
    // planilla
    ['idx_planilla_fecha2',         'planilla_pagos',          '(tenant_id, fecha)'],
    // admin_tareas
    ['idx_admin_tareas_tenant',     'admin_tareas',            '(tenant_id, completada)'],
  ];

  // Deduplicate by index name
  const seen = new Set();
  for (const [name, table, cols] of indexes) {
    if (seen.has(name)) continue;
    seen.add(name);
    await runIndex(
      `index: ${name}`,
      `CREATE INDEX IF NOT EXISTS ${name} ON ${table} ${cols}`
    );
  }
}

// ---------------------------------------------------------------------------
// SEED: usuarios admin
// ---------------------------------------------------------------------------

async function seedUsuarios() {
  console.log('\n--- SEED: usuarios ---');

  const check = await client.query(`SELECT id FROM usuarios WHERE usuario = 'admin'`);
  if (check.rows.length === 0) {
    await run('seed: admin user', `
      INSERT INTO usuarios (usuario, nombre, password_hash, rol, activo, tenant_id)
      VALUES ('admin','Administrador','$2b$10$io4GOTM300XQHIsHtB0b4evsgKCQ2MMqCYXPyUnvXGUnAukq/xMNW','administrador',1,1)
    `);
  } else {
    // Upsert: update existing admin
    await run('seed: admin user (update existing)', `
      UPDATE usuarios SET
        nombre = 'Administrador',
        password_hash = '$2b$10$io4GOTM300XQHIsHtB0b4evsgKCQ2MMqCYXPyUnvXGUnAukq/xMNW',
        rol = 'administrador',
        activo = 1,
        tenant_id = 1
      WHERE usuario = 'admin'
    `);
  }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('=============================================================');
  console.log('  Supabase PostgreSQL Schema Setup – Restaurant Management   ');
  console.log('=============================================================');
  console.log(`  Host: db.vfltsjcktxgmqbrzwthn.supabase.co`);
  console.log(`  DB:   postgres`);
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log('=============================================================');

  await client.connect();
  console.log('\nConnected to Supabase PostgreSQL.');

  try {
    await createEnumTypes();
    await createCoreTables();
    await createAuditLog();
    await createAlmacen();
    await createRecetas();
    await createCaja();
    await createSunat();
    await createAdministracion();
    await createCanales();
    await createFeatures();
    await createMultitenant();
    await createAdminTareas();
    await createIndexes();

    // Seeds that depend on other tables
    await seedUsuarios();

    console.log('\n=============================================================');
    console.log('  SCHEMA SETUP COMPLETED SUCCESSFULLY');
    console.log('=============================================================');
    console.log('  Tables created (or verified existing):');
    console.log('   Core       : productos, producto_hijos, producto_hijos_items,');
    console.log('                clientes, facturas, factura_pagos, detalle_factura,');
    console.log('                configuracion_impresion, usuarios, mesas,');
    console.log('                pedidos, pedido_items');
    console.log('   Migrations : audit_log, almacen_categorias, almacen_ingredientes,');
    console.log('                almacen_lotes, almacen_movimientos, almacen_historial_diario,');
    console.log('                almacen_conteo_fisico, almacen_temperaturas, inspeccion_recepcion,');
    console.log('                proveedores, ordenes_compra, orden_compra_items,');
    console.log('                recetas, receta_items, combos, combo_items,');
    console.log('                turnos, metodos_pago, cajas, caja_movimientos,');
    console.log('                comprobantes_electronicos, notas_credito, config_sunat,');
    console.log('                personal, planilla_pagos, gastos_categorias, gastos, presupuestos,');
    console.log('                canales, canal_mensajes, canal_mensajes_leidos,');
    console.log('                reservas, pedidos_delivery, promociones, descuentos_aplicados,');
    console.log('                fidelidad_puntos, fidelidad_movimientos,');
    console.log('                modificadores_grupo, modificadores, producto_modificadores,');
    console.log('                tenants, tenant_suscripciones, admin_tareas');
    console.log('  Seeds      : admin user (admin/admin123), tenant El Marinerito Picante,');
    console.log('               almacen_categorias (14), gastos_categorias (17),');
    console.log('               turnos (2), metodos_pago (8), canales (5), modificadores (3 grupos)');
    console.log('  Indexes    : 60+ performance indexes created');
    console.log('=============================================================\n');
  } catch (err) {
    console.error('\nFATAL: Setup failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
