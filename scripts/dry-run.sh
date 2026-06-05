#!/usr/bin/env bash
#
# dry-run.sh — simula o setup NESTA máquina sem instalar nem alterar nada.
# Mostra o "plano de execução": o que já existe, o que faltaria instalar, quais
# linhas WSL-only seriam removidas. Read-only. Rode antes do setup real.
#
# Uso:  ./scripts/dry-run.sh
#
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERRO: python3 não encontrado (necessário só para o dry-run)." >&2
  echo "Instale python3, ou rode o setup real pelo Claude Code." >&2
  exit 1
fi

python3 "$SCRIPT_DIR/dryrun.py"
