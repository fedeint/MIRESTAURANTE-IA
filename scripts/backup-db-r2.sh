#!/bin/bash
# scripts/backup-db-r2.sh
# Automaticamente hace backup diario de PostgreSQL → Cloudflare R2
# Ejecutar via cron: 0 2 * * * /path/to/backup-db-r2.sh

set -e

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/mirestconia_${BACKUP_DATE}.sql.gz"
LOG_FILE="/var/log/mirestconia-backup.log"

# Database credentials (from .env)
DB_HOST="${DB_HOST:-db.xxxxx.supabase.co}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_DATABASE:-postgres}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"

# R2 Configuration
R2_ACCOUNT_ID="${CF_ACCOUNT_ID}"
R2_ACCESS_KEY_ID="${CF_API_TOKEN}"
R2_SECRET_ACCESS_KEY="${CF_API_TOKEN_SECRET}"
R2_BUCKET="mirestconia-backups"
R2_REGION="us"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Retention: keep only last 7 backups
RETENTION_DAYS=7

# ============================================================================
# FUNCIONES
# ============================================================================

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
  log "❌ ERROR: $1"
  exit 1
}

success() {
  log "✅ $1"
}

# ============================================================================
# VALIDACIONES
# ============================================================================

if [ -z "$DB_PASSWORD" ]; then
  error "DB_PASSWORD no configurada en .env"
fi

if [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ]; then
  error "Credenciales R2 no configuradas (CF_API_TOKEN, CF_API_TOKEN_SECRET)"
fi

# ============================================================================
# BACKUP
# ============================================================================

log "📦 Iniciando backup de PostgreSQL..."

export PGPASSWORD="$DB_PASSWORD"

if pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password \
  --format=plain \
  | gzip > "$BACKUP_FILE"; then
  success "Backup creado: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  error "pg_dump falló"
fi

# ============================================================================
# UPLOAD A R2
# ============================================================================

log "📤 Subiendo a Cloudflare R2..."

# Usar AWS CLI (compatible con R2)
if aws s3 cp "$BACKUP_FILE" \
  "s3://${R2_BUCKET}/db/${BACKUP_DATE}.sql.gz" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$R2_REGION" \
  --no-progress; then
  success "Backup subido a R2"
else
  error "Fallo al subir a R2"
fi

# ============================================================================
# LIMPIEZA: MANTENER SOLO ÚLTIMOS 7 DÍAS
# ============================================================================

log "🧹 Limpiando backups antiguos (> 7 días)..."

# Listar archivos en R2, ordenar por nombre (YYYYMMDD_HHMMSS), eliminar viejos
aws s3 ls "s3://${R2_BUCKET}/db/" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$R2_REGION" \
  | awk '{print $4}' \
  | sort -r \
  | tail -n +8 \
  | while read file; do
    if [ -n "$file" ]; then
      log "🗑️ Eliminando: $file"
      aws s3 rm "s3://${R2_BUCKET}/db/${file}" \
        --endpoint-url "$R2_ENDPOINT" \
        --region "$R2_REGION"
    fi
  done

success "Limpieza completada"

# ============================================================================
# FINAL
# ============================================================================

rm -f "$BACKUP_FILE"
success "Backup completado y limpieza local finalizada"

# Retornar 0 para cron
exit 0
