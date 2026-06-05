#!/usr/bin/env python3
"""
dryrun.py — simula o que o SETUP.md faria NESTA máquina, sem instalar nem
alterar nada. É o "plano de execução" do import, em modo read-only.

Lê profile/manifest.json e, para o SO atual:
  - detecta SO / WSL e a presença de zsh, git e Oh My Zsh;
  - para cada ferramenta/version manager: diz se JÁ EXISTE ou se FALTA, e qual
    comando de instalação SERIA usado;
  - checa se os plugins do OMZ já estão em disco;
  - resolve o status do tema (conhecido / manual / faltando);
  - lista as linhas específicas de plataforma (por SO) a ajustar no .zshrc.

Nada é executado além de checagens 'command -v' e leitura de paths.
Código de saída: 0 sempre (é diagnóstico). Use-o antes do setup real.
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import sys
from pathlib import Path

HOME = Path.home()
REPO = Path(__file__).resolve().parent.parent
MANIFEST = REPO / "profile" / "manifest.json"

# Cores só se for um terminal de verdade.
_tty = sys.stdout.isatty()
def c(code, s):  # noqa: E704
    return f"\033[{code}m{s}\033[0m" if _tty else s
GREEN = lambda s: c("32", s)   # noqa: E731
YELLOW = lambda s: c("33", s)  # noqa: E731
CYAN = lambda s: c("36", s)    # noqa: E731
DIM = lambda s: c("2", s)      # noqa: E731
BOLD = lambda s: c("1", s)     # noqa: E731

PRESENT = GREEN("● já presente")
MISSING = YELLOW("○ faltando   ")


def detect_os() -> str:
    if platform.system() == "Darwin":
        return "macos"
    if platform.system() == "Linux":
        return "debian" if (shutil.which("apt") or shutil.which("apt-get")) else "linux"
    return "unknown"


def is_wsl() -> bool:
    r = platform.release().lower()
    return "microsoft" in r or "wsl" in r


def install_cmd(install, os_key: str) -> str:
    """Resolve qual comando de instalação seria usado no SO atual."""
    if isinstance(install, str):
        return install
    if isinstance(install, dict):
        return install.get(os_key) or install.get("fallback") or install.get("all") or "(sem comando para este SO)"
    return "(n/d)"


def compute_adaptation_plan(lines, dest_os, dest_is_wsl):
    """Decide, por linha, o que MANTER × REMOVER neste destino — a regra
    bidirecional explícita. Uma linha de plataforma X sobrevive só se ESTE destino
    é da plataforma X; caso contrário sai. Função pura (testável).

    Retorna (keep, remove, add_debian_aliases).
    """
    keep, remove = [], []
    for ln in lines:
        p = ln.get("platform")
        if p == "macos":
            target = dest_os == "macos"
        elif p == "wsl_windows":
            target = dest_is_wsl
        elif p == "debian_binary_rename":
            target = dest_os == "debian"
        else:
            target = True  # desconhecido: conservador, mantém
        (keep if target else remove).append(ln)
    # No destino Debian/Ubuntu os binários viram batcat/fdfind → precisa dos aliases.
    # Mas só "adicionar" se a origem NÃO os trouxe (senão já estão nas linhas mantidas).
    origin_has_aliases = any(l.get("platform") == "debian_binary_rename" for l in lines)
    add_debian_aliases = dest_os == "debian" and not origin_has_aliases
    return keep, remove, add_debian_aliases


def header(title: str):
    print()
    print(BOLD(CYAN(f"── {title} " + "─" * max(0, 56 - len(title)))))


def main() -> int:
    if not MANIFEST.exists():
        print(f"ERRO: {MANIFEST} não encontrado. Rode ./export.sh na origem e "
              f"commite o profile/.", file=sys.stderr)
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    os_key = detect_os()
    wsl = is_wsl()

    print(BOLD("DRY-RUN — simulação do setup (nada será instalado ou alterado)"))
    print(DIM(f"manifest gerado em: {manifest['generated_from']['os']} "
              f"(WSL={manifest['generated_from']['is_wsl']})"))

    # ── Ambiente base ────────────────────────────────────────────────
    header("Ambiente base deste alvo")
    print(f"  SO detectado: {BOLD(os_key)}" + (DIM("  (WSL)") if wsl else ""))
    for tool in ("zsh", "git"):
        ok = shutil.which(tool)
        print(f"  {PRESENT if ok else MISSING}  {tool}"
              + (DIM(f"  → {ok}") if ok else YELLOW("  → o setup vai perguntar e instalar")))
    omz = (HOME / ".oh-my-zsh").exists()
    print(f"  {PRESENT if omz else MISSING}  oh-my-zsh"
          + (DIM(f"  → {HOME/'.oh-my-zsh'}") if omz else ""))

    summary = {"present": 0, "missing": 0}

    def is_present(it):
        """Mesma lógica de detecção do exporter: binário, alias do Debian, ou path."""
        for b in (it.get("detect"), it.get("detect_alt"), it["name"]):
            if b and shutil.which(b):
                return shutil.which(b)
        dp = it.get("detect_path")
        if dp:
            p = Path(os.path.expanduser(dp))
            if p.exists():
                return str(p)
        return None

    def report_tools(title, items):
        header(title)
        for it in items:
            found = is_present(it)
            if found:
                summary["present"] += 1
                print(f"  {PRESENT}  {it['name']:<12}" + DIM(f"  → {found}  (será pulado)"))
            else:
                summary["missing"] += 1
                cmd = install_cmd(it.get("install"), os_key)
                print(f"  {MISSING}  {it['name']:<12}" + DIM(f"  → instalaria: {cmd}"))

    report_tools("Ferramentas CLI", manifest["cli_tools"])
    report_tools("Version managers", manifest["version_managers"])

    # ── Plugins ──────────────────────────────────────────────────────
    header("Plugins do Oh My Zsh")
    custom = Path(os.environ.get("ZSH_CUSTOM", HOME / ".oh-my-zsh" / "custom"))
    for p in manifest["omz_plugins"]:
        if p["name"] == "git":
            print(f"  {DIM('•')}  {p['name']:<22}" + DIM("  (builtin, nada a fazer)"))
            continue
        path = custom / "plugins" / p["name"]
        exists = path.exists()
        flag = "" if p["known"] else YELLOW("  (FONTE DESCONHECIDA — verificar)")
        print(f"  {PRESENT if exists else MISSING}  {p['name']:<22}"
              + (DIM(f"  → {path}") if exists else DIM("  → seria clonado")) + flag)

    # ── Tema ─────────────────────────────────────────────────────────
    header("Tema")
    theme = manifest["theme"]
    if not theme:
        print("  (nenhum tema configurado)")
    else:
        tag = []
        if theme.get("manual"):
            tag.append(YELLOW("AÇÃO MANUAL (pago/privado)"))
        if not theme.get("known"):
            tag.append(YELLOW("fonte desconhecida"))
        print(f"  tema configurado: {BOLD(theme['name'])}  " + "  ".join(tag))
        if theme.get("manual"):
            print(DIM(f"    → o setup vai PERGUNTAR: copiar o pago ou usar alternativa gratuita."))

    # ── Plano de adaptação (origem → este destino) ───────────────────
    header("Plano de adaptação do .zshrc (origem → ESTE destino)")
    lines = manifest["platform_specific_lines"]
    from collections import Counter
    src_os = manifest["generated_from"]["os"]
    keep, remove, add_aliases = compute_adaptation_plan(lines, os_key, wsl)
    dest_label = f"{os_key}{' (WSL)' if wsl else ''}"
    print(f"  origem: {BOLD(src_os)}   →   destino: {BOLD(dest_label)}")
    rem_brk = ", ".join(f"{p}: {n}" for p, n in
                        Counter(l.get("platform", "?") for l in remove).items()) or "—"
    keep_brk = ", ".join(f"{p}: {n}" for p, n in
                         Counter(l.get("platform", "?") for l in keep).items()) or "—"
    print(f"  {GREEN('MANTER')}  {len(keep)} linha(s)  ({keep_brk})")
    print(f"  {YELLOW('REMOVER')} {len(remove)} linha(s)  ({rem_brk})")
    for ln in remove[:5]:
        print(DIM(f"      L{ln['line']:>3} [{ln.get('platform','?')}] {ln['text'][:46]}"))
    if len(remove) > 5:
        print(DIM(f"      … e mais {len(remove) - 5}"))
    if add_aliases:
        print(f"  {CYAN('ADICIONAR')} alias bat=\"batcat\", alias fd=\"fdfind\" "
              f"(binários renomeados no Debian/Ubuntu)")

    # ── Resumo ───────────────────────────────────────────────────────
    header("Resumo do plano")
    print(f"  {GREEN(str(summary['present']))} ferramenta(s) já presente(s) → serão puladas")
    print(f"  {YELLOW(str(summary['missing']))} ferramenta(s) faltando → seriam instaladas")
    print(f"  adaptação do .zshrc: manter {len(keep)} · remover {len(remove)}"
          + (" · adicionar aliases bat/fd" if add_aliases else ""))
    print()
    print(BOLD(GREEN("DRY-RUN concluído. Nada foi instalado ou alterado.")))
    print(DIM("Para executar de verdade: abra o Claude Code e diga "
              "\"Leia profile/SETUP.md e prepare meu ambiente.\""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
