#!/usr/bin/env bash
#
# backup.sh — snapshot das configs de shell DESTA máquina (o alvo), antes de
# qualquer alteração feita pelo setup. Roda no destino. Portável (macOS/Linux/WSL).
#
# Cria  ~/.shell-config-backups/<timestamp>/  com:
#   - cópia de cada config existente, preservando a estrutura relativa ao $HOME
#   - MANIFEST.txt  (lista do que foi salvo)
#   - restore.sh    (antídoto auto-suficiente: reverte sem precisar do repo)
#
# Uso:  ./scripts/backup.sh
# Saída (stdout, última linha): o caminho absoluto do backup criado.
#
set -eu

# Configs que o setup pode tocar — caminhos relativos ao $HOME.
TARGETS="
.zshrc
.zshenv
.p10k.zsh
.fzf.zsh
.config/micro
.config/glow
.config/starship.toml
"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TS="$(date +%Y-%m-%d_%H-%M-%S)"
DEST="$HOME/.shell-config-backups/$TS"

mkdir -p "$DEST"
: > "$DEST/MANIFEST.txt"

count=0
for rel in $TARGETS; do
  src="$HOME/$rel"
  [ -e "$src" ] || continue
  mkdir -p "$DEST/$(dirname "$rel")"
  cp -R "$src" "$DEST/$rel"
  printf '%s\n' "$rel" >> "$DEST/MANIFEST.txt"
  count=$((count + 1))
  echo "  backup: ~/$rel"
done

# Copia o antídoto para dentro do próprio backup (auto-suficiente).
if [ -f "$SCRIPT_DIR/restore.sh" ]; then
  cp "$SCRIPT_DIR/restore.sh" "$DEST/restore.sh"
  chmod +x "$DEST/restore.sh"
fi

if [ "$count" -eq 0 ]; then
  echo "Nenhuma config existente encontrada para backup (máquina limpa)."
else
  echo "Backup de $count item(ns) criado."
fi
echo "Para reverter depois:  $DEST/restore.sh"
# Última linha = caminho do backup (o Claude/usuário deve guardar isto).
echo "$DEST"
