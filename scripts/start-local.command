#!/bin/bash
# ============================================================
# start-local.command
# Double-click this file on macOS to start the local server.
# The Finder opens .command files in Terminal automatically.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Add Homebrew PostgreSQL binaries to PATH (covers Apple Silicon + Intel)
export PATH="/opt/homebrew/opt/postgresql@15/bin:/usr/local/opt/postgresql@15/bin:$PATH"

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo "============================================"
echo "  dignita.tech - Servidor Local"
echo "============================================"
echo ""
echo "  Abre esta URL en tablets y celulares:"
echo ""
echo "  http://$LOCAL_IP:1995"
echo ""
echo "  Presiona Ctrl+C para detener."
echo "============================================"
echo ""

# Verify .env.local exists
if [ ! -f ".env.local" ]; then
    echo "ERROR: .env.local no existe."
    echo "Ejecuta primero: npm run setup:local"
    read -r -p "Presiona Enter para salir..." _
    exit 1
fi

# Ensure PostgreSQL is running
if ! pg_isready -q 2>/dev/null; then
    echo "Iniciando PostgreSQL..."
    brew services start postgresql@15 2>/dev/null || \
    brew services start postgresql 2>/dev/null || true
    sleep 3

    if ! pg_isready -q 2>/dev/null; then
        echo "ERROR: No se pudo iniciar PostgreSQL."
        read -r -p "Presiona Enter para salir..." _
        exit 1
    fi
fi

echo "Base de datos local: OK"
echo "Iniciando servidor..."
echo ""

# Start with .env.local
MODO=local node -r dotenv/config server.js dotenv_config_path=.env.local

# Keep terminal open if server exits with error
if [ $? -ne 0 ]; then
    echo ""
    echo "El servidor se detuvo con errores."
    read -r -p "Presiona Enter para cerrar..." _
fi
