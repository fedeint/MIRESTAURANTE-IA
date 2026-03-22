// services/file-upload.js
'use strict';

const MAGIC_BYTES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])]
};

/**
 * Validates file content by checking magic bytes (not just extension).
 */
function validateMagicBytes(buffer, declaredMime) {
  if (!buffer || buffer.length < 12) return false;

  // MP4: check for 'ftyp' at offset 4
  if (declaredMime === 'video/mp4') {
    return buffer.slice(4, 8).toString('ascii') === 'ftyp';
  }

  // WebM: check for EBML header
  if (declaredMime === 'video/webm') {
    return buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
  }

  const expected = MAGIC_BYTES[declaredMime];
  if (!expected) return false;

  return expected.some(magic => buffer.slice(0, magic.length).equals(magic));
}

/**
 * Extracts safe EXIF data from an image buffer.
 * Only returns known safe fields (lat, lng, timestamp, camera).
 */
function extractExifSafe(buffer) {
  try {
    const ExifParser = require('exif-parser');
    const parser = ExifParser.create(buffer);
    const result = parser.parse();
    const tags = result.tags || {};
    return {
      lat: typeof tags.GPSLatitude === 'number' ? tags.GPSLatitude : null,
      lng: typeof tags.GPSLongitude === 'number' ? tags.GPSLongitude : null,
      timestamp: tags.DateTimeOriginal
        ? new Date(tags.DateTimeOriginal * 1000).toISOString()
        : null,
      camera: tags.Make ? `${tags.Make} ${tags.Model || ''}`.trim() : null
    };
  } catch (e) {
    return { lat: null, lng: null, timestamp: null, camera: null };
  }
}

/**
 * Haversine distance in km between two coordinates.
 */
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { validateMagicBytes, extractExifSafe, distanciaKm };
