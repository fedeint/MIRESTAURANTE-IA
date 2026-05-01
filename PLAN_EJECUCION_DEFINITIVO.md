# PLAN DE EJECUCION DEFINITIVO - dignita.tech SaaS V3
## Incorpora 104 hallazgos de 2 especialistas senior (30+ anos c/u)

**Autor**: Leonidas Yauri, CEO dignita.tech
**Fecha**: 17 de Marzo 2026
**Basado en**: PLAN_SAAS_V2.md + REVIEW_SAAS_ARCHITECT.md (61 hallazgos) + REVIEW_SYSTEMS_ANALYST.md (43 hallazgos)
**Estado**: APROBADO PARA EJECUCION

---

## RESUMEN: 12 FASES, 22 MODULOS, ~18-22 SEMANAS

```
FASE 0  │ Fundamentos (seguridad, tenant_id, migraciones)     │ 2-3 sem
FASE 1  │ Almacen completo (8 secciones + proveedores + lotes) │ 3 sem
FASE 2  │ Recetas (versionadas, sub-recetas, yield)            │ 2 sem
FASE 3  │ Caja (denominacion, turnos, cash drops, propinas)    │ 2 sem
FASE 4  │ SUNAT (facturacion electronica, IGV, boletas)        │ 3 sem
FASE 5  │ Administracion/P&L (planilla real, gastos, presup.)  │ 2 sem
FASE 6  │ Canales internos + notificaciones tiempo real        │ 1 sem
FASE 7  │ Reportes PDF/Excel (diario + 9 reportes adicionales) │ 1-2 sem
FASE 8  │ Features nuevos (reservas, delivery, promos, fideliz)│ 3 sem
FASE 9  │ IA con voz + IA predictiva                           │ 1 sem
FASE 10 │ Modo offline (PWA, Service Worker, sync)              │ 2 sem
FASE 11 │ SaaS multi-tenant + planes + super-admin             │ 3-4 sem
```

---

## FASE 0: FUNDAMENTOS (antes de tocar cualquier modulo) - 2-3 semanas

> "Sin estos fundamentos, todo lo demas se construye sobre arena" - Arquitecto SaaS

### 0.1 Seguridad critica
| # | Tarea | Hallazgo | Prioridad |
|---|-------|----------|-----------|
| 0.1.1 | Mover TODAS las credenciales a .env (eliminar hardcode en db.js) | SEC-001 | CRITICO |
| 0.1.2 | Restringir CORS al dominio del tenant (no `*`) | SEC-002 | CRITICO |
| 0.1.3 | Session secret fuerte + rotacion | SEC-003 | CRITICO |
| 0.1.4 | Implementar CSRF protection (csurf middleware) | SEC-005 | CRITICO |
| 0.1.5 | HTTPS obligatorio (redirigir HTTP → HTTPS) | SEC-004 | CRITICO |
| 0.1.6 | Forzar cambio de contrasena en primer login | SEC-006 | CRITICO |
| 0.1.7 | Validacion de complejidad de contrasena (8+ chars, mayusc, num) | SEC-006 | CRITICO |
| 0.1.8 | Bloqueo de cuenta despues de 5 intentos fallidos | SEC-008 | IMPORTANTE |
| 0.1.9 | Registro de intentos de login fallidos (IP, timestamp) | SEC-008 | IMPORTANTE |

### 0.2 Arquitectura base
| # | Tarea | Hallazgo |
|---|-------|----------|
| 0.2.1 | Instalar sistema de migraciones (Knex.js) | ARQ-002 |
| 0.2.2 | Agregar `tenant_id` a TODAS las tablas existentes desde ahora | MT-001 |
| 0.2.3 | Crear middleware de tenant que inyecte tenant_id en cada request | MT-001 |
| 0.2.4 | Crear wrapper de BD que SIEMPRE incluya tenant_id en queries | MT-001 |
| 0.2.5 | Separar capas: routes/ → services/ → models/ | ARQ-003 |
| 0.2.6 | Instalar Redis (sessions + cache + queues) | MT-003, ESC-002 |
| 0.2.7 | Migrar session store a Redis | MT-003 |
| 0.2.8 | Renombrar proyecto consistentemente (package.json, BD, etc.) | ARQ-001 |

### 0.3 Tabla de auditoria
```sql
CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    usuario_id INT NOT NULL,
    accion ENUM('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','ERROR') NOT NULL,
    modulo VARCHAR(50) NOT NULL,        -- 'caja', 'almacen', 'facturacion', etc.
    tabla_afectada VARCHAR(100) NOT NULL,
    registro_id INT NULL,
    datos_anteriores JSON NULL,
    datos_nuevos JSON NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(300) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_tenant (tenant_id, created_at),
    INDEX idx_audit_modulo (modulo, tabla_afectada, created_at),
    INDEX idx_audit_usuario (usuario_id, created_at)
);
```

### 0.4 Tabla de roles granular (reemplaza ENUM)
```sql
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    permisos JSON NOT NULL,
    es_sistema TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, nombre)
);

-- Permisos JSON ejemplo para admin:
-- {"dashboard":true,"facturacion":true,"mesas":true,"cocina":true,
--  "caja":true,"almacen":true,"productos":true,"clientes":true,
--  "ranking":true,"administracion":true,"planilla":true,"canales":true,
--  "chat_ia":true,"usuarios":true,"configuracion":true,"reportes":true}
```

### 0.5 Soft delete uniforme
- Agregar `deleted_at TIMESTAMP NULL` a TODAS las tablas maestras
- Nunca DELETE fisico de registros financieros/contables

