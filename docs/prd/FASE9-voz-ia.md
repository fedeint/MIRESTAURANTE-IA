# PRD: Fase 9 - IA con Voz
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Features
- Boton microfono en el chat (al lado del send)
- Speech-to-Text: Web Speech API (SpeechRecognition) es-PE
- Text-to-Speech: Web Speech API (SpeechSynthesis) es-PE
- Toggle "Leer respuestas en voz alta" (activado por defecto)
- Boton se pone rojo cuando esta escuchando
- Idioma: espanol Peru (es-PE)
- Gratis, sin API externa, funciona en Chrome/Edge

## Flujo
1. Click microfono → se activa reconocimiento de voz
2. Usuario habla → se convierte a texto → se envia automaticamente
3. IA responde → texto se lee en voz alta (si toggle activado)

## Fallback
- Si el navegador no soporta Web Speech API, el boton se oculta
- Solo texto funciona siempre

## Archivos
- `views/chat.ejs` - Boton mic, toggle voz, JS Speech API
