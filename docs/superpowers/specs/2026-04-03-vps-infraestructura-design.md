# Diseño: Infraestructura VPS — Mail, Storage, CRM, Seguridad

**Fecha:** 2026-04-03
**Estado:** Aprobado

---

## Contexto

Servarica VPS (Ubuntu 24.04, 8GB RAM, 242GB disco, IP 38.49.208.40) está vacío y listo para configurar. Se necesita:
1. Hardening de seguridad
2. Mail server con 6 buzones corporativos
3. File storage privado para multimedia por tenant
4. Twenty CRM (open source) para gestión comercial
5. Backup automático

**Subdominio storage:** `torach.mirestconia.com` (nombre ofuscado, acceso solo via API)
**CRM:** Twenty CRM en el mismo VPS, acceso via subdominio privado

---

## 1. Hardening del servidor

### Firewall (UFW)
```
22/tcp    → SSH (cambiar a puerto custom después)
25/tcp    → SMTP
465/tcp   → SMTPS
587/tcp   → Submission
993/tcp   → IMAPS
443/tcp   → HTTPS (nginx para storage + CRM)
80/tcp    → HTTP (redirect a HTTPS)
```
Todo lo demás: DENY

### Fail2ban
- SSH: 5 intentos → ban 1 hora
- SMTP: 10 intentos → ban 30 min
- Nginx: 20 intentos → ban 15 min

### SSH hardening
- Generar SSH key pair desde la máquina local
- Copiar public key al servidor
- Deshabilitar login con password (solo key)
- Cambiar puerto SSH de 22 a 2222
- Deshabilitar root login directo → crear usuario `deployer`

### Actualizaciones automáticas
- `unattended-upgrades` para parches de seguridad

---

## 2. Mail Server — 6 buzones corporativos

### Software
- **Postfix** — enviar correo (MTA)
- **Dovecot** — recibir correo (IMAP)
- **OpenDKIM** — firma DKIM (anti-spam)
- **Certbot** — SSL para mail
- **SpamAssassin** — anti-spam entrante

### Buzones
| Correo | Contraseña | Uso |
|---|---|---|
| `no-reply@mirestconia.com` | (generada) | Emails automáticos del sistema |
| `hola@mirestconia.com` | (generada) | Comunicación general |
| `ventas@mirestconia.com` | (generada) | Ventas, contratos, planes |
| `demo@mirestconia.com` | (generada) | Solicitudes de demo |
| `soporte@mirestconia.com` | (generada) | Soporte técnico |
| `legal@mirestconia.com` | (generada) | Privacidad, reclamos |

### DNS necesarios (en Vercel DNS)
```
MX    @           mail.mirestconia.com    10
A     mail        38.49.208.40
TXT   @           v=spf1 ip4:38.49.208.40 include:_spf.google.com ~all
TXT   dkim._domainkey   (se genera durante instalación)
TXT   _dmarc      v=DMARC1; p=quarantine; rua=mailto:legal@mirestconia.com
```

### Integración con el sistema
Actualizar `.env` en Vercel:
```
SMTP_HOST=mail.mirestconia.com
SMTP_PORT=587
SMTP_USER=no-reply@mirestconia.com
SMTP_PASS=(contraseña generada)
SMTP_FROM=no-reply@mirestconia.com
```

---

## 3. File Storage — Multimedia por tenant

### Arquitectura
```
Internet → Vercel (app) → API interna → VPS (nginx) → /var/www/storage/
                                    ↑
                            Token secreto (STORAGE_API_KEY)
```

**NO hay acceso público directo.** Todo pasa por el backend de Vercel que verifica:
1. Token de API válido
2. Usuario autenticado
3. El tenant_id del usuario coincide con el archivo solicitado

### Estructura de carpetas
```
/var/www/storage/mirestconia/
├── tenant-{id}/
│   ├── solicitud/        → fotos y video de verificación
│   ├── productos/        → fotos de carta/menú
│   ├── logo/             → logo del restaurante
│   ├── chat/             → fotos enviadas a DallIA
│   └── documentos/       → boletas, facturas, contratos PDF
├── shared/               → assets del sistema
└── backups/              → backups encriptados de DB
```

### Nginx config
- Escucha en 443 (HTTPS) con SSL de Let's Encrypt
- Server name: `torach.mirestconia.com`
- Solo acepta requests con header `X-Storage-Key: {STORAGE_API_KEY}`
- Rate limit: 100 req/min por IP

### API endpoints en nginx
```
GET  /files/{tenant_id}/{path}     → Descargar archivo
POST /files/{tenant_id}/{path}     → Subir archivo
DELETE /files/{tenant_id}/{path}   → Eliminar archivo
```

### Encriptación
- Archivos sensibles (DNI, contratos) encriptados con AES-256 en reposo
- Key de encriptación en variable de entorno del VPS
- Archivos públicos (logos, fotos productos) sin encriptar

### Servicio Node.js en el VPS
Un pequeño Express server (`storage-api.js`) que:
- Valida el token
- Maneja uploads con multer
- Encripta/desencripta archivos sensibles
- Sirve archivos

