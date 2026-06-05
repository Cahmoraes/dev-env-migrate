#!/usr/bin/env bash
#
# restore.sh — reverte as configs de shell para um snapshot feito pelo backup.sh.
# Auto-suficiente: funciona a partir de dentro da pasta de backup, sem o repo.
#
# Uso:
#   ./restore.sh                 # restaura o backup onde este script está
#   ./restore.sh <pasta-backup>  # restaura um backup específico
#
# Antes de sobrescrever, faz um backup-de-segurança do estado atual em
# <pasta-backup>/.pre-restore-<timestamp>/ — assim o próprio revert é reversível.
#
set -eu

BACKUP_DIR="${1:-$(cd "$(dirname "$0")" && pwd)}"
MANIFEST="$BACKUP_DIR/MANIFEST.txt"

if [ ! -f "$MANIFEST" ]; then
  echo "ERRO: MANIFEST.txt não encontrado em $BACKUP_DIR" >&2
  echo "Passe a pasta do backup como argumento: ./restore.sh <pasta>" >&2
  exit 1
fi

echo "Restaurando de: $BACKUP_DIR"
SAFETY="$BACKUP_DIR/.pre-restore-$(date +%Y-%m-%d_%H-%M-%S)"

while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  src="$BACKUP_DIR/$rel"
  dst="$HOME/$rel"
  [ -e "$src" ] || continue

  # Salva o estado atual antes de sobrescrever (revert do revert).
  if [ -e "$dst" ]; then
    mkdir -p "$SAFETY/$(dirname "$rel")"
    cp -R "$dst" "$SAFETY/$rel"
  fi

  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  cp -R "$src" "$dst"
  echo "  restaurado: ~/$rel"
done < "$MANIFEST"

if [ -d "$SAFETY" ]; then
  echo "Estado anterior ao revert salvo em: $SAFETY"
fi
echo "Revert concluído. Abra um novo shell (ou rode: exec zsh) para aplicar."
