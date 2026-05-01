# ✅ OPS + ANALYTICS Stack - Implementation Checklist

Guía paso-a-paso para implementar todo el stack en producción.

---

## 🟢 PARTE A: PostHog SDK (YA HECHO ✓)

**Qué se hizo:**
- ✅ Instaló `npm install posthog-js`
- ✅ Creó `/lib/posthog-events.js` (helpers para eventos)
- ✅ Integró en `/routes/chat.js` (captura preguntas, respuestas, errores)
- ✅ Variables en `.env.example`

**Paso 1: Crear cuenta PostHog**
```bash
1. Ve a https://app.posthog.com/signup
2. Crea proyecto "mirestcon-ia-prod"
3. Copia API key: phc_xxxxx
4. En .env:
   POSTHOG_API_KEY=phc_xxxxx
   POSTHOG_API_HOST=https://us.i.posthog.com
   POSTHOG_PROJECT_ID=12345 (número del proyecto)
```

**Paso 2: Verificar eventos**
```bash
npm run dev
# Abre http://localhost:1995/chat
# Envía pregunta: "¿Cómo registro un ayudante?"
# Verifica en https://app.posthog.com/events
# Deberías ver: dallia_chat_opened, dallia_question_sent, dallia_response_generated
```

**Docs**: `/docs/POSTHOG-SETUP.md`

---

## 🟢 PARTE B: Grafana Dashboards + Backups

### B1: Grafana Cloud Setup

**Paso 1: Crear cuenta Grafana**
```bash
1. https://grafana.com/auth/sign-up/create-account
2. Free tier
3. Copia API key
4. En .env:
   GRAFANA_INSTANCE_URL=https://your-org.grafana.net
   GRAFANA_API_KEY=glc_xxxxx
   GRAFANA_ORG_SLUG=mirestconia
```

**Paso 2: Crear 4 dashboards**

Sigue `/docs/GRAFANA-DASHBOARDS.md`:
1. HTTP Latency & Errors
2. Database Health
3. OpenAI API Usage
4. Vercel Functions

Después de crear, obtén los IDs y agrega a `.env`:
```bash
GRAFANA_DASHBOARD_HTTP_ID=abc123
GRAFANA_DASHBOARD_DB_ID=def456
GRAFANA_DASHBOARD_OPENAI_ID=ghi789
GRAFANA_DASHBOARD_VERCEL_ID=jkl012
```

**Docs**: `/docs/GRAFANA-DASHBOARDS.md`

### B2: Backups Automáticos (PostgreSQL → R2)

**Paso 1: Crear Cloudflare R2 bucket**
```bash
1. https://dash.cloudflare.com
2. R2 → Create bucket → mirestconia-backups
3. API token → Create (s3:*)
4. En .env:
   CF_ACCOUNT_ID=xxxxx
   CF_API_TOKEN=xxxxx
   CF_API_TOKEN_SECRET=xxxxx
```

**Paso 2: Setup scripts**
```bash
# En tu VPS o servidor que corre backups:
cp scripts/backup-db-r2.sh /home/backup/
cp scripts/restore-db-r2.sh /home/backup/
chmod +x /home/backup/*.sh

# Instalar AWS CLI:
apt-get install awscli  # Linux
brew install awscli     # macOS
```

**Paso 3: Configurar cron**
```bash
# En .env de VPS, agregar:
CF_ACCOUNT_ID=xxxxx
CF_API_TOKEN=xxxxx
CF_API_TOKEN_SECRET=xxxxx

# Agregar cron job (2 AM UTC = 21:00 Lima):
crontab -e
# Pegar: 0 2 * * * /home/backup/backup-db-r2.sh

# Test manual:
./scripts/backup-db-r2.sh
# Deberías ver: ✅ Backup creado, ✅ Backup subido a R2
```

**Docs**: `/docs/BACKUPS-SETUP.md`

---

## 🟢 PARTE C: Superman Analytics UI

**Qué se hizo:**
- ✅ Creó rutas en `/routes/superadmin.js`
- ✅ Creó vistas EJS:
  - `/views/superadmin/analytics-dallia.ejs` (PostHog)
  - `/views/superadmin/analytics-infrastructure.ejs` (Grafana)
- ✅ Variables en `.env.example`

**Paso 1: Verificar rutas**
```bash
npm run dev

# Abre:
# http://localhost:1995/superadmin/analytics/dallia
# http://localhost:1995/superadmin/analytics/infrastructure

# Deberías ver dashboards (con placeholders si no están configurados)
```

**Paso 2: Agregar links en Superman Dashboard**

En `/views/superadmin/dashboard.ejs`, agregar links:
```html
<!-- En el dashboard principal -->
<div class="row mt-4">
  <div class="col-md-6">
    <a href="/superadmin/analytics/dallia" class="btn btn-outline-primary btn-lg w-100">
      <i class="bi bi-graph-up"></i> DallIA Analytics
    </a>
  </div>
  <div class="col-md-6">
    <a href="/superadmin/analytics/infrastructure" class="btn btn-outline-primary btn-lg w-100">
      <i class="bi bi-gear"></i> Infrastructure
    </a>
  </div>
</div>
```

