// lib/crypto-helper.js
// Cifrado/descifrado simétrico de secretos sensibles (API keys de tenants).
// Usa AES-256-GCM con clave derivada de SESSION_SECRET via scrypt.
//
// Formato del blob cifrado (base64 url-safe):
//   [salt(16) | iv(12) | authTag(16) | ciphertext(N)]
//
// NUNCA loguear ni persistir la clave plana después de cifrarla.

'use strict';

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;      // AES-256
const SALT_LEN = 16;
const IV_LEN = 12;       // GCM recomienda 96 bits
const TAG_LEN = 16;
const SCRYPT_COST = 16384; // N parameter — balance seguridad/perf

function getMasterSecret() {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 32) {
        throw new Error('SESSION_SECRET debe tener al menos 32 chars para cifrado BYOK');
    }
    return s;
}

function deriveKey(salt) {
    return crypto.scryptSync(getMasterSecret(), salt, KEY_LEN, { N: SCRYPT_COST });
}

/**
 * Cifra un string y devuelve blob base64 url-safe.
 * @param {string} plaintext
 * @returns {string}
 */
function encrypt(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') {
        throw new Error('encrypt: plaintext requerido (string)');
    }
    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const key = deriveKey(salt);

    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const blob = Buffer.concat([salt, iv, authTag, ciphertext]);
    return blob.toString('base64url');
}

/**
 * Descifra blob base64 url-safe y devuelve plaintext.
 * Lanza si el blob fue manipulado (GCM auth tag falla).
 * @param {string} encoded
 * @returns {string}
 */
function decrypt(encoded) {
    if (!encoded || typeof encoded !== 'string') {
        throw new Error('decrypt: blob requerido');
    }
    const blob = Buffer.from(encoded, 'base64url');
    if (blob.length < SALT_LEN + IV_LEN + TAG_LEN + 1) {
        throw new Error('decrypt: blob demasiado corto');
    }

    const salt       = blob.slice(0, SALT_LEN);
    const iv         = blob.slice(SALT_LEN, SALT_LEN + IV_LEN);
    const authTag    = blob.slice(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
    const ciphertext = blob.slice(SALT_LEN + IV_LEN + TAG_LEN);

    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
}

/**
 * Versión para UI: muestra "AIza...wXYZ" del API key (primeros 4 + últimos 4).
 */
function maskKey(plainKey) {
    if (!plainKey || plainKey.length < 12) return '••••••••';
    return plainKey.slice(0, 4) + '...' + plainKey.slice(-4);
}

module.exports = { encrypt, decrypt, maskKey };
