// routes/stt.js
// DalIA STT — transcripción de audio con Gemini 2.5 Flash multimodal.
// BYOK: usa la API key del tenant (o master si plan Premium).
//
// Frontend espera grabar con MediaRecorder (webm/mp4) y enviar como
// multipart/form-data (field: "audio") o body binary directo.

'use strict';

const express = require('express');
const router = express.Router();
const tenantAi = require('../lib/tenant-ai');

// Multer para manejo de uploads multipart (memoria, sin disco)
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max (≈ 10min audio)
});

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const PROMPT_TRANSCRIPCION = `Transcribe este audio a texto en español peruano.
Reglas:
- Devuelve SOLO el texto transcrito, sin comentarios ni formato.
- Mantén modismos peruanos ("dale", "pe", "chévere", "manyas").
- Si el audio está vacío o es ininteligible, devuelve: "(audio no entendido)".
- NO inventes contenido si hay silencio.`;

/**
 * Mapea mime types comunes de MediaRecorder a los soportados por Gemini.
 * Gemini acepta: audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac
 */
function normalizeMime(input) {
    const m = (input || '').toLowerCase();
    if (m.includes('webm')) return 'audio/ogg';    // Gemini acepta ogg; muchos browsers graban webm con codec opus
    if (m.includes('mp4') || m.includes('m4a')) return 'audio/aac';
    if (m.includes('ogg')) return 'audio/ogg';
    if (m.includes('wav')) return 'audio/wav';
    if (m.includes('mp3')) return 'audio/mp3';
    if (m.includes('flac')) return 'audio/flac';
    return 'audio/ogg'; // default
}

// POST /api/stt — transcribe audio a texto
router.post('/', upload.single('audio'), async (req, res) => {
    const tid = req.tenantId || 1;

    // BYOK resolution
    const resolved = await tenantAi.resolveApiKey(tid);
    if (!resolved) {
        return res.status(402).json({
            error: 'Para usar la voz necesitas configurar tu API key de Google AI (gratis) en /config/dallia, o contratar Premium.',
            upgradeRequired: true
        });
    }

    // Audio desde multipart o body raw
    let audioBuffer;
    let mimeType;
    if (req.file) {
        audioBuffer = req.file.buffer;
        mimeType = normalizeMime(req.file.mimetype);
    } else if (req.body && Buffer.isBuffer(req.body)) {
        audioBuffer = req.body;
        mimeType = normalizeMime(req.headers['content-type']);
    } else {
        return res.status(400).json({ error: 'Audio requerido (multipart field "audio" o body binary)' });
    }

    if (audioBuffer.length < 500) {
        return res.status(400).json({ error: 'Audio demasiado corto' });
    }

    const audioBase64 = audioBuffer.toString('base64');

    try {
        const resp = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(resolved.key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: PROMPT_TRANSCRIPCION },
                        { inlineData: { mimeType, data: audioBase64 } }
                    ]
                }],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 1024
                }
            })
        });

        const data = await resp.json();
        if (!resp.ok) {
            console.error('[STT] Gemini error:', data);
            const msg = data?.error?.message || 'Gemini STT error';

            await tenantAi.logFallback(tid, 'gemini', 'none', msg, 'stt').catch(()=>{});

            if (resp.status === 429) {
                return res.status(429).json({
                    error: resolved.plan === 'basico'
                        ? '⚠️ Alcanzaste tu límite gratuito diario de Google AI. Vuelve mañana o contrata Premium.'
                        : 'Google AI saturado, reintenta en unos segundos.',
                    upgradeRequired: resolved.plan === 'basico'
                });
            }
            return res.status(502).json({ error: msg });
        }

        const parts = data?.candidates?.[0]?.content?.parts || [];
        const texto = parts.filter(p => p.text).map(p => p.text).join(' ').trim();

        if (!texto || texto === '(audio no entendido)') {
            return res.json({ texto: '', entendido: false });
        }

        // Estimar duración (muy rough — Gemini no la devuelve)
        const duracionSeg = Math.round(audioBuffer.length / 16000); // ~16KB/s para audio comprimido
        tenantAi.recordVoiceUsage(tid, 'stt', duracionSeg, texto.length, 'gemini-2.5-flash', resolved.source).catch(()=>{});

        res.json({
            texto,
            entendido: true,
            modelo: 'gemini-2.5-flash',
            source: resolved.source
        });
    } catch (err) {
        console.error('[STT] fallo:', err);
        res.status(500).json({ error: 'Error al transcribir audio' });
    }
});

module.exports = router;
