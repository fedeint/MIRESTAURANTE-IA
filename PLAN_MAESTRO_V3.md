# PLAN MAESTRO V3 — MiRestconIA
## De POS a Plataforma de Gestión Integral con IA Autónoma

**Versión:** 3.0
**Fecha:** 2026-03-22
**CEO:** Leonidas Yauri — dignita.tech SAC
**Dominio:** mirestconia.com
**Deadline:** 1 mes (2026-04-22)

**Elaborado por equipo multidisciplinario:**
- CEO / Estratega de producto (30 años experiencia)
- Especialista ERP con IA (30 años)
- Consultor estratégico (30 años)
- Fullstack Developer (30 años)
- DevOps Engineer (30 años)
- Especialista Redes Sociales (30 años)
- Director Comercial / Ventas (30 años)

---

## ÍNDICE

1. [Visión Ejecutiva](#1-visión-ejecutiva)
2. [Propuesta de Valor Única](#2-propuesta-de-valor-única)
3. [Estado Actual del Sistema](#3-estado-actual-del-sistema)
4. [Arquitectura Técnica](#4-arquitectura-técnica)
5. [Módulos a Construir](#5-módulos-a-construir)
6. [Infraestructura](#6-infraestructura)
7. [Roadmap de 4 Semanas](#7-roadmap-de-4-semanas)
8. [Estrategia de Precios](#8-estrategia-de-precios)
9. [Estrategia de Ventas y Marketing](#9-estrategia-de-ventas-y-marketing)
10. [Proyección de Ingresos](#10-proyección-de-ingresos)
11. [Riesgos y Mitigaciones](#11-riesgos-y-mitigaciones)

---

## 1. VISIÓN EJECUTIVA

### El Problema

En LATAM, los restaurantes pequeños y medianos operan con herramientas fragmentadas: Excel para inventario, WhatsApp para comunicación, libretas para pedidos. El propietario juega 15 roles simultáneamente y el negocio depende completamente de su presencia física.

### La Revolución: Equipo Ejecutivo IA

**MiRestconIA** entrega a cada restaurante un **equipo ejecutivo virtual de IA** que REALMENTE DIRIGE EL NEGOCIO:

```
┌─────────────────────────────────────────────────────────────┐
│                    SOSTAC (Cerebro Estratégico)              │
│  Brief → Situación → Mercado → Pulse → SMART → E→T→A→C     │
│  "Este año: expandir a 3 sedes, reducir food cost a 28%"    │
╚══════════════════════╤══════════════════════════════════════╝
                       │
              ┌────────▼────────┐
              │     DalIA       │
              │ GERENTE GENERAL │
              │  Orquestadora   │
              └───────┬─────────┘
                      │
        ┌─────┬──────┼──────┬──────┬──────┐
        ▼     ▼      ▼      ▼      ▼      ▼
     ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐
     │ MKT ││VENTA││ RRHH││LEGAL││ FIN ││ OPS │
     │Delfi││     ││     ││     ││     ││     │
     │Vega ││     ││     ││     ││     ││     │
     │Atlas││     ││     ││     ││     ││     │
     │Forge││     ││     ││     ││     ││     │
     └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘
```

### Por Qué Es Revolucionario

1. **No es un POS, es un socio comercial IA** — Los agentes ejecutan estrategia real
2. **Único en LATAM** — Toast/Square son herramientas; nosotros somos un co-founder invisible
3. **Accesible** — Un "CFO + Gerente + Director de MKT" por S/ 299/mes vs S/ 10,000+ en sueldos reales
4. **Retención ultra-alta** — Una vez que la IA maneja el negocio, no pueden cambiar

---

## 2. PROPUESTA DE VALOR ÚNICA

### vs. Competencia

| Aspecto | Toast | Square | Mozo (Perú) | **MiRestconIA** |
|---------|-------|--------|-------------|-----------------|
| Precio | S/ 400+ | S/ 220 | S/ 200 | **S/ 149-299** |
| POS | ✅ | ✅ | ✅ | ✅ |
| Inventario | Básico | No | Básico | **FIFO + Lotes + Merma** |
| Recetas/Costeo | No | No | No | **✅ Versionado** |
| SUNAT | No | No | Parcial | **✅ Nativo** |
| Offline | No | No | No | **✅ PWA + Sync** |
| IA Asistente | No | No | No | **✅ DalIA** |
| **Agentes IA Autónomos** | No | No | No | **✅ ÚNICO** |
| **SOSTAC Estratégico** | No | No | No | **✅ ÚNICO** |
| **Reconocimiento Facial** | No | No | No | **✅ CompreFace** |
| **CRM + Marketing IA** | No | No | No | **✅ Vega/Atlas** |
| LATAM Nativo | No | No | Sí | **✅ Perú first** |

---

## 3. ESTADO ACTUAL DEL SISTEMA

### Lo que YA funciona (✅ = producción)

| Módulo | Estado | Detalle |
|--------|--------|---------|
| ✅ POS / Mesas / Pedidos | Producción | Flujo completo mesa→cocina→cuenta |
| ✅ Cocina (KDS) | Producción | 5 tabs, timer 8min, alertas |
| ✅ Caja | Producción | Apertura/cierre, turnos, denominaciones |
| ✅ Inventario/Almacén | Producción | 200+ ingredientes, FIFO, lotes, proveedores |
| ✅ Recetas | Producción | Versionado, costeo, sub-recetas |
| ✅ SUNAT | Producción | Boletas/facturas electrónicas |
| ✅ P&L / Administración | Producción | Gastos, nómina, margen bruto |
| ✅ Reportes PDF/Excel | Producción | Diarios, mensuales, rankings |
| ✅ IA Chat (DalIA) | Producción | Claude + voz (Edge TTS) |
| ✅ Multi-tenant SaaS | Producción | Tenants, planes, suscripciones |
| ✅ Trial System | Producción | 5 días gratis, verificación |
| ✅ Onboarding | Producción | Google OAuth, wizard, fotos/videos |
| ✅ Offline / PWA | Producción | Service Worker + IndexedDB |
| ✅ Observabilidad | Producción | KPIs, alertas, Grafana, geo-tracking |
| ✅ WhatsApp/Facebook | Producción | Mensajes, canales |
| ✅ Contratos | Producción | PDF, firma electrónica |
| ✅ Legal/Compliance | Producción | INDECOPI, privacidad, términos |
| ⚠️ Delivery | Esqueleto | Tabla existe, sin integración real |
| ⚠️ Reservas | Básico | CRUD simple |
| ⚠️ Fidelización | Básico | Puntos, sin automatización |

### Tech Stack

```
Backend:    Node.js 24 + Express 4.18 + PostgreSQL (pg)
Frontend:   EJS + Bootstrap 5 + jQuery + SweetAlert2
AI:         @anthropic-ai/sdk (Claude)
Auth:       Passport.js (Google OAuth + local)
Pagos:      Izipay
Storage:    Supabase Storage
Deploy:     Vercel (serverless)
Database:   Supabase (PostgreSQL managed)
Offline:    Service Worker + IndexedDB
```

---

## 4. ARQUITECTURA TÉCNICA

### Arquitectura Híbrida: Vercel + VPS

```
INTERNET
    │
    ├── mirestconia.com ──────────→ Vercel (App principal, CDN)
    ├── *.mirestconia.com ────────→ Vercel (Multi-tenant)
    ├── mail.mirestconia.com ─────→ VPS Servarica (Stalwart Mail)
    ├── vision.mirestconia.com ───→ VPS Servarica (CompreFace + YOLO)
    └── agents.mirestconia.com ───→ VPS Servarica (Agent runner)

RESTAURANTE LOCAL (tenants con cámaras)
    └── Mini PC / Raspberry Pi
            ├── FFmpeg (captura RTSP)
            └── POST frames → vision.mirestconia.com
```

### Flujo de Datos Completo

```
+===========================================================================+
|                          CLIENTES / USUARIOS                              |
|   Navegador Web   |   App PWA (offline)   |   Cámara IP Reolink (RTSP)   |
+===========================================================================+
          │                    │                          │
          ▼                    ▼                          ▼
+------------------+  +------------------+  +------------------------+
|   Vercel CDN     |  |  Service Worker  |  |  FFmpeg local          |
|   (proxy, TLS)   |  |  IndexedDB Sync  |  |  1 frame / 30s         |
+------------------+  +------------------+  +------------------------+
          │                    │                          │
          └────────────────────┼──────────────────────────┘
                               │
          +====================▼===========================+
          |          NODE.JS / EXPRESS - CORE API           |
          |                                                 |
          |  MÓDULOS ACTUALES:                              |
          |  POS │ Almacén │ Recetas │ SUNAT │ Caja        |
          |  Chat │ Canales │ Reportes │ Observabilidad    |
          |                                                 |
          |  MÓDULOS NUEVOS:                                |
          |  SOSTAC │ CRM │ RRHH │ Contabilidad │ Delivery |
          |  Agentes IA │ Cámaras │ CMS                    |
          +====================│===========================+
                               │
          +====================▼===========================+
          |              CAPA DE DATOS                      |
          |  PostgreSQL (Supabase) │ Supabase Storage       |
          +====================│===========================+
                               │
          +====================▼===========================+
          |          VPS SERVARICA (SERVICIOS)              |
          |  CompreFace │ YOLO │ Stalwart │ Agent Runner   |
          +=================================================+
```

### Modelo de Datos — Nuevas Migraciones

| Migration | Tablas | Propósito |
|-----------|--------|-----------|
| `013_fase0_ops.js` | `cocina_timers`, `delivery_pedidos`, `delivery_items`, `producto_disponibilidad` | Deuda operaciones |
| `014_sostac.js` | `sostac_briefs`, `sostac_situacion`, `sostac_mercado`, `sostac_pulse`, `sostac_objetivos`, `sostac_estrategia` | Cerebro estratégico |
| `015_crm.js` | `crm_segmentos`, `crm_campanas`, `crm_campana_destinatarios`, `crm_interacciones`, `crm_puntos_historial` | CRM + Marketing |
| `016_rrhh.js` | `rrhh_empleados`, `rrhh_turnos`, `rrhh_asistencia`, `rrhh_facial_log`, `rrhh_afluencia` | RRHH + Facial |
| `017_contabilidad.js` | `cta_plan_cuentas`, `cta_asientos`, `cta_partidas`, `cta_presupuestos` | Contabilidad |
| `018_agentes_ia.js` | `agentes_catalogo`, `agentes_sesiones`, `agentes_tareas`, `agentes_aprobaciones`, `agentes_memoria`, `agentes_knowledge_base` | Framework IA |
| `019_camaras.js` | `camaras_dispositivos`, `camaras_eventos` | Cámaras + Visión |

---

## 5. MÓDULOS A CONSTRUIR

### 5.1 SOSTAC — Cerebro Estratégico

```
FLUJO: Brief Express (Delfino) → Situación → Mercado → Pulse → SMART → E→T→A→C

Rutas:
  GET  /sostac                    Dashboard SOSTAC
  GET  /sostac/brief              Wizard Brief Express (20 preguntas)
  POST /sostac/brief              Guardar brief + generar análisis
  GET  /sostac/situacion          Análisis situacional (auto desde POS)
  GET  /sostac/mercado            Análisis de mercado
  GET  /sostac/pulse              Centro de decisiones
  POST /sostac/pulse/propuesta    Generar propuesta VEGA
  GET  /sostac/objetivos          OKRs SMART
  GET  /sostac/estrategia         Plan estratégico
  GET  /sostac/tacticas           Tácticas por departamento
  GET  /sostac/accion             Panel de ejecución
  GET  /sostac/control            Métricas vs objetivos
```

### 5.2 CRM — Gestión de Clientes

```
Rutas:
  GET  /crm                       Dashboard 360° de clientes
  GET  /crm/cliente/:id           Ficha completa del cliente
  GET  /crm/segmentos             Segmentación RFM (Recency/Frequency/Monetary)
  POST /crm/campanas              Crear campaña (WhatsApp/Email)
  GET  /crm/fidelizacion          Programa de puntos + tiers

Auto-captura: cada factura alimenta el CRM automáticamente.
Segmentos: VIP (>S/500), Frecuentes (>10 visitas), Nuevos (<1 mes), En riesgo (>60 días sin visita)
```

### 5.3 RRHH — Recursos Humanos

```
Rutas:
  GET  /rrhh                      Dashboard RRHH
  GET  /rrhh/turnos               Calendario de turnos (tipo Google Calendar)
  POST /rrhh/turnos               Crear/editar turno
  GET  /rrhh/asistencia           Log de asistencia facial
  POST /rrhh/asistencia/checkin   Check-in por reconocimiento facial
  GET  /rrhh/rendimiento          Métricas por empleado

Facial Recognition:
  - Cámara Reolink RLC-510A (~S/ 250) con RTSP
  - CompreFace (Docker en VPS) para identificación
  - FFmpeg local captura 1 frame / 30 segundos
  - Precisión: >95% con buena iluminación
```

### 5.4 Contabilidad

```
Rutas:
  GET  /contabilidad              Dashboard financiero
  GET  /contabilidad/plan         Plan de cuentas
  GET  /contabilidad/diario       Libro diario
  GET  /contabilidad/estados      P&L, Balance, Flujo de caja
  GET  /contabilidad/presupuesto  Presupuestos vs real

Auto-registro: ventas del POS → asiento contable automático.
Integración: SUNAT → libros electrónicos.
```

### 5.5 Delivery — Integración Rappi

```
Rutas:
  GET  /delivery                  Dashboard delivery
  POST /api/delivery/webhook      Webhook Rappi (nuevo pedido)
  PUT  /api/delivery/:id/estado   Actualizar estado

Flujo: Rappi envía pedido → webhook → cocina → preparado → Rappi recoge
Sincronización de menú bidireccional.
```

### 5.6 Cámaras + Conteo de Personas

```
Hardware: Reolink RLC-510A (S/ 250, PoE, RTSP)
Software: CompreFace (reconocimiento) + YOLO (conteo)

Flujo:
  Cámara RTSP → FFmpeg (local) → frame JPEG → VPS
  VPS: CompreFace identifica → POST /api/vision/event → Supabase
  VPS: YOLO cuenta personas → POST /api/vision/count → Supabase

Privacidad: frames se procesan en RAM, nunca se persisten.
```

### 5.7 Agentes IA — Framework Multi-Agente

```
Estructura:
  /lib/agents/
    base-agent.js          Framework base (rol, tools, memory)
    dalia.js               Gerente General (orquestadora)
    /marketing/
      delfino.js           Onboarding + Brief Express
      vega.js              Campañas + contenido social
      atlas.js             Análisis de mercado
      forge.js             Creatividad + diseño
    /ventas/
    /rrhh/
    /finanzas/
    /operaciones/
    /legal/

Cada agente tiene:
  - Rol y system prompt especializado
  - Tools (function calling) para ACTUAR
  - Acceso a Knowledge Base del tenant
  - Memoria estratégica persistente
  - Nivel de autonomía configurable

Niveles de aprobación:
  BAJO:  auto-aprobado (generar reporte, enviar alerta)
  MEDIO: notifica al dueño (lanzar promo < S/ 50)
  ALTO:  requiere aprobación (cambiar precios, contratar)
```

### 5.8 Mejoras Operaciones

```
Recetas:    Vista independiente /recetas (hoy solo API)
Cocina:     Timer mejorado desde envío del mozo, prioridad visual
Mesero:     Disponibilidad en tiempo real de cocina
```

---

## 6. INFRAESTRUCTURA

### Qué Corre Dónde

```
SERVICIO                    DÓNDE           RAZÓN
────────────────────────────────────────────────────
App web / API REST          Vercel          Auto-scaling, CDN, zero-ops
Base de datos               Supabase        Managed, backups, realtime
Storage fotos/videos        Supabase        CDN, políticas RLS
CompreFace                  VPS             Docker requerido
YOLO / Python               VPS             Proceso persistente
Stalwart Mail               VPS             SMTP/IMAP propio
Agent runner (crons)        VPS             Crons < 1 minuto
FFmpeg (RTSP)               Local/restaur   Streams son locales
```

### Layout del VPS Servarica

```
/srv/
├── compreface/        ← Docker Compose (reconocimiento facial)
├── vision-api/        ← FastAPI + YOLO (conteo personas)
├── agents/            ← PM2 / Node.js (agent runner + crons)
├── stalwart/          ← Stalwart Mail Docker (correo propio)
└── nginx/             ← Reverse proxy, TLS via certbot
```

### Costos Mensuales Proyectados

| Escenario | Vercel | Supabase | VPS | Claude API | Total | Ingreso Est. | Margen |
|-----------|--------|----------|-----|------------|-------|-------------|--------|
| 10 tenants | $0 | $0 | $15 | $8 | **$25** | $290 | 91% |
| 50 tenants | $20 | $25 | $30 | $48 | **$123** | $1,450 | 92% |
| 100 tenants | $20 | $25 | $60 | $128 | **$267** | $2,900 | 91% |

---

## 7. ROADMAP DE 4 SEMANAS

### SEMANA 1: Operaciones + SOSTAC Foundation

**Lunes-Martes: Deuda Operaciones**
- [ ] Recetas: vista independiente `/recetas` con búsqueda y filtros
- [ ] Cocina: timer mejorado (tiempo desde envío del mozo, countdown visual)
- [ ] Mesero: panel de disponibilidad en cocina en tiempo real

**Miércoles-Jueves: SOSTAC Foundation**
- [ ] Brief Express (Delfino): wizard 20 preguntas → JSON estructurado
- [ ] Knowledge Base: tabla `agentes_knowledge_base` por tenant
- [ ] DalIA upgrade: consume Knowledge Base + historial ventas → reporte diario
- [ ] Análisis Situacional: auto-generado desde datos del POS

**Viernes: Integración + Demo**
- [ ] Flujo end-to-end: Brief → DalIA genera reporte inteligente
- [ ] QA: test con datos reales de un restaurante

**Entregable S1:** SOSTAC Brief funcional + DalIA inteligente + cocina mejorada

---

### SEMANA 2: Agentes IA + CRM

**Lunes-Martes: Framework Multi-Agente**
- [ ] Base Agent class: rol, tools, memory, execute
- [ ] DalIA como Gerente: lectura diaria, recomendaciones, escalación
- [ ] Sistema de aprobación: auto/notifica/requiere según riesgo
- [ ] Agent communication bus (pub/sub interno)

**Miércoles-Jueves: CRM + Marketing Agent (Vega)**
- [ ] CRM: auto-captura desde facturas, segmentación RFM
- [ ] Vista CRM 360°: ficha cliente con historial completo
- [ ] Vega Agent: genera 3 posts/semana + campañas automáticas
- [ ] Marketing triggers: cumpleaños, 60 días sin visita → WhatsApp

**Viernes: QA + Documentación**
- [ ] Test agentes bajo carga (100 órdenes/día simuladas)
- [ ] Validar privacidad en prompts
- [ ] Documentación: arquitectura de agentes

**Entregable S2:** Agentes funcionando + CRM captura 100% clientes + Vega genera contenido

---

### SEMANA 3: RRHH + Contabilidad + Cámaras

**Lunes-Martes: RRHH + Facial Recognition**
- [ ] Turnos: calendario visual, asignación de empleados
- [ ] CompreFace: setup Docker en VPS + endpoint checkin
- [ ] Asistencia facial: captura → reconoce → registra entrada/salida
- [ ] Dashboard asistencia: horas trabajadas, tardanzas, faltas

**Miércoles-Jueves: Contabilidad + Cámaras**
- [ ] Plan de cuentas (chart of accounts para restaurante)
- [ ] Asientos automáticos desde ventas del POS
- [ ] P&L diario automático + integración DalIA
- [ ] Cámaras: YOLO conteo personas + dashboard afluencia

**Viernes: Delivery + Infraestructura VPS**
- [ ] Rappi: webhook de pedidos + flujo a cocina
- [ ] VPS: Nginx, certbot, UFW, fail2ban, Docker
- [ ] Agent runner: PM2 con primeros crons

**Entregable S3:** RRHH con facial + Contabilidad auto + Cámaras contando + Delivery Rappi

---

### SEMANA 4: Integración + QA + Lanzamiento Beta

**Lunes-Martes: Onboarding completo + Email**
- [ ] Onboarding refactor: incluir Brief Express (Delfino)
- [ ] Stalwart Mail: setup + SPF/DKIM/DMARC
- [ ] Email automation: welcome + secuencia 5 días

**Miércoles: QA Intensivo**
- [ ] E2E: nuevo restaurante → Brief → primera orden → reporte IA
- [ ] E2E: empleado ficha cara → dashboard → nómina calculada
- [ ] E2E: DalIA detecta venta baja → Vega propone campaña
- [ ] E2E: pedido Rappi → cocina → entregado
- [ ] Performance: <2s homepage, <500ms APIs

**Jueves: Documentación + Assets**
- [ ] Manual de usuario
- [ ] Video demo 3 min
- [ ] Screenshots para redes sociales

**Viernes: Lanzamiento Beta**
- [ ] Activar 5 restaurantes beta (pagos)
- [ ] Soporte directo WhatsApp
- [ ] Monitoreo Grafana activo
- [ ] Analytics de onboarding

**Entregable S4:** 5 restaurantes en producción, sistema completo, soporte activo

---

## 8. ESTRATEGIA DE PRECIOS

### Estructura en Soles (Perú)

```
┌──────────────────────────────────────────────────────────┐
│                    PLAN FREE — S/ 0                       │
│  2 usuarios │ 500 transacciones │ POS básico              │
│  Sin IA │ Sin reportes avanzados │ Trial 5 días           │
│  Objetivo: Adquisición y educación de mercado             │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  PLAN PRO — S/ 149/mes                    │
│  (Anual: S/ 1,490, ahorro 17%)                           │
│                                                           │
│  5 usuarios │ Ilimitadas transacciones │ 1 sede           │
│  POS completo │ Cocina digital │ Inventario + alertas     │
│  Recetas + costeo │ Caja con arqueos │ SUNAT integrado    │
│  IA Chat (DalIA básico) │ Reportes │ Offline mode         │
│                                                           │
│  Ideal: Restaurantes hasta S/ 100,000/mes ventas          │
│  ROI: 2 días (elimina S/ 2,500/mes en pérdidas)          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              PLAN ENTERPRISE — S/ 299/mes                 │
│  (Anual: S/ 2,990, ahorro 17%)                           │
│                                                           │
│  Todo de Pro +                                            │
│  Usuarios ilimitados │ Hasta 5 sedes (+S/ 100 c/u)       │
│  Agentes IA autónomos (DalIA, Vega, Delfino)             │
│  CRM integrado │ SOSTAC planning │ Análisis predictivo    │
│  Reconocimiento facial │ Conteo de personas               │
│  Integración Rappi/delivery │ RRHH (turnos, asistencia)  │
│  Contabilidad automática │ Soporte prioritario            │
│                                                           │
│  Ideal: Restaurantes S/ 100,000+, cadenas pequeñas        │
│  ROI: 15 días (decisiones IA, sin staff adicional)        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              PLAN CUSTOM — Consultar precio               │
│  Cadenas 10+ sedes │ API completa │ SLA 99.5%            │
│  Setup: S/ 2,000 - 5,000 único                           │
└──────────────────────────────────────────────────────────┘
```

### Precios USD (Expansión LATAM)

| Plan | USD/mes | Anual |
|------|---------|-------|
| Free | $0 | $0 |
| Pro | $40 | $390 |
| Enterprise | $80 | $800 |
| Sede adicional | $25 | — |

### ROI Justificado — Plan Pro S/ 149/mes

```
Restaurante promedio: S/ 80,000 ventas/mes

SIN MiRestconIA:                    CON MiRestconIA Pro:
  Errores de caja:     -S/ 1,200      Caja exacta:         +S/ 1,200
  Merma inventario:    -S/ 800        Control FIFO:         +S/ 600
  Reportes manuales:   -S/ 500        Automático:           +S/ 300
  Precios sin data:    -S/ 400        IA optimiza:          +S/ 400
  Total pérdidas:      -S/ 2,500      Total ahorro:         +S/ 2,500

Inversión: S/ 149/mes
ROI = 1,574% anual — Se paga en 2 días
```

---

## 9. ESTRATEGIA DE VENTAS Y MARKETING

### Funnel de Ventas

```
AWARENESS (Redes Sociales, Google, Referidos)
    │  175 visitantes/mes
    ▼
TRIAL (5 días gratis, sin tarjeta)
    │  35 registros (20% conversión)
    ▼
ACTIVATION (Brief Express + primera orden)
    │  25 completan onboarding (71%)
    ▼
PAID (Plan Pro o Enterprise)
    │  8-10 clientes (32-40% trial→paid)
    ▼
EXPANSION (upgrade Pro→Enterprise, +sedes)
    │  30% upgrade en 6 meses
    ▼
ADVOCACY (referidos, testimonios)
```

### Redes Sociales — Plan por Plataforma

| Plataforma | Contenido | Frecuencia | Objetivo |
|------------|-----------|------------|----------|
| **TikTok** | "Un día gestionando restaurante con IA" (behind scenes) | 5/semana | Awareness jóvenes |
| **Instagram** | Antes/después, tips, casos de éxito | 4/semana | Engagement |
| **Facebook** | Testimonios, promos, comunidad | 3/semana | Conversión (dueños 35+) |
| **LinkedIn** | Thought leadership, tech + gastronomía | 2/semana | Partnerships, inversores |
| **YouTube** | Tutoriales, demos, webinars | 1/semana | Educación, SEO |

### Elevator Pitch (30 segundos)

> "¿Sabías que el 60% de restaurantes en Perú cierra en 2 años por mala gestión? MiRestconIA le da a tu restaurante un equipo completo de gerentes IA — uno para marketing, otro para finanzas, otro para operaciones — por S/ 149 al mes. Es como tener un MBA trabajando 24/7 para tu negocio. Ya tenemos restaurantes ahorrando S/ 2,500 al mes. ¿Te interesa probarlo 5 días gratis?"

### Partnerships Estratégicos

| Partner | Beneficio | Modelo |
|---------|-----------|--------|
| **Rappi** | 15K restaurantes en Perú, integración directa | Co-marketing, referidos |
| **APEGA** | 8K miembros, asociación gastronómica #1 | Descuento especial, eventos |
| **Escuelas de cocina** | Pipeline de futuros dueños | Licencia educativa gratuita |
| **Distribuidores de insumos** | Contacto directo con restaurantes | Comisión 15% |
| **Contadores** | Recomiendan a sus clientes restauranteros | Comisión 20% |

---

## 10. PROYECCIÓN DE INGRESOS

### Año 1 — Crecimiento Mensual

| Mes | Clientes | MRR (S/) | ARR (S/) | Costo Infra | Margen |
|-----|----------|----------|----------|-------------|--------|
| 1 | 5 | 745 | 8,940 | S/ 95 | 87% |
| 2 | 15 | 2,235 | 26,820 | S/ 95 | 96% |
| 3 | 30 | 4,470 | 53,640 | S/ 190 | 96% |
| 4 | 50 | 7,450 | 89,400 | S/ 465 | 94% |
| 5 | 70 | 10,430 | 125,160 | S/ 465 | 96% |
| 6 | 100 | 14,900 | 178,800 | S/ 465 | 97% |
| 9 | 170 | 25,330 | 303,960 | S/ 750 | 97% |
| 12 | 250 | 37,250 | 447,000 | S/ 1,000 | 97% |

*Asumiendo mix 70% Pro (S/ 149) + 30% Enterprise (S/ 299) y 5% churn mensual*

### Hitos de Ingreso

```
Breakeven personal:    S/ 5,000 MRR  (~35 clientes)  → Mes 3
Primer empleado:       S/ 15,000 MRR (~100 clientes)  → Mes 6
Oficina/equipo:        S/ 30,000 MRR (~200 clientes)  → Mes 10
```

---

## 11. RIESGOS Y MITIGACIONES

### Técnicos

| Riesgo | Prob. | Mitigación |
|--------|-------|-----------|
| CompreFace falla con poca luz | Alta | Guía de instalación: "cámara con luz frontal". Fallback: QR/PIN |
| Claude API rate limit con 20+ agentes | Media | Cache de prompts, batches, limitar a 1 reporte/día por agente |
| Supabase cae en hora pico | Media | Service Worker offline + IndexedDB (ya implementado) |
| Multi-tenant data breach | Baja | `WHERE tenant_id = ?` obligatorio + Row-Level Security |
| Vercel cold starts >5s | Media | Keep-alive ping cada 4 min, cache agresivo |

### Producto

| Riesgo | Prob. | Mitigación |
|--------|-------|-----------|
| Dueños no entienden Brief Express | Alta | Video 2 min + ejemplo pre-llenado + chat soporte |
| Agentes IA generan contenido inapropiado | Baja | Approval workflow: draft → human review → publish |
| Churn alto mes 1 (no ven ROI) | Media | Dashboard visible: "Ahorraste X horas esta semana" |

### Mercado

| Riesgo | Prob. | Mitigación |
|--------|-------|-----------|
| Toast/Square entran agresivo a Perú | Media | Diferenciador: IA autónoma + SUNAT nativo + precio |
| Adopción lenta de IA en LATAM | Media | Empezar con pain points (nómina, reportes), IA como bonus |
| Regulación IA en Perú | Baja | Audit trail completo de cada decisión IA |

### Decisiones Go/No-Go por Semana

```
Fin S1: ¿SOSTAC Brief funciona? ¿DalIA genera reportes útiles?
  → No: reducir alcance agentes S2

Fin S2: ¿Agentes son útiles? ¿Vega genera contenido de calidad?
  → No: pausar marketing agents, enfocarse en DalIA + operaciones

Fin S3: ¿Facial recognition funciona? ¿P&L es correcto?
  → No: retrasar facial a S5, enfocarse en contabilidad manual

Fin S4: ¿5 betas en producción? ¿Zero critical bugs?
  → No: extender beta a 1 cliente, fix issues, relanzar S5
```

---

## DOCUMENTOS COMPLEMENTARIOS

Para especificaciones técnicas detalladas, ver:

- **[docs/PLAN_MAESTRO_ARQUITECTURA.md](docs/PLAN_MAESTRO_ARQUITECTURA.md)** — Arquitectura técnica completa, modelo de datos (47 tablas), especificación por módulo, integraciones externas
- **[docs/INFRAESTRUCTURA_MASTER_PLAN.md](docs/INFRAESTRUCTURA_MASTER_PLAN.md)** — Infraestructura Vercel + VPS, CI/CD, monitoreo, seguridad, costos detallados
- **[GO_TO_MARKET_PLAN.md](GO_TO_MARKET_PLAN.md)** — Estrategia completa de precios, ventas, redes sociales, partnerships, proyecciones de ingreso detalladas

---

**"MiRestconIA no es un POS. Es el primer co-founder IA para restaurantes en Latinoamérica."**

*— Plan aprobado para ejecución: 2026-03-22*
