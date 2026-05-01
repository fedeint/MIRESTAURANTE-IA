# CRM Ventas Fase 1 — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Configurar Twenty CRM como centro de ventas con pipeline de 6 etapas, sync automático de leads/demos/trials, código WhatsApp listo, y cotizador/contratos conectados al pipeline.

**Architecture:** Twenty CRM (GraphQL API) ← services/twenty-crm.js ← triggers en rutas existentes. WhatsApp Cloud API preparado en services/whatsapp-api.js. Cron para secuencia de trial.

**Tech Stack:** Twenty CRM GraphQL, Meta WhatsApp Cloud API, Express.js, node-fetch

---

## Task 1: Configurar pipeline y custom objects en Twenty CRM

Via la UI de Twenty en https://crm-internal.mirestconia.com

- [ ] **Step 1: Registrar cuenta admin en Twenty**
Acceder a https://crm-internal.mirestconia.com, crear cuenta con leonidasyuriyauri@gmail.com

- [ ] **Step 2: Configurar pipeline de 6 etapas**
Settings > Data Model > Opportunity > Stage field > editar opciones:
1. Lead (gris)
2. Calificado (azul)
3. Demo Agendada (amarillo)
4. Trial Activo (naranja)
5. Propuesta Enviada (morado)
6. Cliente (verde)

- [ ] **Step 3: Crear custom object "Cotizacion"**
Settings > Data Model > + New Object:
- Name: Cotizacion
- Fields: plan_software (select), paquete_hardware (select), monto_total (number), estado (select: Borrador/Enviada/Aceptada/Rechazada), pdf_url (text), fecha_envio (date)
- Relation to: Opportunity

- [ ] **Step 4: Crear custom object "Contrato"**
- Name: Contrato
- Fields: nro_contrato (text), estado (select: Borrador/Enviado/Firmado/Cancelado), pdf_url (text), firmado_at (date)
- Relation to: Opportunity

- [ ] **Step 5: Crear custom object "DemoSolicitud"**
- Name: DemoSolicitud
- Fields: restaurante (text), whatsapp (text), paquete_interes (select), fecha_preferida (date), estado (select: Pendiente/Confirmada/Realizada/No show)
- Relation to: Person

- [ ] **Step 6: Obtener API key de Twenty**
Settings > API & Webhooks > Create API Key. Guardar en .credentials/crm-twenty.md

- [ ] **Step 7: Commit nota**
```bash
git commit --allow-empty -m "feat(crm): configure pipeline 6 stages + custom objects in Twenty CRM"
```

---

## Task 2: Servicio Twenty CRM (GraphQL client)

**Files:**
- Create: `services/twenty-crm.js`

- [ ] **Step 1: Crear el servicio**

```javascript
// services/twenty-crm.js
'use strict';

const logger = require('../lib/logger');

const TWENTY_URL = process.env.TWENTY_API_URL || '';
const TWENTY_KEY = process.env.TWENTY_API_KEY || '';

async function gql(query, variables = {}) {
  if (!TWENTY_URL || !TWENTY_KEY) {
    logger.info('twenty_crm_skip', { reason: 'TWENTY_API_URL or TWENTY_API_KEY not set' });
    return null;
  }

  try {
    const res = await fetch(`${TWENTY_URL}/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TWENTY_KEY}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error('twenty_crm_error', { status: res.status, body: text });
      return null;
    }

    const data = await res.json();
    if (data.errors) {
      logger.error('twenty_crm_gql_error', { errors: data.errors });
      return null;
    }

    return data.data;
  } catch (err) {
    logger.error('twenty_crm_failed', { error: err.message });
    return null;
  }
}

/**
 * Create or update a person (contact) in Twenty CRM.
 */
