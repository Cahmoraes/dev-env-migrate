#!/usr/bin/env python3
"""
receipt.py — RECIBO do último import aplicado NESTE destino.

É o "estado" que torna a reconciliação de remoção possível e segura. No fim de um
import bem-sucedido, o destino grava aqui uma cópia dos manifests que acabou de
aplicar. No PRÓXIMO import, a engine (lib/reconcile.py) compara este recibo com o
manifest novo da origem: o que está no recibo e sumiu do manifest = órfão.

Por que recibo (e não a realidade do disco)? Resolve a ambiguidade entre
"removido na origem" e "instalado localmente pelo usuário": o recibo só contém o
que o PRÓPRIO tool aplicou — nunca tocamos no que o usuário pôs por conta própria.

Mora FORA do repo (estado volátil, específico da máquina, não viaja no profile):
  $DEV_ENV_MIGRATE_STATE  ou, por padrão,  ~/.dev-env-migrate/receipt/
Guarda cópias de manifest.json (shell) e claude-manifest.json (Claude).

CLI:
  python3 scripts/receipt.py save   # grava o recibo a partir do profile/ atual
  python3 scripts/receipt.py show   # mostra o recibo existente (ou avisa que não há)
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

HOME = Path.home()
REPO = Path(__file__).resolve().parent.parent
PROFILE = REPO / "profile"

# Manifests que o recibo espelha: (nome lógico, caminho no profile, nome no recibo).
TRACKED = [
    ("shell", PROFILE / "manifest.json", "manifest.json"),
    ("claude", PROFILE / "claude" / "claude-manifest.json", "claude-manifest.json"),
]


def receipt_dir() -> Path:
    """Diretório do recibo no destino (sobreescritível por env, p/ testes)."""
    base = os.environ.get("DEV_ENV_MIGRATE_STATE")
    return Path(base) if base else HOME / ".dev-env-migrate" / "receipt"


def load(which: str) -> dict | None:
    """Lê um manifest do recibo ('shell' ou 'claude'). None se ainda não há recibo."""
    name = next((n for k, _, n in TRACKED if k == which), None)
    if not name:
        return None
    p = receipt_dir() / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save() -> list[str]:
    """Copia os manifests atuais do profile/ para o recibo. Retorna o que gravou."""
    dst = receipt_dir()
    dst.mkdir(parents=True, exist_ok=True)
    written = []
    for _, src, name in TRACKED:
        if src.exists():
            shutil.copy2(src, dst / name)
            written.append(name)
    return written


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "show"
    if cmd == "save":
        written = save()
        if written:
            print(f"✓ Recibo gravado em {receipt_dir()}")
            for n in written:
                print(f"  - {n}")
            print("Este é o baseline da PRÓXIMA reconciliação de remoção.")
        else:
            print("Nada a gravar: profile/ não tem manifests. Rode os exports na origem.",
                  file=sys.stderr)
            return 1
        return 0
    if cmd == "show":
        d = receipt_dir()
        if not d.exists() or not any((d / n).exists() for _, _, n in TRACKED):
            print(f"Nenhum recibo em {d} — este seria o PRIMEIRO import (nada a remover).")
            return 0
        print(f"Recibo em {d}:")
        for which, _, name in TRACKED:
            m = load(which)
            print(f"  - {name}: {'presente' if m else 'ausente'}")
        return 0
    print(f"Uso: receipt.py [save|show] (recebido: {cmd!r})", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
