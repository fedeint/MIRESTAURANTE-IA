# 📋 SPEC COMPLETO: OPS + ANALYTICS MiRestcon IA (2026)

**Objetivo**: Arquitectura de bajo costo, escalable, sin "trampas", con analytics profundo de DallIA.

---

## 1️⃣ ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────────┐
│                      USUARIO FINAL (PWA Mobile)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                 ↓↓↓                                  │
├─────────────────────────────────────────────────────────────────────┤
│                 VERCEL (Next.js/Frontend/Edge)                       │
│  • Pages: /app, /superadmin, /onboarding                            │
│  • API Routes: /api/dallia, /api/tenant, /api/analytics             │
│  • Edge Functions: autenticación, feature flags (PostHog)           │
│  Costo: ~$20/mes (Pro)                                              │
├─────────────────────────────────────────────────────────────────────┤
│                SUPABASE (PostgreSQL + Auth)                         │
│  • Base de datos: tenants, usuarios, solicitudes, eventos           │
│  • Auth: Google OAuth 2.0                                           │
│  • Backups automáticos (Pro plan)                                   │
│  Costo: ~$25/mes (Pro)                                              │
├─────────────────────────────────────────────────────────────────────┤
│           SERVICIOS EXTERNOS (Analytics + Storage)                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PostHog Cloud (Product Analytics)                           │  │
│  │  • Event capture: usuario DallIA                             │  │
│  │  • Session replay: ver qué hizo antes de preguntar           │  │
│  │  • Feature flags: A/B testing de nuevas preguntas            │  │
│  │  • Funnels: onboarding Día 1→2→3→Semana 1→Semana 2          │  │
│  │  Costo: $0 (gratuito 1M eventos/mes)                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Grafana Cloud (Infrastructure Metrics)                      │  │
│  │  • Fuente: Prometheus pushgateway desde tu VPS               │  │
│  │  • Dashboards: HTTP latency, DB pool, errores, DallIA API   │  │
│  │  • Alertas: uptimess, token usage, trial expiring            │  │
│  │  Costo: $0 (gratuito)                                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Cloudflare R2 (Multimedia Storage)                          │  │
│  │  • Fotos: restaurante, platos, logos                         │  │
│  │  • Backups: pg_dump diarios comprimidos                      │  │
│  │  • CDN incluido (imágenes rápidas en Perú)                   │  │
│  │  Costo: $0.015/GB + $0 egress = ~$2-5/mes                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Resend (Transactional Email)                                │  │
│  │  • Aprobación trial → solicitudes_registro@                  │  │
│  │  • Alertas Superman: suscripciones venciendo, errores         │  │
│  │  • Notificaciones DallIA: tips, mejoras                      │  │
│  │  Costo: $0 (3k emails/mes)                                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│          VPS HETZNER/DIGITALOCEAN (Mini - 1vCore, 2GB)              │
│  • Cron jobs: pg_dump → R2, alertas diarias                        │
│  • Mail server: Maddy (correos corporativos admin@mirestconia)     │
│  • Prometheus pushgateway (para Grafana metrics)                    │
│  Costo: ~$5-10/mes                                                  │
├─────────────────────────────────────────────────────────────────────┤
│               SUPERMAN (Superadmin Panel) en Vercel                  │
│  • Dashboard: MRR, ARR, tenants, usuarios, facturas                │
│  • PostHog iframe: top preguntas DallIA, adoption                  │
│  • Grafana iframe: system health, alerts                           │
│  • Gestión tenants: crear, suspender, cambiar plan                 │
│  • Logs: login history, audit log, errores                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2️⃣ COSTOS DESGLOSADOS

