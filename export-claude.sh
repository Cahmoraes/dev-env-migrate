#!/usr/bin/env bash
#
# export-claude.sh — exporta a configuração GLOBAL do Claude Code (plugins,
# marketplaces, language servers, statusline, hooks, settings sanitizado) para
# um profile portável. Roda DEPOIS do ./export.sh (são independentes).
#
# Não exporta segredos (.credentials.json, .claude.json, history, sessions).
#
# Uso:  ./export-claude.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERRO: python3 não encontrado. Instale python3 e rode novamente." >&2
  exit 1
fi

echo "── dev-env-migrate :: Claude Code ────────────────────"
python3 "$SCRIPT_DIR/lib/claude_exporter.py"
