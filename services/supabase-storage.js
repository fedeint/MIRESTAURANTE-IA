// services/supabase-storage.js
'use strict';

const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'verificacion';

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

/**
 * Uploads a file buffer to Supabase Storage.
 * @returns {string|null} Public URL or null if Storage unavailable
 */
async function uploadFile(buffer, path, contentType) {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: true
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // Get public URL
  const { data: urlData } = client.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return urlData?.publicUrl || null;
}

/**
 * Deletes a file from Supabase Storage.
 */
async function deleteFile(path) {
  const client = getClient();
  if (!client) return;

  await client.storage
    .from(BUCKET)
    .remove([path]);
}

/**
 * Uploads verification photos for a tenant.
 * @returns {Array<{url, filename, exif}>}
 */
async function uploadVerificationPhotos(tenantId, fotosFiles, exifDataArray) {
  const results = [];

  for (let i = 0; i < fotosFiles.length; i++) {
    const file = fotosFiles[i];
    const ext = file.originalname.split('.').pop() || 'jpg';
    const storagePath = `tenant-${tenantId}/fotos/foto-${Date.now()}-${i}.${ext}`;

    try {
      const url = await uploadFile(file.buffer, storagePath, file.mimetype);
      results.push({
        url: url,
        filename: file.originalname,
        size: file.size,
        storagePath: storagePath,
        exif: exifDataArray[i] || {},
        sospechoso: exifDataArray[i]?.sospechoso || false
      });
    } catch (err) {
      console.error(`Error uploading photo ${i}:`, err.message);
      results.push({
        url: null,
        filename: file.originalname,
        size: file.size,
        storagePath: null,
        exif: exifDataArray[i] || {},
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Uploads verification video for a tenant.
 * @returns {string|null} Public URL
 */
async function uploadVerificationVideo(tenantId, videoFile) {
  const ext = videoFile.originalname.split('.').pop() || 'mp4';
  const storagePath = `tenant-${tenantId}/video/video-${Date.now()}.${ext}`;

  try {
    return await uploadFile(videoFile.buffer, storagePath, videoFile.mimetype);
  } catch (err) {
    console.error('Error uploading video:', err.message);
    return null;
  }
}

module.exports = {
  uploadFile,
  deleteFile,
  uploadVerificationPhotos,
  uploadVerificationVideo
};