```
┌────────────────────────────────────────────────────────────┐
│                   COSTO INICIAL (MVP)                      │
├────────────────────────────────────────────────────────────┤
│ Supabase (Pro)                     $25/mes                 │
│ Vercel (Pro)                       $20/mes                 │
│ Cloudflare R2                      $2-5/mes (por uso)      │
│ Grafana Cloud                      $0 (gratuito)           │
│ PostHog Cloud                      $0 (gratuito)           │
│ VPS Hetzner/DO (Apt-1)             $6-10/mes               │
│ Dominio                            $1/mes (Namesilo)       │
│ Resend                             $0 (3k/mes gratuito)    │
├────────────────────────────────────────────────────────────┤
│ TOTAL INICIAL                      ~$54-60/mes             │
│ (= 1 iPhone 15 Pro al año)                                │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│              COSTO ESCALADO (100 tenants activos)          │
├────────────────────────────────────────────────────────────┤
│ Supabase Pro → Business ($115)     $115/mes                │
│ Vercel Pro → Pro+ ($150)           $150/mes                │
│ Cloudflare R2                      $15-25/mes (500GB)      │
│ PostHog Cloud (20M eventos)        $200-300/mes            │
│ Grafana Cloud (si pagas plan)      $0-30/mes               │
│ VPS (upgrade a 2vCore, 4GB)        $15-20/mes              │
│ Resend (si >3k emails)             $0-50/mes               │
├────────────────────────────────────────────────────────────┤
│ TOTAL ESCALADO                     ~$500-550/mes           │
│ (a $300-400 MRR × 100 tenants = $30k-40k MRR)             │
│ → EBITDA: 20-25% (excelente)                              │
└────────────────────────────────────────────────────────────┘
```

---

## 3️⃣ EVENTOS DALIA PARA POSTHOG

### Estructura de eventos a capturar:

```javascript
// lib/posthog-events.js
const posthog = require('posthog-js').default

// Helper para capturar eventos DallIA
async function capturarEventoDallIA(evento, propiedades) {
  posthog.capture(evento, {
    tenant_id: req.tenant?.id,
    usuario_id: req.user?.id,
    timestamp: new Date().toISOString(),
    ...propiedades
  })
}

module.exports = {
  capturarEventoDallIA
}
```

### Eventos específicos a capturar:

#### 1. **Interacción inicial con DallIA**
```javascript
// Usuario abre chat del robot chef
posthog.capture('dallia_chat_opened', {
  tenant_id: '123',
  usuario_id: 'user_456',
  seccion: 'dashboard', // o 'caja', 'cocina', etc.
  timestamp: Date.now()
})
```

#### 2. **Pregunta enviada**
```javascript
posthog.capture('dallia_question_sent', {
  tenant_id: '123',
  usuario_id: 'user_456',
  categoria: 'propinas', // o 'legal', 'mantenimiento', etc.
  pregunta_texto: 'How to register a helper?', // para análisis de intent
  fuente: 'chat', // o 'voz', 'sugerencia'
  timestamp: Date.now()
})
```

#### 3. **Respuesta generada (backend)**
```javascript
// En routes/dallia.js después de obtener respuesta de OpenAI
posthog.capture('dallia_response_generated', {
  tenant_id: req.tenant.id,
  usuario_id: req.user.id,
  categoria: 'propinas',
  tokens_usados: 150, // OpenAI response tokens
  tiempo_respuesta_ms: 2340, // cuánto tardó GPT
  temperatura: 0.7, // temperatura del modelo
  timestamp: Date.now()
})
```

#### 4. **Usuario lee respuesta (frontend)**
```javascript
posthog.capture('dallia_response_viewed', {
  tenant_id: '123',
  usuario_id: 'user_456',
  categoria: 'propinas',
  tiempo_lectura_segundos: 45,
  scroll_depth: 0.8, // 80% de scroll
  timestamp: Date.now()
})
```

#### 5. **Rating de utilidad**
```javascript
posthog.capture('dallia_response_rated', {
  tenant_id: '123',
  usuario_id: 'user_456',
  categoria: 'propinas',
  util: true, // o false
  comentario_opcional: 'Muy clara la explicación', // si lo dejan
  timestamp: Date.now()
})
```

#### 6. **Pregunta diaria (¿Trabajas solo?)**
```javascript
posthog.capture('dallia_daily_question', {
  tenant_id: '123',
  usuario_id: 'user_456',
  pregunta: '¿Hoy trabajas solo?',
  respuesta: 'no', // 'si' o 'no'
  timestamp: Date.now()
})

// Si dice "no", luego:
posthog.capture('dallia_helper_selected', {
  tenant_id: '123',
  usuario_id: 'user_456',
  helper_nombre: 'Carlos',
  helper_rol: 'Mozo',
  timestamp: Date.now()
})
```