### 0.6 Testing basico
- Tests para calculo financiero (IGV, COGS, margenes)
- Tests para aislamiento de tenant
- Tests para concurrencia de stock

---

## FASE 1: ALMACEN COMPLETO - 3 semanas

> "Si el almacen esta bien, todo esta bien" - Leonidas Yauri

### 1.1 Tablas de BD (todas con tenant_id)

**14 categorias, ~200 ingredientes**

```sql
-- Categorias
CREATE TABLE almacen_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    icono VARCHAR(50) NULL,
    color VARCHAR(20) NULL,
    orden INT DEFAULT 0,
    activo TINYINT(1) DEFAULT 1,
    UNIQUE(tenant_id, nombre)
);

-- Proveedores (nuevo - hallazgo del plan original)
CREATE TABLE proveedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    ruc VARCHAR(20) NULL,
    telefono VARCHAR(20) NULL,
    email VARCHAR(100) NULL,
    direccion VARCHAR(300) NULL,
    contacto_nombre VARCHAR(100) NULL,
    tipo ENUM('mayorista','minorista','productor','distribuidor') DEFAULT 'mayorista',
    calificacion INT NULL,
    dias_credito INT DEFAULT 0,             -- [ADM-007] Cuentas por pagar
    activo TINYINT(1) DEFAULT 1,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingredientes
CREATE TABLE almacen_ingredientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    categoria_id INT NULL,
    proveedor_id INT NULL,
    codigo VARCHAR(50) NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(300) NULL,
    unidad_medida ENUM('kg','g','lt','ml','und','docena','saco','caja') NOT NULL DEFAULT 'kg',
    unidad_compra ENUM('kg','g','lt','ml','und','docena','saco','caja') NOT NULL DEFAULT 'kg',
    factor_conversion DECIMAL(10,4) DEFAULT 1,
    stock_actual DECIMAL(12,3) NOT NULL DEFAULT 0,
    stock_minimo DECIMAL(12,3) NOT NULL DEFAULT 0,
    stock_maximo DECIMAL(12,3) NULL,
    costo_unitario DECIMAL(10,4) NOT NULL DEFAULT 0,
    costo_promedio DECIMAL(10,4) NOT NULL DEFAULT 0,
    ultimo_costo DECIMAL(10,4) NULL,
    merma_preparacion_pct DECIMAL(5,2) DEFAULT 0,  -- [ALM-008] 30% para pescado = 0.30
    ubicacion VARCHAR(100) NULL,
    perecible TINYINT(1) DEFAULT 1,
    dias_vencimiento INT NULL,
    temperatura_almacen VARCHAR(50) NULL,
    -- [ALM-006] Sustituto
    ingrediente_sustituto_id INT NULL,
    factor_sustitucion DECIMAL(10,4) NULL,   -- 1.0 = misma cantidad
    -- Alergenos [REC-008]
    alergenos JSON NULL,                     -- ["gluten","lacteos","mariscos"]
    activo TINYINT(1) DEFAULT 1,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, codigo),
    INDEX idx_stock (tenant_id, stock_actual, stock_minimo),
    INDEX idx_categoria (tenant_id, categoria_id)
);

-- [ALM-003] Lotes con vencimiento real
CREATE TABLE almacen_lotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    ingrediente_id INT NOT NULL,
    numero_lote VARCHAR(50) NULL,
    fecha_ingreso DATE NOT NULL,
    fecha_vencimiento DATE NULL,
    cantidad_inicial DECIMAL(12,3) NOT NULL,
    cantidad_disponible DECIMAL(12,3) NOT NULL,
    costo_unitario DECIMAL(10,4) NOT NULL,
    proveedor_id INT NULL,
    orden_compra_id INT NULL,
    estado ENUM('disponible','agotado','vencido','descartado') DEFAULT 'disponible',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vencimiento (tenant_id, fecha_vencimiento, estado),
    INDEX idx_fifo (tenant_id, ingrediente_id, fecha_ingreso)
);

-- Ordenes de compra
CREATE TABLE ordenes_compra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    proveedor_id INT NOT NULL,
    numero_orden VARCHAR(50) NULL,
    fecha_orden DATE NOT NULL,
    fecha_entrega_esperada DATE NULL,
    fecha_recibida DATE NULL,
    estado ENUM('borrador','enviada','parcial','recibida','cancelada') DEFAULT 'borrador',
    subtotal DECIMAL(12,2) DEFAULT 0,
    igv DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    comprobante_tipo ENUM('boleta','factura','sin_comprobante') DEFAULT 'sin_comprobante',
    comprobante_numero VARCHAR(50) NULL,
    -- [ADM-007] Cuentas por pagar
    estado_pago ENUM('pendiente','pagado','parcial','vencido') DEFAULT 'pendiente',
    fecha_vencimiento_pago DATE NULL,
    monto_pagado DECIMAL(12,2) DEFAULT 0,
    notas TEXT NULL,
    usuario_id INT NOT NULL,
    recibido_por INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_estado (tenant_id, estado, fecha_orden),
    INDEX idx_proveedor (tenant_id, proveedor_id)
);

-- Items de orden de compra
CREATE TABLE orden_compra_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_id INT NOT NULL,
    ingrediente_id INT NOT NULL,
    cantidad_pedida DECIMAL(12,3) NOT NULL,
    cantidad_recibida DECIMAL(12,3) NULL,
    costo_unitario DECIMAL(10,4) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    estado ENUM('pendiente','recibido','parcial','rechazado') DEFAULT 'pendiente',
    lote_id INT NULL,                       -- Vincula al lote creado al recibir
    notas VARCHAR(200) NULL
);

-- [ALM-002] Inspeccion de recepcion
CREATE TABLE inspeccion_recepcion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    orden_compra_id INT NULL,
    ingrediente_id INT NOT NULL,
    temperatura_recibida DECIMAL(4,1) NULL,
    estado_visual ENUM('excelente','bueno','aceptable','rechazado') NOT NULL,
    peso_declarado DECIMAL(12,3) NULL,
    peso_verificado DECIMAL(12,3) NULL,
    foto_url VARCHAR(500) NULL,
    notas_inspeccion TEXT NULL,
    aprobado TINYINT(1) DEFAULT 1,
    inspector_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Movimientos (con stock anterior/posterior + concurrencia)
CREATE TABLE almacen_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    ingrediente_id INT NOT NULL,
    lote_id INT NULL,                       -- [ALM-003] Lote afectado
    tipo ENUM('entrada','salida','ajuste','merma','devolucion','transferencia') NOT NULL,
    cantidad DECIMAL(12,3) NOT NULL,
    stock_anterior DECIMAL(12,3) NOT NULL,
    stock_posterior DECIMAL(12,3) NOT NULL,
    costo_unitario DECIMAL(10,4) NULL,
    costo_total DECIMAL(12,2) NULL,
    motivo ENUM(
        'compra_proveedor','venta_platillo','merma_vencimiento',
        'merma_dano','merma_preparacion','consumo_interno',
        'ajuste_inventario','devolucion_proveedor','regalo',
        'robo_perdida','transferencia_sucursal'
    ) NOT NULL,
    referencia_tipo VARCHAR(50) NULL,
    referencia_id INT NULL,
    comprobante VARCHAR(100) NULL,
    notas TEXT NULL,
    -- [ALM-007] Aprobacion para ajustes grandes
    requiere_aprobacion TINYINT(1) DEFAULT 0,
    aprobado_por INT NULL,
    aprobado_at TIMESTAMP NULL,
    usuario_id INT NOT NULL,
    turno_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ingrediente (tenant_id, ingrediente_id, created_at),
    INDEX idx_tipo (tenant_id, tipo, motivo, created_at),
    INDEX idx_referencia (tenant_id, referencia_tipo, referencia_id)
);

-- Historial diario consolidado
CREATE TABLE almacen_historial_diario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    fecha DATE NOT NULL,
    ingrediente_id INT NOT NULL,
    stock_inicio_dia DECIMAL(12,3) NOT NULL,
    total_entradas DECIMAL(12,3) DEFAULT 0,
    total_salidas_venta DECIMAL(12,3) DEFAULT 0,
    total_salidas_merma DECIMAL(12,3) DEFAULT 0,
    total_salidas_otros DECIMAL(12,3) DEFAULT 0,
    stock_fin_dia DECIMAL(12,3) NOT NULL,
    costo_total_entradas DECIMAL(12,2) DEFAULT 0,
    costo_total_salidas DECIMAL(12,2) DEFAULT 0,
    usuario_cierre INT NULL,
    UNIQUE KEY uq_fecha_ingr (tenant_id, fecha, ingrediente_id)
);

-- Conteo fisico
CREATE TABLE almacen_conteo_fisico (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    fecha DATE NOT NULL,
    ingrediente_id INT NOT NULL,
    stock_sistema DECIMAL(12,3) NOT NULL,
    stock_contado DECIMAL(12,3) NOT NULL,
    diferencia DECIMAL(12,3) NOT NULL,
    ajustado TINYINT(1) DEFAULT 0,
    notas VARCHAR(200) NULL,
    usuario_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [ALM-005] Registro de temperaturas
CREATE TABLE almacen_temperaturas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    ubicacion VARCHAR(100) NOT NULL,
    temperatura DECIMAL(4,1) NOT NULL,
    alerta TINYINT(1) DEFAULT 0,
    registrado_por INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ubicacion (tenant_id, ubicacion, created_at)
);
```

