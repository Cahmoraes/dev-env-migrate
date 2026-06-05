#!/usr/bin/env python3
"""
Teste de INTEGRAÇÃO — roda os dois fluxos completos de ponta a ponta, hermético
e sem tocar no sistema real:

  Fluxo direto:  origem WSL  → destino macOS   (remove linhas WSL, remove alias bat=batcat)
  Fluxo reverso: origem macOS → destino WSL    (remove linhas macOS, ADICIONA alias bat=batcat)

Cada fluxo exercita a cadeia inteira: export (classifica por plataforma) →
manifest → import (filtra pelo destino) → .zshrc adaptado. Mais o flow do Claude
(sanitização → expansão de ${HOME}) e o round-trip de backup/restore.

Rodar:  python3 -m unittest tests.test_integration
Usa só a stdlib.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "lib"))
sys.path.insert(0, str(REPO / "scripts"))
import exporter          # type: ignore  # noqa: E402
import claude_exporter as ce  # type: ignore  # noqa: E402
import dryrun            # type: ignore  # noqa: E402
import reconcile         # type: ignore  # noqa: E402
import receipt           # type: ignore  # noqa: E402

# ── Fixtures: dois .zshrc realistas, um por plataforma de origem ──────────────
ZSHRC_WSL = '''ZSH_THEME="dracula-pro"
plugins=(git zsh-autosuggestions)
alias bat="batcat"
alias fd="fdfind"
export PULSE_SERVER=unix:/mnt/wslg/runtime-dir/pulse/native
export WARP_ENABLE_WAYLAND=1
VSCODE_BIN="/mnt/c/Users/ike/bin"
alias pp="pnpm"
alias gs="git status"
eval "$(zoxide init zsh)"
'''

ZSHRC_MAC = '''ZSH_THEME="dracula-pro"
plugins=(git zsh-autosuggestions)
eval "$(/opt/homebrew/bin/brew shellenv)"
alias copy="pbcopy"
alias ls="ls -G"
export LSCOLORS="GxFxCxDxBxegedabagaced"
alias code="open -a 'Visual Studio Code'"
alias pp="pnpm"
alias gs="git status"
eval "$(zoxide init zsh)"
'''

PORTABLE = ['ZSH_THEME="dracula-pro"', "alias pp=", "alias gs=", "zoxide init"]


def export_shell(zshrc_text, src_os):
    """Lado ORIGEM: roda o pipeline real de export e devolve (manifest, setup_md)."""
    tmp = Path(tempfile.mkdtemp()) / ".zshrc"
    tmp.write_text(zshrc_text, encoding="utf-8")
    catalog = exporter.load_catalog()
    zsh_info = exporter.parse_zshrc(tmp)
    plat_lines = exporter.scan_platform_lines(tmp, catalog)
    detected = {"cli_tools": {}, "version_managers": {}, "frameworks": {}}
    manifest = exporter.build_manifest(catalog, zsh_info, detected, plat_lines,
                                       [".zshrc"], src_os)
    setup_md = exporter.render_setup_md(manifest)
    return manifest, setup_md


def import_shell(zshrc_text, manifest, dest_os, dest_is_wsl):
    """Lado DESTINO: aplica a regra de adaptação (Fase 4) e devolve o .zshrc final."""
    lines = manifest["platform_specific_lines"]
    keep, remove, add_aliases = dryrun.compute_adaptation_plan(lines, dest_os, dest_is_wsl)
    drop = {l["line"] for l in remove}
    src = zshrc_text.splitlines()
    adapted = [ln for i, ln in enumerate(src, 1) if i not in drop]
    if add_aliases:
        adapted += ['alias bat="batcat"', 'alias fd="fdfind"']
    return "\n".join(adapted) + "\n", keep, remove, add_aliases


class TestFlowDirectWslToMac(unittest.TestCase):
    """Origem WSL → destino macOS."""

    def setUp(self):
        self.manifest, self.setup_md = export_shell(ZSHRC_WSL, "debian")
        self.adapted, self.keep, self.remove, self.add = import_shell(
            ZSHRC_WSL, self.manifest, dest_os="macos", dest_is_wsl=False)

    def test_export_classifica_por_plataforma(self):
        plats = {l["platform"] for l in self.manifest["platform_specific_lines"]}
        self.assertIn("wsl_windows", plats)
        self.assertIn("debian_binary_rename", plats)

    def test_setup_md_declara_origem(self):
        self.assertIn("gerado em **debian**", self.setup_md)

    def test_linhas_wsl_removidas_no_mac(self):
        for leak in ["/mnt/c", "/mnt/wslg", "PULSE_SERVER", "WARP_ENABLE_WAYLAND"]:
            self.assertNotIn(leak, self.adapted, f"{leak} vazou para o macOS")

    def test_alias_renomeado_removido_no_mac(self):
        # no macOS o binário é 'bat'/'fd' nativo — os aliases do Debian saem
        self.assertNotIn('alias bat="batcat"', self.adapted)
        self.assertFalse(self.add)

    def test_portaveis_preservados(self):
        for p in PORTABLE:
            self.assertIn(p, self.adapted)


class TestFlowReverseMacToWsl(unittest.TestCase):
    """Origem macOS → destino WSL."""

    def setUp(self):
        self.manifest, self.setup_md = export_shell(ZSHRC_MAC, "macos")
        self.adapted, self.keep, self.remove, self.add = import_shell(
            ZSHRC_MAC, self.manifest, dest_os="debian", dest_is_wsl=True)

    def test_export_marca_linhas_macos(self):
        plats = {l["platform"] for l in self.manifest["platform_specific_lines"]}
        self.assertEqual(plats, {"macos"})

    def test_linhas_macos_removidas_no_wsl(self):
        for leak in ["/opt/homebrew", "pbcopy", "ls -G", "LSCOLORS", "open -a"]:
            self.assertNotIn(leak, self.adapted, f"{leak} vazou para o WSL")

    def test_alias_bat_adicionado_no_debian(self):
        # origem Mac não tinha alias; no Debian o binário é batcat → precisa adicionar
        self.assertTrue(self.add)
        self.assertIn('alias bat="batcat"', self.adapted)

    def test_portaveis_preservados(self):
        for p in PORTABLE:
            self.assertIn(p, self.adapted)


class TestFlowSameOsKeepsLines(unittest.TestCase):
    """Origem WSL → destino WSL: as linhas WSL devem ser MANTIDAS."""

    def test_wsl_to_wsl_mantem_tudo(self):
        manifest, _ = export_shell(ZSHRC_WSL, "debian")
        adapted, _, remove, add = import_shell(
            ZSHRC_WSL, manifest, dest_os="debian", dest_is_wsl=True)
        self.assertIn("/mnt/wslg", adapted)        # destino é WSL → mantém
        self.assertIn('alias bat="batcat"', adapted)
        self.assertEqual(remove, [])
        self.assertFalse(add)                       # origem já tinha os aliases


class TestClaudeFlowSanitizeRoundtrip(unittest.TestCase):
    """Flow do Claude: sanitização na origem → expansão de ${HOME} no destino."""

    def test_segredo_removido_e_home_expandido(self):
        home_origem = ce.HOME_STR
        settings = {
            "env": {"GITHUB_TOKEN": "ghp_segredo", "EDITOR": "micro"},
            "statusLine": {"command": f"bash {home_origem}/.claude/sl.sh"},
        }
        # ORIGEM: sanitiza
        clean, removed = ce.sanitize_settings(settings)
        self.assertNotIn("GITHUB_TOKEN", clean["env"])
        self.assertIn("EDITOR", clean["env"])
        self.assertNotIn(home_origem, json.dumps(clean))
        self.assertTrue(removed)
        # DESTINO: expande ${HOME} para o home de lá
        dest_home = "/home/destino"
        expanded = json.loads(json.dumps(clean).replace("${HOME}", dest_home))
        self.assertIn(f"{dest_home}/.claude/sl.sh", expanded["statusLine"]["command"])
        self.assertNotIn("${HOME}", json.dumps(expanded))


class TestBackupRestoreRoundtrip(unittest.TestCase):
    """Rede de segurança: backup.sh → modifica → restore.sh devolve o original."""

    def test_roundtrip(self):
        home = Path(tempfile.mkdtemp())
        (home / ".zshrc").write_text("ORIGINAL\n")
        env = {"HOME": str(home), "PATH": "/usr/bin:/bin"}

        out = subprocess.run(["bash", str(REPO / "scripts/backup.sh")],
                             cwd=REPO, env=env, capture_output=True, text=True)
        backup_dir = out.stdout.strip().splitlines()[-1]
        self.assertTrue(Path(backup_dir).exists())

        (home / ".zshrc").write_text("MODIFICADO\n")
        subprocess.run(["bash", f"{backup_dir}/restore.sh"], env=env,
                       capture_output=True, text=True)
        self.assertEqual((home / ".zshrc").read_text(), "ORIGINAL\n")


class TestRemovalReconciliationFlow(unittest.TestCase):
    """Fluxo de REMOÇÃO ponta-a-ponta: recibo do import anterior (prev) × manifest
    novo da origem (curr), usando a POLÍTICA real dos catálogos. Prova que apagar
    algo na origem (cli, plugin, skill, security flag) é refletido no destino —
    e que a ação certa (prompt_remove × report_only) é escolhida."""

    def _dims(self, catalog_name):
        cat = json.loads((REPO / "lib" / catalog_name).read_text(encoding="utf-8"))
        return cat["removal_policy"]["dimensions"]

    def test_shell_cli_e_plugin_removidos(self):
        dims = self._dims("catalog.json")
        prev = {"cli_tools": [{"name": "bat"}, {"name": "fd"}],
                "omz_plugins": [{"name": "zsh-autosuggestions"}, {"name": "zsh-syntax"}],
                "version_managers": [], "frameworks": [], "theme": None, "dotfiles_copied": []}
        curr = {"cli_tools": [{"name": "bat"}],                       # fd removido (sistema)
                "omz_plugins": [{"name": "zsh-autosuggestions"}],     # zsh-syntax removido (tool-owned)
                "version_managers": [], "frameworks": [], "theme": None, "dotfiles_copied": []}
        plan = reconcile.compute_removal_plan(prev, curr, dims)
        prompt, report = reconcile.split_by_action(plan)
        # plugin OMZ → o roteiro remove (tool-owned); cli → só avisa (binário de sistema)
        self.assertEqual({p["id"] for p in prompt}, {"zsh-syntax"})
        self.assertEqual({p["id"] for p in report}, {"fd"})

    def test_claude_skill_e_flag_removidas(self):
        dims = self._dims("claude_catalog.json")
        prev = {"plugins": [], "marketplaces": [], "language_servers": [],
                "hook_dependencies": [], "security_flags": {"skipAutoPermissionPrompt": True},
                "config_inventory": {"skills": ["spec", "handoff"], "agents": [], "commands": [], "hooks": []}}
        curr = {"plugins": [], "marketplaces": [], "language_servers": [],
                "hook_dependencies": [], "security_flags": {},
                "config_inventory": {"skills": ["spec"], "agents": [], "commands": [], "hooks": []}}
        plan = reconcile.compute_removal_plan(prev, curr, dims)
        prompt, _ = reconcile.split_by_action(plan)
        ids = {(p["label"], p["id"]) for p in prompt}
        self.assertIn(("skill", "handoff"), ids)            # skill apagada propaga
        self.assertIn(("security flag", "skipAutoPermissionPrompt"), ids)  # flag removida propaga

    def test_receipt_roundtrip_e_primeiro_import(self):
        """Recibo grava/lê via DEV_ENV_MIGRATE_STATE; sem recibo = primeiro import."""
        state = Path(tempfile.mkdtemp()) / "state"
        prev_env = os.environ.get("DEV_ENV_MIGRATE_STATE")
        os.environ["DEV_ENV_MIGRATE_STATE"] = str(state)
        try:
            # Sem recibo ainda → load devolve None → plano vazio (nada a remover).
            self.assertIsNone(receipt.load("shell"))
            self.assertEqual(reconcile.compute_removal_plan(receipt.load("shell"),
                             {"cli_tools": [{"name": "bat"}]}, self._dims("catalog.json")), [])
            # Grava um recibo à mão (simulando o fim de um import) e relê.
            state.mkdir(parents=True, exist_ok=True)
            (state / "manifest.json").write_text(json.dumps(
                {"cli_tools": [{"name": "bat"}, {"name": "fd"}], "omz_plugins": [],
                 "version_managers": [], "frameworks": [], "theme": None,
                 "dotfiles_copied": []}), encoding="utf-8")
            prev = receipt.load("shell")
            self.assertIsNotNone(prev)
            # Agora a origem perdeu 'fd' → órfão detectado a partir do recibo lido.
            plan = reconcile.compute_removal_plan(
                prev, {"cli_tools": [{"name": "bat"}], "omz_plugins": [],
                       "version_managers": [], "frameworks": [], "theme": None,
                       "dotfiles_copied": []}, self._dims("catalog.json"))
            self.assertEqual([p["id"] for p in plan], ["fd"])
        finally:
            if prev_env is None:
                os.environ.pop("DEV_ENV_MIGRATE_STATE", None)
            else:
                os.environ["DEV_ENV_MIGRATE_STATE"] = prev_env


if __name__ == "__main__":
    unittest.main(verbosity=2)
