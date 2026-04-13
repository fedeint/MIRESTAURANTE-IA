# Arquitectura técnica de la IA

## Proveedores LLM (en `lib/llm.js`)

Prioridad de uso definida por variables de entorno:

1. **`KIMI_API_KEY`** → Moonshot Kimi (`moonshot-v1-8k`) vía `api.moonshot.cn`
   También hay una variante vía OpenRouter (`moonshotai/kimi-k2`) en `routes/chat.js:chatWithKimi()`
2. **`ANTHROPIC_API_KEY`** → Claude (`claude-sonnet-4-20250514`)

Si ninguna está configurada, el chat responde `500: Configura KIMI_API_KEY o ANTHROPIC_API_KEY`.

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