### 1.2 Secciones de la vista (8 secciones)

```
/almacen/dashboard        → KPIs: valor inventario, alertas, compras del dia, merma
/almacen/inventario       → Stock actual con semaforo, filtros, CRUD, import Excel
/almacen/proveedores      → CRUD proveedores con calificacion e historial
/almacen/compras          → Ordenes de compra con recepcion + inspeccion
/almacen/entradas         → Entrada rapida (mercado diario) sin orden formal
/almacen/salidas          → Merma/consumo interno con justificacion obligatoria
/almacen/historial        → Por dia, por ingrediente, por usuario, exportable
/almacen/conteo-fisico    → Inventario fisico con ajuste automatico
```

### 1.3 Logica critica: descuento atomico de stock
```javascript
// [ALM-001] Operacion atomica - NO usa SELECT + UPDATE separados
async function descontarStock(tenantId, ingredienteId, cantidad) {
    const [result] = await db.query(
        `UPDATE almacen_ingredientes
         SET stock_actual = stock_actual - ?
         WHERE tenant_id = ? AND id = ? AND stock_actual >= ?`,
        [cantidad, tenantId, ingredienteId, cantidad]
    );
    if (result.affectedRows === 0) {
        throw new Error(`Stock insuficiente para ingrediente ID ${ingredienteId}`);
    }
}
```