#### 7. **Módulo disparado por DallIA**
```javascript
// Ej: DallIA sugiere "Deberías ver Fidelidad"
posthog.capture('dallia_module_suggested', {
  tenant_id: '123',
  usuario_id: 'user_456',
  modulo: 'fidelidad',
  razon: 'Tienes 5 clientes recurrentes',
  click: true, // usuario hizo click o ignoró
  timestamp: Date.now()
})
```

#### 8. **Error o timeout**
```javascript
posthog.capture('dallia_error', {
  tenant_id: '123',
  usuario_id: 'user_456',
  error_tipo: 'timeout', // o 'api_error', 'rate_limit'
  error_mensaje: 'OpenAI API timeout after 10s',
  categoria: 'propinas',
  timestamp: Date.now()
})
```

---

## 4️⃣ DASHBOARDS POSTHOG EN SUPERMAN

### Vista 1: DallIA Usage Overview
```
┌──────────────────────────────────────────────────────────────┐
│  📊 DallIA Analytics (últimas 7 días)                        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Total Preguntas: 2,450      Preguntas/tenant: 24.5         │
│  Rating positivo: 87%         Tiempo promedio respuesta: 2.3s│
│  Categorías top: propinas (340), legal (210), personal (180) │
│  Tenants usando DallIA: 98/100 (98%)                        │
│                                                               │
│  ┌─ TENDENCIA 7 DÍAS ──────────────────────────────────────┐ │
│  │ 400 │                                                    │ │
│  │ 300 │     ╱╲     ╱╲      (gráfico de línea)            │ │
│  │ 200 │ ╱╲ ╱  ╲╱╲ ╱  ╲                                    │ │
│  │ 100 │╱  ╲            ╲ ╱                                │ │
│  │   0 └────────────────────────────────────────────────── │ │
│  │     L M  M  J  V  S  D                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─ CATEGORÍAS TOP 5 ──────────────────────────────────────┐ │
│  │ 1. Propinas (340)  ████████████ 14%                    │ │
│  │ 2. Legal (210)     ███████ 8.6%                        │ │
│  │ 3. Personal (180)  ██████ 7.3%                         │ │
│  │ 4. Entrega (145)   █████ 5.9%                          │ │
│  │ 5. SUNAT (125)     ████ 5.1%                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  📍 Rating por Categoría:                                   │
│     propinas: 89% ✓  |  legal: 84% ✓  |  personal: 81% ✓   │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Vista 2: Tenant DallIA Deep Dive
```
┌──────────────────────────────────────────────────────────────┐
│  🔍 Corkys (tenant_id: 42) - DallIA Behavior                │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Last 30 days:                                              │
│  • Preguntas: 145                                           │
│  • Usuarios activos: 3 (dueño, mozo, ocasional)           │
│  • Categorías: propinas (45), inventario (30), legal (20)  │
│  • Rating promedio: 88%                                     │
│  • Días sin preguntas: 2 (viernes, sábado)                 │
│                                                               │
│  Session Replay: [Ver sesión del 28 Mar - Usuario abrió chat│
│  pero no escribió nada. Hizo scroll 3 veces. Cerró tab]     │
│                                                               │
│  🚨 Insight: "No saben cómo formular preguntas"             │
│  Recomendación: Agregar ejemplos en placeholder             │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Vista 3: Funnel - Onboarding a DallIA

```
┌──────────────────────────────────────────────────────────────┐
│  🔗 Funnel: Onboarding DallIA Adoption                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Paso 1: Ingreso SuperAdmin              100 tenants (100%) │
│          ↓                                                    │
│  Paso 2: DallIA explicado en onboarding   92 tenants (92%)  │
│          ↓                                                    │
│  Paso 3: Abrió chat DallIA               85 tenants (85%)   │
│          ↓                                                    │
│  Paso 4: Envió 1ª pregunta               78 tenants (78%)   │
│          ↓                                                    │
│  Paso 5: Rating positivo en 1ª pregunta  67 tenants (67%)   │
│          ↓                                                    │
│  Paso 6: Usó DallIA 3+ veces en Día 1   62 tenants (62%)   │
│                                                               │
│  🎯 Dropout Analysis:                                        │
│    • 8% abrieron pero no escribieron → UX issue             │
│    • 7% escribieron pero no volvieron → respuesta mala?      │
│    • 11% escribieron pero dieron 👎  → contenido inmejorable│
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 5️⃣ QUERIES GRAFANA (INFRAESTRUCTURA)

### Prometheus PromQL Queries:

#### 1. **DallIA API Latency**
```promql
# Latencia p95 de respuestas DallIA
histogram_quantile(0.95, rate(dallia_api_duration_seconds_bucket[5m]))