### Integración con el sistema
Nuevo servicio `services/vps-storage.js` que reemplaza `services/supabase-storage.js`:
```javascript
// Upload
const url = await uploadToVPS(tenantId, 'productos', file.buffer, file.mimetype);

// Download (returns signed URL proxy)
const url = getFileUrl(tenantId, 'productos/ceviche.jpg');
// → /api/files/tenant-5/productos/ceviche.jpg (proxy via Vercel)
```

---

## 4. Twenty CRM

### Qué es
Twenty es un CRM open source (alternativa a Salesforce/HubSpot) con:
- Pipeline de ventas (Kanban)
- Contactos y empresas
- Actividades y notas
- API GraphQL
- Interfaz moderna (React)

### Instalación
- Docker compose en el VPS
- PostgreSQL propio (separado de Supabase)
- Acceso via subdominio privado (ej: `crm-internal.mirestconia.com`)
- Protegido con autenticación

### Fase 1 — Solo para ti (superadmin)
- Instalar Twenty CRM en Docker
- Acceso directo via URL privada
- Importar datos existentes: tenants → empresas, demos → deals

### Fase 2 — Módulo para tenants premium (futuro)
- Integrar Twenty via API GraphQL en el sistema
- Cada tenant premium tiene su workspace en Twenty
- Acceso desde `/crm` en el sistema MiRestcon IA
- Solo plan "De por vida" tiene acceso

---

## 5. Backups automáticos

### Base de datos (Supabase → VPS)
- Cron diario a las 3am
- `pg_dump` de Supabase → archivo comprimido + encriptado
- Almacenado en `/var/www/storage/mirestconia/backups/`
- Retención: 30 días rolling

### Archivos (VPS)
- Cron semanal (domingos 2am)
- tar.gz de `/var/www/storage/mirestconia/`
- Retención: 4 semanas

---

## 6. Observabilidad — Indicadores VPS en superadmin

Agregar al tab **Infra** del módulo de observabilidad (`/superadmin/observabilidad`) una sección "VPS Servarica":

### Endpoint health en el VPS
`GET /health` (protegido con X-Storage-Key) retorna:
```json
{
  "cpu_percent": 0.24,
  "ram_used_gb": 2.85,
  "ram_total_gb": 8,
  "disk_used_gb": 2.4,
  "disk_total_gb": 242,
  "services": {
    "postfix": true,
    "dovecot": true,
    "nginx": true,
    "storage_api": true,
    "twenty_crm": true
  },
  "mail_queue": 0,
  "fail2ban_banned": 3,
  "last_backup": "2026-04-03T03:00:00Z",
  "storage_by_tenant": [
    { "tenant_id": 1, "size_mb": 45 },
    { "tenant_id": 2, "size_mb": 12 }
  ]
}
```

### Visualización en superadmin
```
VPS Servarica ($7/mes)
├── CPU: 0.24% ████░░░░░░ de 2 cores
├── RAM: 2.85 / 8 GiB ████░░░░░░
├── Disco: 2.4 / 242 GB █░░░░░░░░░
├── Servicios: Postfix ✅ Dovecot ✅ Nginx ✅ Storage ✅ CRM ✅
├── Cola correos: 0 pendientes
├── IPs bloqueadas hoy: 3
└── Último backup: hace 4h ✅
```

### Integración
- Cron existente `/api/cron/metrics-infra` consulta `GET /health` del VPS cada 5 min
- Guarda en `kpi_snapshots` con tipo `vps_health`
- El tab Infra lee el snapshot y muestra indicadores verde/rojo

---

## 7. Distribución Supabase vs VPS

| Componente | Supabase | VPS Servarica |
|---|---|---|
| Base de datos PostgreSQL | ✅ Principal | ❌ Solo Twenty CRM |
| Sesiones (express-session) | ✅ | ❌ |
| Auth (usuarios, tenants) | ✅ | ❌ |
| Pedidos, facturas, inventario | ✅ | ❌ |
| Fotos solicitud (verificación) | ❌ Migrar | ✅ |
| Fotos productos | ❌ | ✅ |
| Logos tenants | ❌ | ✅ |
| Chat DallIA (imágenes) | ❌ | ✅ |
| Contratos PDF | ❌ | ✅ |
| Boletas/Facturas PDF | ❌ | ✅ |
| Correo corporativo | ❌ | ✅ |
| CRM Twenty | ❌ | ✅ |
| Backups DB | Auto (Supabase) | ✅ Copia encriptada |

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `services/vps-storage.js` | Crear: cliente para el storage API del VPS |
| `services/supabase-storage.js` | Modificar: fallback a VPS storage |
| `.credentials/correos.md` | Crear: credenciales de buzones |
| `.credentials/storage-api.md` | Crear: token API storage |
| `.credentials/crm-twenty.md` | Crear: acceso CRM |
| Scripts en VPS | Crear: setup-mail.sh, setup-storage.sh, setup-crm.sh, setup-backup.sh |

---

## Orden de implementación

1. **Hardening** (firewall, fail2ban, SSH key, usuario deployer)
2. **Mail server** (Postfix + Dovecot + DKIM + DNS)
3. **Storage API** (nginx + Express storage-api.js + SSL)
4. **Integración storage** (services/vps-storage.js en el sistema)
5. **Twenty CRM** (Docker compose)
6. **Backups** (crons)
7. **Migración** (mover archivos de Supabase Storage al VPS)
8. **Verificación** (enviar email de prueba, subir archivo, verificar CRM)