### 1.4 Config por tenant
```javascript
// [ALM-004] Si se permite stock negativo o no
{ permitir_stock_negativo: false }  // Si false, bloquea venta
{ umbral_aprobacion_ajuste: 100 }   // S/100+ requiere aprobacion admin
{ alerta_vencimiento_dias: 2 }      // Alertar 2 dias antes de vencimiento
```

---

## FASE 2: RECETAS - 2 semanas

### 2.1 Tablas

```sql
-- Recetas versionadas [REC-001]
CREATE TABLE recetas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    producto_id INT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    nombre_version VARCHAR(100) NULL,       -- 'Original', 'Reducida', 'Temporada'
    rendimiento_porciones DECIMAL(6,2) DEFAULT 1, -- [REC-003] Yield
    tiempo_preparacion_min INT NULL,        -- [REC-007] Minutos
    food_cost_objetivo_pct DECIMAL(5,2) NULL, -- [REC-006] 30% = 0.30
    activa TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, producto_id, version),
    INDEX idx_producto (tenant_id, producto_id, activa)
);

-- Items de receta
CREATE TABLE receta_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receta_id INT NOT NULL,
    ingrediente_id INT NULL,               -- FK almacen_ingredientes
    sub_receta_id INT NULL,                -- [REC-002] Referencia a otra receta (sub-receta)
    cantidad DECIMAL(10,3) NOT NULL,
    unidad_medida ENUM('kg','g','lt','ml','und') NOT NULL DEFAULT 'g',
    es_opcional TINYINT(1) DEFAULT 0,
    notas VARCHAR(200) NULL,
    FOREIGN KEY (receta_id) REFERENCES recetas(id) ON DELETE CASCADE,
    CHECK (ingrediente_id IS NOT NULL OR sub_receta_id IS NOT NULL)
);

-- Snapshot de costo al momento de facturar [REC-001]
-- Se almacena en detalle_facturas:
ALTER TABLE detalle_facturas ADD COLUMN costo_receta DECIMAL(10,4) NULL;
ALTER TABLE detalle_facturas ADD COLUMN receta_version INT NULL;
```

### 2.2 Sub-recetas [REC-002]

Ejemplo: "Leche de Tigre" es sub-receta usada en Ceviche, Tiradito, y como plato propio.
- Un `receta_items` puede referenciar `sub_receta_id` (otra receta)
- El costo se calcula en cascada
- Cambiar la sub-receta actualiza automaticamente todos los platos que la usan

### 2.3 Menu del dia / Combos [REC-005]

```sql
CREATE TABLE combos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,           -- 'Menu del dia', 'Promo 2x1'
    precio DECIMAL(10,2) NOT NULL,
    activo TINYINT(1) DEFAULT 1,
    fecha_inicio DATE NULL,
    fecha_fin DATE NULL,                    -- NULL = permanente
    hora_inicio TIME NULL,                  -- Para happy hour
    hora_fin TIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE combo_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    combo_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT DEFAULT 1,
    FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE
);
```

---

## FASE 3: CAJA REGISTRADORA - 2 semanas

### 3.1 Tablas

```sql
-- Turnos [CAJA-003]
CREATE TABLE turnos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    activo TINYINT(1) DEFAULT 1
);

-- Cajas con soporte multi-turno
CREATE TABLE cajas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    turno_id INT NULL,
    usuario_id INT NOT NULL,
    nombre_caja VARCHAR(50) DEFAULT 'Caja 1', -- Para multiples cajas fisicas
    fecha_apertura DATETIME NOT NULL,
    fecha_cierre DATETIME NULL,
    monto_apertura DECIMAL(10,2) NOT NULL DEFAULT 0,
    monto_cierre_sistema DECIMAL(10,2) NULL,
    monto_cierre_real DECIMAL(10,2) NULL,
    diferencia DECIMAL(10,2) NULL,
    -- [CAJA-001] Conteo por denominacion
    denominacion_cierre JSON NULL,
    -- Ej: {"b200":5,"b100":22,"b50":15,"b20":30,"b10":45,
    --      "m5":20,"m2":35,"m1":25,"m050":40}
    estado ENUM('abierta','cerrada') DEFAULT 'abierta',
    -- [CAJA-002] Umbral para cash drop
    umbral_efectivo DECIMAL(10,2) DEFAULT 1500,
    notas TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_estado (tenant_id, estado, fecha_apertura)
);

-- Movimientos de caja
CREATE TABLE caja_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    caja_id INT NOT NULL,
    tipo ENUM('ingreso','egreso') NOT NULL,
    concepto ENUM(
        'venta_factura','propina',
        'retiro_caja_fuerte','retiro_banco','retiro_propietario',
        'gasto_compra_almacen','gasto_servicio','gasto_otro',
        'pago_planilla','devolucion_cliente',
        'fondo_inicial','ajuste'
    ) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    metodo_pago_id INT NULL,                -- FK tabla metodos_pago
    referencia_tipo VARCHAR(50) NULL,
    referencia_id INT NULL,
    -- [CAJA-004] Propinas
    es_propina TINYINT(1) DEFAULT 0,
    -- [CAJA-006] Anulacion
    anulado TINYINT(1) DEFAULT 0,
    anulado_por INT NULL,
    anulado_motivo VARCHAR(200) NULL,
    -- Autorizacion para retiros
    autorizado_por INT NULL,
    usuario_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_caja (tenant_id, caja_id, created_at),
    INDEX idx_tipo (tenant_id, tipo, concepto)
);

-- [CAJA-005] Metodos de pago flexibles (no ENUM)
CREATE TABLE metodos_pago (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    tipo ENUM('efectivo','tarjeta','transferencia','digital','credito') NOT NULL,
    comision_pct DECIMAL(5,2) DEFAULT 0,    -- POS cobra 3.5%
    activo TINYINT(1) DEFAULT 1,
    UNIQUE(tenant_id, nombre)
);
-- Precarga: Efectivo, Visa POS, Mastercard POS, Yape, Plin, Transferencia BCP,
--           Transferencia Interbank, Transferencia BBVA, Credito casa
```