# Label: path="/api/dallia"
```

#### 2. **DallIA Token Usage**
```promql
# Tokens consumidos por tenant por día
sum by (tenant_id) (rate(openai_tokens_consumed[24h]))
```

#### 3. **HTTP Errors (4xx, 5xx)**
```promql
# Tasa de errores en últimas 24h
rate(http_requests_total{status=~"4..|5.."}[1h])
```

#### 4. **Database Pool Health**
```promql
# Conexiones activas en pool
db_pool_active

# Querys esperando conexión
db_pool_waiting
```

#### 5. **Vercel Function Duration**
```promql
# Latencia funciones Vercel
histogram_quantile(0.99, rate(vercel_function_duration_ms_bucket[5m]))
```

### Loki LogQL Queries:

#### 1. **Errores DallIA últimas 24h**
```logql
{job="observabilidad"}
| json
| evento="dallia_error"
| stats count by error_tipo
```

#### 2. **Logs de suscripciones próximas a vencer**
```logql
{job="observabilidad"}
| json
| evento="subscription_expiring_soon"
```

#### 3. **Intentos de login fallidos (seguridad)**
```logql
{job="observabilidad"}
| json
| evento="login_failed"
| stats count by tenant_id, usuario_id
```

---

## 6️⃣ CONFIGURACIÓN BACKUPS

### A. Backup PostgreSQL → Cloudflare R2

**Cron script en VPS (daily 2am):**

```bash
#!/bin/bash
# /home/backup/backup-db.sh

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/mirestconia_${BACKUP_DATE}.sql.gz"
DB_HOST="your-supabase-db.supabase.co"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASS=$DB_PASSWORD  # from .env

# Dump database
PGPASSWORD=$DB_PASS pg_dump \
  -h $DB_HOST \
  -U $DB_USER \
  -d $DB_NAME \
  --no-password \
  | gzip > $BACKUP_FILE

# Upload to R2
aws s3 cp $BACKUP_FILE \
  s3://mirestconia-backups/db/${BACKUP_DATE}.sql.gz \
  --endpoint-url https://your-account.r2.cloudflarestorage.com \
  --region us \
  --acl private

# Keep only last 7 backups
aws s3 ls s3://mirestconia-backups/db/ \
  --endpoint-url https://your-account.r2.cloudflarestorage.com \
  --region us \
  | awk '{print $4}' \
  | sort -r \
  | tail -n +8 \
  | xargs -I {} aws s3 rm s3://mirestconia-backups/db/{} \
  --endpoint-url https://your-account.r2.cloudflarestorage.com \
  --region us

# Log success
echo "✅ Backup completed: ${BACKUP_FILE}" >> /var/log/backup.log

# Clean local
rm $BACKUP_FILE
```

**Crontab (every day at 2am UTC):**
```bash
0 2 * * * /home/backup/backup-db.sh
```

### B. Restore from Backup

```bash
# Download backup
aws s3 cp s3://mirestconia-backups/db/20260401_020000.sql.gz /tmp/

# Restore
gunzip -c /tmp/20260401_020000.sql.gz | PGPASSWORD=$DB_PASSWORD psql \
  -h your-supabase-db.supabase.co \
  -U postgres \
  -d postgres
```

### C. Alertas de Backup en Grafana

```
IF backup_job_success < 1 (ayer no hay backup)
THEN alert("⚠️ Backup failed yesterday")
```

---

## 7️⃣ ESTRUCTURA SUPERMAN INTEGRADO

### URL Structure:
```
/superadmin
├── /dashboard              # Home: MRR, ARR, tenants, usuarios
├── /tenants               # CRUD: crear, editar, suspender
├── /billing               # Ingresos, gastos, EBITDA
├── /analytics
│   ├── /dallia            # PostHog iframe: analytics DallIA
│   ├── /infrastructure    # Grafana iframe: system health
│   └── /usage             # Logs: login history, audit
├── /solicitudes           # Aprobación/rechazo de registros
└── /settings              # Configuración: emails, API keys

