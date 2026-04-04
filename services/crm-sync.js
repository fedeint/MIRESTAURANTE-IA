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
      stage: 'LEAD',
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

    await twenty.createOpportunity({
      name: `Trial Activo — ${solicitud.restaurante}`,
      stage: 'TRIAL_ACTIVO',
      personId,
    });

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
      email: demo.email || `${(demo.whatsapp || '').replace(/\D/g, '')}@wa.temp`,
      firstName: demo.nombre,
      phone: demo.whatsapp,
    });

    await twenty.createOpportunity({
      name: `Demo — ${demo.restaurante || demo.nombre}`,
      stage: 'DEMO_AGENDADA',
      personId,
    });

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
      domainName: `mirestconia.com/${tenant.subdominio}`,
    });

    await twenty.createOpportunity({
      name: `Cliente — ${tenant.nombre}`,
      stage: 'CLIENTE',
      amount: tenant.precio || 0,
      personId,
      companyId,
    });

    logger.info('crm_sync_tenant', { nombre: tenant.nombre });
  } catch (err) {
    logger.error('crm_sync_tenant_error', { error: err.message });
  }
}

module.exports = { onSolicitudCreada, onTrialAprobado, onDemoSolicitada, onTenantCreado };
