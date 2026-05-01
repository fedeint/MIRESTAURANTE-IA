#!/bin/bash
# scripts/restore-db-r2.sh
# Restaura backup de PostgreSQL desde Cloudflare R2
# Uso: ./restore-db-r2.sh 20260331_020000

set -e

# ============================================================================
# ARGUMENTOS
# ============================================================================

BACKUP_DATE="${1:-}"

if [ -z "$BACKUP_DATE" ]; then
  echo "❌ Uso: ./restore-db-r2.sh BACKUP_DATE"
  echo "   Ejemplo: ./restore-db-r2.sh 20260331_020000"
  echo ""
  echo "📋 Backups disponibles:"

  # Listar backups disponibles
  R2_ENDPOINT="https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com"
  R2_REGION="us"
  R2_BUCKET="mirestconia-backups"

  aws s3 ls "s3://${R2_BUCKET}/db/" \
    --endpoint-url "$R2_ENDPOINT" \
    --region "$R2_REGION" \
    | awk '{print "   " $4}' | sort -r | head -20

  exit 1
fi

# ============================================================================
# CONFIGURACIÓN
# ============================================================================

LOG_FILE="/var/log/mirestconia-restore.log"
RESTORE_FILE="/tmp/mirestconia_restore_${BACKUP_DATE}.sql.gz"

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
  error "Credenciales R2 no configuradas"
fi

# ============================================================================
# DESCARGAR BACKUP DESDE R2
# ============================================================================

log "📥 Descargando backup: ${BACKUP_DATE}.sql.gz"

if aws s3 cp "s3://${R2_BUCKET}/db/${BACKUP_DATE}.sql.gz" "$RESTORE_FILE" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$R2_REGION" \
  --no-progress; then
  success "Backup descargado: $RESTORE_FILE"
else
  error "Fallo al descargar backup desde R2"
fi

# ============================================================================
# RESTAURAR BASE DE DATOS
# ============================================================================

log "⚠️  ATENCIÓN: Se van a restaurar todos los datos. Asegúrate de tener backup local."
log "Continuando en 10 segundos (Ctrl+C para cancelar)..."
sleep 10

log "🔄 Restaurando base de datos desde: ${BACKUP_DATE}"

export PGPASSWORD="$DB_PASSWORD"

# Drop y recreate database (opcional, según tu setup)
# psql -h "$DB_HOST" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $DB_NAME;"
# psql -h "$DB_HOST" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"

# Restore
if gunzip -c "$RESTORE_FILE" | psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password; then
  success "Base de datos restaurada exitosamente"
else
  error "psql restore falló"
fi

# ============================================================================
# LIMPIEZA
# ============================================================================

log "🧹 Limpiando archivo temporal..."
rm -f "$RESTORE_FILE"

success "Restauración completada"
echo ""
echo "⚠️  Próximos pasos:"
echo "   1. Verifica integridad: SELECT COUNT(*) FROM tenants;"
echo "   2. Reinicia aplicación: npm run dev"
echo "   3. Prueba login y datos"

exit 0