async function upsertPerson({ email, firstName, lastName, phone, city }) {
  // Try to find existing person by email
  const findResult = await gql(`
    query FindPerson($email: String!) {
      people(filter: { emails: { primaryEmail: { eq: $email } } }, first: 1) {
        edges { node { id } }
      }
    }
  `, { email });

  const existing = findResult?.people?.edges?.[0]?.node;

  if (existing) {
    return existing.id;
  }

  // Create new person
  const createResult = await gql(`
    mutation CreatePerson($data: PersonCreateInput!) {
      createPerson(data: $data) { id }
    }
  `, {
    data: {
      name: { firstName: firstName || '', lastName: lastName || '' },
      emails: { primaryEmail: email },
      phones: { primaryPhoneNumber: phone || '' },
      city: city || '',
    }
  });

  return createResult?.createPerson?.id || null;
}

/**
 * Create an opportunity (deal) in Twenty CRM.
 */
async function createOpportunity({ name, stage, amount, personId, companyId, closeDate }) {
  const stageMap = {
    'lead': 'LEAD',
    'calificado': 'CALIFICADO',
    'demo_agendada': 'DEMO_AGENDADA',
    'trial_activo': 'TRIAL_ACTIVO',
    'propuesta_enviada': 'PROPUESTA_ENVIADA',
    'cliente': 'CLIENTE',
  };

  const result = await gql(`
    mutation CreateOpportunity($data: OpportunityCreateInput!) {
      createOpportunity(data: $data) { id stage }
    }
  `, {
    data: {
      name: name,
      stage: stageMap[stage] || 'LEAD',
      amount: amount ? { amountMicros: Math.round(amount * 1000000), currencyCode: 'PEN' } : undefined,
      closeDate: closeDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      pointOfContactId: personId || undefined,
      companyId: companyId || undefined,
    }
  });

  return result?.createOpportunity?.id || null;
}

/**
 * Update opportunity stage.
 */
async function updateOpportunityStage(opportunityId, stage) {
  const stageMap = {
    'lead': 'LEAD',
    'calificado': 'CALIFICADO',
    'demo_agendada': 'DEMO_AGENDADA',
    'trial_activo': 'TRIAL_ACTIVO',
    'propuesta_enviada': 'PROPUESTA_ENVIADA',
    'cliente': 'CLIENTE',
  };

  return gql(`
    mutation UpdateStage($id: ID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) { id stage }
    }
  `, { id: opportunityId, data: { stage: stageMap[stage] || stage } });
}

/**
 * Create a company in Twenty CRM.
 */
async function upsertCompany({ name, domainName, city }) {
  const findResult = await gql(`
    query FindCompany($name: String!) {
      companies(filter: { name: { eq: $name } }, first: 1) {
        edges { node { id } }
      }
    }
  `, { name });

  const existing = findResult?.companies?.edges?.[0]?.node;
  if (existing) return existing.id;

  const result = await gql(`
    mutation CreateCompany($data: CompanyCreateInput!) {
      createCompany(data: $data) { id }
    }
  `, {
    data: {
      name: name,
      domainName: domainName || '',
      address: { addressCity: city || '' },
    }
  });

  return result?.createCompany?.id || null;
}

/**
 * Add a note/activity to a person or opportunity.
 */
async function addNote(targetId, title, body) {
  return gql(`
    mutation CreateNote($data: NoteCreateInput!) {
      createNote(data: $data) { id }
    }
  `, {
    data: {
      title: title,
      body: body,
    }
  });
}

module.exports = {
  gql,
  upsertPerson,
  createOpportunity,
  updateOpportunityStage,
  upsertCompany,
  addNote,
};
```

- [ ] **Step 2: Commit**
```bash
git add services/twenty-crm.js
git commit -m "feat(crm): add Twenty CRM GraphQL client service"
```

---

## Task 3: Servicio WhatsApp API (preparado)

**Files:**
- Create: `services/whatsapp-api.js`

- [ ] **Step 1: Crear el servicio**

```javascript
// services/whatsapp-api.js
'use strict';

const logger = require('../lib/logger');

const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const API_URL = 'https://graph.facebook.com/v21.0';

/**
 * Send a WhatsApp template message.
 * Returns true if sent, false if WhatsApp not configured or failed.
 */
