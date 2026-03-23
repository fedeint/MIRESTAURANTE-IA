# INFRAESTRUCTURA - MASTER PLAN
# Sistema SaaS de Gestion de Restaurantes - mirestconia.com
# Fecha: 2026-03-22 | Autor: DevOps Engineering

---

## 1. INFRAESTRUCTURA ACTUAL VS NECESARIA

### Estado Actual (lo que existe hoy)

```
COMPONENTE          TECNOLOGIA              ESTADO
----------------------------------------------------------
App principal       Node.js/Express         Vercel (serverless)
Base de datos       PostgreSQL              Supabase (hosted)
Almacenamiento      Supabase Storage        Activo (fotos/videos)
DNS / Dominio       Namecheap -> Vercel     mirestconia.com
Subdominios         *.mirestconia.com       Wildcard multi-tenant
VPS                 Servarica               Disponible, sin usar
IA generativa       Anthropic Claude API    Activo
Observabilidad      Custom + Grafana Cloud  Implementado
Cron jobs           Vercel crons (4 jobs)   Solo frecuencia diaria
CI/CD               Git push -> Vercel      Sin pipeline formal
```

### Necesidades Nuevas - Gap Analysis

```
NECESIDAD               GAP ACTUAL                  IMPACTO
------------------------------------------------------------------
CompreFace (Docker)     Vercel NO soporta Docker    BLOQUEANTE
FFmpeg / RTSP           Vercel NO tiene estado       BLOQUEANTE
YOLO (Python)           Vercel NO ejecuta Python     BLOQUEANTE
Servidor de email       No existe, usando terceros   ALTO
Agentes IA (cron)       Vercel crons: max 1/dia      ALTO
CMS por tenant          No existe                    MEDIO
Crons frecuentes        Vercel Hobby: solo diarios   ALTO
Base de datos local     Sin sincronizacion offline   MEDIO
```

### Conclusion del Gap Analysis

El VPS Servarica ya disponible resuelve todos los gaps bloqueantes sin costo adicional.
Vercel continua siendo correcto para la app principal (serverless, CDN, auto-scaling).
La arquitectura resultante es hibrida: Vercel para stateless + VPS para stateful.

---

## 2. ARQUITECTURA DE SERVICIOS

### Diagrama General

```
INTERNET
    |
    |-- mirestconia.com --------> Vercel (CDN global)
    |-- *.mirestconia.com -------> Vercel (multi-tenant)
    |-- api.mirestconia.com -----> Vercel (API principal)
    |-- mail.mirestconia.com ----> VPS Servarica (Stalwart)
    |-- vision.mirestconia.com --> VPS Servarica (CompreFace + YOLO)
    |-- agents.mirestconia.com --> VPS Servarica (Agent runner)
    |
    +-- RESTAURANTE LOCAL (por cada tenant que tenga camaras)
            |
            +-- Raspberry Pi / Mini PC
                    |-- FFmpeg (captura RTSP de camaras)
                    |-- Buffer frames -> manda a vision.mirestconia.com
                    |-- App local offline (Node.js PKG build)
```

### Capa 1: Vercel (sin cambios, lo que ya funciona)

```
SERVICIO                    DESCRIPCION
-------------------------------------------------------------
App principal               Express SSR, EJS, multi-tenant
API REST                    Todos los endpoints /api/*
Observabilidad frontend     /superadmin/observabilidad
Crons diarios               kpi-snapshot, cleanup, trial-*
CDN assets                  public/*, imagenes estaticas
SSL automatico              *.mirestconia.com incluido
```

Vercel NO cambia. Sigue siendo el core de la aplicacion.

Limitaciones a respetar:
- Timeout maximo: 10 segundos (Hobby) / 60 segundos (Pro)
- Sin Docker, sin procesos persistentes
- Crons: una vez al dia en Hobby, cada minuto en Pro
- Sin acceso a filesystem entre requests