**Paso 3: Iframear Grafana dashboards**

En `/views/superadmin/analytics-infrastructure.ejs`, reemplazar placeholders:
```html
<!-- En los dashboards, usar iframes: -->
<iframe
  src="<%= grafanaUrl %>/d/<%= dashboards.http %>"
  width="100%"
  height="600px">
</iframe>
```

---

## 📋 Checklist de Implementación

### PostHog
- [ ] Cuenta creada en PostHog Cloud
- [ ] API key en `.env` (`POSTHOG_API_KEY`)
- [ ] npm run dev → abre chat
- [ ] Envía pregunta
- [ ] Verifica eventos en PostHog dashboard

### Grafana
- [ ] Cuenta creada en Grafana Cloud
- [ ] API key en `.env` (`GRAFANA_API_KEY`)
- [ ] 4 dashboards creados (HTTP, DB, OpenAI, Vercel)
- [ ] Dashboard IDs agregados a `.env`
- [ ] Alertas configuradas (error rate, DB pool, backup)

### Backups
- [ ] Cloudflare R2 bucket creado
- [ ] Credenciales R2 en `.env` (CF_*)
- [ ] Scripts copiados a VPS
- [ ] AWS CLI instalado
- [ ] Cron job agregado (backup diario 2 AM)
- [ ] Test manual ejecutado (./backup-db-r2.sh)
- [ ] Archivo confirmado en R2

### Superman UI
- [ ] Rutas agregadas a superadmin.js
- [ ] Vistas EJS creadas
- [ ] Links agregados al dashboard
- [ ] http://localhost/superadmin/analytics/dallia accesible
- [ ] http://localhost/superadmin/analytics/infrastructure accesible
- [ ] Iframes de Grafana cargando

---

## 🚀 Deploy a Producción (Vercel)

```bash
# 1. Commit cambios
git add .
git commit -m "feat: PostHog + Grafana + Backups analytics stack"

# 2. Push a GitHub
git push origin main

# 3. Deploy automático en Vercel
# (Vercel va a detectar push y deploy automáticamente)

# 4. Verificar en producción
# https://tu-dominio.com/superadmin/analytics/dallia
# https://tu-dominio.com/superadmin/analytics/infrastructure
```

---

## 💰 Costos Mensuales (Resumen)

```
┌─────────────────────────────────────────┐
│  COSTO INICIAL (MVP)                    │
├─────────────────────────────────────────┤
│ Supabase Pro              $25            │
│ Vercel Pro               $20             │
│ Cloudflare R2           $2-5             │
│ PostHog (gratuito)       $0              │
│ Grafana Cloud (gratuito) $0              │
│ VPS Hetzner (mini)       $6-10           │
├─────────────────────────────────────────┤
│ TOTAL                    ~$54-60/mes     │
└─────────────────────────────────────────┘
```

---

## 📚 Documentación Completa

- **PostHog Setup**: `/docs/POSTHOG-SETUP.md`
- **Grafana Dashboards**: `/docs/GRAFANA-DASHBOARDS.md`
- **Backups**: `/docs/BACKUPS-SETUP.md`
- **Full Spec**: `/SPEC_OPS_ANALYTICS_2026.md`

---

## 🆘 Troubleshooting

### PostHog: No se capturan eventos
```bash
# Check: POSTHOG_API_KEY en .env
echo $POSTHOG_API_KEY

# Check logs:
npm run dev | grep PostHog

# Verifica en: https://app.posthog.com/events
```

### Grafana: Dashboards no cargan
```bash
# Verifica: GRAFANA_DASHBOARD_*_ID en .env
# Verifica URL: https://your-org.grafana.net/d/ID

# Si IDs incorrectos, crea nuevos en Grafana UI
```

### Backups: Falla cron
```bash
# Test manual:
/home/backup/backup-db-r2.sh

# Check logs:
tail -f /var/log/mirestconia-backup.log

# Verifica R2:
aws s3 ls s3://mirestconia-backups/ \
  --endpoint-url https://[ACCOUNT_ID].r2.cloudflarestorage.com
```

### Superman: Rutas 404
```bash
# Verifica que rutas están en superadmin.js
grep "analytics" routes/superadmin.js

# Verifica que vistas existen
ls views/superadmin/analytics*

# Restart:
npm run dev
```

---

## ✨ Próximos pasos (Future)

1. **Alertas en Slack/Email** (Grafana → Slack webhook)
2. **Custom PostHog dashboards** (importar JSON)
3. **Métricas de onboarding** (tracking Día 1→2→3→Semana 1)
4. **A/B testing de nuevas preguntas** (Feature flags PostHog)
5. **Reportes automáticos** (email diario a Superman)

---

¿Preguntas? Revisa la documentación en `/docs/`

Última actualización: 2026-03-31
