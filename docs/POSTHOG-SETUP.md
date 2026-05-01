# 🚀 PostHog Setup - DallIA Analytics

## ¿Qué es PostHog?

PostHog es una plataforma de **product analytics** que captura:
- 📊 Eventos de usuario (qué hace el usuario)
- 🎬 Session replay (ver grabación de sesión)
- 🔗 Funnels (conversión: pregunta → respuesta → rating)
- 🎯 Feature flags (A/B testing de nuevas preguntas)

Para **MiRestcon IA**, usamos PostHog para entender **cómo los administradores usan DallIA**.

---

## 1️⃣ Crear cuenta en PostHog Cloud

### A. Registro
1. Ve a https://app.posthog.com/signup
2. Crea cuenta con email corporativo
3. Acepta términos

### B. Crear Proyecto
1. En el dashboard, haz click en **"+ New project"**
2. Nombre: `mirestcon-ia-prod`
3. Timezone: `America/Lima`
4. Dashboard type: `Web`

### C. Obtener API Key
1. Ve a **Project Settings** (ícono engranaje)
2. **Copy token** (ej: `phc_1234567890abcdef`)
3. Guarda en `.env`: `POSTHOG_API_KEY=phc_1234567890abcdef`

---

## 2️⃣ Configurar en .env

```bash
# .env
POSTHOG_API_KEY=phc_xxxxx (copia del paso anterior)
POSTHOG_API_HOST=https://us.i.posthog.com
```

---

## 3️⃣ Verificar que funciona

### A. Reinicia el servidor
```bash
npm run dev
# o si uses Vercel: vercel dev
```

### B. Abre el chat de DallIA
```
http://localhost:1995/chat
```

### C. Envía una pregunta
- Escribe: "¿Cómo registro un ayudante?"
- Espera respuesta

### D. Verifica en PostHog
1. Ve a https://app.posthog.com/events
2. Deberías ver:
   - `dallia_chat_opened`
   - `dallia_question_sent` (con `categoria: "personal"`)
   - `dallia_response_generated` (con `tokens_usados`, `tiempo_respuesta_ms`)

Si NO ves eventos:
- Revisa console logs: `grep "PostHog" server.log`
- Verifica que `POSTHOG_API_KEY` esté en `.env`
- Reinicia con: `npm run dev`

---

## 4️⃣ Eventos que capturamos

| Evento | Cuándo | Propiedades |
|--------|--------|------------|
| `dallia_chat_opened` | Usuario abre chat | `seccion` |
| `dallia_question_sent` | Usuario envía pregunta | `categoria`, `pregunta_texto`, `fuente` |
| `dallia_response_generated` | Backend genera respuesta | `tokens_usados`, `tiempo_respuesta_ms`, `modelo` |
| `dallia_response_rated` | Usuario califica respuesta | `util` (true/false), `comentario` |
| `dallia_error` | Ocurre error | `error_tipo`, `error_mensaje` |
| `dallia_tokens_warning` | Tokens por debajo del 10% | `porcentaje_restante`, `tokens_restantes` |
| `dallia_daily_question` | Usuario responde "¿trabajas solo?" | `respuesta` |
| `dallia_module_suggested` | DallIA sugiere módulo | `modulo`, `razon`, `click` |

**Cada evento incluye automáticamente**:
- `tenant_id`: ID del restaurante
- `user_id`: ID del usuario
- `usuario`: Nombre del usuario
- `rol`: Rol (admin, mesero, cocinero, etc.)
- `timestamp`: Cuándo ocurrió

---

## 5️⃣ Dashboards en Superman

Una vez que tienes datos, los puedes ver en Superman en:
- `/superadmin/analytics/dallia` — PostHog iframe

**Iframe embed**:
```jsx
<iframe
  src="https://app.posthog.com/projects/YOUR_PROJECT_ID/dashboard"
  width="100%"
  height="600px"
/>
```

---

## 6️⃣ Preguntas frecuentes

### ¿Soy GDPR compatible?
Sí. PostHog:
- No hace cookie tracking
- Los datos se envían a USA (EU option disponible)
- Puedes exportar/borrar datos de usuario

### ¿Cómo veo datos de un restaurante específico?
En PostHog, filtra por `tenant_id`:
```
Properties:
  tenant_id = "42" (ID de Corkys)
```

### ¿Cuándo empieza a contar datos?
Inmediatamente después de configurar `POSTHOG_API_KEY`. Los eventos anteriores no se capturan.

### ¿Qué pasa si PostHog está down?
El chat sigue funcionando. Los eventos se pierden (pero no bloqueamos).

### ¿Cómo veo session replay?
En PostHog:
1. Ve a **Session Replay**
2. Filtra por `tenant_id` o usuario
3. Haz click en sesión para ver grabación

### ¿Cómo hago A/B testing de nuevas preguntas?
1. Crea **Feature Flag** en PostHog
2. Ej: `new_propinas_questions = true para 50% usuarios`
3. En `routes/chat.js`:
```javascript
if (posthog.getFeatureFlag('new_propinas_questions')) {
  // usa nuevas preguntas
}
```

---

## 7️⃣ Costos

| Nivel | Eventos/mes | Costo |
|-------|-------------|-------|
| Gratuito | 1M | $0 |
| Tier 1 | 10M | $300 |
| Tier 2 | 100M | $2000 |

**MiRestcon**: Inicio ~100k eventos/mes (gratuito), escala a ~5M a 100 tenants (Tier 1).

---

## 📞 Soporte

- **Docs**: https://posthog.com/docs
- **Community**: https://posthog.com/slack
- **Nuestro implementador**: Leonidas (@mirestconia.com)

---

## Próximos pasos

1. ✅ Crear cuenta PostHog
2. ✅ Agregar `POSTHOG_API_KEY` a `.env`
3. ✅ Reiniciar servidor
4. ⏭️ Verificar eventos en https://app.posthog.com/events
5. ⏭️ Crear dashboards en Superman
6. ⏭️ Configurar alertas de onboarding (Día 1→2→3)
