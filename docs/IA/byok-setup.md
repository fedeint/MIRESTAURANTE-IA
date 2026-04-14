# BYOK (Bring Your Own Key) — Setup técnico

Arquitectura que permite a cada tenant traer su propia API key de Google AI Studio, manteniendo nuestra key maestra solo para clientes Premium.

## Flujo de resolución de key

```
Request entra a /api/chat (o /api/tts, /api/stt)
        │
        ▼
tenantAi.resolveApiKey(tenantId)
        │
        ├── ¿Tenant tiene key propia cifrada en DB?
        │   └── SÍ → descifrar y devolver { key, source: 'tenant', plan }
        │
        ├── ¿Plan es 'premium' o 'trial'?
        │   └── SÍ → devolver { key: process.env.GOOGLE_AI_API_KEY, source: 'master', plan }
        │
        └── NINGUNO → null (mostrar upgrade prompt al cliente)
```

## Fallback chain (routes/chat.js)

Si Gemini falla (429 quota, network, invalid key):

```
Gemini (tenant or master)  → 429 quota exceeded
        │                     └── plan=basico → mostrar upgrade prompt (NO fallback)
        │                     └── plan=premium → sigue fallback
        ▼
DeepSeek (master key DEEPSEEK_API_KEY)
        │
        ▼
Kimi (master key KIMI_API_KEY)
        │
        ▼
Claude (master key ANTHROPIC_API_KEY)
        │
        ▼
Error 502
```

Cada salto se registra en `ai_fallback_log` para analítica.

## Cifrado de keys

Archivo: `lib/crypto-helper.js`

- **Algoritmo**: AES-256-GCM
- **Key derivation**: `scrypt(SESSION_SECRET, salt)` → 32 bytes
- **Formato blob**: `[salt(16) | iv(12) | authTag(16) | ciphertext(N)]` en base64url
- **Integridad**: GCM auth tag previene manipulación
- **Rotation**: si se cambia `SESSION_SECRET`, todas las keys se vuelven ilegibles (requiere re-pegar)

### API
```js
const { encrypt, decrypt, maskKey } = require('./lib/crypto-helper');

const blob = encrypt('AIzaSyXXX...');        // guardar en DB
const key  = decrypt(blob);                   // al usar
const ui   = maskKey(key);                    // "AIza...wXYZ" para mostrar
```

## Tablas

### `tenant_ai_credentials`
```
tenant_id                PK
google_ai_key_encrypted  TEXT        — AES-256-GCM blob
google_ai_key_preview    VARCHAR(20) — "AIza...xxxx" para UI
google_ai_key_validated  BOOLEAN
google_ai_key_last_test  TIMESTAMP
plan_tipo                VARCHAR(20) — 'basico' | 'premium' | 'trial'
voice_minutos_dia        INTEGER     — contador, reset cron diario
voice_minutos_mes        INTEGER
voice_minutos_limite_dia INTEGER     — 0 basico | 60 premium | 30 trial
```

### `tenant_voice_usage`
Log por cada llamada TTS/STT. Usado para facturación y analytics.
```
tenant_id, tipo, duracion_seg, caracteres, modelo, source_key, created_at
```

### `ai_fallback_log`
Cuándo saltamos de un proveedor a otro.
```
tenant_id, origen, destino, razon, tipo_call, created_at
```

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/config/dallia/api-key` | Info de key (masked + plan + validada) |
| POST | `/config/dallia/api-key` | Validar vs Gemini + guardar cifrada |
| DELETE | `/config/dallia/api-key` | Revocar key del tenant |
| GET | `/config/dallia/plan` | Plan actual + uso de voz + precios |

**Nunca expone la key en plano** — solo el `preview` (AIza...xxxx).

## Validación de key

Antes de guardar, hacemos ping a `generativelanguage.googleapis.com/v1beta/models?key=<key>`:
- HTTP 200 → válida
- HTTP 400/403 → rechazar con error claro

Esto evita guardar keys basura.

## Rate limits del free tier (Gemini 2.5 Flash)

- **500 RPD** (requests per day) — por API key
- **10 RPM** (requests per minute)
- **250K TPM** (tokens per minute)

Cuando se excede: Gemini devuelve HTTP 429 con `QUOTA_EXCEEDED`. El frontend muestra:

> ⚠️ Alcanzaste tu límite gratuito diario de Google AI (500/día). Vuelve mañana o contrata Premium.

## Env vars relevantes

```bash
# Maestra (nosotros) — para plan Premium y Trial
GOOGLE_AI_API_KEY=AIza...

# Fallbacks si Gemini cae
DEEPSEEK_API_KEY=sk-...
KIMI_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...

# Cifrado de keys de tenants (OBLIGATORIA >= 32 chars)
SESSION_SECRET=...
```

## Flow UI del cliente

### Plan Básico (BYOK)
1. Cliente entra a `/config/dallia`
2. Ve card "🔑 Mi API Key de Google AI" con botón "¿Cómo obtengo mi API key gratis?"
3. Sigue los 3 pasos (link directo a aistudio.google.com)
4. Pega la key → click "Validar y guardar"
5. Sistema hace ping a Gemini → si válida, cifra y guarda → muestra preview
6. DalIA ya funciona

### Plan Premium
1. Cliente contacta por WhatsApp
2. Admin marca tenant como `plan_tipo = 'premium'` en DB
3. Cliente no necesita hacer nada más
4. Sistema usa `GOOGLE_AI_API_KEY` maestra

## Consideraciones de seguridad

1. **No logear keys**: `console.log` de errores NO incluye la key, solo el preview masked.
2. **No devolver keys en responses**: todos los GET devuelven masked preview, nunca plain text.
3. **Session check**: todos los endpoints `/config/dallia/*` requieren sesión activa (middleware `requireAuth` en server.js).
4. **Revocación**: si sospechan compromiso, cliente puede DELETE la key y subir nueva.
5. **Rotación de SESSION_SECRET**: si se rota, todas las keys cifradas quedan ilegibles → hay que forzar re-captura. Considerar almacenar versión del secret para migración suave.
