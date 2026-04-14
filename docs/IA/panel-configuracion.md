# Panel de configuración DalIA — Consumo de tokens

Ubicación: **`/config/dallia`** (PWA, menú Más → Personalizar DalIA).
Backend: `routes/config-pwa.js` | Vista: `views/config/dallia.ejs`.

## Qué muestra al dueño del restaurante

### 1. Cuota del plan
- Barra de progreso: tokens usados / tokens totales del plan
- Porcentaje con color (verde → naranja según consumo)
- Reset: fecha en que se renueva la cuota

### 2. ¿A dónde se van los tokens? (desglose por fuente)
Cada tipo de llamada IA tiene su propia barra. Últimos 30 días.

| Tipo | Qué cuenta |
|---|---|
| 💬 Chat | Preguntas directas del usuario |
| ⚡ Acciones | Borradores de DalIA Actions |
| 📊 Resumen diario | Cierre automático (si está activo) |
| ⏰ Vencimiento | Alertas de insumos por vencer |
| 💰 Recordatorio caja | Avisos de caja abierta |
| 🎯 Meta alcanzada | Celebración de meta |
| 🚀 Onboarding | Alta inicial |
| 🐬 SOSTAC | Brief estratégico |
| 💾 Cache | Respuestas cacheadas (cero costo) |

Cada barra muestra: nombre + tokens + costo USD real.

### 3. Ahorro por cache inteligente
Card verde destacada con:
- **Tokens ahorrados** (suma de `tokens_ahorrados` en cache hits)
- **Preguntas en cache** (cantidad de respuestas cacheadas)
- **Equivalente en USD** (calculado con tarifa promedio DeepSeek)

### 4. Top preguntas frecuentes
Lista top 10 de preguntas más repetidas del tenant en los últimos 30 días, con:
- Ranking (#1, #2…)
- Categoría (general, legal, ventas, etc.)
- Veces repetida

Útil para detectar qué pueden convertirse en FAQ estática o para auditoría.

### 5. Mantenimiento
Botón **Limpiar cache de preguntas** → borra el FAQ cache del tenant. Se usa cuando:
- Cambió información del negocio (precios, horarios)
- Las respuestas cacheadas ya no son correctas
- Se modificó el system prompt de DalIA

### 6. Automatizaciones
Toggles para activar/desactivar cada automatización que consume tokens:

| Toggle | Default | Tokens/mes aprox |
|---|---|---|
| Resumen diario al cerrar | ❌ OFF | 90k (3k × 30 días) |
| Alerta de vencimientos | ✅ ON | ~15k |
| Recordatorio cerrar caja | ✅ ON | ~8k |
| Celebrar meta alcanzada | ✅ ON | ~5k |
| Pedido a proveedor automático | ❌ OFF | variable |

Apagar una automatización reduce el consumo mensual.

## Endpoints usados

| Método | Ruta | Retorna |
|---|---|---|
| GET | `/config/dallia/stats` | cuota, desglose, ahorro |
| GET | `/config/dallia/top-preguntas` | top 20 preguntas |
| GET | `/config/dallia/historico` | consumo por día 30d |
| POST | `/config/dallia/faq-cache/limpiar` | borra cache del tenant |
| GET | `/config/dallia/automatizaciones` | estado de toggles |
| POST | `/config/dallia/automatizaciones` | guarda toggle |

Todos están **filtrados por `tenantId`** vía `req.tenantId` (middleware de sesión) — un tenant nunca ve datos de otro.

## Cache FAQ — reglas de seguridad

Solo se cachean categorías **estáticas** cuya respuesta no depende de datos vivos:

- ✅ `legal` (SUNAT, impuestos, boletas) — mismo contenido para todos
- ✅ `mantenimiento` (impresoras, equipos)
- ✅ `general` (rutina, consejos genéricos)

**NO** se cachean:
- ❌ `ventas`, `inventario`, `entrega` — cambian en minutos
- ❌ Respuestas personalizadas al negocio específico (mesas, caja)

TTL default: **7 días**. Cada hit actualiza `last_hit_at`. Hash SHA-256 de la pregunta normalizada (sin tildes, puntuación, mayúsculas).

Normalización: ver `normalizarPregunta()` en `routes/chat.js`.

## Tablas involucradas

```
tenant_suscripciones          cuota del plan (tokens_total, tokens_consumidos, tokens_reset_fecha)
token_consumo                 log por llamada (tenant, tipo, tokens, modelo, pregunta, cache_hit, costo)
dallia_faq_cache              respuestas cacheadas por tenant (hash, respuesta, hits, expires_at)
tenant_dallia_automatizaciones toggles de automatizaciones por tenant
```

Ver migration: `migrations/add_dallia_optimizacion.sql`.
