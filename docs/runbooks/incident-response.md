# Runbook: Incident response

> Cuando **algo está caído o hay un ataque activo**, sigue este runbook. Orden: **calma → triage → contención → comunicación → post-mortem**.

## When to use

- Usuarios reportan que el sistema no carga o tira errores 500
- Dashboard `/superadmin/observabilidad` muestra spike de errores
- Recibes alertas por email o WhatsApp de `lib/alertas.js`
- Sospechas de un ataque activo (patrón raro de requests, intentos de login masivos, scraping agresivo)
- Detectas un data leak (PII en logs, credenciales expuestas)

## Prioridad de acción (primeros 5 min)

### 1. Calma

- Respira. **No entres en pánico.**
- No hagas cambios impulsivos. La mayoría de incidents se empeoran con decisiones apuradas.
- Si es tarde/fin de semana y estás solo, aún así sigue el runbook. Está diseñado para una sola persona.

### 2. Confirma el incident

Antes de declarar incident, verifica que es real:

```bash
# Health check del endpoint principal
curl -s -o /dev/null -w "%{http_code}\n" https://mirestconia.com/login

# Status de Supabase
# https://status.supabase.com

# Status de Vercel
# https://www.vercel-status.com

# Logs recientes en Vercel
vercel logs --prod --output json | tail -50
```

**Posibles "falsos positivos":**
- Tu red local tiene problemas (prueba con datos móviles)
- Supabase está haciendo mantenimiento programado
- DNS propagación lenta después de un cambio

Si en 2 min no confirmaste que es real, **no es un incident** — ve a investigar normal.

### 3. Clasifica la severidad

| Nivel | Criterio | Ejemplo | Acción |
|---|---|---|---|
| **SEV-1 (Critical)** | Sistema completamente caído o data breach activo | `mirestconia.com` responde 500 a todo; hay un atacante con credenciales de admin | Rollback inmediato, rotación de secrets, comunicación urgente |
| **SEV-2 (High)** | Módulo principal roto afectando >50% de usuarios | Cocina no funciona para ningún tenant; login con Google falla para todos | Rollback o hotfix en <30 min |
| **SEV-3 (Medium)** | Feature menor roto o afectando algunos tenants | Reportes no exporta Excel; un tenant específico no puede cerrar caja | Fix en <4 h |
| **SEV-4 (Low)** | Bug cosmético o edge case | Typo en un label; chart no carga en Safari 14 | Fix en próximo sprint |

## Response por severidad

### SEV-1 — Sistema caído

**Tiempo objetivo de recuperación**: <15 min

1. **Triage rápido (2 min)**:
   - ¿Qué está roto exactamente? (homepage, login, módulo específico)
   - ¿Desde cuándo? (Vercel deployment list te da timestamps)
   - ¿Coincide con un deploy reciente? → 90% de los casos es el deploy

2. **Rollback inmediato** si fue un deploy:
   - Ve a [rollback-deploy.md](./rollback-deploy.md)
   - Opción A (Vercel Dashboard Promote) es la más rápida

3. **Rollback de DB** si hubo migration:
   - Ver [run-migration.md](./run-migration.md) sección "Rollback"