### Capa 2: VPS Servarica (servicios con estado)

```
VPS Servarica
├── /srv/compreface/
│   └── docker-compose.yml          <- CompreFace completo
│
├── /srv/vision-api/
│   ├── Dockerfile                  <- Python + YOLO + FastAPI
│   ├── main.py                     <- Endpoints: /count, /recognize
│   └── models/yolov8n.pt           <- Modelo YOLO preentrenado
│
├── /srv/agents/
│   ├── agent-runner.js             <- Process manager de agentes
│   ├── crons/                      <- Agentes programados
│   └── events/                     <- Agentes por webhook/evento
│
├── /srv/stalwart/
│   └── docker-compose.yml          <- Stalwart Mail Server
│
├── /srv/cms/
│   └── (por definir: Directus o custom)
│
└── /srv/nginx/
    └── nginx.conf                  <- Reverse proxy para todo
```

### Capa 3: Local en Restaurante (edge processing)

```
HARDWARE RECOMENDADO: Raspberry Pi 4 (8GB) o mini PC x86
COSTO: ~$80-120 USD por restaurante (solo los que pidan vision)

Mini PC Local
├── Node.js app (PKG build, ya existe npm run build)
│   └── Modo offline + sincronizacion con nube
│
├── FFmpeg service
│   ├── Lee RTSP de camaras IP del local
│   ├── Extrae 1 frame cada N segundos
│   └── POST frame a vision.mirestconia.com/count
│
└── Cache local
    └── Guarda conteo si no hay internet (outbox queue)
```

### Diagrama de Flujo: Vision por Camara

```
Camara IP (RTSP)
      |
      v
  FFmpeg local
  (1 frame / 30s)
      |
      v  HTTP POST con imagen
  vision.mirestconia.com
  [VPS: FastAPI + YOLO]
      |
      +-- /count     -> retorna N personas detectadas
      +-- /recognize -> retorna identidades (CompreFace)
      |
      v
  API principal (Vercel)
  POST /api/vision/event
      |
      v
  Supabase PostgreSQL
  tabla: vision_events
```

### Diagrama de Flujo: Agentes IA

```
TRIGGER                      AGENT RUNNER (VPS)              EFECTO
--------                     ------------------              ------
cron: */5 * * * *    -->     agent-stock-alert.js    -->    WhatsApp al dueno
cron: 0 */1 * * *    -->     agent-ventas-report.js  -->    Email resumen
webhook: pedido_bajo -->     agent-reorder.js        -->    Sugiere compra
webhook: mesa_llena  -->     agent-upsell.js         -->    Mensaje mesa QR
evento: fin_turno    -->     agent-cierre.js         -->    Cierre automatico
```

El VPS llama a la API de Vercel internamente. Los agentes no son un segundo backend:
son workers que consumen la misma API REST que ya existe.

### Resumen: Que Corre Donde

```
SERVICIO                    DONDE           RAZON
----------------------------------------------------------------
App web / API REST          Vercel          Auto-scaling, CDN, zero-ops
Base de datos               Supabase        Managed, backups, realtime
Storage fotos/videos        Supabase        CDN, politicas RLS
CompreFace                  VPS             Docker requerido
YOLO / Python               VPS             GPU-less OK para conteo basico
Stalwart Mail               VPS             SMTP/IMAP propio
Agent runner                VPS             Procesos persistentes, crons < 1min
FFmpeg                      Local/restaur   Streams RTSP son locales
App offline                 Local/restaur   PKG build ya existente
CMS                         VPS o Vercel    Analisis en seccion 2.5
```

### 2.5 CMS para Sitios Web de Restaurantes

Dos enfoques posibles:

OPCION A: Static site generation (recomendado para empezar)
- Cada tenant tiene una pagina `/s/[slug]` en Vercel
- Template EJS que lee datos del tenant desde Supabase
- Zero costo adicional, ya en infraestructura actual
- Limites: no es un CMS editable por el dueno del restaurante