async function sendTemplate(toPhone, templateName, params = []) {
  if (!PHONE_ID || !TOKEN) {
    logger.info('whatsapp_skip', { reason: 'WHATSAPP_PHONE_ID or TOKEN not set', template: templateName });
    return false;
  }

  // Normalize Peru phone: remove +, spaces, ensure starts with 51
  let phone = String(toPhone).replace(/[\s+\-()]/g, '');
  if (phone.startsWith('9') && phone.length === 9) phone = '51' + phone;
  if (!phone.startsWith('51')) phone = '51' + phone;

  try {
    const res = await fetch(`${API_URL}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'es' },
          components: params.length > 0 ? [{
            type: 'body',
            parameters: params.map(p => ({ type: 'text', text: String(p) })),
          }] : [],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('whatsapp_error', { template: templateName, to: phone, status: res.status, error: err });
      return false;
    }

    logger.info('whatsapp_sent', { template: templateName, to: phone });
    return true;
  } catch (err) {
    logger.error('whatsapp_failed', { template: templateName, error: err.message });
    return false;
  }
}

/**
 * Send a simple text message (only within 24h conversation window).
 */
async function sendText(toPhone, message) {
  if (!PHONE_ID || !TOKEN) return false;

  let phone = String(toPhone).replace(/[\s+\-()]/g, '');
  if (phone.startsWith('9') && phone.length === 9) phone = '51' + phone;

  try {
    const res = await fetch(`${API_URL}/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    });

    return res.ok;
  } catch (err) {
    logger.error('whatsapp_text_failed', { error: err.message });
    return false;
  }
}

module.exports = { sendTemplate, sendText };
```

- [ ] **Step 2: Commit**
```bash
git add services/whatsapp-api.js
git commit -m "feat(crm): add WhatsApp Cloud API service (ready for number connection)"
```

---

## Task 4: CRM Sync — triggers en el sistema

**Files:**
- Create: `services/crm-sync.js`
- Modify: `routes/superadmin.js` (aprobar solicitud)
- Modify: `routes/public.js` (nueva demo)
- Modify: `routes/solicitud.js` (nueva solicitud)

- [ ] **Step 1: Crear servicio de sync**

```javascript
// services/crm-sync.js
'use strict';

const twenty = require('./twenty-crm');
const whatsapp = require('./whatsapp-api');
const logger = require('../lib/logger');

/**
 * New trial request submitted.
 */
async function onSolicitudCreada(solicitud) {
  try {
    const personId = await twenty.upsertPerson({
      email: solicitud.email,
      firstName: solicitud.nombre,
      phone: solicitud.telefono,
      city: solicitud.distrito,
    });

    const companyId = await twenty.upsertCompany({
      name: solicitud.restaurante,
      city: solicitud.distrito,
    });

    await twenty.createOpportunity({
      name: `Trial — ${solicitud.restaurante}`,
      stage: 'lead',
      personId,
      companyId,
    });

    logger.info('crm_sync_solicitud', { email: solicitud.email, personId });
  } catch (err) {
    logger.error('crm_sync_solicitud_error', { error: err.message });
  }
}

/**
 * Trial approved by superadmin.
 */
async function onTrialAprobado(solicitud) {
  try {
    const personId = await twenty.upsertPerson({
      email: solicitud.email,
      firstName: solicitud.nombre,
      phone: solicitud.telefono,
    });

    // Find and update opportunity stage
    // For now, create a new one if not found
    await twenty.createOpportunity({
      name: `Trial Activo — ${solicitud.restaurante}`,
      stage: 'trial_activo',
      personId,
    });

    // WhatsApp welcome (if configured)
    if (solicitud.telefono) {
      await whatsapp.sendTemplate(solicitud.telefono, 'trial_bienvenida', [
        solicitud.nombre,
        solicitud.restaurante,
      ]);
    }

    logger.info('crm_sync_trial_aprobado', { email: solicitud.email });
  } catch (err) {
    logger.error('crm_sync_trial_error', { error: err.message });
  }
}

/**
 * Demo request received.
 */