4. **Verifica recuperación**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://mirestconia.com/login
   # Esperar 200
   ```

5. **Comunicación**:
   - Si tienes clientes productivos activos, avísales por WhatsApp: "Tuvimos un problema breve, ya está resuelto"
   - Post en el canal interno del equipo
   - **NO pongas detalles técnicos del incident en comunicación pública** — solo confirmación de que está resuelto

### SEV-2 — Módulo roto

**Tiempo objetivo de recuperación**: <30 min

1. Triage (5 min): identifica qué módulo y desde cuándo
2. Decide: ¿rollback o hotfix?
   - Si fue un deploy → rollback
   - Si fue un cambio en terceros → hotfix (el rollback no arregla nada)
3. Rollback o abre un hotfix PR con fix rápido
4. Mergea el hotfix con aprobación express (2 min review)
5. Verifica recuperación
6. Comunicación al equipo interno

### SEV-3 y SEV-4

- Crea issue con label `[Incident]`
- Asigna prioridad en el backlog
- No rollback — fix forward en ciclo normal

## Si es un ataque activo

### Signos de ataque

- Spike masivo de requests de un mismo IP o IPs similares
- Intentos de login masivos con usuarios inválidos (credential stuffing)
- Scraping de endpoints públicos
- Requests con payloads raros (SQL injection attempts, path traversal)

El sistema automáticamente detecta estos patrones via `cron/attack-detection` cada 1 min y:
1. Los guarda en `ataques_log`
2. Agrega el IP al `ip_blacklist`
3. Envía alertas por email + WhatsApp via `lib/alertas.js`
4. Lo muestra en `/superadmin/observabilidad` tab "Ataques"

### Qué hacer cuando recibes la alerta

1. Abre `/superadmin/observabilidad` tab "Ataques"
2. Revisa el tipo de ataque:
   - **DDoS** → el rate limiter ya está bloqueando. Si el ataque es grande, habilita Cloudflare "I'm under attack" mode
   - **Brute force login** → verifica el `loginGuard` hizo su trabajo. Si el atacante ya está lockout, ok
   - **Credential stuffing** → si sospechas que leaked passwords reales, fuerza cambio de password global
   - **Scanner/probe** → automáticamente blacklisted. Solo monitorea.
   - **API abuse** → revisa qué endpoint y aplica rate limit más agresivo

3. Si el ataque persiste >15 min a pesar del bloqueo automático:
   - Agrega el IP/rango al `ip_blacklist` manualmente (desde la UI)
   - Considera bloquear a nivel Cloudflare (más efectivo)
   - Contacta al ISP del atacante si tienes patience

4. Preserva evidencia: screenshots del dashboard, export de `ataques_log`, logs de Vercel

### Si sospechas breach (acceso no autorizado real)

1. **Identifica el vector**: ¿cómo entraron?
   - Credenciales leaked? → rota TODOS los secrets ([rotate-credentials.md](./rotate-credentials.md))
   - Vulnerabilidad en el código? → identifica el commit, rollback
   - Social engineering? → fuerza cambio de password global + 2FA obligatorio

2. **Contención**:
   - Rota TODOS los secretos (SESSION_SECRET, DATABASE_URL, API keys de terceros)
   - Invalida todas las sesiones (rotar SESSION_SECRET lo hace automático)
   - Bloquea el IP atacante
   - Si los datos fueron accedidos, documenta cuáles

3. **Notificación legal**:
   - Peru tiene ley de protección de datos personales (Ley 29733)
   - Si hay PII comprometida, hay que notificar a usuarios en 72 horas
   - **Consulta con legal antes de comunicar** — no improvises

4. **Post-mortem formal** (mandatorio para breaches):
   - Timeline completo
   - Root cause detallado
   - Datos afectados
   - Usuarios afectados
   - Medidas preventivas
   - Archivo en `docs/superpowers/audits/YYYY-MM-DD-breach.md` (privado, no commit público)

## Siempre después del incident

1. **Post-mortem** dentro de 48h:
   - **Blameless** — busca causas, no culpables
   - Timeline minuto a minuto
   - What worked well
   - What could improve
   - Action items con owners y deadlines

2. **Actualiza este runbook** si aprendiste algo nuevo

3. **Agrega una entrada en `SECURITY.md`** sección "Incidentes pasados"

4. **Review de los action items** en 1 semana para verificar que se hicieron

## Contact chain

| Rol | Canal | Cuándo |
|---|---|---|
| `@Leonidasx8` | WhatsApp directo | SIEMPRE en un SEV-1 o SEV-2 |
| Soporte Supabase | support@supabase.io | Si la DB es la causa y no tienes acceso |
| Soporte Vercel | vercel.com/support | Si el deploy pipeline es la causa |

**Regla de oro**: mejor sobre-comunicar un "casi incident" que bajo-comunicar un incident real.
