const express = require('express');
const router = express.Router();
const { EdgeTTS } = require('@andresaya/edge-tts');

// POST /api/tts - Generate speech audio from text
router.post('/', async (req, res) => {
    const { texto, voz } = req.body;
    if (!texto || !String(texto).trim()) {
        return res.status(400).json({ error: 'Texto requerido' });
    }

    try {
        const tts = new EdgeTTS();
        await tts.synthesize(String(texto).trim(), voz || 'es-MX-DaliaNeural', {
            rate: '+5%',
            pitch: '+10Hz'
        });

        const audioBuffer = tts.toBuffer();
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'public, max-age=3600'
        });
        res.send(audioBuffer);
    } catch (error) {
        console.error('Error TTS:', error);
        res.status(500).json({ error: 'Error al generar audio' });
    }
});

module.exports = router;