async function onDemoSolicitada(demo) {
  try {
    const personId = await twenty.upsertPerson({
      email: demo.email || `${demo.whatsapp}@whatsapp.temp`,
      firstName: demo.nombre,
      phone: demo.whatsapp,
    });

    await twenty.createOpportunity({
      name: `Demo — ${demo.restaurante || demo.nombre}`,
      stage: 'demo_agendada',
      personId,
    });

    // WhatsApp confirmation (if configured)
    if (demo.whatsapp) {
      await whatsapp.sendTemplate(demo.whatsapp, 'demo_confirmada', [
        demo.nombre,
        demo.fecha_preferida || 'por confirmar',
      ]);
    }

    logger.info('crm_sync_demo', { nombre: demo.nombre });
  } catch (err) {
    logger.error('crm_sync_demo_error', { error: err.message });
  }
}

/**
 * Tenant created directly (paid, no trial).
 */
async function onTenantCreado(tenant) {
  try {
    const personId = await twenty.upsertPerson({
      email: tenant.email_admin,
      firstName: tenant.nombre,
    });

    const companyId = await twenty.upsertCompany({
      name: tenant.nombre,
      domainName: `${tenant.subdominio}.mirestconia.com`,
    });

    await twenty.createOpportunity({
      name: `Cliente — ${tenant.nombre}`,
      stage: 'cliente',
      amount: tenant.precio || 0,
      personId,
      companyId,
    });

    logger.info('crm_sync_tenant', { nombre: tenant.nombre });
  } catch (err) {
    logger.error('crm_sync_tenant_error', { error: err.message });
  }
}

module.exports = {
  onSolicitudCreada,
  onTrialAprobado,
  onDemoSolicitada,
  onTenantCreado,
};
```

- [ ] **Step 2: Agregar trigger en routes/superadmin.js — al aprobar solicitud**

En `routes/superadmin.js`, dentro de `router.post('/solicitudes/:id/aprobar', ...)`, después del bloque de email de bienvenida, agregar:

```javascript
    // Sync to CRM
    try {
      const crmSync = require('../services/crm-sync');
      await crmSync.onTrialAprobado({
        email: solicitud.google_email,
        nombre: solicitud.unom || solicitud.nombre_restaurante,
        restaurante: solicitud.nombre_restaurante,
        telefono: solicitud.telefono_solicitante,
      });
    } catch (_) {}
```

- [ ] **Step 3: Agregar trigger en routes/superadmin.js — al crear tenant manual**

En `router.post('/tenants', ...)`, después del bloque de email, agregar:

```javascript
    // Sync to CRM
    try {
      const crmSync = require('../services/crm-sync');
      await crmSync.onTenantCreado({
        email_admin,
        nombre,
        subdominio: subdominionLimpio,
        precio: precioValue,
      });
    } catch (_) {}
```

- [ ] **Step 4: Agregar trigger en routes/public.js — al recibir demo**

En `router.post('/api/demos', ...)`, después del INSERT, agregar:

```javascript
    // Sync to CRM
    try {
      const crmSync = require('../services/crm-sync');
      await crmSync.onDemoSolicitada({ nombre, restaurante, whatsapp, paquete, fecha_preferida });
    } catch (_) {}
```

- [ ] **Step 5: Agregar trigger en routes/solicitud.js — al crear solicitud**

En la ruta POST que crea solicitud, después del INSERT, agregar:

```javascript
    // Sync to CRM
    try {
      const crmSync = require('../services/crm-sync');
      await crmSync.onSolicitudCreada({
        email: user.google_email,
        nombre: user.nombre || nombre_restaurante,
        restaurante: nombre_restaurante,
        telefono: telefono,
        distrito: direccion,
      });
    } catch (_) {}
