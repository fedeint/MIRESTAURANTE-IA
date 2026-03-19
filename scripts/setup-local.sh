#!/bin/bash
# =============================================================================
# setup-local.sh
# One-time setup for the local PostgreSQL server (offline/power-outage mode).
# Run this ONCE on the restaurant's Mac/laptop that will act as the local server.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_NAME="dignita_local"
DB_URL="postgresql://localhost:5432/$DB_NAME"

echo "=== Configuracion del Servidor Local - dignita.tech ==="
echo "Proyecto: $PROJECT_DIR"
echo ""

# ── 1. Verificar PostgreSQL ────────────────────────────────────────────────────
echo "1. Verificando PostgreSQL local..."

if ! command -v psql &> /dev/null; then
    echo "   PostgreSQL no encontrado. Instalando con Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "   ERROR: Homebrew no esta instalado."
        echo "   Instala Homebrew primero: https://brew.sh"
        exit 1
    fi
    brew install postgresql@15
    brew services start postgresql@15
    # Add pg binaries to PATH for this session
    export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
    sleep 3  # Give the service a moment to start
    echo "   PostgreSQL instalado y arrancado."
else
    echo "   PostgreSQL encontrado: $(psql --version)"
fi

# Ensure the PostgreSQL service is running
if ! pg_isready -q 2>/dev/null; then
    echo "   Iniciando servicio PostgreSQL..."
    brew services start postgresql@15 2>/dev/null || \
    brew services start postgresql 2>/dev/null || \
    pg_ctl start -D /usr/local/var/postgresql@15 2>/dev/null || true
    sleep 3
fi

if ! pg_isready -q 2>/dev/null; then
    echo "   ERROR: No se pudo iniciar PostgreSQL. Revisa la instalacion."
    exit 1
fi
echo "   PostgreSQL corriendo."

# ── 2. Crear base de datos local ──────────────────────────────────────────────
echo ""
echo "2. Creando base de datos local '$DB_NAME'..."
createdb "$DB_NAME" 2>/dev/null && echo "   Base de datos creada." || echo "   Base de datos ya existe, continuando."

# ── 3. Ejecutar esquema ───────────────────────────────────────────────────────
echo ""
echo "3. Ejecutando esquema de tablas..."
cd "$PROJECT_DIR"
DATABASE_URL="$DB_URL" node scripts/setup-supabase.js
echo "   Esquema aplicado."

# ── 4. Crear tabla sync_log (solo existe en local) ───────────────────────────
echo ""
echo "4. Creando tabla de control de sincronizacion..."
psql "$DB_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS sync_log (
    id           SERIAL PRIMARY KEY,
    table_name   VARCHAR(100) NOT NULL,
    synced_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    records_sent INTEGER      NOT NULL DEFAULT 0,
    records_recv INTEGER      NOT NULL DEFAULT 0,
    direction    VARCHAR(20)  NOT NULL DEFAULT 'to_cloud',
    status       VARCHAR(20)  NOT NULL DEFAULT 'ok',
    error_msg    TEXT         NULL,
    details      JSONB        NULL
);

-- Global last-sync marker (one row per direction)
CREATE TABLE IF NOT EXISTS sync_state (
    id           SERIAL PRIMARY KEY,
    direction    VARCHAR(20)  NOT NULL UNIQUE,
    last_sync_at TIMESTAMP    NOT NULL DEFAULT '1970-01-01 00:00:00'
);

INSERT INTO sync_state (direction, last_sync_at)
VALUES ('to_cloud', '1970-01-01 00:00:00')
ON CONFLICT (direction) DO NOTHING;

INSERT INTO sync_state (direction, last_sync_at)
VALUES ('from_cloud', '1970-01-01 00:00:00')
ON CONFLICT (direction) DO NOTHING;
SQL
echo "   Tablas sync_log y sync_state creadas."

# ── 5. Crear .env.local ───────────────────────────────────────────────────────
echo ""
echo "5. Creando .env.local..."
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

cat > "$PROJECT_DIR/.env.local" << ENVEOF
# ============================================================
# Modo LOCAL - servidor en la LAN del restaurante
# Este archivo NO se sube a git (ver .gitignore)
# ============================================================

# Base de datos local (sin SSL)
DATABASE_URL=postgresql://localhost:5432/dignita_local

# Sesion
SESSION_SECRET=local-$(openssl rand -hex 16 2>/dev/null || echo "change-me-now")

# Entorno
NODE_ENV=production
PORT=1995

# CLAVE: activa el modo local (sin SSL, sin Supabase)
MODO=local

# URL de la nube para sincronizar (llenar con la URL de Supabase)
# CLOUD_DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres
ENVEOF
echo "   .env.local creado."

# ── 6. Crear start-local.command ─────────────────────────────────────────────
echo ""
echo "6. Creando lanzador de doble clic..."
COMMAND_FILE="$PROJECT_DIR/scripts/start-local.command"
cat > "$COMMAND_FILE" << 'CMDEOF'
#!/bin/bash
# ============================================================
# start-local.command
# Doble clic en este archivo para arrancar el servidor local.
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Add Homebrew pg binaries to PATH in case they are not in system PATH
export PATH="/opt/homebrew/opt/postgresql@15/bin:/usr/local/opt/postgresql@15/bin:$PATH"

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo "============================================"
echo "  dignita.tech - Servidor Local"
echo "============================================"
echo ""
echo "  URL para tablets/celulares:"
echo "  http://$LOCAL_IP:1995"
echo ""
echo "  Presiona Ctrl+C para detener el servidor."
echo "============================================"
echo ""

# Ensure PostgreSQL is running
if ! pg_isready -q 2>/dev/null; then
    echo "Iniciando PostgreSQL..."
    brew services start postgresql@15 2>/dev/null || \
    brew services start postgresql 2>/dev/null || true
    sleep 3
fi

# Start the app in local mode using .env.local
MODO=local node -r dotenv/config server.js dotenv_config_path=.env.local
CMDEOF
chmod +x "$COMMAND_FILE"
echo "   start-local.command creado y con permisos de ejecucion."

# ── 7. Resumen ────────────────────────────────────────────────────────────────
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo ""
echo "============================================"
echo "  CONFIGURACION COMPLETADA"
echo "============================================"
echo ""
echo "  Para iniciar el servidor local:"
echo "  - Doble clic en: scripts/start-local.command"
echo "  - O desde terminal: npm run local"
echo ""
echo "  Los dispositivos se conectan a:"
echo "  http://$LOCAL_IP:1995"
echo ""
echo "  Para sincronizar datos con la nube:"
echo "  1. Edita .env.local y pon CLOUD_DATABASE_URL"
echo "  2. Ejecuta: npm run sync:to-cloud"
echo "============================================"