### 3.2 Validaciones criticas
- NO permitir facturar si no hay caja abierta [flujo Mesas→Caja]
- Alerta cuando efectivo en caja > umbral (S/1,500) → sugerir cash drop
- Solo admin puede anular movimientos
- Propina registrada separada del total de factura

---

## FASE 4: FACTURACION ELECTRONICA SUNAT - 3 semanas

> "Sin esto, el sistema no puede operar legalmente en Peru" - Ambos reviewers

### 4.1 Tablas

```sql
-- Comprobantes electronicos
CREATE TABLE comprobantes_electronicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    factura_id INT NOT NULL,
    tipo ENUM('boleta','factura','nota_credito','nota_debito') NOT NULL,
    serie VARCHAR(10) NOT NULL,
    correlativo INT NOT NULL,
    fecha_emision DATETIME NOT NULL,
    cliente_tipo_doc VARCHAR(5) NOT NULL,    -- '6'=RUC, '1'=DNI, '0'=sin doc
    cliente_num_doc VARCHAR(20) NOT NULL,
    cliente_razon_social VARCHAR(200) NOT NULL,
    subtotal_sin_igv DECIMAL(12,2) NOT NULL,
    igv DECIMAL(12,2) NOT NULL,             -- 18%
    total_con_igv DECIMAL(12,2) NOT NULL,
    xml_firmado LONGTEXT NULL,
    hash_cpe VARCHAR(100) NULL,
    qr_data TEXT NULL,
    codigo_sunat VARCHAR(10) NULL,
    mensaje_sunat TEXT NULL,
    pdf_url VARCHAR(300) NULL,
    estado ENUM('pendiente','aceptado','rechazado','anulado') DEFAULT 'pendiente',
    enviado_sunat_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, tipo, serie, correlativo),
    INDEX idx_fecha (tenant_id, fecha_emision)
);

-- Notas de credito [BD-001, FLUJO-001]
CREATE TABLE notas_credito (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    factura_id INT NOT NULL,
    comprobante_id INT NULL,
    motivo ENUM('devolucion','error_facturacion','descuento_posterior','anulacion') NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    items JSON NULL,
    estado ENUM('emitida','anulada') DEFAULT 'emitida',
    usuario_id INT NOT NULL,
    notas TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 Integracion con OSE
- Proveedor recomendado: **Nubefact** (API REST, popular en Peru, facil de integrar)
- Alternativa: SUNAT directo (gratis pero mas complejo)
- Generar XML UBL 2.1 firmado
- QR obligatorio en boletas desde 2023
- Envio automatico de comprobante por email

### 4.3 Cambios en factura existente
```sql
ALTER TABLE facturas ADD COLUMN subtotal_sin_igv DECIMAL(12,2);
ALTER TABLE facturas ADD COLUMN igv DECIMAL(12,2);
ALTER TABLE facturas ADD COLUMN total_con_igv DECIMAL(12,2);
ALTER TABLE facturas ADD COLUMN tipo_comprobante ENUM('boleta','factura','nota_venta','ticket');
ALTER TABLE facturas ADD COLUMN serie VARCHAR(10);
ALTER TABLE facturas ADD COLUMN correlativo INT;
ALTER TABLE facturas ADD COLUMN sunat_estado ENUM('pendiente','enviada','aceptada','rechazada');
ALTER TABLE facturas ADD COLUMN propina DECIMAL(10,2) DEFAULT 0;
```

### 4.4 Cambios en clientes
```sql
ALTER TABLE clientes ADD COLUMN tipo_documento ENUM('DNI','RUC','CE','PASAPORTE') DEFAULT 'DNI';
ALTER TABLE clientes ADD COLUMN numero_documento VARCHAR(20);
ALTER TABLE clientes ADD COLUMN email VARCHAR(150);
ALTER TABLE clientes ADD COLUMN razon_social VARCHAR(200);
```

### 4.5 Validacion RUC/DNI
- RUC: 11 digitos, algoritmo modulo 11, auto-completar razon social via API SUNAT
- DNI: 8 digitos, validacion via RENIEC (apiperu.dev)

---

## FASE 5: ADMINISTRACION / P&L - 2 semanas

### 5.1 Planilla real Peru [ADM-005]

```sql
CREATE TABLE personal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    usuario_id INT NULL,
    nombre VARCHAR(150) NOT NULL,
    dni VARCHAR(8) NULL,
    cargo VARCHAR(100) NOT NULL,
    tipo_contrato ENUM('planilla','recibo_honorarios','informal') DEFAULT 'planilla',
    tipo_pago ENUM('diario','semanal','quincenal','mensual') DEFAULT 'diario',
    monto_pago DECIMAL(10,2) NOT NULL,
    regimen_pension ENUM('onp','afp_integra','afp_prima','afp_profuturo','afp_habitat','ninguno') DEFAULT 'onp',
    fecha_ingreso DATE NULL,
    activo TINYINT(1) DEFAULT 1,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE planilla_pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    personal_id INT NOT NULL,
    fecha DATE NOT NULL,
    monto_bruto DECIMAL(10,2) NOT NULL,
    -- Deducciones Peru
    deduccion_onp_afp DECIMAL(10,2) DEFAULT 0,   -- 13% ONP o ~12.5% AFP
    deduccion_ir_5ta DECIMAL(10,2) DEFAULT 0,      -- Renta 5ta categoria
    monto_neto DECIMAL(10,2) NOT NULL,
    -- Aportes empleador
    aporte_essalud DECIMAL(10,2) DEFAULT 0,        -- 9%
    aporte_sctr DECIMAL(10,2) DEFAULT 0,           -- ~1.5%
    horas_trabajadas DECIMAL(5,2) NULL,
    notas VARCHAR(200) NULL,
    pagado TINYINT(1) DEFAULT 0,
    caja_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 Gastos con grupos del P&L [Cashflow Excel]

