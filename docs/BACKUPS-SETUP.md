# 💾 Backups Automáticos - PostgreSQL → Cloudflare R2

## Overview

Cada día a las **2 AM UTC** (9 PM Peru time):
1. ✅ Dump PostgreSQL completo
2. ✅ Comprime con gzip
3. ✅ Sube a Cloudflare R2
4. ✅ Mantiene solo últimos 7 backups
5. ✅ Logs a `/var/log/mirestconia-backup.log`

---

## 1️⃣ Configurar Cloudflare R2

### A. Crear bucket
1. Ve a https://dash.cloudflare.com
2. R2 → Create bucket
3. Nombre: `mirestconia-backups`
4. Default settings

### B. Obtener credenciales
1. R2 → Settings
2. **API token** → Create API token
3. Permisos: `s3:*` (full access)
4. Guardar:
```
CF_ACCOUNT_ID=xxxxx (tu account ID)
CF_API_TOKEN=xxxxx (token)
CF_API_TOKEN_SECRET=xxxxx (secret)
```

### C. Instalar AWS CLI
```bash
# macOS
brew install awscli

# Linux
apt-get install awscli

# O: pip install awscliv2
```

### D. Verificar conexión
```bash
export CF_ACCOUNT_ID="tu-account-id"
export CF_API_TOKEN="tu-token"
export CF_API_TOKEN_SECRET="tu-secret"

aws s3 ls s3://mirestconia-backups/ \
  --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com \
  --region us

# Si funciona: "An error occurred (NoSuchBucket)" es OK (es vacío)
```

---

## 2️⃣ Configurar PostgreSQL credentials

En **tu VPS** o **máquina que corre backups**, crear `.pgpass`:

```bash
# ~/.pgpass
db.xxxxx.supabase.co:5432:postgres:postgres:tu-password

# Permisos (requerido)
chmod 600 ~/.pgpass
```

---

## 3️⃣ Configurar cron job

### Opción A: En VPS (recomendado)

```bash
# 1. Copiar scripts a VPS
scp scripts/backup-db-r2.sh root@your-vps:/home/backup/
scp scripts/restore-db-r2.sh root@your-vps:/home/backup/
chmod +x /home/backup/backup-db-r2.sh
chmod +x /home/backup/restore-db-r2.sh

# 2. Editar .env en VPS para agregar:
CF_ACCOUNT_ID=xxxxx
CF_API_TOKEN=xxxxx
CF_API_TOKEN_SECRET=xxxxx

# 3. Agregar cron job
crontab -e

# Pegar (2 AM UTC = 21:00 Lima time):
0 2 * * * /home/backup/backup-db-r2.sh >> /var/log/cron.log 2>&1

# Guardar y salir
```

### Opción B: En Vercel (si no tienes VPS)

Vercel no permite cron, pero puedes usar **Cron-job.org** (servicio externo):
```
1. Ve a https://cron-job.org
2. Create → HTTP GET
3. URL: https://tu-servidor.com/api/backup
4. Schedule: Daily 2 AM
```

Luego en `routes/cron.js`:
```javascript
router.get('/backup', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.CRON_SECRET) return res.status(401).send('Unauthorized');

  const { exec } = require('child_process');
  exec('/home/backup/backup-db-r2.sh', (err, stdout) => {
    res.json({ status: err ? 'failed' : 'success' });
  });
});
```

---

## 4️⃣ Verificar que funciona

### A. Test manual
```bash
# En VPS o máquina con backup script
./scripts/backup-db-r2.sh

# Esperar 1-2 min
# Ver logs:
tail -f /var/log/mirestconia-backup.log

# Deberías ver:
# ✅ Backup creado: /tmp/mirestconia_20260401_020000.sql.gz (145MB)
# ✅ Backup subido a R2
# ✅ Limpieza completada
# ✅ Backup completado y limpieza local finalizada
```

### B. Verificar en R2
```bash
aws s3 ls s3://mirestconia-backups/db/ \
  --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com \
  --region us

# Deberías ver archivos como:
# 20260401_020000.sql.gz
# 20260331_020000.sql.gz
# etc.
```

### C. Test restore (SOLO EN DEV)
```bash
# Listar backups:
./scripts/restore-db-r2.sh

# Restore a BD dev:
./scripts/restore-db-r2.sh 20260401_020000

# Esperar 5-10 min (depende del tamaño)
# Verifica que tabla se restauró:
psql -h tu-host -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM tenants;"
```

---

## 5️⃣ Alertas en Grafana

Dentro de `routes/cron.js`, después de cada backup, push a Grafana:

```javascript
const grafana = require('../lib/grafana-client');

async function logBackupStatus(success, sizeBytes) {
  await grafana.pushMetric('backup_job_success', success ? 1 : 0, {
    job: 'backup_db_r2'
  });
  await grafana.pushMetric('backup_size_bytes', sizeBytes, {
    job: 'backup_db_r2'
  });
}
```

Luego en Grafana, crea alertas:
```promql
# Alert: Backup falló
backup_job_success < 1
# For: 1 hour (si no hay backup en 1 hora, alerta)

# Alert: Backup muy grande (>500MB = posible issue)
backup_size_bytes > 500000000
# For: 5 minutes
```

---

## 6️⃣ Recuperación de emergencia

Si tu BD se corrompe:

```bash
# 1. Listar backups
./scripts/restore-db-r2.sh

# 2. Restaurar el más reciente que confíes
./scripts/restore-db-r2.sh 20260401_020000

# 3. Verificar integridad
psql -h tu-host -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM tenants; SELECT COUNT(*) FROM usuarios; ..."

# 4. Reiniciar aplicación
npm run dev

# 5. Test: login, crear factura, etc.
```

---

## 7️⃣ Costos

| Storage | Costo |
|---------|-------|
| 10 GB × 7 días | ~$1/mes |
| 100 GB × 7 días | ~$10/mes |
| 1 TB × 7 días | ~$100/mes |

**MiRestcon inicial**: ~5-20 GB/mes (muy bajo)

---

## 8️⃣ Checklist

- [ ] Cloudflare R2 bucket creado
- [ ] AWS CLI instalado
- [ ] Credenciales R2 guardadas en `.env`
- [ ] `~/.pgpass` configurado
- [ ] Scripts copied a VPS
- [ ] Cron job agregado
- [ ] Test manual ejecutado
- [ ] Archivo en R2 verificado
- [ ] Grafana alerts creadas
- [ ] Restore script testeado (en DEV)

---

## 📞 Troubleshooting

### Error: "Connection refused"
- Verifica DB_HOST, DB_PORT en .env
- ¿Supabase está accesible desde tu VPS?

### Error: "S3 signature mismatch"
- Verifica CF_API_TOKEN, CF_API_TOKEN_SECRET
- Regenera tokens en Cloudflare

### Error: "aws: command not found"
- Instala AWS CLI: `apt-get install awscli` (Linux) o `brew install awscli` (Mac)

### Backup muy lento (>30 min)
- BD demasiado grande: considera aumentar RAM VPS
- O hacer backups en horario con menos traffic

### ¿Cómo monitoreo backups en Superman?
- Ir a `/superadmin/analytics/infrastructure`
- Panel "Backup Status" en Grafana
- Verá verde si backup éxito, rojo si falló

---

## Próximo paso

Una vez backups funcionando:
→ Armar **Superman Analytics UI** (iframes PostHog + Grafana)
