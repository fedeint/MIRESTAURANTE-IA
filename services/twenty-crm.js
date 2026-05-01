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
      logger.error('twenty_crm_error', { status: res.status, body: text.substring(0, 200) });
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
 * Create or find a person (contact) in Twenty CRM.
 */
async function upsertPerson({ email, firstName, lastName, phone, city }) {
  const findResult = await gql(`
    query FindPerson($email: String!) {
      people(filter: { emails: { primaryEmail: { eq: $email } } }, first: 1) {
        edges { node { id } }
      }
    }
  `, { email });

  const existing = findResult?.people?.edges?.[0]?.node;
  if (existing) return existing.id;

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
  const result = await gql(`
    mutation CreateOpportunity($data: OpportunityCreateInput!) {
      createOpportunity(data: $data) { id stage }
    }
  `, {
    data: {
      name,
      stage: (stage || 'LEAD').toUpperCase(),
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
  return gql(`
    mutation UpdateStage($id: ID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) { id stage }
    }
  `, { id: opportunityId, data: { stage: stage.toUpperCase() } });
}

/**
 * Create or find a company in Twenty CRM.
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
      name,
      domainName: domainName || '',
      address: { addressCity: city || '' },
    }
  });

  return result?.createCompany?.id || null;
}

/**
 * Add a note to a record.
 */
async function addNote(title, body) {
  return gql(`
    mutation CreateNote($data: NoteCreateInput!) {
      createNote(data: $data) { id }
    }
  `, { data: { title, body } });
}

module.exports = { gql, upsertPerson, createOpportunity, updateOpportunityStage, upsertCompany, addNote };