```

### Mockup: /superadmin/analytics/dallia

```html
<!-- pages/superadmin/analytics/dallia.jsx -->

import { useState } from 'react'
import PostHogDashboard from '@/components/PostHog-Iframe'

export default function DallIAAnalytics() {
  const [dateRange, setDateRange] = useState('7d')
  const [tenant, setTenant] = useState('all')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">📊 DallIA Analytics</h1>
        <p className="text-slate-400">Comportamiento de usuarios con asistente IA</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-8">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg"
        >
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
          <option value="90d">Últimos 90 días</option>
        </select>

        <select
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg"
        >
          <option value="all">Todos los tenants</option>
          <option value="42">Corkys Restaurant</option>
          <option value="15">La Pólvora</option>
          {/* load from API */}
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Preguntas totales"
          value="2,450"
          trend="+12% vs semana anterior"
        />
        <StatCard
          label="Rating positivo"
          value="87%"
          trend="+3% (excelente)"
        />
        <StatCard
          label="Tenants usando DallIA"
          value="98/100"
          trend="98% adoption"
        />
        <StatCard
          label="Tiempo respuesta (p95)"
          value="2.3s"
          trend="-0.4s mejora"
        />
      </div>

      {/* Embedded PostHog Dashboard */}
      <div className="bg-slate-800 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-4">📈 Tendencia Preguntas (7 días)</h2>
        <PostHogDashboard
          dashboardId="your-posthog-dashboard-id"
          filters={{ dateRange, tenant_id: tenant }}
        />
      </div>

      {/* Categories */}
      <div className="bg-slate-800 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-white mb-4">🏷️ Categorías Top</h2>
        <div className="space-y-2">
          {[
            { cat: 'propinas', count: 340, pct: 14, rating: 89 },
            { cat: 'legal', count: 210, pct: 8.6, rating: 84 },
            { cat: 'personal', count: 180, pct: 7.3, rating: 81 },
          ].map(item => (
            <div key={item.cat} className="flex items-center justify-between">
              <span className="text-slate-300 capitalize">{item.cat}</span>
              <div className="flex-1 mx-4 bg-slate-700 rounded h-2">
                <div
                  className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded"
                  style={{ width: `${item.pct}%` }}
                />
              </div>
              <span className="text-slate-400 text-sm">{item.count} ({item.pct}%)</span>
              <span className="text-green-400 text-sm ml-4">★ {item.rating}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Session Replay Section */}
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">🎬 Session Replay (PostHog)</h2>
        <p className="text-slate-400 mb-4">Filtros: usuarios que no escribieron pregunta en 1 minuto</p>

        {/* List sessions */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {/* Populated from PostHog API */}
          <SessionItem
            tenant="Corkys"
            user="Juan"
            date="28 Mar 12:45"
            insight="Abrió chat → hizo scroll 3x → cerró (confusión UI)"
          />
        </div>

        <a
          href="https://app.posthog.com/projects/YOUR_PROJECT/sessions"
          target="_blank"
          className="text-orange-500 hover:text-orange-600 text-sm mt-4 inline-block"
        >
          Ver todas las sesiones en PostHog →
        </a>
      </div>
    </div>
  )
}

function StatCard({ label, value, trend }) {
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <p className="text-slate-400 text-sm mb-1">{label}</p>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-xs text-slate-500">{trend}</p>
    </div>
  )
}

function SessionItem({ tenant, user, date, insight }) {
  return (
    <div className="bg-slate-700 rounded p-3 hover:bg-slate-600 cursor-pointer">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-white font-semibold">{tenant}</p>
          <p className="text-slate-400 text-sm">Usuario: {user}</p>
        </div>
        <span className="text-slate-400 text-xs">{date}</span>
      </div>
      <p className="text-slate-300 text-sm">💡 {insight}</p>
    </div>
  )
}
```

### Mockup: /superadmin/analytics/infrastructure

```html
<!-- pages/superadmin/analytics/infrastructure.jsx -->

import GrafanaIframe from '@/components/Grafana-Iframe'

export default function InfrastructureAnalytics() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <h1 className="text-3xl font-bold text-white mb-8">🔧 Infrastructure & System Health</h1>

      {/* Alert badges */}
      <div className="mb-8 flex gap-4">
        <AlertBadge type="error" msg="5 backups fallidos últimos 30d" />
        <AlertBadge type="warning" msg="DB pool > 80% hoy a las 14:30" />
      </div>

      {/* Grid of Grafana dashboards */}
      <div className="grid grid-cols-2 gap-6">
        {/* HTTP Metrics */}
        <GrafanaIframe
          dashboardId="http-latency"
          title="HTTP API Latency"
          height="400px"
        />

        {/* Database */}
        <GrafanaIframe
          dashboardId="database-health"
          title="Database Pool & Performance"
          height="400px"
        />

        {/* OpenAI API */}
        <GrafanaIframe
          dashboardId="openai-tokens"
          title="OpenAI Token Usage (by tenant)"
          height="400px"
        />

        {/* Vercel */}
        <GrafanaIframe
          dashboardId="vercel-functions"
          title="Vercel Function Duration"
          height="400px"
        />
      </div>
    </div>
  )
}

