#!/usr/bin/env bash
#
# export.sh — ponto de entrada CLI.
# Escaneia seu ambiente shell atual e gera ./profile/ (manifest + dotfiles + SETUP.md).
# Não instala nem move nada: apenas inventaria a procedência das suas ferramentas.
#
# Uso:  ./export.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Precisamos de python3 para gerar JSON com escape correto e copiar árvores de config.
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERRO: python3 não encontrado. Instale python3 e rode novamente." >&2
  echo "  (no WSL/Ubuntu:  sudo apt install -y python3)" >&2
  exit 1
fi

echo "── export-shell-config ───────────────────────────────"
python3 "$SCRIPT_DIR/lib/exporter.py"
