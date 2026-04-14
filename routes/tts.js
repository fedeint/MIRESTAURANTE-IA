// routes/tts.js
// DalIA voice — Gemini 2.5 Flash TTS via AI Studio.
// Devuelve WAV (PCM 24kHz wrap) para reproducción nativa en navegador.

'use strict';

const express = require('express');
const router = express.Router();
const tenantAi = require('../lib/tenant-ai');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';
const DEFAULT_VOICE = 'Aoede'; // femenina suave — elegida para DalIA
const ALLOWED_VOICES = new Set([
    'Aoede','Kore','Puck','Charon','Fenrir','Leda','Orus','Zephyr',
    'Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba',
    'Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar',
    'Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi',
    'Vindemiatrix','Sadachbia','Sadaltager','Sulafat'
]);

/**
 * Wrap raw PCM (24kHz, 16-bit mono LE) as a WAV para que <audio> lo reproduzca directo.
 */
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitDepth = 16) {
    const byteRate   = sampleRate * numChannels * bitDepth / 8;
    const blockAlign = numChannels * bitDepth / 8;
    const dataSize   = pcmBuffer.length;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);            // fmt chunk size
    header.writeUInt16LE(1, 20);              // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
}

// POST /api/tts — genera audio de un texto con la voz de DalIA
router.post('/', async (req, res) => {
    const tid = req.tenantId || 1;

    // BYOK: resolver key del tenant (propia o maestra según plan)
    const resolved = await tenantAi.resolveApiKey(tid);
    if (!resolved) {
        return res.status(402).json({
            error: 'Tu plan básico requiere configurar tu propia API key de Google AI Studio en /config/dallia. O contrata Premium para voz con nuestra cuenta.',
            upgradeRequired: true
        });
    }
    const apiKey = resolved.key;

    const { texto, voz, estilo } = req.body;
    if (!texto || !String(texto).trim()) {
        return res.status(400).json({ error: 'Texto requerido' });
    }

    const voiceName = ALLOWED_VOICES.has(voz) ? voz : DEFAULT_VOICE;
    const textoLimpio = String(texto).trim().slice(0, 5000); // hard cap
    const estiloLimpio = estilo ? String(estilo).trim().slice(0, 500) : null;

    // El modelo TTS no soporta system_instruction — el estilo va como contexto en el texto
    const textoConEstilo = estiloLimpio
        ? `[${estiloLimpio}]\n\n${textoLimpio}`
        : textoLimpio;

    const reqBody = {
        contents: [{ parts: [{ text: textoConEstilo }] }],
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName }
                }
            }
        }
    };

    try {
        const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });

        const data = await resp.json();
        if (!resp.ok) {
            console.error('[TTS] Gemini error:', data);
            const isQuota = resp.status === 429;
            const msg = data?.error?.message || 'Gemini TTS error';

            await tenantAi.logFallback(tid, 'gemini', 'none', msg, 'tts').catch(()=>{});

            if (isQuota) {
                return res.status(429).json({
                    error: resolved.plan === 'basico'
                        ? '⚠️ Alcanzaste tu límite gratuito diario de Google AI. Vuelve mañana o contrata Premium.'
                        : 'Google AI saturado. Reintenta en unos segundos.',
                    upgradeRequired: resolved.plan === 'basico'
                });
            }

            return res.status(502).json({ error: msg, status: resp.status });
        }

        const part = data?.candidates?.[0]?.content?.parts?.[0];
        const b64  = part?.inlineData?.data;
        if (!b64) {
            return res.status(502).json({ error: 'Gemini TTS no devolvió audio' });
        }

        const pcm = Buffer.from(b64, 'base64');
        const wav = pcmToWav(pcm);

        // Registrar uso para facturación Premium
        const duracionSeg = Math.ceil(pcm.length / (24000 * 2)); // 24kHz * 2 bytes/sample
        tenantAi.recordVoiceUsage(tid, 'tts', duracionSeg, textoLimpio.length, 'gemini-2.5-flash-tts', resolved.source).catch(()=>{});

        res.set({
            'Content-Type': 'audio/wav',
            'Content-Length': wav.length,
            'Cache-Control': 'private, max-age=3600',
            'X-TTS-Voice': voiceName,
            'X-TTS-Provider': 'gemini-2.5-flash-tts',
            'X-TTS-Source': resolved.source
        });
        res.send(wav);
    } catch (err) {
        console.error('[TTS] fallo:', err);
        res.status(500).json({ error: 'Error al generar audio' });
    }
});

// GET /api/tts/voices — lista de voces disponibles (para UI)
router.get('/voices', (req, res) => {
    res.json({
        default: DEFAULT_VOICE,
        voices: Array.from(ALLOWED_VOICES).sort()
    });
});

module.exports = router;
