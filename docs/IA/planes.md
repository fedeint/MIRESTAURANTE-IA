# Planes de IA — MiRest con IA

Sistema de dos planes basado en BYOK (Bring Your Own Key) para escalar sin que el costo de IA se coma el margen.

## 🆓 Plan Básico — Gratis

**Precio**: S/ 0/mes

**Qué incluye**:
- Chat con DalIA (ilimitado mientras no agotes tu quota)
- Voz (TTS con Aoede + STT)
- Todas las features del sistema (pedidos, mesas, caja, etc.)
- Panel de consumo de tokens

**Cómo funciona**:
1. El cliente crea su **propia cuenta en Google AI Studio** (aistudio.google.com, gratis, sin tarjeta)
2. Genera su API key
3. La pega en `/config/dallia` — se guarda cifrada en nuestra DB
4. Todas las llamadas IA del sistema usan SU key

**Límite**: 500 requests/día (de Google, compartido entre chat + voz + STT)

**Para quién**: restaurantes chicos, micro-emprendedores, trials.

---

## 💎 Plan Premium — S/ 50/mes

**Precio**: S/ 50/mes (~$13 USD)

**Qué incluye**:
- Todo lo del Básico, PLUS:
- **Voz hasta 1 hora/día** (sin límite mensual dentro de esa cuota)
- **Sin configurar API key** — usamos nuestra cuenta Google maestra
- **Soporte prioritario** vía WhatsApp
- **Uso profesional**: ideal para operaciones intensivas

**Cómo funciona**:
- El cliente contrata por WhatsApp
- Marcamos su tenant como `plan_tipo = 'premium'`
- Todas las llamadas IA usan **nuestra** `GOOGLE_AI_API_KEY` (con billing activo)
- Cuota: 60 min voz/día + chat ilimitado (limitado solo por Gemini paid tier que es muy alto)

**Costo real para nosotros**:
- Voz: ~$3-5 USD/mes (Gemini TTS paid)
- Chat: ~$0.50-1 USD/mes (Gemini Flash paid)
- **Total costo: $4-6 USD** → margen **~S/ 25-30 por cliente**

---

## 🎁 Plan Trial — 7 días gratis con Premium

Para captar clientes:
- 7 días usando nuestra API key maestra
- 30 min voz/día (mitad que Premium)
- Después: Básico (BYOK) automático o upgrade a Premium

---

## 📊 Comparativa

| Feature | Básico | Trial | Premium |
|---|---|---|---|
| Precio/mes | S/ 0 | S/ 0 (7 días) | S/ 50 |
| API key | **Tuya** (AI Studio) | Nuestra | Nuestra |
| Chat DalIA | ✅ (500/día) | ✅ | ✅ ilimitado |
| Voz TTS Aoede | ✅ (dentro de 500/día) | ✅ (30min/día) | ✅ **1h/día** |
| STT (escuchar) | ✅ (dentro de 500/día) | ✅ | ✅ |
| Soporte WhatsApp | ❌ | ❌ | ✅ |
| Duración | Ilimitado | 7 días | Mensual |

---

## 🔧 Implementación técnica

Ver [`byok-setup.md`](./byok-setup.md) para detalles de:
- Cifrado AES-256-GCM de las keys
- Resolución de key (tenant → master)
- Fallback chain: Gemini → DeepSeek → Kimi → Claude
- Tablas `tenant_ai_credentials`, `tenant_voice_usage`, `ai_fallback_log`

---

## 📈 Proyección de ingresos

Asumiendo mix realista:

| Clientes | Básico (gratis) | Premium (S/50) | Ingreso/mes | Costo IA/mes | **Neto/mes** |
|---|---|---|---|---|---|
| 10 | 8 | 2 | S/ 100 | S/ 40 | **S/ 60** |
| 50 | 35 | 15 | S/ 750 | S/ 300 | **S/ 450** |
| 100 | 70 | 30 | S/ 1,500 | S/ 600 | **S/ 900** |
| 500 | 350 | 150 | S/ 7,500 | S/ 3,000 | **S/ 4,500** |
| 1000 | 700 | 300 | S/ 15,000 | S/ 6,000 | **S/ 9,000** |

*Costo IA = ~$4 USD promedio por cliente Premium. Básicos cuestan $0 para nosotros (usan su key).*

**Punto clave**: el 70% de clientes en Básico no cuesta nada a la empresa. Solo el 30% Premium genera costo, pero pagan 50 soles vs $4 USD costo real → margen del 70%.

---

## ⚠️ Edge cases

1. **Cliente Básico agota sus 500/día**: mostrar mensaje de upgrade, o esperar al día siguiente.
2. **Key del cliente se compromete**: el cliente puede revocarla desde `/config/dallia` y subir una nueva.
3. **Gemini tiene caída**: fallback automático a DeepSeek (plan Premium usa DeepSeek pagado por nosotros). Plan Básico también puede usar DeepSeek si tenemos `DEEPSEEK_API_KEY` maestra configurada como fallback de emergencia.
4. **Cliente quiere seguir gratis pero upgrade a voz ilimitada**: no existe ese intermedio. O paga Premium o se aguanta los 500/día.
