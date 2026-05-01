# 📊 Grafana Cloud - Dashboards de Infraestructura

## Setup Initial (5 min)

### 1. Crear cuenta Grafana Cloud
```
https://grafana.com/auth/sign-up/create-account
→ Free tier gratuito
→ URL: https://your-org.grafana.net
```

### 2. Obtener API Key
1. Profile → API keys
2. Create API key (Admin)
3. Guardar en `.env`:
```bash
GRAFANA_API_KEY=glc_xxxxx
GRAFANA_INSTANCE_URL=https://your-org.grafana.net
```

### 3. Conectar Prometheus + Loki
- Ya está en el `SPEC_OPS_ANALYTICS_2026.md`
- Variables en `.env`:
```bash
GRAFANA_CLOUD_OTLP_URL=...
GRAFANA_CLOUD_WRITE_KEY=...
GRAFANA_CLOUD_PROM_URL=...
GRAFANA_CLOUD_LOKI_URL=...
```

---

## 📈 Dashboard 1: HTTP Latency & Errors

**URL en Grafana**: New Dashboard → Add panel

### Panel 1.1: Request Latency (p95)
```promql
histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))
```
**Labels**: `method`, `route`, `status`
**Type**: Graph
**Title**: "HTTP Latency (p95)"

### Panel 1.2: Request Rate
```promql
rate(http_requests_total[1m])
```
**Type**: Graph
**Title**: "Request Rate"

### Panel 1.3: Error Rate
```promql
rate(http_errors_total[5m]) / rate(http_requests_total[5m])
```
**Type**: Stat
**Title**: "Error Rate %"
**Threshold**: > 5% = red

### Panel 1.4: Top 10 Slowest Routes (p99)
```promql
topk(10, histogram_quantile(0.99, rate(http_request_duration_ms_bucket{status="200"}[5m])))
```
**Type**: Table
**Title**: "Slowest Routes"

---

## 🗄️ Dashboard 2: Database Health

### Panel 2.1: Active Connections
```promql
db_pool_active
```
**Type**: Gauge
**Title**: "Active DB Connections"
**Threshold**: < 20 (green), 20-40 (yellow), > 40 (red)

### Panel 2.2: Idle Connections
```promql
db_pool_idle
```
**Type**: Graph
**Title**: "Idle Connections"

### Panel 2.3: Waiting Connections
```promql
db_pool_waiting
```
**Type**: Stat
**Title**: "Waiting Connections"
**Alert**: If > 5 for 5min → trigger alert

### Panel 2.4: Query Performance (by tenant)
```logql
{job="observabilidad"}
| json
| evento="query_slow"
| stats avg(duracion_ms) by tenant_id
```
**Type**: Table
**Title**: "Slowest Tenants (avg query time)"

---

## 🤖 Dashboard 3: OpenAI API Usage

### Panel 3.1: Tokens Consumed (by tenant)
```promql
sum by (tenant_id) (rate(openai_tokens_consumed[24h]))
```
**Type**: Table
**Title**: "Daily Token Usage by Tenant"

### Panel 3.2: API Cost (USD/day)
```promql
# Asumir: $0.002 per 1000 tokens promedio
sum(rate(openai_tokens_consumed[24h])) * 0.002 / 1000
```
**Type**: Stat
**Title**: "Daily API Cost (USD)"

### Panel 3.3: Request Latency (OpenAI)
```promql
histogram_quantile(0.95, rate(openai_api_duration_ms_bucket[5m]))
```
**Type**: Graph
**Title**: "OpenAI Response Time (p95)"

### Panel 3.4: Errors
```logql
{job="observabilidad"}
| json
| evento="dallia_error"
| stats count by error_tipo
```
**Type**: Bar chart
**Title**: "Error Types (DallIA)"

---

## ⚡ Dashboard 4: Vercel Functions

### Panel 4.1: Function Duration (p95)
```promql
histogram_quantile(0.95, rate(vercel_function_duration_ms_bucket[5m]))
```
**Type**: Graph
**Title**: "Vercel Duration (p95)"

### Panel 4.2: Function Invocations
```promql
rate(vercel_function_invocations[1m])
```
**Type**: Graph
**Title**: "Invocations/min"

### Panel 4.3: Cold Starts
```promql
increase(vercel_cold_starts[1h])
```
**Type**: Stat
**Title**: "Cold Starts (last hour)"

### Panel 4.4: Memory Usage
```promql
avg by (function_name) (vercel_memory_usage_mb)
```
**Type**: Table
**Title**: "Memory Usage by Function"

---

## 🚨 Alertas Recomendadas

### Alert 1: High Error Rate
```promql
rate(http_errors_total[5m]) > 0.05
```
**For**: 5 minutes
**Severity**: Critical
**Message**: "Error rate > 5%"

### Alert 2: DB Connection Pool High
```promql
db_pool_active > 40
```
**For**: 2 minutes
**Severity**: Warning
**Message**: "DB pool near capacity"

### Alert 3: OpenAI Timeout
```logql
{job="observabilidad"}
| json
| evento="dallia_error"
| error_tipo="timeout"
```
**For**: 1 minute (any occurrences)
**Severity**: Warning
**Message**: "OpenAI API timeout"

### Alert 4: Low Free Disk
```promql
node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
```
**For**: 10 minutes
**Severity**: Critical
**Message**: "Disk < 10% free"

---

## 📊 Como armar dashboards en Grafana UI

### Opción A: Crear manualmente (visual)
1. Ve a https://your-org.grafana.net
2. Click **+ Create** → **Dashboard**
3. Click **Add panel**
4. Data source: Prometheus (o Loki)
5. Pega la query PromQL/LogQL
6. Configura title, type, threshold

### Opción B: Importar JSON (más rápido)
1. Tengo los 4 dashboards listos en JSON
2. Copy JSON
3. En Grafana: **+ Create** → **Import**
4. Paste JSON → Import

---

## 🔗 Variables en Grafana (para filtros)

```
Template variables:
- tenant_id: regex /^(\d+)$/
- timeRange: Last 24h (default)
- status: regex /^(200|400|500|5..)$/
```

Esto te permite en Superman hacer filtros como:
- Ver metrics solo para tenant A
- Filtrar últimas 7 días vs 30 días
- Ver solo errores 5xx

---

## ✅ Checklist Setup

- [ ] Cuenta Grafana Cloud creada
- [ ] API key obtenida
- [ ] Prometheus + Loki conectados
- [ ] Variables en `.env`
- [ ] 4 dashboards creados
- [ ] 4 alertas configuradas
- [ ] Superman puede iframear dashboards

---

## 💰 Costos

| Nivel | Queries/mes | Costo |
|-------|-------------|-------|
| Gratuito | Ilimitado | $0 |
| Pro | Ilimitado + alertas | $29/mes |

**MiRestcon**: Gratuito es suficiente (inicio), upgrade a Pro si necesitas alertas por Slack.

---

## Próximo paso

Ir a Superman y armar iframes:
```html
<iframe
  src="https://your-org.grafana.net/d/DASHBOARD_ID/..."
  width="100%"
  height="600px"
/>
```