```

- [ ] **Step 6: Commit**
```bash
git add services/crm-sync.js routes/superadmin.js routes/public.js routes/solicitud.js
git commit -m "feat(crm): add CRM sync triggers on solicitud, demo, trial approval, and tenant creation"
```

---

## Task 5: Cron secuencia WhatsApp trial

**Files:**
- Modify: `routes/cron.js`

- [ ] **Step 1: Agregar cron de secuencia WhatsApp para trials**

En `routes/cron.js`, agregar nuevo endpoint antes del `module.exports`:

```javascript
// ---------------------------------------------------------------------------
// WhatsApp trial sequence — daily at 9am Lima time
// ---------------------------------------------------------------------------
router.get('/whatsapp-trial-sequence', async (req, res) => {
  try {
    const whatsapp = require('../services/whatsapp-api')
    const results = { day3: 0, day7: 0, day12: 0, day14: 0 }

    // Get active trials with their day count
    const [trials] = await db.query(`
      SELECT t.id, t.nombre, t.email_admin, t.trial_inicio, t.trial_fin,
             u.nombre as user_nombre,
             EXTRACT(DAY FROM NOW() - t.trial_inicio) as trial_day
      FROM tenants t
      LEFT JOIN usuarios u ON u.tenant_id = t.id AND u.rol = 'administrador'
      WHERE t.estado_trial = 'activo'
        AND t.trial_fin > NOW()
    `)

    for (const trial of (trials || [])) {
      const day = Math.floor(trial.trial_day)
      const nombre = trial.user_nombre || trial.nombre
      const phone = trial.telefono || null

      if (!phone) continue

      if (day === 3) {
        await whatsapp.sendTemplate(phone, 'trial_dia3', [nombre])
        results.day3++
      } else if (day === 7) {
        await whatsapp.sendTemplate(phone, 'trial_dia7', [nombre])
        results.day7++
      } else if (day === 12) {
        await whatsapp.sendTemplate(phone, 'trial_dia12', [nombre])
        results.day12++
      } else if (day === 14) {
        await whatsapp.sendTemplate(phone, 'trial_dia14', [nombre])
        results.day14++
      }
    }

    logger.info('cron_whatsapp_trial', results)
    res.json({ ok: true, ...results })
  } catch (err) {
    logger.error('cron_whatsapp_trial_error', { error: err.message })
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 2: Agregar al vercel.json**

En `vercel.json`, agregar en el array `crons`:
```json
{ "path": "/api/cron/whatsapp-trial-sequence", "schedule": "0 14 * * *" }
```
(14:00 UTC = 9:00 AM Lima)

- [ ] **Step 3: Commit**
```bash
git add routes/cron.js vercel.json
git commit -m "feat(crm): add WhatsApp trial sequence cron (Day 3/7/12/14)"
```

---

## Task 6: Deploy + variables de entorno

- [ ] **Step 1: Agregar variables en Vercel**

```bash
vercel env add TWENTY_API_URL production
# Value: https://crm-internal.mirestconia.com
vercel env add TWENTY_API_KEY production
# Value: (API key from Twenty Settings)
# WhatsApp variables — agregar cuando se tenga número aprobado:
# vercel env add WHATSAPP_PHONE_ID production
# vercel env add WHATSAPP_TOKEN production
```

- [ ] **Step 2: Push y deploy**
```bash
git push origin main
```

- [ ] **Step 3: Verificar sync**
Crear un tenant de prueba desde superadmin → verificar que aparece en Twenty CRM como Person + Opportunity.

---

## Task 7: Branding Twenty CRM

- [ ] **Step 1: Inyectar CSS custom via nginx**

En el VPS, crear archivo de estilos custom:
```bash
cat > /opt/twenty/custom-theme.css << 'CSS'
:root {
  --color-blue: #FF6B35 !important;
  --accent-primary: #FF6B35 !important;
}
CSS
```

Modificar nginx para inyectar el CSS en las respuestas de Twenty.

- [ ] **Step 2: Cambiar workspace name e ícono**
En Twenty UI: Settings > General > Workspace name: "MiRestcon IA — Ventas"

- [ ] **Step 3: Commit nota**
```bash
git commit --allow-empty -m "feat(crm): apply MiRestcon IA branding to Twenty CRM"
```
