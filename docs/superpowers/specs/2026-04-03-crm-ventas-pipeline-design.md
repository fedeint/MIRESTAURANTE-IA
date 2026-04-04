# Diseño: CRM Ventas — Pipeline, WhatsApp, PostHog, Automatizaciones

**Fecha:** 2026-04-03
**Estado:** Aprobado

---

## Contexto

Twenty CRM está corriendo en el VPS. Necesitamos convertirlo en el centro de operaciones de ventas de MiRestcon IA. Los vendedores (agentes) deben poder abordar clientes de forma ordenada con un pipeline claro, WhatsApp integrado, lead scoring automático, y generación de cotizaciones/contratos desde el CRM.

**Objetivo:** Vender el SaaS de forma profesional y escalable.

**Presupuesto:** Mínimo hasta generar revenue ($7/mes VPS + ~$15-22/mes WhatsApp API)

---

## Fases

### Fase 1 — Pipeline + Datos + Código WhatsApp (esta semana)
- Configurar pipeline de 6 etapas en Twenty
- Crear custom objects (Cotizaciones, Contratos, Demos)
- Sync automático: sistema MiRestcon → Twenty CRM
- Código WhatsApp listo (se conecta número en 4 días)
- Cotizador y contratos conectados al pipeline
- Branding de Twenty con colores de la marca

### Fase 2 — WhatsApp activo + PostHog lead scoring (semana 2)
- Conectar número WhatsApp aprobado
- Templates de mensajes aprobados por Meta
- Secuencia automática trial 15 días
- PostHog → lead score → Twenty CRM (cron diario)
- n8n para orquestación de automaciones
- Dashboard de ventas en Twenty

### Fase 3 — CRM módulo para tenants premium (futuro)
- Cada tenant premium tiene mini-CRM de sus clientes
- Integrado en el sistema como módulo /crm
- Solo plan "De por vida" tiene acceso

---

## Fase 1 — Detalle técnico

### 1.1 Pipeline en Twenty CRM

**6 etapas:**

| Etapa | Color | Criterio de salida |
|---|---|---|
| Lead | Gris | Contacto capturado (form, WhatsApp, referido) |
| Calificado | Azul | BANT confirmado: presupuesto, decisor, necesidad |
| Demo Agendada | Amarillo | Demo programada (virtual o presencial) |
| Trial Activo | Naranja | Trial de 15 días corriendo, login confirmado |
| Propuesta Enviada | Morado | Cotización + paquete hardware enviado |
| Cliente | Verde | Primer pago recibido |

Configurar via Twenty UI: Settings > Data Model > Opportunity > Stage field > editar opciones.

### 1.2 Custom Objects en Twenty

**Cotización** (vinculada a Opportunity):
- plan_software (select: Free, Anual S/3200, De por vida S/4500)
- paquete_hardware (select: Solo Software S/500, Básico S/1500, Completo S/3000)
- monto_total (number)
- estado (select: Borrador, Enviada, Aceptada, Rechazada)
- pdf_url (text)
- fecha_envio (date)

**Contrato** (vinculado a Opportunity):
- nro_contrato (text)
- estado (select: Borrador, Enviado, Firmado, Cancelado)
- pdf_url (text)
- token_firma (text)
- firmado_at (date)

**Demo** (vinculado a Person):
- restaurante (text)
- whatsapp (text)
- paquete_interes (select)
- fecha_preferida (date)
- estado (select: Pendiente, Confirmada, Realizada, No show)

### 1.3 Sync automático: Sistema → Twenty CRM

**Triggers en el sistema MiRestcon IA:**

| Evento | Acción en Twenty CRM |
|---|---|
| Nueva solicitud de trial (`solicitudes_registro`) | Crear Person + Opportunity etapa "Lead" |
| Solicitud aprobada | Mover Opportunity a "Trial Activo" |
| Nueva demo (`demo_solicitudes`) | Crear Person + Demo + Opportunity etapa "Demo Agendada" |
| Tenant creado (pago directo) | Crear Person + Company + Opportunity etapa "Cliente" |
| Trial expira sin pagar | Mover Opportunity a "Perdido" |

**Implementación:**
- Nuevo servicio `services/twenty-crm.js` con funciones GraphQL
- Se llama desde `routes/superadmin.js` (al aprobar/rechazar)
- Se llama desde `routes/public.js` (al recibir demo)
- Se llama desde `routes/solicitud.js` (al crear solicitud)

### 1.4 Código WhatsApp (preparado, sin número aún)

**Servicio `services/whatsapp-api.js`:**
- Usa Meta Cloud API (SDK oficial `whatsapp`)
- Variables de entorno: `WHATSAPP_PHONE_ID`, `WHATSAPP_TOKEN`
- Si no están configuradas → log silencioso, no crashea
- Funciones: `sendTemplate(phone, templateName, params)`

