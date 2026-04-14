# Arquitectura técnica de la IA

## Proveedores LLM (en `lib/llm.js` y `routes/chat.js`)

Prioridad de uso (primera que exista gana):

1. **`DEEPSEEK_API_KEY`** → DeepSeek V3 (`deepseek-chat`) — **default actual**, ~4x más barato que Kimi
2. **`KIMI_API_KEY`** → Moonshot Kimi (`moonshot-v1-8k` directo, o `moonshotai/kimi-k2` vía OpenRouter en chat.js)
3. **`ANTHROPIC_API_KEY`** → Claude (`claude-sonnet-4-20250514`)

El **tono peruano** está forzado en el system prompt (bloque `# ESTILO PERUANO OBLIGATORIO` en `chat.js:131+`), así que cualquier modelo lo replica. No dependemos del fine-tuning del modelo.

### Precios (USD/M tokens)
| Modelo | Input | Output | Cache hit |
|---|---|---|---|
| deepseek-chat | $0.28 | $0.42 | $0.028 (10%) |
| moonshot-v1-8k | $0.60 | $2.50 | — |
| claude-sonnet-4 | $3.00 | $15.00 | $0.30 (10%) |

Constantes en `lib/llm.js:PRICING`.

## Voz (TTS) — Gemini 2.5 Flash via AI Studio

Endpoint: **`POST /api/tts`** en `routes/tts.js`.

- **Proveedor**: Google AI Studio (Gemini 2.5 Flash TTS Preview)
- **Voz default**: **Aoede** (femenina suave, elegida para DalIA)
- **Voces disponibles**: 30 prebuilt (Kore, Puck, Charon, Fenrir, Leda, Aoede, Zephyr, etc.)
- **Formato**: recibe PCM 24kHz 16-bit mono, lo wrap como WAV → navegador lo reproduce con `<audio>`
- **Env var**: `GOOGLE_AI_API_KEY` (la misma sirve para texto Gemini si algún día se migra)
- **Free tier**: 500 req/día Gemini 2.5 Flash — suficiente para 99% de restaurantes
- **Paid tier**: ~$0.50/M input + $10/M audio output (~$1.50/mes perfil mediano)
- **Request body**: `{ texto: string, voz?: string }`
- **Response**: `audio/wav` binary

Listar voces disponibles: `GET /api/tts/voices`.

## Flujo de una consulta al chat

```
Usuario escribe en /chat
        │
        ▼
POST /api/chat (routes/chat.js)
        │
        ├── 1. Validar mensaje + rol desde sesión
        ├── 2. capturarPreguntaEnviada() → PostHog
        ├── 3. Detectar intención (stock, vencimiento, resumen, caja, meta)
        │       └── Si matchea → DalIA Actions flow
        ├── 4. buildContext(tenantId) → knowledge-base.js
        │       └── SQL reales: ventas 7d, caja, mesas, stock, brief SOSTAC
        ├── 5. buildSystemPrompt(contexto, rol) → inyecta datos + identidad
        ├── 6. buildMessages(historial, mensaje, 8000 tokens) → ventana
        ├── 7. chatWithKimi() o chatWithClaude()
        ├── 8. recordTokenUsage() → tabla token_consumo
        └── 9. capturarRespuestaGenerada() → PostHog
```

## Archivos clave

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `lib/llm.js` | 70 | Wrapper genérico Claude/Kimi para acciones (no chat) |
| `routes/chat.js` | 1138 | Endpoint del chat, system prompt completo, detectores |
| `services/knowledge-base.js` | 285 | `buildContext(tenantId)` — arma datos reales del negocio |
| `services/dallia-actions.js` | 153 | Runtime: `run()`, `executeApproved()`, `rejectProposal()` |
| `services/dallia-actions/*.js` | 5 handlers | Cada uno: `detect`, `draft`, `execute` |
| `lib/posthog-events.js` | — | Eventos analítica DalIA (pregunta, respuesta, error, alerta) |

## Base de datos (tablas IA)

| Tabla | Uso |
|---|---|
| `tenant_suscripciones` | Columnas `tokens_total`, `tokens_consumidos` (cuota mensual) |
| `token_consumo` | Log de consumo por usuario/tenant/modelo |
| `dallia_actions` | Catálogo de acciones registradas (seed en `db.js`) |
| `dallia_actions_log` | Estados: `propuesta` → `ejecutada` / `fallida` / `rechazada` |
| `sostac_briefs` | Contexto estratégico del negocio inyectado al prompt |

## Endpoints

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/chat` | Render de la vista de chat |
| POST | `/api/chat` | Enviar mensaje y obtener respuesta IA |
| GET | `/api/chat/tokens` | Cuota restante del tenant |
| POST | `/api/chat/action/:logId/approve` | Ejecutar acción propuesta |
| POST | `/api/chat/action/:logId/reject` | Rechazar propuesta |

## Seguridad y límites

- **Rate limit**: chat/IA a 60 req/hora por IP (regla global del proyecto en `CLAUDE.md`).
- **Rol vía sesión**: `req.session.user.rol` — nunca se confía en el cliente.
- **Cuota de tokens**: por tenant, se descuenta de `tenant_suscripciones.tokens_consumidos`.
- **Filtrado por rol**: contexto sensible (S/ ventas, etc.) se oculta a no-admins antes de enviar al LLM.

## Vistas EJS

- `views/chat.ejs` — chat PWA mobile
- `views/dallia-chat.ejs` — variante DalIA chat
- `views/dallia-voz.ejs` — modo voz
- `views/onboarding-dallia.ejs` — DalIA guía el alta
- `views/sostac/*.ejs` — agente Delfino (brief SOSTAC)
