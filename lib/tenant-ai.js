// lib/tenant-ai.js
// Gestión de credenciales IA por tenant (BYOK).
//
// Cada tenant puede traer su propia API key de Google AI Studio (plan Básico),
// o contratar Premium donde usamos la key maestra (GOOGLE_AI_API_KEY).
//
// Flujo de resolución de key (en orden):
//   1. tenant.google_ai_key (cifrada) → SI existe y es válida → usar
//   2. plan = premium → usar master key
//   3. plan = basico → 429 / upgrade message
//
// Los callers (routes/chat.js, tts.js, stt.js) usan resolveApiKey(tenantId).

'use strict';

const db = require('../db');
const { encrypt, decrypt, maskKey } = require('./crypto-helper');

/**
 * Plan del tenant. Retorna 'basico' | 'premium' | 'trial'.
 * Default 'basico' si no hay registro.
 */
async function getTenantPlan(tenantId) {
    try {
        const [[row]] = await db.query(
            `SELECT plan_tipo FROM tenant_ai_credentials WHERE tenant_id = ? LIMIT 1`,
            [tenantId]
        );
        return row?.plan_tipo || 'basico';
    } catch (_) {
        return 'basico';
    }
}

/**
 * Devuelve la key descifrada del tenant o null si no existe.
 */
async function getTenantGoogleKey(tenantId) {
    try {
        const [[row]] = await db.query(
            `SELECT google_ai_key_encrypted, google_ai_key_validated
             FROM tenant_ai_credentials WHERE tenant_id = ? LIMIT 1`,
            [tenantId]
        );
        if (!row?.google_ai_key_encrypted) return null;
        return decrypt(row.google_ai_key_encrypted);
    } catch (e) {
        console.warn('[tenant-ai] getTenantGoogleKey failed:', e.message);
        return null;
    }
}

/**
 * Devuelve info para UI: preview enmascarado, plan, validada.
 * NUNCA devuelve la key en plano.
 */
async function getTenantKeyInfo(tenantId) {
    try {
        const [[row]] = await db.query(
            `SELECT google_ai_key_preview, google_ai_key_validated,
                    google_ai_key_last_test, plan_tipo,
                    voice_minutos_dia, voice_minutos_limite_dia
             FROM tenant_ai_credentials WHERE tenant_id = ? LIMIT 1`,
            [tenantId]
        );
        return {
            tieneKey:    !!row?.google_ai_key_preview,
            keyPreview:  row?.google_ai_key_preview || null,
            validada:    !!row?.google_ai_key_validated,
            ultimoTest:  row?.google_ai_key_last_test || null,
            plan:        row?.plan_tipo || 'basico',
            vozHoy:      row?.voice_minutos_dia || 0,
            vozLimite:   row?.voice_minutos_limite_dia || 0
        };
    } catch (_) {
        return {
            tieneKey: false, keyPreview: null, validada: false,
            ultimoTest: null, plan: 'basico', vozHoy: 0, vozLimite: 0
        };
    }
}

/**
 * Guarda key cifrada para el tenant. Valida que la key tenga formato AIza...
 */
async function saveTenantGoogleKey(tenantId, plainKey, validated = false) {
    if (!plainKey || typeof plainKey !== 'string') {
        throw new Error('API key inválida');
    }
    const clean = plainKey.trim();
    if (!clean.startsWith('AIza') || clean.length < 30) {
        throw new Error('Formato inválido. Google AI keys empiezan con AIza...');
    }

    // Esperar a que ensureSchema() cree la tabla si aún no existe
    await db.schemaReady;

    const encrypted = encrypt(clean);
    const preview   = maskKey(clean);

    await db.query(
        `INSERT INTO tenant_ai_credentials
         (tenant_id, google_ai_key_encrypted, google_ai_key_preview,
          google_ai_key_validated, google_ai_key_last_test, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           google_ai_key_encrypted = EXCLUDED.google_ai_key_encrypted,
           google_ai_key_preview   = EXCLUDED.google_ai_key_preview,
           google_ai_key_validated = EXCLUDED.google_ai_key_validated,
           google_ai_key_last_test = NOW(),
           updated_at              = NOW()`,
        [tenantId, encrypted, preview, validated]
    );
    return { preview, validated };
}

/**
 * Borra la key del tenant (el cliente la revoca desde UI).
 */
async function deleteTenantGoogleKey(tenantId) {
    await db.query(
        `UPDATE tenant_ai_credentials
         SET google_ai_key_encrypted = NULL,
             google_ai_key_preview   = NULL,
             google_ai_key_validated = FALSE,
             updated_at              = NOW()
         WHERE tenant_id = ?`,
        [tenantId]
    );
}

/**
 * Valida una key contra Gemini haciendo un ping barato.
 * Returns { ok: bool, razon?: string }
 */
async function validateGoogleKey(plainKey) {
    try {
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(plainKey)}`,
            { method: 'GET' }
        );
        if (resp.ok) return { ok: true };
        const data = await resp.json().catch(() => ({}));
        return { ok: false, razon: data?.error?.message || `HTTP ${resp.status}` };
    } catch (e) {
        return { ok: false, razon: e.message };
    }
}

/**
 * Resolución principal que usan los callers. Devuelve:
 *   { key, source: 'tenant' | 'master', plan }
 * O null si no hay ninguna disponible (basico sin key).
 */
async function resolveApiKey(tenantId) {
    const plan = await getTenantPlan(tenantId);

    // Si el tenant tiene su propia key, úsala siempre primero
    const tenantKey = await getTenantGoogleKey(tenantId);
    if (tenantKey) {
        return { key: tenantKey, source: 'tenant', plan };
    }

    // Plan premium: usa master key (nuestra factura)
    if (plan === 'premium' || plan === 'trial') {
        const masterKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
        if (masterKey) return { key: masterKey, source: 'master', plan };
    }

    // Plan básico sin key propia: no hay key disponible
    return null;
}

/**
 * Registrar salto de Gemini a DeepSeek (u otro fallback) para analítica.
 */
async function logFallback(tenantId, origen, destino, razon, tipoCall) {
    try {
        await db.query(
            `INSERT INTO ai_fallback_log (tenant_id, origen, destino, razon, tipo_call)
             VALUES (?, ?, ?, ?, ?)`,
            [tenantId, origen, destino, String(razon || '').slice(0, 100), tipoCall]
        );
    } catch (_) { /* no fatal */ }
}

/**
 * Registrar uso de voz (TTS/STT) para facturación Premium.
 */
async function recordVoiceUsage(tenantId, tipo, duracionSeg, caracteres, modelo, source) {
    try {
        await db.query(
            `INSERT INTO tenant_voice_usage (tenant_id, tipo, duracion_seg, caracteres, modelo, source_key)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tenantId, tipo, duracionSeg, caracteres || null, modelo, source]
        );
        // Incrementar contador diario
        const minutos = Math.ceil(duracionSeg / 60);
        await db.query(
            `UPDATE tenant_ai_credentials
             SET voice_minutos_dia = voice_minutos_dia + ?,
                 voice_minutos_mes = voice_minutos_mes + ?
             WHERE tenant_id = ?`,
            [minutos, minutos, tenantId]
        );
    } catch (_) { /* no fatal */ }
}

module.exports = {
    getTenantPlan,
    getTenantGoogleKey,
    getTenantKeyInfo,
    saveTenantGoogleKey,
    deleteTenantGoogleKey,
    validateGoogleKey,
    resolveApiKey,
    logFallback,
    recordVoiceUsage
};