function AlertBadge({ type, msg }) {
  const colors = {
    error: 'bg-red-900 text-red-200',
    warning: 'bg-yellow-900 text-yellow-200',
    info: 'bg-blue-900 text-blue-200',
  }
  return <div className={`px-4 py-2 rounded-lg ${colors[type]}`}>{msg}</div>
}
```

---

## 8️⃣ IMPLEMENTACIÓN PASO A PASO

### Phase 1: Setup Infraestructura (Week 1)

- [ ] Crear cuenta PostHog Cloud + API key
- [ ] Instalar PostHog SDK en frontend (npm install posthog-js)
- [ ] Crear cuenta Cloudflare R2 + bucket "mirestconia-backups"
- [ ] Crear VPS Hetzner/DigitalOcean (Ubuntu 22.04, 1vCore, 2GB)
- [ ] Instalar Prometheus pushgateway en VPS
- [ ] Configurar cron backup PostgreSQL → R2

### Phase 2: Event Instrumentation (Week 2)

- [ ] Modificar `/routes/dallia.js` para capturar eventos de pregunta/respuesta
- [ ] Agregar PostHog SDK al frontend DallIA
- [ ] Capturar 8 eventos clave (ver sección 3️⃣)
- [ ] Testing: verificar eventos en PostHog dashboard

### Phase 3: Grafana Dashboards (Week 3)

- [ ] Crear dashboards en Grafana Cloud (HTTP, DB, OpenAI, Vercel)
- [ ] Configurar alertas: backup failures, DB pool, token usage
- [ ] Crear LogQL queries en Grafana Loki

### Phase 4: Superman Integración (Week 4)

- [ ] Agregar rutas `/superadmin/analytics/dallia` y `/infrastructure`
- [ ] Iframear PostHog + Grafana dashboards en Superman
- [ ] Agregar filtros por fecha + tenant
- [ ] Deploy a Vercel

---

## 9️⃣ RESUMEN FINAL

```
✅ Bajo costo: ~$54-60/mes inicial
✅ Escalable: crece a ~$500-550/mes con 100 tenants
✅ Sin "trampas": todo open source o plataformas neutrales
✅ Análisis profundo: DallIA (PostHog) + Infrastructure (Grafana)
✅ Superman integrado: ver todo en un dashboard
✅ Backups automatizados: PostgreSQL diario a R2
✅ Alertas: suscripciones venciendo, errores, backup failures

Próximo paso: ¿Empezamos con PostHog SDK en frontend?
```

---

## 📞 REFERENCIAS

- **PostHog Docs**: https://posthog.com/docs
- **Grafana Docs**: https://grafana.com/docs/grafana/latest/
- **Cloudflare R2**: https://developers.cloudflare.com/r2/
- **Resend**: https://resend.com/docs
- **Prometheus Pushgateway**: https://github.com/prometheus/pushgateway