**Templates a crear en Meta (cuando se apruebe número):**
1. `trial_bienvenida` — "Hola {{1}}, tu prueba de MiRestcon IA está activa..."
2. `trial_dia3` — "Hola {{1}}, ¿ya registraste tu primera venta?..."
3. `trial_dia7` — "{{1}}, llevas una semana con MiRestcon IA..."
4. `trial_dia12` — "{{1}}, te quedan 3 días de prueba..."
5. `trial_expirado` — "{{1}}, tu prueba terminó. Elige tu plan..."
6. `demo_confirmada` — "{{1}}, tu demo está agendada para {{2}}..."
7. `contrato_enviado` — "{{1}}, tu contrato está listo..."
8. `pago_confirmado` — "{{1}}, ¡bienvenido a MiRestcon IA!..."

**Secuencia automática (cron):**
- Cron diario revisa trials activos
- Según día del trial → envía template correspondiente
- Si no hay número WhatsApp configurado → solo log

### 1.5 Cotizador + Contratos en pipeline

**Flujo:**
1. Vendedor en Twenty mueve deal a "Propuesta Enviada"
2. Webhook de Twenty → sistema MiRestcon IA
3. Sistema genera PDF de cotización (código existente en `routes/cotizaciones.js`)
4. PDF se guarda en VPS storage (`torach.mirestconia.com`)
5. Se envía por WhatsApp al contacto
6. Si acepta → genera contrato (código existente en `routes/contratos.js`)
7. Contrato firmado → deal se mueve a "Cliente"

### 1.6 Branding Twenty CRM

Personalizar el frontend de Twenty con colores MiRestcon IA:
- Primary: #FF6B35
- Background: #0a0f24
- Logo: isotipo robot chef
- Workspace name: "MiRestcon IA — Ventas"

Como Twenty no tiene theming via UI, se hace modificando las variables CSS del container Docker o inyectando un custom stylesheet via nginx.

---

## Fase 2 — Detalle técnico

### 2.1 PostHog → Lead Score → Twenty

**Cron diario (3am):**
1. Query HogQL a PostHog: sesiones, features usados, pricing views por usuario
2. Calcular lead score (0-100)
3. Upsert en Twenty CRM: actualizar campo `lead_score` en Person

**Score formula:**
```
sessions × 4 (max 20) + features × 7 (max 28) + invited_team × 25 + viewed_pricing × 15 + value_moment × 12 = score/100
```

Score 60+ → notificación WhatsApp al vendedor: "Lead caliente: [Restaurante] score 78"

### 2.2 n8n Orquestación

n8n (self-hosted en el VPS) conecta:
- Twenty webhook → n8n → WhatsApp (deal stage change)
- PostHog webhook → n8n → Twenty (real-time scoring)
- Sistema → n8n → Twenty + WhatsApp (nueva solicitud)

### 2.3 Dashboard de ventas

Vistas en Twenty CRM:
- Pipeline Kanban (deals por etapa)
- Leads calientes (score > 60)
- Trials activos (días restantes)
- Revenue por mes
- Conversion rate por etapa

---

## Archivos a crear/modificar

### Fase 1
| Archivo | Acción |
|---|---|
| `services/twenty-crm.js` | Crear: cliente GraphQL para Twenty |
| `services/whatsapp-api.js` | Crear: cliente WhatsApp Cloud API |
| `services/crm-sync.js` | Crear: sync eventos → Twenty |
| `routes/superadmin.js` | Modificar: trigger sync al aprobar/rechazar |
| `routes/public.js` | Modificar: trigger sync al recibir demo |
| `routes/solicitud.js` | Modificar: trigger sync al crear solicitud |
| `routes/cron.js` | Modificar: agregar cron de secuencia WhatsApp trial |

### Fase 2
| Archivo | Acción |
|---|---|
| `services/posthog-scoring.js` | Crear: query HogQL + calcular scores |
| `routes/cron.js` | Modificar: agregar cron de lead scoring |
| n8n workflows en VPS | Crear: 3 workflows (deal→whatsapp, posthog→twenty, sistema→twenty+whatsapp) |

---

## Costos

| Servicio | Costo | Cuándo |
|---|---|---|
| VPS Servarica | $7/mes | Ya activo |
| WhatsApp Cloud API | ~$15-22/mes (500 msgs) | Cuando se apruebe número |
| PostHog | Gratis (hasta 1M eventos/mes) | Ya activo |
| Twenty CRM | Gratis (self-hosted) | Ya activo |
| n8n | Gratis (self-hosted en VPS) | Fase 2 |
| **Total** | **~$22-29/mes** | |

Con 1 venta anual (S/3,200) se paga 1 año de infraestructura completa.

---

## Fuera de alcance (Fase 3)
- CRM como módulo para tenants premium
- App mobile nativa para vendedores
- AI para auto-calificar leads
- Integración con pasarela de pago