Categorias precargadas alineadas al Excel:
```
COMPRAS EXISTENCIAS: Producto terminado A/B, Semiterminado, Packaging
SERVICIOS ONLINE: Ecommerce, Correos, Cloud
MARKETING: Facebook Ads, Instagram Ads, Google Ads, YouTube Ads, Email Marketing
SUELDOS Y SALARIOS: (vinculado a tabla personal)
INMOVILIZADO: Alquiler, Seguro, Alarma, Fianzas, Suministros (Luz, Agua, Internet, Gas)
LEGAL Y FINANCIERO: Contador, Abogados, Comisiones bancarias, Otros financieros
OTROS GASTOS: Transportes, Viajes, Otros
```

### 5.3 P&L automatico [PyG Excel]
```
(+) Ventas (desde facturas, SIN IGV)
(-) COGS teorico (receta x ventas)
(-) COGS real (compras - inv_final + inv_inicial)    [3.3 del review]
(=) Margen Bruto
    Varianza operativa = COGS teorico - COGS real    [MarketMan feature]
(-) Gastos Administrativos
(-) Sueldos y salarios (con aportes reales)
(=) EBITDA
(-) Amortizaciones
(-) Provisiones
(=) EBIT
(+/-) Extraordinarios
(=) Resultado ordinario
(+/-) Financieros
(=) EBT
(-) IR Peru (segun regimen: RUS/RER/MYPE/General)   [ADM-004]
(=) BENEFICIO NETO
```

### 5.4 Presupuesto vs Real [ADM-006]
- Definir presupuesto mensual por categoria de gasto
- Alerta cuando gasto > 80% del presupuesto
- Comparacion visual en dashboard

### 5.5 Cuentas por pagar [ADM-007]
- Proveedores con dias de credito
- Reporte de deudas pendientes con vencimiento
- Alerta de pagos proximos a vencer

### 5.6 Conciliacion bancaria basica [ADM-003]
- Registrar depositos recibidos del procesador de tarjetas
- Comparar: ventas tarjeta del dia vs deposito (menos comision 3-4%)
- Dias de rezago (2-3 dias habiles)

---

## FASE 6: CANALES INTERNOS - 1 semana

### 6.1 Canales + mejoras de reviews

```sql
CREATE TABLE canales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(200) NULL,
    roles_permitidos JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mensajes con lectura separada [CAN-001]
CREATE TABLE canal_mensajes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    canal_id INT NOT NULL,
    usuario_id INT NULL,
    tipo ENUM('texto','alerta','sistema') DEFAULT 'texto',
    mensaje TEXT NOT NULL,
    prioridad ENUM('normal','alta','urgente') DEFAULT 'normal',
    pinned TINYINT(1) DEFAULT 0,            -- [CAN-002] Mensajes anclados
    pinned_until DATETIME NULL,              -- Expira automaticamente
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_canal (tenant_id, canal_id, created_at)
);

-- Tabla separada para leidos [CAN-001]
CREATE TABLE canal_mensajes_leidos (
    mensaje_id INT NOT NULL,
    usuario_id INT NOT NULL,
    leido_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mensaje_id, usuario_id)
);
```

### 6.2 WebSockets con Socket.IO + Redis adapter [ESC-005]
- Namespaces por tenant: `/tenant-123/cocina`
- Notificacion sonora para mensajes urgentes [CAN-003]
- Push notification via Service Worker

### 6.3 Canales predefinidos
- `#inventario` → Admin + Cocinero jefe
- `#meseros` → Admin + Meseros (platos no disponibles en tiempo real)
- `#cocina` → Admin + Cocineros (comunicacion bidireccional [CAN-004])
- `#administracion` → Solo Admin (cierres, reportes, alertas financieras)
- `#soporte` → Todos

---

## FASE 7: REPORTES - 1-2 semanas

### 7.1 Reporte diario PDF (9 secciones - ya detallado en plan V2)

### 7.2 Reportes adicionales [REP-001]

| Reporte | Frecuencia | Descripcion |
|---------|-----------|-------------|
| Comparativo semanal | Semanal | Ventas Lun vs Mar vs Mie... |
| Merma semanal | Semanal | Cuanto se perdio, por ingrediente, motivo |
| Productividad por mesero | Semanal | Mesas atendidas, ticket promedio, propinas |
| Platos de baja rotacion | Mensual | Platos que venden < X por semana |
| Rotacion de inventario | Mensual | Dias de inventario por ingrediente |
| ABC de ingredientes | Mensual | Pareto: 20% que es 80% del costo |
| Desempeno proveedor | Mensual | Cumplimiento, variacion precios, calidad |
| Tendencias | Mensual | Ventas por hora, dia semana, estacionalidad |
| Kardex valorizado | Mensual | Requerido por SUNAT |
| Food cost por categoria | Mensual | Benchmark: pescados 30%, carnes 35%... |
| Presupuesto vs Real | Mensual | Por categoria de gasto |
| P&L completo | Mensual | Con ratios ROS, ROE, ROA |