OPCION B: Directus headless CMS en VPS (cuando haya 20+ tenants activos)
- Directus sobre PostgreSQL (puede compartir VPS)
- Cada tenant tiene su coleccion en Directus
- API REST para feeds de menu, eventos, galeria
- Frontend: Next.js o Astro desplegado en Vercel por tenant

Recomendacion: comenzar con Opcion A, migrar a B cuando el volumen lo justifique.

---

## 3. PIPELINE CI/CD

### Estado Actual

```
DEV                 PROD
 |                   |
 +-- git push -----> Vercel auto-deploy (rama main)
                     Sin tests, sin staging, sin rollback manual
```

### Pipeline Objetivo

```
                    +------------------+
  git push          |   GitHub Actions  |
  rama: feature/* ->|                  |
                    |  1. npm install   |
                    |  2. lint (ESLint) |
                    |  3. test unitario |
                    |  4. audit segur.  |
                    +--------+---------+
                             |
                    Pull Request
                             |
                    +--------v---------+
                    |  Deploy preview  |
                    |  (Vercel preview)|
                    |  URL temporal    |
                    +--------+---------+
                             |
                    Merge a main
                             |
                    +--------v---------+
                    |  Deploy staging  |
                    |  staging.miresc  |
                    |  onia.com        |
                    |  (Vercel env:    |
                    |   staging)       |
                    +--------+---------+
                             |
                    Aprobacion manual
                    (o automatico si tests OK)
                             |
                    +--------v---------+
                    |  Deploy prod     |
                    |  mirestconia.com |
                    +--------+---------+
                             |
                    +--------v---------+
                    |  VPS deploy      |
                    |  (SSH + docker   |
                    |   compose pull)  |
                    +------------------+
```

### Archivo: .github/workflows/ci.yml

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint          # agregar ESLint
      - run: npm audit --audit-level=high
      - run: npm test              # agregar tests basicos

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  deploy-prod:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
      # Deploy servicios VPS si cambiaron
      - name: Deploy VPS services
        if: contains(github.event.head_commit.modified, 'srv/')
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /srv && git pull origin main
            docker compose -f vision-api/docker-compose.yml pull
            docker compose -f vision-api/docker-compose.yml up -d
            systemctl reload nginx
