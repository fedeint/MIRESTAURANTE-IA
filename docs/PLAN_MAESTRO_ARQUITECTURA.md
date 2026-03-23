# PLAN MAESTRO TECNICO - MIREST CON IA
## Sistema ERP para Restaurantes - Arquitectura y Especificacion de Modulos

**Version:** 1.0
**Fecha:** 2026-03-22
**Autor:** Arquitectura & Business Analysis
**Deadline:** 1 mes (2026-04-22)
**Stack base:** Node.js / Express / PostgreSQL / EJS / Service Worker

---

## INDICE

1. [Arquitectura Tecnica General](#1-arquitectura-tecnica-general)
2. [Modelo de Datos - Tablas Nuevas](#2-modelo-de-datos---tablas-nuevas)
3. [Especificacion por Modulo](#3-especificacion-por-modulo)
4. [Integraciones Externas](#4-integraciones-externas)
5. [Seguridad y Multi-tenancy](#5-seguridad-y-multi-tenancy)
6. [Roadmap de Implementacion](#6-roadmap-de-implementacion)

---

## 1. ARQUITECTURA TECNICA GENERAL

### 1.1 Vision de Capas del Sistema

```
+===========================================================================+
|                          CLIENTES / USUARIOS                              |
|   Navegador Web   |   App PWA (offline)   |   Camara IP Reolink (RTSP)   |
+===========================================================================+
          |                    |                          |
          v                    v                          v
+------------------+  +------------------+  +------------------------+
|   Nginx / CDN    |  |  Service Worker  |  |  CompreFace / YOLO     |
|  (proxy, SSL)    |  |  IndexedDB Sync  |  |  (Docker sidecar)      |
+------------------+  +------------------+  +------------------------+
          |                    |                          |
          +--------------------+--------------------------+
                               |
          +====================v===========================+
          |          NODE.JS / EXPRESS - CORE API          |
          |                                                 |
          |  +----------+  +----------+  +-------------+   |
          |  | Auth MW  |  | Tenant   |  | Rate Limit  |   |
          |  | JWT+Sess |  | Resolver |  | Helmet CORS |   |
          |  +----------+  +----------+  +-------------+   |
          |                                                 |
          |  MODULOS ACTUALES:                              |
          |  POS | Almacen | Recetas | SUNAT | Caja        |
          |  Observabilidad | Onboarding | Chat (DalIA)     |
          |                                                 |
          |  MODULOS NUEVOS (este plan):                    |
          |  SOSTAC | CRM+ | RRHH | Contabilidad            |
          |  Delivery | Agentes IA | Camara/Asistencia      |
          +====================+===========================+
                               |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
  +---------------+  +------------------+  +---------------+
  | PostgreSQL    |  | Servicios Ext.   |  | Workers Async |
  | (multi-tenant)|  |                  |  |               |
  |               |  | - NubeFact SUNAT |  | - Bull Queue  |
  | Core tables   |  | - Anthropic API  |  | - Cron Jobs   |
  | + 47 nuevas   |  | - Rappi API      |  | - Face Recog  |
  | tablas        |  | - Grafana Cloud  |  | - People Count|
  | (ver seccion  |  | - Twilio/Meta WA |  | - AI Agents   |
  |  2)           |  | - CompreFace     |  |   Scheduler   |
  +---------------+  +------------------+  +---------------+
```

### 1.2 Flujo de Datos - Ciclo Operativo Completo

```
[CLIENTE ENTRA AL LOCAL]
        |
        v
[Camera Reolink RTSP] --> [YOLO People Counter] --> [conteo_afluencia]
        |
        v
[MESERO - Mesa/Pedido] --> [pedido_items] --> [cocina (WebSocket)]
        |                                           |
        |                                    [timer_prioridad]
        v                                           |
[CIERRE - Factura/SUNAT] <------------------------ v
        |                               [item listo -> notifica mesero]
        v
[CRM: historial_compras] --> [segmentacion_clientes]
        |
        v
[CONTABILIDAD: asiento automatico] --> [P&L / Balance]
        |
        v
[SOSTAC: Pulse analiza] --> [DalIA propone accion]
        |
        v
[AGENTE IA ejecuta] <-- [aprobacion admin si riesgo alto]
```

### 1.3 Arquitectura de Agentes IA (FASE 5)

```
+----------------------------------------------------------+
|                    DalIA - ORQUESTADOR                    |
|              (Anthropic Claude + Function Calling)        |
+----------------------------------------------------------+
     |          |         |         |         |        |
     v          v         v         v         v        v
+--------+ +--------+ +------+ +------+ +-------+ +------+
| Agente | | Agente | |Agent | |Agent | | Agent | |Agent |
|MARKET. | | VENTAS | | RRHH | |LEGAL | |FINANZ.| |OPER. |
+--------+ +--------+ +------+ +------+ +-------+ +------+
     |          |         |         |         |        |
     +----------+---------+---------+---------+--------+
                               |
                    +----------v-----------+
                    |   KNOWLEDGE BASE      |
                    |   (por tenant)        |
                    |   - Historial ventas  |
                    |   - Recetas/costos    |
                    |   - Clientes/CRM      |
                    |   - Lo que funciono   |
                    +----------+-----------+
                               |
                    +----------v-----------+
                    |  SISTEMA DE APROBACION|
                    |  riesgo_bajo -> auto  |
                    |  riesgo_medio -> noti |
                    |  riesgo_alto -> block |
                    +----------------------+
```

### 1.4 Arquitectura Multi-Tenant - Patron de Aislamiento

Todos los modulos nuevos heredan el patron ya establecido:

```
Cada query critica lleva: WHERE tenant_id = $tenantId

Middleware: req.tenantId (resuelto desde session o subdomain)
Indices: TODOS los indices compuestos arrancan con (tenant_id, ...)
RLS opcional en PostgreSQL para capa extra de seguridad
```

### 1.5 Comunicacion en Tiempo Real

```
WebSocket (Socket.io ya existente):
  - Cocina: timer actualizado cada segundo
  - Mesero: disponibilidad de ingredientes (push desde almacen)
  - Delivery: estado del pedido Rappi
  - Agentes IA: progreso de tarea en curso

SSE (Server-Sent Events) para:
  - Dashboard SOSTAC Pulse (actualizaciones de KPIs)
  - Notificaciones de asistencia (facial recog)
  - Alertas de stock critico
```

---

## 2. MODELO DE DATOS - TABLAS NUEVAS

### 2.1 Resumen de Tablas por Modulo

| Modulo | Tablas Nuevas | Tablas Modificadas |
|---|---|---|
| FASE 0 - Cocina/Delivery | delivery_pedidos, delivery_items, cocina_timers | pedidos, pedido_items, productos |
| FASE 1 - SOSTAC | sostac_sesiones, sostac_analisis, sostac_objetivos, sostac_tacticas, sostac_acciones, sostac_control | tenants |
| FASE 2 - CRM | crm_clientes, crm_historial_compras, crm_segmentos, crm_segmento_clientes, crm_programas_fidelidad, crm_puntos, crm_campanas, crm_campana_envios | clientes |
| FASE 3 - RRHH | rrhh_empleados, rrhh_turnos, rrhh_asignacion_turnos, rrhh_asistencia, rrhh_reconocimiento_facial, afluencia_conteo | usuarios |
| FASE 4 - Contabilidad | cont_plan_cuentas, cont_asientos, cont_asiento_lineas, cont_periodos, cont_presupuestos, cont_presupuesto_lineas | facturas |
| FASE 5 - Agentes IA | ia_agentes, ia_sesiones, ia_tareas, ia_aprobaciones, ia_memoria_estrategica, ia_knowledge_base | - |
| FASE 6 - Camaras | cam_dispositivos, cam_eventos, cam_embeddings_faciales | rrhh_empleados |

**Total: 35 tablas nuevas, 8 tablas modificadas**

---

### 2.2 FASE 0 - Cocina y Delivery

```sql
-- ============================================================
-- MIGRATION: 001_fase0_cocina_delivery.sql
-- ============================================================

-- Timer de cocina por item (prioridad y alertas)
-- Relacionado con: routes/cocina.js, views/cocina.ejs
CREATE TABLE IF NOT EXISTS cocina_timers (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    pedido_item_id  INTEGER NOT NULL REFERENCES pedido_items(id),
    pedido_id       INTEGER NOT NULL REFERENCES pedidos(id),
    mesa_numero     VARCHAR(20),
    producto_nombre VARCHAR(150),
    enviado_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    alerta_amarilla_at TIMESTAMP,   -- umbral 1: advertencia (ej: 8 min)
    alerta_roja_at  TIMESTAMP,      -- umbral 2: urgente (ej: 15 min)
    prioridad       SMALLINT DEFAULT 0,   -- 0=normal, 1=urgente, 2=VIP
    completado_at   TIMESTAMP,
    minutos_config_amarillo INTEGER DEFAULT 8,
    minutos_config_rojo     INTEGER DEFAULT 15,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cocina_timers_tenant_activo
    ON cocina_timers(tenant_id, completado_at)
    WHERE completado_at IS NULL;

-- Configuracion de umbrales por tenant
ALTER TABLE configuracion_impresion
    ADD COLUMN IF NOT EXISTS cocina_umbral_amarillo_min INTEGER DEFAULT 8,
    ADD COLUMN IF NOT EXISTS cocina_umbral_rojo_min INTEGER DEFAULT 15,
    ADD COLUMN IF NOT EXISTS cocina_audio_alerta BOOLEAN DEFAULT true;

-- Delivery: pedidos via Rappi (y futuro: PedidosYa, propio)
-- Relacionado con: routes/delivery.js (nuevo)
CREATE TABLE IF NOT EXISTS delivery_pedidos (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    origen          VARCHAR(30) NOT NULL DEFAULT 'rappi', -- rappi | pedidosya | propio
    origen_orden_id VARCHAR(100) UNIQUE,    -- ID del pedido en Rappi
    estado          VARCHAR(30) NOT NULL DEFAULT 'recibido',
    -- Estados: recibido | confirmado | en_cocina | listo | en_camino | entregado | cancelado
    cliente_nombre  VARCHAR(150),
    cliente_telefono VARCHAR(30),
    cliente_direccion TEXT,
    subtotal        DECIMAL(10,2) DEFAULT 0,
    total           DECIMAL(10,2) DEFAULT 0,
    comision_rappi  DECIMAL(10,2) DEFAULT 0,
    instrucciones   TEXT,
    tiempo_estimado_min INTEGER,
    webhook_payload JSONB,    -- payload crudo de Rappi para trazabilidad
    pedido_id       INTEGER REFERENCES pedidos(id),   -- pedido interno generado
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_delivery_tenant_estado
    ON delivery_pedidos(tenant_id, estado, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_items (
    id                  BIGSERIAL PRIMARY KEY,
    delivery_pedido_id  BIGINT NOT NULL REFERENCES delivery_pedidos(id),
    nombre_producto     VARCHAR(150) NOT NULL,
    producto_id         INTEGER REFERENCES productos(id),
    cantidad            DECIMAL(10,2) NOT NULL DEFAULT 1,
    precio_unitario     DECIMAL(10,2) NOT NULL,
    subtotal            DECIMAL(10,2) NOT NULL,
    nota                TEXT
);

-- Separacion receta <-> producto: columna flag en productos
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS es_plato_menu  BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS visible_carta  BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS categoria_menu VARCHAR(80),
    ADD COLUMN IF NOT EXISTS orden_carta    SMALLINT DEFAULT 0;

-- Disponibilidad en tiempo real (para mesero)
-- Se actualiza cuando el almacen cambia stock
CREATE TABLE IF NOT EXISTS producto_disponibilidad (
    tenant_id       INTEGER NOT NULL,
    producto_id     INTEGER NOT NULL,
    disponible      BOOLEAN NOT NULL DEFAULT true,
    razon_no_disp   VARCHAR(200),  -- "Sin harina (falta 200g)"
    actualizado_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (tenant_id, producto_id)
);
```

---

### 2.3 FASE 1 - SOSTAC (Cerebro Estrategico)

```sql
-- ============================================================
-- MIGRATION: 002_fase1_sostac.sql
-- ============================================================

-- Sesion de Brief Express (entrevista IA al dueno)
CREATE TABLE IF NOT EXISTS sostac_sesiones (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
    tipo            VARCHAR(30) DEFAULT 'brief_inicial',
    -- tipos: brief_inicial | revision_mensual | crisis | expansion
    estado          VARCHAR(20) DEFAULT 'en_curso',
    -- estados: en_curso | completado | abandonado
    preguntas_total SMALLINT DEFAULT 0,
    preguntas_resp  SMALLINT DEFAULT 0,
    transcripcion   JSONB,   -- [{rol, contenido, ts}]
    resumen_ia      TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    completado_at   TIMESTAMP
);
CREATE INDEX idx_sostac_sesiones_tenant
    ON sostac_sesiones(tenant_id, created_at DESC);

-- Analisis situacional auto-generado desde datos POS
CREATE TABLE IF NOT EXISTS sostac_analisis (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    periodo_inicio  DATE NOT NULL,
    periodo_fin     DATE NOT NULL,
    tipo            VARCHAR(30) DEFAULT 'situacional',
    -- tipos: situacional | mercado | competencia | foda
    datos_fuente    JSONB,   -- snapshot de KPIs al momento del analisis
    contenido_ia    TEXT,    -- analisis narrativo generado por Claude
    fortalezas      JSONB,   -- array de strings
    debilidades     JSONB,
    oportunidades   JSONB,
    amenazas        JSONB,
    tokens_usados   INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sostac_analisis_tenant
    ON sostac_analisis(tenant_id, created_at DESC);

-- Objetivos SMART / OKRs
CREATE TABLE IF NOT EXISTS sostac_objetivos (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    titulo          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    tipo            VARCHAR(20) DEFAULT 'okr',  -- okr | smart | kpi
    area            VARCHAR(30),
    -- areas: ventas | costos | clientes | personal | operaciones | marketing
    valor_meta      DECIMAL(15,2),
    unidad_meta     VARCHAR(50),   -- "S/", "%", "clientes", "min"
    valor_actual    DECIMAL(15,2) DEFAULT 0,
    fecha_inicio    DATE,
    fecha_fin       DATE,
    estado          VARCHAR(20) DEFAULT 'activo',
    -- estados: activo | logrado | fallido | pausado
    padre_id        INTEGER REFERENCES sostac_objetivos(id),  -- OKR jerarquia
    prioridad       SMALLINT DEFAULT 2,  -- 1=alta, 2=media, 3=baja
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Tacticas (como lograr cada objetivo)
CREATE TABLE IF NOT EXISTS sostac_tacticas (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    objetivo_id     INTEGER REFERENCES sostac_objetivos(id),
    titulo          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    canal           VARCHAR(50),  -- redes_sociales | whatsapp | local | precio | menu
    responsable_id  INTEGER REFERENCES usuarios(id),
    presupuesto     DECIMAL(10,2) DEFAULT 0,
    estado          VARCHAR(20) DEFAULT 'pendiente',
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Acciones concretas (tareas diarias/semanales)
CREATE TABLE IF NOT EXISTS sostac_acciones (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    tactica_id      INTEGER REFERENCES sostac_tacticas(id),
    titulo          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    responsable_id  INTEGER REFERENCES usuarios(id),
    fecha_limite    DATE,
    estado          VARCHAR(20) DEFAULT 'pendiente',
    -- estados: pendiente | en_progreso | completado | cancelado
    resultado       TEXT,
    completado_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Control: registro de medicion de resultados
CREATE TABLE IF NOT EXISTS sostac_control (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    objetivo_id     INTEGER REFERENCES sostac_objetivos(id),
    fecha_medicion  DATE NOT NULL,
    valor_medido    DECIMAL(15,2) NOT NULL,
    valor_meta      DECIMAL(15,2),
    cumplimiento_pct DECIMAL(5,2),
    nota            TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sostac_control_tenant
    ON sostac_control(tenant_id, fecha_medicion DESC);

-- Pulse: propuestas IA para decision del dueno
CREATE TABLE IF NOT EXISTS sostac_pulse (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    tipo            VARCHAR(50) NOT NULL,
    -- tipos: alerta_stock | oportunidad_venta | ajuste_precio |
    --        campana_crm | reduccion_costo | contratacion
    titulo          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    impacto_estimado DECIMAL(10,2),
    urgencia        SMALLINT DEFAULT 2,  -- 1=alta, 2=media, 3=baja
    datos_soporte   JSONB,
    estado          VARCHAR(20) DEFAULT 'pendiente',
    -- estados: pendiente | aceptado | rechazado | ejecutado
    accion_generada_id INTEGER REFERENCES sostac_acciones(id),
    created_at      TIMESTAMP DEFAULT NOW(),
    respondido_at   TIMESTAMP
);
CREATE INDEX idx_sostac_pulse_tenant_estado
    ON sostac_pulse(tenant_id, estado, urgencia);
```

---

### 2.4 FASE 2 - CRM

```sql
-- ============================================================
-- MIGRATION: 003_fase2_crm.sql
-- ============================================================

-- Enriquecer tabla clientes existente
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS tenant_id      INTEGER,
    ADD COLUMN IF NOT EXISTS email          VARCHAR(150),
    ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
    ADD COLUMN IF NOT EXISTS genero         VARCHAR(10),
    ADD COLUMN IF NOT EXISTS canal_captacion VARCHAR(30) DEFAULT 'presencial',
    -- canales: presencial | rappi | whatsapp | referido | online
    ADD COLUMN IF NOT EXISTS primera_visita DATE,
    ADD COLUMN IF NOT EXISTS ultima_visita  DATE,
    ADD COLUMN IF NOT EXISTS total_visitas  INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ticket_promedio DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ltv            DECIMAL(12,2) DEFAULT 0, -- lifetime value
    ADD COLUMN IF NOT EXISTS activo         BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS notas_crm      TEXT,
    ADD COLUMN IF NOT EXISTS tags           JSONB DEFAULT '[]';

-- Historial de compras consolidado (se alimenta desde facturas)
CREATE TABLE IF NOT EXISTS crm_historial_compras (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    factura_id      INTEGER REFERENCES facturas(id),
    delivery_pedido_id BIGINT REFERENCES delivery_pedidos(id),
    fecha           TIMESTAMP NOT NULL,
    total           DECIMAL(10,2) NOT NULL,
    items_resumen   JSONB,  -- [{nombre, cantidad, precio}]
    canal           VARCHAR(30) DEFAULT 'presencial',
    nps_score       SMALLINT,  -- 0-10 puntuacion NPS
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_crm_historial_tenant_cliente
    ON crm_historial_compras(tenant_id, cliente_id, fecha DESC);

-- Segmentos de clientes
CREATE TABLE IF NOT EXISTS crm_segmentos (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    tipo            VARCHAR(20) DEFAULT 'manual',  -- manual | automatico | rfm
    criterios       JSONB,   -- reglas para segmento automatico
    -- Ejemplo RFM: {"recencia_max_dias": 30, "frecuencia_min": 4, "ticket_min": 50}
    color           VARCHAR(7) DEFAULT '#3B82F6',
    activo          BOOLEAN DEFAULT true,
    total_clientes  INTEGER DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW(),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_segmento_clientes (
    segmento_id     INTEGER NOT NULL REFERENCES crm_segmentos(id),
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    score_rfm       DECIMAL(5,2),
    asignado_at     TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (segmento_id, cliente_id)
);

-- Programas de fidelidad
CREATE TABLE IF NOT EXISTS crm_programas_fidelidad (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    tipo            VARCHAR(30) DEFAULT 'puntos',
    -- tipos: puntos | visitas | cashback | nivel
    puntos_por_sol  DECIMAL(5,2) DEFAULT 1.0,   -- puntos ganados por cada S/ gastado
    sol_por_punto   DECIMAL(5,2) DEFAULT 0.1,   -- valor de cada punto en S/
    visitas_para_premio INTEGER,  -- para tipo 'visitas'
    activo          BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Saldo de puntos por cliente
CREATE TABLE IF NOT EXISTS crm_puntos (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    programa_id     INTEGER REFERENCES crm_programas_fidelidad(id),
    movimiento      VARCHAR(20) NOT NULL, -- ganado | canjeado | vencido | ajuste
    puntos          DECIMAL(10,2) NOT NULL,
    saldo_post      DECIMAL(10,2) NOT NULL,
    referencia      VARCHAR(100),  -- factura_id, etc.
    nota            TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_crm_puntos_tenant_cliente
    ON crm_puntos(tenant_id, cliente_id, created_at DESC);

-- Campanas de marketing
CREATE TABLE IF NOT EXISTS crm_campanas (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    nombre          VARCHAR(150) NOT NULL,
    tipo            VARCHAR(30) NOT NULL,
    -- tipos: whatsapp | email | push | descuento | combo
    segmento_id     INTEGER REFERENCES crm_segmentos(id),
    mensaje         TEXT,
    imagen_url      TEXT,
    descuento_pct   DECIMAL(5,2),
    descuento_fijo  DECIMAL(10,2),
    codigo_promo    VARCHAR(30),
    fecha_inicio    DATE,
    fecha_fin       DATE,
    estado          VARCHAR(20) DEFAULT 'borrador',
    -- estados: borrador | activa | pausada | finalizada
    presupuesto     DECIMAL(10,2),
    enviados        INTEGER DEFAULT 0,
    abiertos        INTEGER DEFAULT 0,
    convertidos     INTEGER DEFAULT 0,
    ingreso_generado DECIMAL(12,2) DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_campana_envios (
    id              BIGSERIAL PRIMARY KEY,
    campana_id      INTEGER NOT NULL REFERENCES crm_campanas(id),
    cliente_id      INTEGER NOT NULL REFERENCES clientes(id),
    canal           VARCHAR(20),
    estado          VARCHAR(20) DEFAULT 'pendiente',
    -- estados: pendiente | enviado | abierto | convertido | fallido
    enviado_at      TIMESTAMP,
    abierto_at      TIMESTAMP,
    convertido_at   TIMESTAMP,
    error           TEXT
);
```

---

### 2.5 FASE 3 - RRHH

```sql
-- ============================================================
-- MIGRATION: 004_fase3_rrhh.sql
-- ============================================================

-- Empleados (extiende usuarios con datos laborales)
CREATE TABLE IF NOT EXISTS rrhh_empleados (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    usuario_id      INTEGER REFERENCES usuarios(id),
    nombre_completo VARCHAR(150) NOT NULL,
    dni             VARCHAR(20),
    telefono        VARCHAR(30),
    cargo           VARCHAR(80),
    -- cargos: administrador | mesero | cocinero | cajero | delivery | limpieza
    tipo_contrato   VARCHAR(30) DEFAULT 'planilla',
    -- tipos: planilla | por_horas | services | propietario
    salario_base    DECIMAL(10,2) DEFAULT 0,
    salario_por_hora DECIMAL(8,2) DEFAULT 0,
    horas_semana    SMALLINT DEFAULT 48,
    fecha_ingreso   DATE,
    fecha_cese      DATE,
    estado          VARCHAR(20) DEFAULT 'activo',
    foto_url        TEXT,
    embedding_facial JSONB,  -- vector facial de CompreFace (referencia)
    compreface_subject_id VARCHAR(100),  -- ID en CompreFace
    banco            VARCHAR(50),
    cuenta_bancaria  VARCHAR(30),
    cts_banco        VARCHAR(50),
    cts_cuenta       VARCHAR(30),
    notas            TEXT,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_rrhh_empleados_tenant
    ON rrhh_empleados(tenant_id, estado);

-- Turnos (plantillas de horario)
CREATE TABLE IF NOT EXISTS rrhh_turnos (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    nombre          VARCHAR(80) NOT NULL,  -- "Turno Manana", "Turno Noche"
    hora_inicio     TIME NOT NULL,
    hora_fin        TIME NOT NULL,
    dias_semana     JSONB DEFAULT '[1,2,3,4,5]',
    -- 1=Lunes .. 7=Domingo (ISO)
    tolerancia_min  SMALLINT DEFAULT 10,
    activo          BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Asignacion de turnos a empleados
CREATE TABLE IF NOT EXISTS rrhh_asignacion_turnos (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    empleado_id     INTEGER NOT NULL REFERENCES rrhh_empleados(id),
    turno_id        INTEGER NOT NULL REFERENCES rrhh_turnos(id),
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE,  -- NULL = indefinido
    notas           TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Registro de asistencia
CREATE TABLE IF NOT EXISTS rrhh_asistencia (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    empleado_id     INTEGER NOT NULL REFERENCES rrhh_empleados(id),
    fecha           DATE NOT NULL,
    entrada_at      TIMESTAMP,
    salida_at       TIMESTAMP,
    metodo_entrada  VARCHAR(20) DEFAULT 'manual',
    -- metodos: facial | pin | manual | admin
    metodo_salida   VARCHAR(20) DEFAULT 'manual',
    horas_trabajadas DECIMAL(5,2),
    horas_extras    DECIMAL(5,2) DEFAULT 0,
    estado          VARCHAR(20) DEFAULT 'presente',
    -- estados: presente | tardanza | falta | falta_justificada | feriado
    justificacion   TEXT,
    aprobado_por    INTEGER REFERENCES usuarios(id),
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, empleado_id, fecha)
);
CREATE INDEX idx_rrhh_asistencia_tenant_fecha
    ON rrhh_asistencia(tenant_id, fecha DESC);

-- Eventos de reconocimiento facial (log detallado)
CREATE TABLE IF NOT EXISTS rrhh_reconocimiento_facial (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    empleado_id     INTEGER REFERENCES rrhh_empleados(id),
    camara_id       INTEGER,    -- referencias a cam_dispositivos
    tipo_evento     VARCHAR(20) NOT NULL,  -- entrada | salida | no_reconocido
    confianza       DECIMAL(5,4),   -- 0.0 a 1.0 (score de CompreFace)
    imagen_ref_url  TEXT,
    procesado_at    TIMESTAMP DEFAULT NOW(),
    asistencia_id   BIGINT REFERENCES rrhh_asistencia(id)
);
CREATE INDEX idx_facial_tenant_fecha
    ON rrhh_reconocimiento_facial(tenant_id, procesado_at DESC);

-- Conteo de afluencia (personas que entran al local)
CREATE TABLE IF NOT EXISTS afluencia_conteo (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    camara_id       INTEGER,
    fecha           DATE NOT NULL,
    hora            SMALLINT NOT NULL,   -- 0-23
    entradas        INTEGER DEFAULT 0,
    salidas         INTEGER DEFAULT 0,
    personas_dentro INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, camara_id, fecha, hora)
);
CREATE INDEX idx_afluencia_tenant_fecha
    ON afluencia_conteo(tenant_id, fecha DESC);
```

---

### 2.6 FASE 4 - Contabilidad

```sql
-- ============================================================
-- MIGRATION: 005_fase4_contabilidad.sql
-- ============================================================

-- Plan de cuentas (PCGE Peru adaptado)
CREATE TABLE IF NOT EXISTS cont_plan_cuentas (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    codigo          VARCHAR(20) NOT NULL,
    nombre          VARCHAR(150) NOT NULL,
    tipo            VARCHAR(20) NOT NULL,
    -- tipos: activo | pasivo | patrimonio | ingreso | gasto | costo
    naturaleza      VARCHAR(10) NOT NULL,   -- deudora | acreedora
    nivel           SMALLINT DEFAULT 1,     -- 1=mayor, 2=sub, 3=analitica
    padre_id        INTEGER REFERENCES cont_plan_cuentas(id),
    acepta_movimiento BOOLEAN DEFAULT true,
    activo          BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, codigo)
);
CREATE INDEX idx_cont_cuentas_tenant
    ON cont_plan_cuentas(tenant_id, codigo);

-- Periodos contables
CREATE TABLE IF NOT EXISTS cont_periodos (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    anio            SMALLINT NOT NULL,
    mes             SMALLINT NOT NULL,   -- 1-12
    nombre          VARCHAR(50),
    estado          VARCHAR(20) DEFAULT 'abierto',   -- abierto | cerrado
    cerrado_por     INTEGER REFERENCES usuarios(id),
    cerrado_at      TIMESTAMP,
    UNIQUE (tenant_id, anio, mes)
);

-- Asientos contables
CREATE TABLE IF NOT EXISTS cont_asientos (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    periodo_id      INTEGER NOT NULL REFERENCES cont_periodos(id),
    numero          VARCHAR(20) NOT NULL,     -- correlativo por tenant/periodo
    fecha           DATE NOT NULL,
    descripcion     VARCHAR(300) NOT NULL,
    origen          VARCHAR(30) DEFAULT 'manual',
    -- origenes: manual | pos_venta | pos_gasto | compra | planilla | ajuste
    origen_id       BIGINT,   -- factura_id, gasto_id, etc.
    estado          VARCHAR(20) DEFAULT 'borrador',
    -- estados: borrador | aprobado | anulado
    total_debe      DECIMAL(14,2) DEFAULT 0,
    total_haber     DECIMAL(14,2) DEFAULT 0,
    aprobado_por    INTEGER REFERENCES usuarios(id),
    created_by      INTEGER REFERENCES usuarios(id),
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, numero)
);
CREATE INDEX idx_cont_asientos_tenant_fecha
    ON cont_asientos(tenant_id, fecha DESC);

-- Lineas del asiento (partidas dobles)
CREATE TABLE IF NOT EXISTS cont_asiento_lineas (
    id              BIGSERIAL PRIMARY KEY,
    asiento_id      BIGINT NOT NULL REFERENCES cont_asientos(id),
    cuenta_id       INTEGER NOT NULL REFERENCES cont_plan_cuentas(id),
    descripcion     VARCHAR(200),
    debe            DECIMAL(14,2) DEFAULT 0,
    haber           DECIMAL(14,2) DEFAULT 0,
    centro_costo    VARCHAR(50),
    orden           SMALLINT DEFAULT 0
);
CREATE INDEX idx_cont_lineas_asiento
    ON cont_asiento_lineas(asiento_id);
CREATE INDEX idx_cont_lineas_cuenta
    ON cont_asiento_lineas(cuenta_id);

-- Presupuestos
CREATE TABLE IF NOT EXISTS cont_presupuestos (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    nombre          VARCHAR(150) NOT NULL,
    anio            SMALLINT NOT NULL,
    estado          VARCHAR(20) DEFAULT 'borrador',
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cont_presupuesto_lineas (
    id              SERIAL PRIMARY KEY,
    presupuesto_id  INTEGER NOT NULL REFERENCES cont_presupuestos(id),
    cuenta_id       INTEGER NOT NULL REFERENCES cont_plan_cuentas(id),
    mes             SMALLINT NOT NULL,
    monto           DECIMAL(14,2) NOT NULL DEFAULT 0
);
```

---

### 2.7 FASE 5 - Agentes IA

```sql
-- ============================================================
-- MIGRATION: 006_fase5_agentes_ia.sql
-- ============================================================

-- Catalogo de agentes disponibles
CREATE TABLE IF NOT EXISTS ia_agentes (
    id              SERIAL PRIMARY KEY,
    codigo          VARCHAR(50) UNIQUE NOT NULL,
    -- codigos: dalia | marketing | ventas | rrhh | legal | finanzas | operaciones
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    modelo          VARCHAR(80) DEFAULT 'claude-sonnet-4-6',
    system_prompt   TEXT,
    tools_disponibles JSONB,   -- array de nombres de funciones
    activo          BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Sesiones de agente por tenant
CREATE TABLE IF NOT EXISTS ia_sesiones (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    agente_id       INTEGER NOT NULL REFERENCES ia_agentes(id),
    usuario_id      INTEGER REFERENCES usuarios(id),
    titulo          VARCHAR(200),
    mensajes        JSONB DEFAULT '[]',  -- [{rol, contenido, ts, tool_calls}]
    contexto        JSONB,    -- datos del negocio inyectados al inicio
    tokens_entrada  INTEGER DEFAULT 0,
    tokens_salida   INTEGER DEFAULT 0,
    estado          VARCHAR(20) DEFAULT 'activa',
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ia_sesiones_tenant
    ON ia_sesiones(tenant_id, created_at DESC);

-- Tareas ejecutadas por agentes (con function calling)
CREATE TABLE IF NOT EXISTS ia_tareas (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    sesion_id       BIGINT REFERENCES ia_sesiones(id),
    agente_id       INTEGER NOT NULL REFERENCES ia_agentes(id),
    tipo            VARCHAR(80) NOT NULL,
    -- tipos: enviar_campana | ajustar_precio | crear_okr | generar_reporte |
    --        aprobar_compra | enviar_whatsapp | actualizar_receta | etc.
    descripcion     TEXT,
    parametros      JSONB,    -- input de la tarea
    resultado       JSONB,    -- output tras ejecucion
    nivel_riesgo    VARCHAR(10) DEFAULT 'bajo',   -- bajo | medio | alto
    estado          VARCHAR(20) DEFAULT 'pendiente',
    -- estados: pendiente | aprobacion | ejecutando | completado | fallido | rechazado
    error           TEXT,
    iniciado_at     TIMESTAMP,
    completado_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ia_tareas_tenant_estado
    ON ia_tareas(tenant_id, estado, created_at DESC);

-- Sistema de aprobaciones
CREATE TABLE IF NOT EXISTS ia_aprobaciones (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    tarea_id        BIGINT NOT NULL REFERENCES ia_tareas(id),
    solicitado_a    INTEGER REFERENCES usuarios(id),
    nivel_riesgo    VARCHAR(10) NOT NULL,
    descripcion_riesgo TEXT,
    estado          VARCHAR(20) DEFAULT 'pendiente',
    -- estados: pendiente | aprobado | rechazado | expirado
    decision_por    INTEGER REFERENCES usuarios(id),
    decision_nota   TEXT,
    expira_at       TIMESTAMP,
    respondido_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ia_aprobaciones_tenant_pendiente
    ON ia_aprobaciones(tenant_id, estado)
    WHERE estado = 'pendiente';

-- Memoria estrategica (lo que funciono / no funciono)
CREATE TABLE IF NOT EXISTS ia_memoria_estrategica (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    categoria       VARCHAR(50) NOT NULL,
    -- categorias: precio | menu | marketing | personal | horario | proveedor
    descripcion     TEXT NOT NULL,
    tipo            VARCHAR(10) NOT NULL,   -- exito | fracaso | insight
    impacto         DECIMAL(10,2),   -- impacto economico estimado
    confianza       DECIMAL(3,2),    -- 0.0 a 1.0
    datos_soporte   JSONB,
    activo          BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ia_memoria_tenant
    ON ia_memoria_estrategica(tenant_id, categoria, tipo);

-- Knowledge Base por tenant
CREATE TABLE IF NOT EXISTS ia_knowledge_base (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    titulo          VARCHAR(200) NOT NULL,
    contenido       TEXT NOT NULL,
    tipo            VARCHAR(30) DEFAULT 'documento',
    -- tipos: documento | faq | proceso | receta | politica | precio
    embedding_vector JSONB,    -- vector para busqueda semantica (futuro)
    metadata        JSONB,
    activo          BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ia_kb_tenant
    ON ia_knowledge_base(tenant_id, tipo, activo);
```

---

### 2.8 FASE 6 - Camaras e Identidad Visual

```sql
-- ============================================================
-- MIGRATION: 007_fase6_camaras.sql
-- ============================================================

-- Registro de dispositivos de camara
CREATE TABLE IF NOT EXISTS cam_dispositivos (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    nombre          VARCHAR(100) NOT NULL,   -- "Camara Entrada", "Camara Cocina"
    modelo          VARCHAR(80),    -- "Reolink RLC-510A"
    rtsp_url        TEXT,           -- rtsp://usuario:pass@ip:554/stream
    ip_local        VARCHAR(45),
    proposito       VARCHAR(30) NOT NULL,
    -- propositos: asistencia | afluencia | seguridad | cocina
    activo          BOOLEAN DEFAULT true,
    ultima_conexion TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Log de eventos de camara
CREATE TABLE IF NOT EXISTS cam_eventos (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    camara_id       INTEGER NOT NULL REFERENCES cam_dispositivos(id),
    tipo_evento     VARCHAR(30) NOT NULL,
    -- tipos: persona_detectada | face_reconocido | face_desconocido |
    --        entrada | salida | movimiento | desconexion
    confianza       DECIMAL(5,4),
    metadata        JSONB,
    imagen_url      TEXT,   -- captura guardada en Supabase Storage
    procesado_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cam_eventos_tenant_fecha
    ON cam_eventos(tenant_id, procesado_at DESC);
```

---

## 3. ESPECIFICACION POR MODULO

### 3.1 FASE 0-A: Recetas - Vista Separada de Productos

**Problema actual:** Las recetas se gestionan dentro del contexto de productos. El dueno no puede ver la "carta" del restaurante separada del catalogo de ingredientes/insumos.

**Tablas afectadas:** `productos` (columnas nuevas), `recetas`, `receta_items`

**Rutas nuevas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /carta | Vista de la carta del restaurante (solo productos es_plato_menu=true) |
| GET | /carta/:id | Detalle de plato: precio, receta, costo, margen |
| GET | /api/carta/disponibilidad | JSON: estado de disponibilidad de todos los platos |
| POST | /api/carta/:id/disponibilidad | Forzar disponible/no disponible manualmente |

**Vistas:**
- `views/carta/index.ejs` - Grid de platos por categoria_menu, con badge disponible/no disponible
- `views/carta/detalle.ejs` - Ficha de plato: receta vinculada, costo, precio sugerido, margen %

**Logica de disponibilidad automatica:**
```
Cuando almacen_movimientos registra salida o ajuste:
  1. Para cada receta activa que use ese ingrediente:
     2. Calcular si stock_actual >= cantidad_requerida * pedidos_estimados
     3. Si NO -> UPDATE producto_disponibilidad SET disponible=false, razon=...
     4. Emitir socket.emit('disponibilidad:cambio', {productoId, disponible, razon})
```

**Integracion con Mesero (vista en tiempo real):**
- `public/js/mesas.js` ya existente: suscribirse al evento Socket.io `disponibilidad:cambio`
- Mostrar badge rojo en boton del producto si no disponible
- Tooltip con razon de no disponibilidad

---

### 3.2 FASE 0-B: Cocina - Timer Mejorado con Prioridades

**Problema actual:** Cocina no muestra cuanto tiempo lleva cada item esperando. Sin alertas de urgencia.

**Tablas:** `cocina_timers` (nueva), config en `configuracion_impresion`

**Rutas nuevas/modificadas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /api/cocina/timers | JSON de todos los timers activos del turno |
| POST | /api/cocina/timers | Crear timer al enviar item a cocina |
| PATCH | /api/cocina/timers/:id/completar | Marcar completado |
| GET | /api/cocina/config-timers | Obtener umbrales configurados |
| POST | /api/cocina/config-timers | Actualizar umbrales (admin) |

**Logica de prioridades:**
```
Al hacer GET /api/cocina/timers:
  minutosEspera = (NOW - enviado_at) / 60

  si minutosEspera >= umbral_rojo   -> prioridad = 2 (ROJO, audio)
  si minutosEspera >= umbral_amarillo -> prioridad = 1 (AMARILLO)
  sino                               -> prioridad = 0 (NORMAL)

  Ordenar: prioridad DESC, minutosEspera DESC
```

**Frontend (views/cocina.ejs ya existente):**
- Timer en vivo via `setInterval(1000)` o WebSocket push
- Card con fondo rojo pulsante para items urgentes
- Audio alert (beep) reproducido en el navegador de cocina

---

### 3.3 FASE 0-C: Delivery - Integracion Rappi

**Tablas:** `delivery_pedidos`, `delivery_items`

**Rutas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /delivery | Dashboard delivery (pedidos activos) |
| POST | /api/delivery/rappi/webhook | Receptor de eventos Rappi |
| POST | /api/delivery/rappi/confirmar/:id | Confirmar pedido a Rappi |
| POST | /api/delivery/rappi/rechazar/:id | Rechazar pedido |
| GET | /api/delivery/rappi/menu-sync | Sincronizar menu con Rappi |
| GET | /api/delivery/pedidos | Listar pedidos delivery con filtros |

**Flujo Rappi Webhook:**
```
[Rappi] --POST--> /api/delivery/rappi/webhook
    |
    v
Validar firma HMAC-SHA256 (header X-Rappi-Signature)
    |
    v
Guardar en delivery_pedidos (webhook_payload = crudo)
    |
    v
Si tipo == 'NEW_ORDER':
    - Crear pedido interno en 'pedidos' con mesa_id especial "DELIVERY"
    - Agregar items a pedido_items
    - Notificar via WebSocket a vista delivery y cocina
    |
    v
Si tipo == 'ORDER_CANCELLED':
    - Actualizar estado delivery_pedido = 'cancelado'
    - Actualizar pedido interno = 'cancelado'
    - Notificar
```

**Vista delivery (views/delivery/index.ejs):**
- Columnas kanban: Recibido | En Cocina | Listo | En Camino | Entregado
- Boton "Confirmar a Rappi" y "Listo para recoger"
- Tiempo estimado de entrega visible

---

### 3.4 FASE 1: SOSTAC - Cerebro Estrategico

**Arquitectura del modulo:**
```
/sostac (router principal)
  |-- /brief      -> Entrevista AI (Brief Express)
  |-- /situacion  -> Analisis situacional auto-generado
  |-- /mercado    -> Analisis de mercado (manual + AI)
  |-- /pulse      -> Centro de decisiones
  |-- /objetivos  -> OKRs / SMART
  |-- /tacticas   -> Tactica por objetivo
  |-- /acciones   -> Plan de accion
  |-- /control    -> Medicion y seguimiento
```

**Rutas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /sostac | Dashboard SOSTAC con estado del ciclo |
| GET | /sostac/brief | Iniciar/continuar entrevista AI |
| POST | /api/sostac/brief/responder | Enviar respuesta, obtener siguiente pregunta |
| POST | /api/sostac/brief/completar | Finalizar brief, generar resumen |
| GET | /api/sostac/situacion/generar | Genera analisis desde datos POS (Claude) |
| GET | /sostac/pulse | Centro de decisiones |
| GET | /api/sostac/pulse/pendientes | Propuestas pendientes de decision |
| POST | /api/sostac/pulse/:id/decidir | Aprobar/rechazar propuesta |
| GET/POST/PUT | /api/sostac/objetivos | CRUD OKRs |
| GET/POST/PUT | /api/sostac/tacticas | CRUD tacticas |
| GET/POST/PUT | /api/sostac/acciones | CRUD acciones |
| POST | /api/sostac/control/registrar | Registrar medicion de KPI |

**Integracion con Claude - Brief Express:**
```javascript
// Flujo conversacional con 7-10 preguntas clave
const PREGUNTAS_BRIEF = [
  "Cuantos platos vendes en promedio por dia?",
  "Cual es tu plato estrella y su precio?",
  "Cuales son tus mayores gastos fijos del mes?",
  "Quien es tu cliente tipico?",
  "En que horario tienes mas demanda?",
  "Tienes alguna meta para los proximos 3 meses?",
  "Cual es tu principal dolor operativo hoy?"
];

// Claude sintetiza respuestas en FODA + recomendaciones
// Resultado se guarda en sostac_sesiones.resumen_ia
// Dispara creacion automatica de primer analisis situacional
```

**Generacion de Analisis Situacional:**
```
Al invocar /api/sostac/situacion/generar:
  1. Consultar datos de los ultimos 90 dias:
     - ventas totales, ticket promedio, platos top 10
     - rotacion de mesas, horas pico
     - gastos registrados, margen bruto
     - clientes nuevos vs recurrentes
     - alertas de stock frecuentes

  2. Construir prompt para Claude con esos datos

  3. Solicitar: FODA + 3 recomendaciones prioritarias

  4. Guardar en sostac_analisis

  5. Si FODA identifica oportunidades -> crear sostac_pulse automaticamente
```

---

### 3.5 FASE 2: CRM

**Rutas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /crm | Dashboard CRM (metricas, segmentos, campanas recientes) |
| GET | /crm/clientes | Lista con filtros RFM y segmentos |
| GET | /crm/clientes/:id | Ficha 360 del cliente |
| GET | /crm/segmentos | Gestion de segmentos |
| POST | /api/crm/segmentos/calcular | Recalcular segmentos automaticos (RFM) |
| GET | /crm/campanas | Lista de campanas |
| GET | /crm/campanas/nueva | Wizard para crear campana |
| POST | /api/crm/campanas | Crear campana |
| POST | /api/crm/campanas/:id/enviar | Ejecutar envio |
| GET | /crm/fidelidad | Programas de puntos |
| POST | /api/crm/puntos/canjear | Canjear puntos en POS |

**Calculo RFM (job diario via cron):**
```
R (Recencia)  = dias desde ultima_visita        (score 1-5)
F (Frecuencia)= total_visitas en ultimos 90 dias (score 1-5)
M (Monetario) = ltv / total_visitas              (score 1-5)

Segmentos automaticos:
  R>=4, F>=4, M>=4  -> "Campeon" (VIP)
  R>=3, F>=3        -> "Leal"
  R<=2, F>=3        -> "En riesgo de perdida"
  R<=1              -> "Perdido"
  R=5, F=1          -> "Nuevo"
```

**Ficha 360 del cliente (views/crm/cliente_detalle.ejs):**
- Timeline de visitas con monto
- Platos favoritos (top 5)
- Score RFM visual (radar chart)
- Historial de campanas recibidas
- Saldo de puntos
- Campo notas CRM editables

---

### 3.6 FASE 3: RRHH

**Rutas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /rrhh | Dashboard RRHH (resumen turnos hoy, asistencias, alertas) |
| GET | /rrhh/empleados | Lista empleados con estado asistencia hoy |
| GET/POST/PUT | /rrhh/empleados/:id | CRUD empleado |
| POST | /api/rrhh/empleados/:id/registrar-face | Registrar embedding facial |
| GET | /rrhh/turnos | Gestion de turnos |
| GET | /rrhh/horario | Vista semanal de asignaciones (calendar grid) |
| GET | /rrhh/asistencia | Reporte de asistencia con filtros |
| POST | /api/rrhh/asistencia/manual | Registrar asistencia manual |
| POST | /api/rrhh/facial/evento | Receptor de evento facial (desde worker) |
| GET | /rrhh/planilla | Liquidacion mensual (conecta con planilla existente) |
| GET | /rrhh/afluencia | Dashboard de personas entrando al local |

**Integracion CompreFace:**
```
Registro de empleado:
  1. Admin sube foto desde /rrhh/empleados/:id
  2. POST a CompreFace /api/v1/recognition/faces con subject=empleado_id
  3. CompreFace devuelve embedding
  4. Guardar compreface_subject_id en rrhh_empleados

Reconocimiento en tiempo real (worker separado):
  1. Worker captura frame de RTSP cada 2 segundos
  2. POST a CompreFace /api/v1/recognition/recognize
  3. Si similarity >= 0.85 -> empleado identificado
  4. POST a /api/rrhh/facial/evento {empleado_id, tipo, confianza}
  5. Route crea/actualiza rrhh_asistencia
  6. WebSocket notifica dashboard RRHH
```

**Worker de Reconocimiento Facial (services/facial-worker.js):**
```
Proceso separado (child_process o pm2 job):
  - Lee RTSP con ffmpeg (pipe de frames JPEG)
  - Envia frame a CompreFace cada N segundos
  - Logica de debounce: mismo empleado no puede registrar
    2 entradas en menos de 5 minutos
  - Si no reconocido y confianza < 0.60: guardar
    imagen para revision manual
```

**Worker YOLO - Conteo de Personas:**
```
Proceso Python separado (microservicio):
  - Lee RTSP Reolink
  - YOLOv8n (modelo nano, ~6MB, corre en CPU)
  - Cuenta entradas/salidas por linea virtual
  - POST a /api/rrhh/afluencia/evento cada minuto
  - Ruta Node actualiza afluencia_conteo
```

---

### 3.7 FASE 4: Contabilidad

**Rutas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /contabilidad | Dashboard con P&L del mes |
| GET | /contabilidad/plan-cuentas | CRUD plan de cuentas |
| POST | /api/contabilidad/plan-cuentas/seed | Cargar PCGE Peru base |
| GET | /contabilidad/asientos | Libro diario con filtros |
| POST | /api/contabilidad/asientos | Crear asiento manual |
| GET | /api/contabilidad/asientos/:id | Ver asiento con lineas |
| GET | /contabilidad/mayor/:cuentaId | Libro mayor de cuenta |
| GET | /contabilidad/estados | Selector de estados financieros |
| GET | /contabilidad/estados/pyg | Estado de Resultados (P&L) |
| GET | /contabilidad/estados/balance | Balance General |
| GET | /contabilidad/estados/flujo-caja | Flujo de Caja |
| GET | /contabilidad/presupuestos | CRUD presupuestos |
| POST | /api/contabilidad/periodos/:id/cerrar | Cierre de periodo |

**Automatizacion de Asientos desde POS:**
```
Trigger: POST hook en routes/facturas.js (al crear factura)

Asiento automatico por venta:
  DEBE:  Caja / Banco (segun forma_pago)    = total
  HABER: Ventas (cuenta ingreso)            = subtotal sin IGV
  HABER: IGV por Pagar                      = IGV (18%)

Asiento automatico por compra (orden de compra aprobada):
  DEBE:  Inventario / Gasto                 = total sin IGV
  DEBE:  IGV Credito Fiscal                 = IGV
  HABER: Cuentas por Pagar Proveedores      = total

Asiento automatico planilla:
  DEBE:  Gastos Personal                    = total bruto
  HABER: Remuneraciones por Pagar           = neto
  HABER: ONP/AFP por Pagar                  = descuentos
```

**Estados Financieros - Generacion Dinamica:**
```
P&L = SUM(cuentas tipo ingreso) - SUM(cuentas tipo gasto + costo)
  Agrupado por mes, comparativo vs presupuesto y periodo anterior

Balance = Activos = Pasivos + Patrimonio
  Validacion: si no cuadra -> alerta auditoria

Flujo de Caja = Metodo directo
  Operaciones: facturas cobradas - pagos a proveedores - planilla
  Inversion: compra activos
  Financiamiento: prestamos
```

---

### 3.8 FASE 5: Agentes IA - Framework DalIA

**Arquitectura de Function Calling:**

```javascript
// Herramientas que los agentes pueden EJECUTAR
const TOOLS_DISPONIBLES = {
  // Lectura (riesgo bajo - auto-aprobado)
  "consultar_ventas":       { riesgo: "bajo",  descripcion: "..." },
  "consultar_stock":        { riesgo: "bajo",  descripcion: "..." },
  "listar_clientes":        { riesgo: "bajo",  descripcion: "..." },
  "ver_asistencia_hoy":     { riesgo: "bajo",  descripcion: "..." },

  // Escritura operacional (riesgo medio - notifica)
  "crear_campana_crm":      { riesgo: "medio", descripcion: "..." },
  "crear_okr":              { riesgo: "medio", descripcion: "..." },
  "enviar_whatsapp_masivo": { riesgo: "medio", descripcion: "..." },
  "actualizar_disponibilidad": { riesgo: "medio", descripcion: "..." },

  // Impacto economico (riesgo alto - bloquea hasta aprobar)
  "ajustar_precio_producto":{ riesgo: "alto",  descripcion: "..." },
  "aprobar_orden_compra":   { riesgo: "alto",  descripcion: "..." },
  "ejecutar_pago_planilla": { riesgo: "alto",  descripcion: "..." },
  "eliminar_producto":      { riesgo: "alto",  descripcion: "..." }
};
```

**Rutas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /agentes | Dashboard de agentes y sesiones recientes |
| POST | /api/agentes/dalia/iniciar | Nueva sesion DalIA con contexto |
| POST | /api/agentes/dalia/mensaje | Enviar mensaje a DalIA |
| GET | /api/agentes/tareas | Listar tareas en curso y completadas |
| GET | /api/agentes/tareas/:id | Detalle tarea |
| POST | /api/agentes/aprobaciones/:id/decidir | Admin aprueba/rechaza tarea |
| GET | /api/agentes/memoria | Ver memoria estrategica |
| POST | /api/agentes/memoria | Agregar insight manual |
| GET | /api/agentes/kb | Knowledge Base del tenant |
| POST | /api/agentes/kb | Agregar documento a KB |

**Flujo de Ejecucion de Agente:**
```
[Usuario] "DalIA, necesito atraer mas clientes los martes"
    |
    v
[DalIA - Orquestador]
  1. Consultar KB: tiene historial de acciones similares?
  2. Consultar ia_memoria_estrategica: que funciono antes?
  3. Llamar tool: consultar_ventas({dia: 'martes', semanas: 8})
  4. Analizar datos: martes = -35% vs promedio
  5. Generar propuesta: "Campana 2x1 martes via WhatsApp a segmento 'Leal'"
    |
    v
[Nivel de riesgo: MEDIO]
  -> Crear ia_tarea con estado 'pendiente'
  -> Crear ia_aprobacion para admin
  -> Notificar via WebSocket + push notification
    |
    v
[Admin aprueba]
    |
    v
[DalIA ejecuta tool: crear_campana_crm({...})]
  -> Crea registro en crm_campanas
  -> Agenda envio
  -> Guarda resultado en ia_tareas.resultado
  -> Registra en ia_memoria_estrategica
```

---

### 3.9 FASE 6: Camaras - CompreFace + YOLO

**Rutas:**

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /camaras | Dashboard de dispositivos y estado |
| POST | /api/camaras | Registrar nueva camara |
| PUT | /api/camaras/:id | Actualizar configuracion |
| POST | /api/camaras/:id/test | Test de conexion RTSP |
| POST | /api/rrhh/facial/evento | Receptor de evento desde worker Python/Node |
| POST | /api/afluencia/evento | Receptor de conteo desde worker YOLO |
| GET | /api/afluencia/hoy | Datos de afluencia del dia para dashboard |

**Infraestructura Docker requerida:**
```yaml
# docker-compose.yml (adicion)
services:
  compreface-core:
    image: exadel/compreface-core:latest
    ports: ["8000:8000"]

  compreface-api:
    image: exadel/compreface-api:latest
    ports: ["8080:8080"]
    environment:
      - COMPREFACE_API_KEY=<tenant_key>

  yolo-counter:
    build: ./services/yolo-worker
    # Python + ultralytics + rtsp capture
    environment:
      - RTSP_URL=rtsp://...
      - API_ENDPOINT=http://app:3000/api/afluencia/evento

  postgres:
    # ya existente
```

**Worker YOLO (services/yolo-worker/main.py):**
```python
# Pseudocodigo de arquitectura
from ultralytics import YOLO
import cv2, requests, time

model = YOLO('yolov8n.pt')
cap = cv2.VideoCapture(RTSP_URL)

# Linea virtual de conteo (coordenada Y al 50% del frame)
LINE_Y = frame_height // 2
conteo_entrada = 0
conteo_salida  = 0

while True:
    ret, frame = cap.read()
    results = model.track(frame, persist=True, classes=[0])  # clase 0 = persona

    for box in results[0].boxes:
        # Si centroide cruza LINE_Y hacia abajo -> entrada
        # Si cruza hacia arriba -> salida
        # Usar track_id para evitar doble conteo

    # Cada 60 segundos enviar totales
    if time.time() - last_post > 60:
        requests.post(API_ENDPOINT, json={
            "tenant_id": TENANT_ID,
            "camara_id": CAMARA_ID,
            "entradas": conteo_entrada,
            "salidas": conteo_salida
        })
```

---

## 4. INTEGRACIONES EXTERNAS

### 4.1 Rappi API

**Documentacion:** Rappi Partner API v3

```
Autenticacion: OAuth2 Bearer Token
  POST https://microservices.dev.rappi.com/api/v1/restaurants/auth/token
  Body: { client_id, client_secret, grant_type: "client_credentials" }
  Vigencia: 3600s -> renovar automaticamente con cron

Endpoints clave:
  GET  /restaurants/{id}/menu          -> Obtener menu actual en Rappi
  PUT  /restaurants/{id}/menu          -> Actualizar menu (precios, disponibilidad)
  GET  /restaurants/{id}/orders        -> Listar ordenes recientes
  POST /restaurants/{id}/orders/{id}/accept  -> Confirmar orden
  POST /restaurants/{id}/orders/{id}/reject  -> Rechazar orden
  PUT  /restaurants/{id}/orders/{id}/ready   -> Marcar listo para recojo

Webhook (Rappi nos envia eventos):
  Registrar URL: /api/delivery/rappi/webhook
  Verificar HMAC: crypto.createHmac('sha256', secret).update(body)
  Tipos de evento: new_order | order_cancelled | payment_confirmed

Credenciales por tenant:
  Guardar en tenants.rappi_client_id y tenants.rappi_client_secret (encriptado)
  Token cache en memoria (Redis futuro, por ahora Map() en proceso)
```

**Estructura del servicio (services/rappi.js):**
```javascript
class RappiService {
  async authenticate(tenantId)     // -> token
  async getMenu(tenantId)          // -> menu Rappi
  async syncMenu(tenantId)         // Productos locales -> Rappi
  async confirmOrder(tenantId, rappiOrderId)
  async rejectOrder(tenantId, rappiOrderId, reason)
  async markReady(tenantId, rappiOrderId)
  async verifyWebhookSignature(body, signature, secret)
}
```

---

### 4.2 CompreFace (Docker local)

```
Base URL: http://compreface:8080/api/v1

API Key: una por tenant (registrar en CompreFace al crear tenant)

Endpoints usados:
  POST /recognition/faces
    Body: FormData { file: imagen.jpg, subject: "empleado_{id}" }
    -> Registra cara del empleado

  POST /recognition/recognize
    Body: FormData { file: frame.jpg }
    Query: limit=1, det_prob_threshold=0.8
    -> Devuelve [{ subject, similarity, box }]
    -> similarity >= 0.85 = reconocido con confianza alta

  DELETE /recognition/faces/{subject}
    -> Eliminar registro facial al dar de baja empleado

Gestion de API Keys por tenant:
  Al crear tenant -> llamar CompreFace admin API para crear API key
  Guardar api_key encriptada en tenants.compreface_api_key

Privacidad:
  Las imagenes de reconocimiento NO se guardan por defecto
  Solo cuando confianza < 0.60 se guarda para revision
  Supabase Storage con bucket privado y presigned URLs
```

---

### 4.3 YOLO + OpenCV (Microservicio Python)

```
Modelo: YOLOv8n (nano)
  - Tamano: ~6MB
  - Velocidad: ~80ms/frame en CPU moderno
  - Precision: 37.3 mAP (suficiente para conteo)

Dependencias Python:
  ultralytics>=8.0
  opencv-python-headless
  requests
  python-dotenv

Input: RTSP stream Reolink RLC-510A
  URL formato: rtsp://admin:password@192.168.1.x:554/h264Preview_01_main

Output: POST /api/afluencia/evento cada 60 segundos
  { tenant_id, camara_id, entradas, salidas, timestamp }

Consideraciones de red:
  Worker debe estar en la misma red local que la camara
  En cloud: usar VPN o stream relay
  Reolink soporta RTSP en puerto 554 por defecto
```

---

### 4.4 Anthropic Claude - Agentes con Function Calling

```javascript
// Configuracion del cliente (services/claude-agent.js)
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Esquema de herramienta ejemplo
const toolConsultarVentas = {
  name: "consultar_ventas",
  description: "Consulta las ventas del restaurante por periodo y filtros",
  input_schema: {
    type: "object",
    properties: {
      fecha_inicio: { type: "string", format: "date" },
      fecha_fin:    { type: "string", format: "date" },
      agrupar_por:  { type: "string", enum: ["dia", "semana", "mes", "producto", "mesero"] }
    },
    required: ["fecha_inicio", "fecha_fin"]
  }
};

// Loop de ejecucion con function calling
async function ejecutarAgente(tenantId, agenteId, mensajeUsuario) {
  const messages = [{ role: "user", content: mensajeUsuario }];

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: buildSystemPromptAgente(tenantId, agenteId),
      tools: getToolsParaAgente(agenteId),
      messages
    });

    if (response.stop_reason === "end_turn") {
      return response.content[0].text;
    }

    if (response.stop_reason === "tool_use") {
      const toolUse = response.content.find(b => b.type === "tool_use");
      const resultado = await ejecutarTool(tenantId, toolUse.name, toolUse.input);

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: [{
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(resultado)
      }]});
    }
  }
}
```

---

### 4.5 Twilio / WhatsApp para Campanas CRM

```
Proveedor: Twilio (ya integrado parcialmente via project_sunat_whatsapp.md)

Endpoint: POST /api/crm/campanas/:id/enviar
  1. Cargar lista de envios (crm_campana_envios estado='pendiente')
  2. Para cada envio:
     POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
     Body: {
       From: "whatsapp:+14155238886",
       To: "whatsapp:+51{telefono}",
       Body: mensaje personalizado,
       MediaUrl: imagen_url (si aplica)
     }
  3. Actualizar crm_campana_envios estado='enviado'
  4. Webhook de estado (delivered/read) actualiza 'abierto'

Rate limiting: max 10 mensajes/segundo (Twilio limit)
  Usar Bull queue para procesar en batch con delay
```

---

## 5. SEGURIDAD Y MULTI-TENANCY

### 5.1 Patron de Aislamiento en Todos los Modulos Nuevos

```javascript
// middleware/tenant-guard.js (refuerzo)
// TODOS los modulos nuevos deben usar este patron:

router.use((req, res, next) => {
  if (!req.tenantId) return res.status(401).json({ error: 'No tenant' });
  next();
});

// En cada query:
// WHERE tenant_id = $1 AND id = $2  <- tenant_id SIEMPRE primero
```

### 5.2 Credenciales de Integraciones

```
Almacenamiento:
  - NUNCA en codigo fuente
  - Variables de entorno para credenciales globales
  - Columnas encriptadas en tenants para credenciales por tenant:
    tenants.rappi_client_secret  -> encriptado con AES-256-GCM
    tenants.compreface_api_key   -> encriptado con AES-256-GCM
    tenants.twilio_auth_token    -> encriptado con AES-256-GCM

Clave de encriptacion: process.env.ENCRYPTION_KEY (32 bytes)
Helper: services/crypto.js -> encrypt(texto) / decrypt(texto)
```

### 5.3 Rate Limiting para APIs de Agentes

```javascript
// Los agentes no deben poder ejecutar mas de:
//   - 100 consultas/hora (herramientas de lectura)
//   - 20 acciones/hora (herramientas de escritura)
//   - 5 acciones de alto riesgo/dia

// Implementar con tabla ia_rate_limits o Redis (futuro)
```

---

## 6. ROADMAP DE IMPLEMENTACION

### Semana 1 (22-28 Mar): Deuda Operativa FASE 0

| Dia | Tarea | Archivos a crear/modificar |
|---|---|---|
| 1-2 | Carta separada de productos + disponibilidad | routes/carta.js, views/carta/, services/disponibilidad.js (extender) |
| 3-4 | Timer cocina mejorado + alertas | migrations/001_fase0.sql, routes/cocina.js (extender), views/cocina.ejs |
| 5-6 | Delivery Rappi webhook + dashboard | routes/delivery.js, views/delivery/, services/rappi.js |
| 7 | Disponibilidad en tiempo real mesero | public/js/mesas.js (extender con Socket.io) |

### Semana 2 (29 Mar - 4 Abr): SOSTAC + CRM Base

| Dia | Tarea | Archivos |
|---|---|---|
| 1-2 | Migrations SOSTAC + Brief Express | migrations/002_sostac.sql, routes/sostac.js, views/sostac/ |
| 3-4 | Generacion analisis situacional (Claude) | services/sostac-analisis.js |
| 5-6 | CRM: Historial + Segmentos RFM | migrations/003_crm.sql, routes/crm.js, views/crm/ |
| 7 | CRM: Campanas + Puntos | services/campanas.js |

### Semana 3 (5-11 Abr): RRHH + Contabilidad

| Dia | Tarea | Archivos |
|---|---|---|
| 1-2 | RRHH Empleados + Turnos | migrations/004_rrhh.sql, routes/rrhh.js |
| 3 | Asistencia manual + horario | views/rrhh/ |
| 4 | CompreFace Docker + worker facial | services/facial-worker.js, docker-compose.yml |
| 5-6 | Contabilidad: Plan cuentas PCGE + asientos auto | migrations/005_contabilidad.sql, routes/contabilidad.js |
| 7 | Estados financieros P&L + Balance | views/contabilidad/ |

### Semana 4 (12-18 Abr): Agentes IA + Camaras + Cierre

| Dia | Tarea | Archivos |
|---|---|---|
| 1-2 | Framework agentes: tools + loop Claude | migrations/006_agentes.sql, services/claude-agent.js |
| 3 | Sistema aprobaciones + memoria | routes/agentes.js, views/agentes/ |
| 4 | YOLO worker Python + afluencia | services/yolo-worker/, migrations/007_camaras.sql |
| 5 | Integracion camaras en dashboard RRHH | views/rrhh/afluencia.ejs |
| 6-7 | QA integral, ajustes, documentacion | - |

### Dias 29-30 (19-22 Abr): Buffer y Go-Live

- UAT con tenant piloto real
- Ajuste de umbrales de alertas
- Capacitacion dueno del restaurante
- Monitoreo Grafana de nuevos modulos

---

### Metricas de Exito por Modulo

| Modulo | KPI de Exito | Meta 30 dias |
|---|---|---|
| Cocina Timers | Reduccion tiempo promedio preparacion | -15% |
| Delivery Rappi | Pedidos delivery procesados sin error | >95% |
| SOSTAC Brief | Tasa de completacion entrevista IA | >80% |
| CRM Segmentos | Clientes categorizados RFM | 100% base |
| CRM Campanas | Tasa de apertura WhatsApp | >40% |
| RRHH Facial | Precision reconocimiento | >92% |
| Contabilidad | Asientos auto sin error | >99% |
| Agentes IA | Tareas auto-completadas sin rechazo | >75% |
| Afluencia | Precision conteo personas | +/-10% |

---

*Documento generado: 2026-03-22 | Siguiente revision: 2026-04-01 (checkpoint semana 2)*