### 7.3 Formatos [REP-002]
- PDF (principal)
- Excel/CSV (para analisis)
- Envio automatico por email al administrador

### 7.4 Generacion async [ESC-003]
- Job queue con Bull + Redis
- No bloquea el servidor
- Notifica cuando esta listo

---

## FASE 8: FEATURES COMPETITIVOS - 3 semanas

### 8.1 Reservas [modulo nuevo]
```sql
CREATE TABLE reservas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    cliente_id INT NULL,
    mesa_id INT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    cantidad_personas INT NOT NULL,
    estado ENUM('pendiente','confirmada','sentada','completada','no_show','cancelada') DEFAULT 'pendiente',
    canal_origen ENUM('telefono','whatsapp','web','presencial','app') DEFAULT 'telefono',
    notas VARCHAR(300) NULL,
    confirmada_at TIMESTAMP NULL,
    usuario_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fecha (tenant_id, fecha, hora)
);
```
- Integracion con mesas (mesa reservada ≠ libre)
- Confirmacion por WhatsApp Business API [EXT-005]
- Vista calendario
- No-show tracking
- Liberacion automatica tras X minutos

### 8.2 Delivery / Para llevar [modulo nuevo]
```sql
CREATE TABLE pedidos_delivery (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    pedido_id INT NOT NULL,
    tipo ENUM('delivery','para_llevar') NOT NULL,
    plataforma ENUM('propio','rappi','pedidosya','ubereats','otro') DEFAULT 'propio',
    direccion TEXT NULL,
    telefono VARCHAR(20) NULL,
    repartidor VARCHAR(100) NULL,
    estado_entrega ENUM('preparando','en_camino','entregado','cancelado') DEFAULT 'preparando',
    tiempo_estimado_min INT NULL,
    comision_plataforma DECIMAL(10,2) DEFAULT 0,
    notas VARCHAR(300) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
- API para recibir pedidos de Rappi/PedidosYa/UberEats
- Comisiones como gasto automatico (20-30%)
- Impacto en inventario identico a ventas presenciales

### 8.3 Promociones y Descuentos [modulo nuevo]
```sql
CREATE TABLE promociones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo ENUM('porcentaje','monto_fijo','2x1','happy_hour','combo') NOT NULL,
    valor DECIMAL(10,2) NULL,
    codigo_cupon VARCHAR(50) NULL,
    fecha_inicio DATE NULL,
    fecha_fin DATE NULL,
    hora_inicio TIME NULL,                  -- Happy hour
    hora_fin TIME NULL,
    productos_aplicables JSON NULL,          -- [1,5,12] o null=todos
    usos_maximo INT NULL,
    usos_actual INT DEFAULT 0,
    activa TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE descuentos_aplicados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    factura_id INT NOT NULL,
    promocion_id INT NULL,
    tipo VARCHAR(50) NOT NULL,
    monto_descuento DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 8.4 Fidelizacion [modulo nuevo]
```sql
CREATE TABLE fidelidad_puntos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    cliente_id INT NOT NULL,
    puntos_acumulados INT DEFAULT 0,
    puntos_canjeados INT DEFAULT 0,
    puntos_disponibles INT DEFAULT 0,
    nivel ENUM('bronce','plata','oro','platino') DEFAULT 'bronce',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, cliente_id)
);

CREATE TABLE fidelidad_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    cliente_id INT NOT NULL,
    tipo ENUM('acumulacion','canje','vencimiento','ajuste') NOT NULL,
    puntos INT NOT NULL,
    factura_id INT NULL,
    descripcion VARCHAR(200) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
- Regla: 1 sol = 1 punto
- Canje: 100 puntos = S/5 de descuento (configurable)
- Niveles por acumulado anual

### 8.5 Menu Digital QR
- Pagina publica: `restaurante.dignita.tech/menu`
- QR en cada mesa que lleva al menu
- Fotos, precios, alergenos
- Platos no disponibles se ocultan automaticamente (segun stock)

### 8.6 Modificadores de plato [Square feature]
```sql
CREATE TABLE modificadores_grupo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,           -- 'Termino de coccion', 'Extras', 'Sin...'
    tipo ENUM('unico','multiple') DEFAULT 'unico',
    obligatorio TINYINT(1) DEFAULT 0
);

CREATE TABLE modificadores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grupo_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,           -- 'Termino medio', 'Sin cebolla', 'Extra aji'
    precio_adicional DECIMAL(10,2) DEFAULT 0,
    activo TINYINT(1) DEFAULT 1
);