```

### Estrategia de Branches

```
main           <- produccion, deploy automatico a Vercel prod
staging        <- pre-produccion, tests de integracion
feature/*      <- desarrollo, genera preview URL en Vercel
hotfix/*       <- merge directo a main + staging en paralelo
```

### Rollback

Vercel: Rollback en 1 click desde dashboard (o `vercel rollback` CLI en <30 segundos).
VPS: `docker compose up -d --scale vision-api=0` + revertir imagen anterior con tag.

---

## 4. MONITOREO Y ALERTAS

### Arquitectura de Observabilidad (extiende lo ya implementado)

La observabilidad superadmin en `/superadmin/observabilidad` ya esta implementada con
6 tabs, Grafana Cloud, y alertas WhatsApp/email. Los nuevos servicios se integran
a ese mismo sistema sin crear infraestructura paralela.

```
NUEVO SERVICIO          METRICA CLAVE               DONDE SE ENVIA
----------------------------------------------------------------------
CompreFace              requests/min, latencia       Grafana OTLP
YOLO / vision-api       frames procesados, errores   Grafana OTLP
Stalwart Mail           emails enviados/fallidos      Grafana Loki
Agent runner            ejecuciones, duracion, falla  kpi_snapshots
FFmpeg local            frames capturados, drops      vision-api -> Grafana
VPS sistema             CPU, RAM, disco, red          Node Exporter -> Grafana
```

### Health Checks

Cada servicio del VPS expone un endpoint `/health`:

```
vision.mirestconia.com/health    -> { status, compreface, yolo, uptime }
agents.mirestconia.com/health    -> { status, jobs_pending, last_run }
mail.mirestconia.com/health      -> (SMTP test, IMAP test)
```

Vercel ya tiene health check nativo. Grafana Cloud hace polling cada 60s a estos
endpoints y alerta si alguno falla 2 checks consecutivos.

### Alertas para Nuevos Servicios

```
CONDICION                           SEVERIDAD   CANAL
---------------------------------------------------------
vision-api no responde > 2min       CRITICAL    WhatsApp
CompreFace container down           CRITICAL    WhatsApp
Agente falla 3 veces seguidas       WARNING     Email
Queue de agentes > 100 pendientes   WARNING     Email
VPS CPU > 85% por 5min              WARNING     Email
VPS disco > 80%                     WARNING     Email
Stalwart: bounce rate > 5%          WARNING     Email
FFmpeg: sin frames > 10min          INFO        Dashboard
```

Estos se agregan como nuevas filas en la tabla `alert_rules` de la migration
`012_observabilidad.js` ya existente.

### Dashboard VPS (tab nuevo en observabilidad superadmin)

Agregar tab 7 "Servicios VPS" al panel existente con:
- Status cards: CompreFace / YOLO / Stalwart / Agents
- Grafico: vision requests/hora
- Grafico: emails enviados/dia
- Grafico: agentes ejecutados/dia con tasa de error
- Tabla: ultimas 20 ejecuciones de agentes

---

## 5. COSTOS MENSUALES PROYECTADOS

### Costos Fijos de Infraestructura

```
SERVICIO                PLAN            COSTO/MES (USD)
----------------------------------------------------------
Vercel                  Hobby           $0
                        Pro (cuando     $20
                        se necesite)
Supabase                Free tier       $0
                        Pro (25GB+)     $25
Grafana Cloud           Free tier       $0
                        (suficiente
                        hasta ~50 ten.)
VPS Servarica           El que tienen   ~$10-30
                        (verificar)
Namecheap DNS           Anual           ~$1.5/mes
Anthropic Claude API    Por uso         variable
Total fijo (est.)                       $12-77/mes
```

### Proyeccion por Numero de Tenants

#### 10 Tenants (etapa actual / proximos 6 meses)

```
COMPONENTE              DETALLE                         USD/MES
---------------------------------------------------------------
Vercel Hobby            Suficiente, <100k requests/mes  $0
Supabase Free           <500MB DB, <1GB storage         $0
VPS Servarica           CompreFace + YOLO + Stalwart    ~$15
Grafana Cloud Free      Suficiente para 10 tenants      $0
Claude API              ~500K tokens/mes (agentes)      ~$8
Namecheap               DNS wildcard incluido           ~$2
                                            TOTAL:      ~$25/mes
```

#### 50 Tenants (6-18 meses)

```
COMPONENTE              DETALLE                         USD/MES
---------------------------------------------------------------
Vercel Pro              Necesario: timeout 60s, crons   $20
                        cada minuto, 1M requests
Supabase Pro            ~5GB DB, ~20GB storage          $25
VPS Servarica           Upgrade RAM (16GB para YOLO)    ~$30
Grafana Cloud Free      Monitorear cardinalidad          $0
Claude API              ~3M tokens/mes                  ~$48
Stalwart Mail           En VPS, sin costo adicional     $0
cron-job.org            Crons externos frecuentes       $0
                                            TOTAL:      ~$123/mes
```

Ingreso estimado a 50 tenants: $50 x $29/mes = $1,450/mes
Margen infraestructura: 91.5%

#### 100 Tenants (18-36 meses)

```
COMPONENTE              DETALLE                         USD/MES
---------------------------------------------------------------
Vercel Pro              Sin cambio                      $20
Supabase Pro            ~15GB DB, ~50GB storage         $25
VPS Servarica x2        Un VPS para vision, otro para   ~$60
                        agents+mail (separacion)
Grafana Cloud Pro       Si se supera free tier          $29
Claude API              ~8M tokens/mes                  ~$128
Backblaze B2            Backup VPS diario               ~$5
CDN Cloudflare Free     Delante de Vercel (opcional)    $0
                                            TOTAL:      ~$267/mes
```

Ingreso estimado a 100 tenants: 100 x $29/mes = $2,900/mes
Margen infraestructura: 90.8%

### Cuando Hacer Upgrade

```
UMBRAL                  ACCION
-------------------------------------------------
> 50K req/dia           Evaluar Vercel Pro
> 1GB Supabase DB       Upgrade a Supabase Pro
> 80% CPU VPS           Upgrade o segundo VPS
> 10K Grafana series    Revisar cardinalidad labels
> 50 tenants activos    Separar VPS vision / backend
```

---

## 6. SEGURIDAD

### 6.1 Red y Perimetro

```
INTERNET
    |
    +-- Cloudflare (opcional, capa 7 WAF)
    |       |
    |       +-- DDoS protection
    |       +-- Bot management
    |       +-- Rate limiting global
    |
    +-- Vercel (ya tiene TLS, rate limiting en middleware)
    |       |
    |       +-- ipGuard.js (blacklist/whitelist ya implementado)
    |       +-- helmet.js (headers de seguridad)
    |       +-- express-rate-limit (ya en package.json)
    |
    +-- VPS Nginx (reverse proxy)
            |
            +-- TLS via Let's Encrypt (certbot)
            +-- Solo puertos 80/443 abiertos al exterior
            +-- Puerto 22 SSH: solo desde IPs especificas
            +-- CompreFace: solo accesible desde VPS internamente
            +-- YOLO API: autenticacion con API key header
```

### 6.2 Seguridad de Datos

```
DATO                    PROTECCION
-----------------------------------------------------------
Contrasenas             bcryptjs (ya implementado)
Sesiones                express-session + PostgreSQL store
Tokens API              Variables de entorno, nunca en codigo
Backups DB              Supabase auto-backup diario (Pro)
Backups VPS             Script diario -> Backblaze B2
Imagenes faciales       CompreFace: datos nunca salen del VPS
Frames de camaras       Procesados en memoria, no persistidos
Email en trancito       TLS obligatorio en Stalwart (STARTTLS)
```

### 6.3 Seguridad de Streams RTSP de Camaras

Este es el componente mas sensible. Las camaras IP graban el interior del restaurante.

```
PRINCIPIO: los frames nunca viajan a la nube como video completo.
Solo se envia el RESULTADO del analisis (N personas, IDs reconocidas).

Flujo seguro:
  Camara RTSP (LAN local)
       |
       | <- Solo dentro de la red del restaurante
       v
  FFmpeg local (Raspberry Pi / mini PC)
       |
       | <- extrae 1 frame cada 30s
       v
  YOLO local (si el hardware lo permite) O
  POST a vision.mirestconia.com (frame JPEG, max 640x480)
       |
       | <- HTTPS, API key del tenant
       v
  vision-api (VPS): procesa, descarta frame inmediatamente
       |
       v
  Retorna solo: { count: 12, faces: ["id_123"], timestamp }
       |
       v
  App Vercel: almacena en Supabase (solo el resultado)
```

Garantias de privacidad:
- Los frames JPEG se procesan en memoria (no se escriben en disco)
- No se almacenan videos ni imagenes de personas en Supabase
- Los modelos de reconocimiento facial se guardan en CompreFace (VPS propio)
- Cada tenant solo puede acceder a sus propios datos de vision
- El mini PC local puede correr YOLO sin enviar nada a internet (modo offline)

### 6.4 Seguridad del Servidor de Email (Stalwart)

```
CONFIGURACION MINIMA PARA NO SER SPAM:
  - SPF record en Namecheap DNS
  - DKIM (Stalwart lo genera automaticamente)
  - DMARC policy = reject
  - Reverse DNS (PTR record) del IP del VPS
  - TLS obligatorio (no enviar sin cifrar)
  - Rate limiting de envio por tenant
  - Bounce handling automatico
```

Riesgo: si un tenant envia spam, el IP del VPS puede ser bloqueado.
Mitigacion: limite de 200 emails/dia por tenant por defecto, aumentable por plan.

### 6.5 Seguridad del Agent Runner

Los agentes IA tienen acceso a la API principal. Vectores de riesgo:

```
RIESGO                      MITIGACION
-----------------------------------------------------------
Agente llama API indefinido  Timeout maximo 30s por agente
Prompt injection via datos   Sanitizar inputs antes de Claude
Agente con token admin       Cada agente usa token de solo lectura
                             o el minimo privilegio necesario
Fuga de datos en logs        No loguear contenido de pedidos/clientes
Agente crea datos invalidos  Validacion igual que en API REST normal
Costo Claude desbocado       Hard limit por tenant: $X/mes en tokens
```

### 6.6 Checklist de Seguridad por Entorno

```
VERCEL (app principal)
  [x] HTTPS forzado
  [x] helmet.js configurado
  [x] express-rate-limit activo
  [x] CSRF protection (csurf)
  [x] IP blacklist/whitelist
  [x] Audit log en PostgreSQL
  [ ] Content Security Policy headers (pendiente afinar)
  [ ] Dependency scanning en CI (pendiente agregar)

VPS SERVARICA
  [ ] UFW firewall: solo 80, 443, 22 (22 restringido por IP)
  [ ] fail2ban para SSH
  [ ] Docker no expone puertos sin necesidad
  [ ] Secrets via archivo .env en /srv/ (no en repositorio)
  [ ] Certbot auto-renew configurado
  [ ] Backup automatico a Backblaze B2
  [ ] Usuario no-root para servicios Docker

SUPABASE
  [x] RLS (Row Level Security) por tenant
  [x] API keys en variables de entorno
  [ ] Revisar politicas RLS periodicamente
  [ ] Habilitar Supabase audit logs (plan Pro)

LOCAL (restaurante)
  [ ] Mini PC en red separada de camaras (VLAN)
  [ ] Contrasena SSH unica por restaurante
  [ ] Auto-update de paquetes de seguridad
  [ ] Disco cifrado si contiene datos de clientes
```

---

## APENDICE: Orden de Implementacion Recomendado

```
SEMANA 1-2  Setup VPS base
            - Nginx + certbot
            - UFW + fail2ban
            - Docker + compose
            - Usuario deploy sin privilegios root

SEMANA 3    Stalwart Mail
            - Deploy Docker
            - DNS: SPF, DKIM, DMARC, PTR
            - Test de entregabilidad (mail-tester.com)
            - Integrar con nodemailer en app

SEMANA 4    Agent runner
            - PM2 o systemd para persistencia
            - Primeros 2 agentes: stock-alert + ventas-report
            - Logs a Grafana Loki
            - Reemplaza los 4 crons de Vercel con mayor frecuencia

SEMANA 5-6  Vision API
            - FastAPI + YOLO en Docker
            - Endpoint /count probado con imagenes de prueba
            - Autenticacion por API key
            - Integracion con app Vercel

SEMANA 7-8  CompreFace
            - Deploy docker-compose oficial
            - API de registro y reconocimiento
            - Solo para tenants que contraten modulo de vision

SEMANA 9+   CMS (cuando haya demanda real)
            - Evaluar Opcion A vs B segun tenants activos
            - No construir sin al menos 5 tenants pidiendolo

CI/CD (en paralelo, cualquier semana)
            - .github/workflows/ci.yml
            - ESLint + npm audit en cada PR
            - Deploy staging antes de prod
```

---

_Documento generado como parte del Master Plan de infraestructura._
_Revision recomendada: trimestral o al superar umbrales de escala descritos._
