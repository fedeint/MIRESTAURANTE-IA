// services/vps-storage.js
'use strict';

const logger = require('../lib/logger');

const STORAGE_URL = process.env.STORAGE_API_URL || '';
const STORAGE_KEY = process.env.STORAGE_API_KEY || '';

/**
 * Upload a file to VPS storage.
 * @param {number} tenantId
 * @param {string} category - 'solicitud', 'productos', 'logo', 'chat', 'documentos'
 * @param {Buffer} buffer - file contents
 * @param {string} originalName - original filename
 * @param {string} mimetype
 * @returns {string|null} path on storage or null if failed
 */
async function uploadFile(tenantId, category, buffer, originalName, mimetype) {
  if (!STORAGE_URL || !STORAGE_KEY) {
    logger.info('vps_storage_skip', { reason: 'STORAGE_API_URL or STORAGE_API_KEY not set' });
    return null;
  }

  try {
    const FormData = (await import('node-fetch')).default ? null : null;
    // Use native fetch (Node 22+)
    const form = new globalThis.FormData();
    const blob = new Blob([buffer], { type: mimetype });
    form.append('file', blob, originalName);

    const res = await fetch(`${STORAGE_URL}/files/${tenantId}/${category}`, {
      method: 'POST',
      headers: { 'X-Storage-Key': STORAGE_KEY },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('vps_storage_upload_error', { tenantId, category, status: res.status, error: err.error });
      return null;
    }

    const data = await res.json();
    logger.info('vps_storage_uploaded', { tenantId, category, path: data.path, size: data.size });
    return data.path;
  } catch (err) {
    logger.error('vps_storage_upload_failed', { tenantId, category, error: err.message });
    return null;
  }
}

/**
 * Get a proxied URL for a file.
 * @param {string} storagePath - e.g. 'tenant-1/productos/ceviche.jpg'
 * @returns {string} URL to access via the app's proxy
 */
function getFileUrl(storagePath) {
  return `/api/files/${storagePath}`;
}

/**
 * Download a file from VPS storage.
 * @param {number} tenantId
 * @param {string} category
 * @param {string} filename
 * @returns {Response|null}
 */
async function downloadFile(tenantId, category, filename) {
  if (!STORAGE_URL || !STORAGE_KEY) return null;

  try {
    const res = await fetch(`${STORAGE_URL}/files/${tenantId}/${category}/${filename}`, {
      headers: { 'X-Storage-Key': STORAGE_KEY },
    });

    if (!res.ok) return null;
    return res;
  } catch (err) {
    logger.error('vps_storage_download_failed', { tenantId, category, filename, error: err.message });
    return null;
  }
}

/**
 * Delete a file from VPS storage.
 */
async function deleteFile(tenantId, category, filename) {
  if (!STORAGE_URL || !STORAGE_KEY) return false;

  try {
    const res = await fetch(`${STORAGE_URL}/files/${tenantId}/${category}/${filename}`, {
      method: 'DELETE',
      headers: { 'X-Storage-Key': STORAGE_KEY },
    });
    return res.ok;
  } catch (err) {
    logger.error('vps_storage_delete_failed', { error: err.message });
    return false;
  }
}

/**
 * List files for a tenant.
 */
async function listFiles(tenantId) {
  if (!STORAGE_URL || !STORAGE_KEY) return [];

  try {
    const res = await fetch(`${STORAGE_URL}/files/${tenantId}`, {
      headers: { 'X-Storage-Key': STORAGE_KEY },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    return [];
  }
}

/**
 * Get VPS health status (for observability).
 */
async function getHealth() {
  if (!STORAGE_URL || !STORAGE_KEY) return null;

  try {
    const res = await fetch(`${STORAGE_URL}/health`, {
      headers: { 'X-Storage-Key': STORAGE_KEY },
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    return null;
  }
}

module.exports = {
  uploadFile,
  getFileUrl,
  downloadFile,
  deleteFile,
  listFiles,
  getHealth,
};