CREATE TABLE producto_modificadores (
    producto_id INT NOT NULL,
    grupo_id INT NOT NULL,
    PRIMARY KEY (producto_id, grupo_id)
);
```

---

## FASE 9: IA CON VOZ + IA PREDICTIVA - 1 semana

### 9.1 Voz (Web Speech API)
- Boton microfono en chat
- `SpeechRecognition` → texto → enviar al chat
- `SpeechSynthesis` → leer respuesta en voz alta
- Toggle activar/desactivar
- Idioma: es-PE (español Peru)

### 9.2 IA Predictiva [IA-003]
- Prediccion de demanda por dia de la semana (basado en historico)
- Sugerencia de compras automatica (stock actual + consumo promedio diario)
- Deteccion de anomalias (ventas 40% menor al promedio → posible robo)
- Menu engineering: clasificar platos en Estrellas/Vacas/Perros/Puzzles

---

## FASE 10: MODO OFFLINE (PWA) - 2 semanas

> "Una caida de internet paraliza un restaurante con 250 clientes" - Analista Senior

### 10.1 Implementacion
- Service Worker para cache de assets (CSS, JS, imagenes)
- IndexedDB para datos criticos (productos, precios, recetas, clientes frecuentes)
- Cola de transacciones offline (facturas, movimientos caja, pedidos)
- Sincronizacion al reconectar
- Indicador visual online/offline en toda la app
- Impresion de tickets desde cache local

### 10.2 Datos en cache
```
Criticos (siempre disponibles offline):
- Lista de productos con precios
- Recetas (para calcular costos)
- Clientes frecuentes (ultimos 100)
- Mesas y sus estados
- Configuracion de impresion

Se sincronizan al reconectar:
- Facturas generadas offline
- Movimientos de caja
- Pedidos enviados a cocina
- Cambios de stock
```

---

## FASE 11: SaaS MULTI-TENANT - 3-4 semanas

### 11.1 Tablas
```sql
CREATE TABLE tenants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    subdominio VARCHAR(100) NOT NULL UNIQUE, -- elmarineritopicante
    plan ENUM('free','pro','enterprise') DEFAULT 'free',
    ruc VARCHAR(20) NULL,
    email_admin VARCHAR(150) NOT NULL,
    logo_url VARCHAR(500) NULL,
    config JSON NULL,
    activo TINYINT(1) DEFAULT 1,
    fecha_inicio DATE NOT NULL,
    fecha_vencimiento DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenant_suscripciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    plan ENUM('free','pro','enterprise') NOT NULL,
    precio_mensual DECIMAL(10,2) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NULL,
    estado ENUM('activa','vencida','cancelada','prueba') DEFAULT 'prueba',
    metodo_pago VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 11.2 Panel super-admin
- Dashboard de todos los tenants
- Metricas por tenant (uso, facturas, almacenamiento)
- Suspender/reactivar
- Impersonar (login como tenant para soporte)
- Gestion de planes

### 11.3 Limites por plan [MT-003]
```javascript
const PLAN_LIMITS = {
    free: { usuarios: 1, mesas: 10, productos: 50, almacen: false, recetas: false,
            caja: false, reportes_pdf: false, ia_voz: false, canales: false },
    pro:  { usuarios: -1, mesas: -1, productos: -1, almacen: true, recetas: true,
            caja: true, reportes_pdf: true, ia_voz: true, canales: true },
    enterprise: { /* todo ilimitado + multi-sucursal + API propia */ }
};
```

### 11.4 Seguridad multi-tenant
- Tests automatizados que validen aislamiento de datos
- Audit log de accesos cross-tenant
- Backup/restore individual por tenant

---

## MODELO DE DATOS FINAL (todas las tablas)

```
CORE (existentes + modificadas):
  tenants, usuarios, roles, productos, clientes, mesas,
  pedidos, pedido_items, facturas, detalle_facturas

ALMACEN (14 tablas):
  almacen_categorias, proveedores, almacen_ingredientes, almacen_lotes,
  ordenes_compra, orden_compra_items, inspeccion_recepcion,
  almacen_movimientos, almacen_historial_diario, almacen_conteo_fisico,
  almacen_temperaturas

RECETAS (4 tablas):
  recetas, receta_items, combos, combo_items

CAJA (3 tablas):
  turnos, cajas, caja_movimientos, metodos_pago

SUNAT (2 tablas):
  comprobantes_electronicos, notas_credito

ADMIN (4 tablas):
  personal, planilla_pagos, gastos_categorias, gastos

CANALES (3 tablas):
  canales, canal_mensajes, canal_mensajes_leidos

FEATURES (7 tablas):
  reservas, pedidos_delivery, promociones, descuentos_aplicados,
  fidelidad_puntos, fidelidad_movimientos,
  modificadores_grupo, modificadores, producto_modificadores

SISTEMA (3 tablas):
  audit_log, tenant_suscripciones, configuracion_impresion

TOTAL: ~45 tablas
```

---

## TIMELINE VISUAL

```
Semana  1  2  3  4  5  6  7  8  9  10  11  12  13  14  15  16  17  18  19  20
FASE 0  ████████                                                              Fundamentos
FASE 1           █████████████                                                 Almacen
FASE 2                        ████████                                         Recetas
FASE 3                                 ████████                                Caja
FASE 4                                          █████████████                  SUNAT
FASE 5                                                        ████████        Admin/P&L
FASE 6                                                                 ████   Canales
FASE 7                                                                 ████   Reportes
FASE 8                                                                     ██████████  Features
FASE 9                                                                     ████         IA Voz
FASE 10                                                                        ████████ Offline
FASE 11                                                                            ████████████ SaaS
```

---

**NOTA**: Este plan incorpora los 104 hallazgos de ambos especialistas.
Cada fase es incremental - el sistema sigue funcionando mientras se construye.
Prioridad absoluta: Fase 0 (seguridad) → Fase 1 (almacen) → Fase 4 (SUNAT).

**Creado por**: Leonidas Yauri, CEO dignita.tech
**Revisado por**: Arquitecto SaaS Senior (30+ anos) + Analista de Sistemas Senior (30+ anos)
