#!/usr/bin/env python3
"""
Testes do plano de adaptação (dryrun.compute_adaptation_plan) — a regra
bidirecional explícita: uma linha de plataforma X sobrevive só se ESTE destino é
da plataforma X. Cobre os dois sentidos (WSL→Mac e Mac→WSL).

Rodar:  python3 -m unittest tests.test_dryrun
"""

import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))
import dryrun  # type: ignore  # noqa: E402


def L(platform):
    return {"line": 1, "platform": platform, "pattern": "x", "text": "t"}


class TestAdaptationPlan(unittest.TestCase):
    def setUp(self):
        # mistura típica: linhas de cada plataforma
        self.lines = [L("macos"), L("macos"), L("wsl_windows"), L("debian_binary_rename")]

    def test_destino_macos(self):
        # No Mac: mantém macos, remove wsl e debian-rename; sem aliases bat/fd.
        keep, remove, add = dryrun.compute_adaptation_plan(self.lines, "macos", False)
        self.assertEqual({l["platform"] for l in keep}, {"macos"})
        self.assertEqual({l["platform"] for l in remove}, {"wsl_windows", "debian_binary_rename"})
        self.assertFalse(add)

    def test_destino_wsl_origem_ja_tinha_aliases(self):
        # Origem já trazia debian_binary_rename → mantém, e NÃO sugere re-adicionar.
        keep, remove, add = dryrun.compute_adaptation_plan(self.lines, "debian", True)
        self.assertEqual({l["platform"] for l in keep}, {"wsl_windows", "debian_binary_rename"})
        self.assertEqual({l["platform"] for l in remove}, {"macos"})
        self.assertFalse(add)  # aliases já presentes

    def test_destino_wsl_origem_mac_adiciona_aliases(self):
        # Fluxo reverso: origem macOS (sem aliases) → destino WSL → ADICIONA bat/fd.
        mac_lines = [L("macos"), L("macos"), L("wsl_windows")]
        _, remove, add = dryrun.compute_adaptation_plan(mac_lines, "debian", True)
        self.assertTrue(add)  # origem não tinha → precisa adicionar no Debian
        self.assertEqual({l["platform"] for l in remove}, {"macos"})

    def test_destino_linux_nativo_nao_wsl(self):
        # Linux nativo (não WSL): remove macos E wsl_windows; mantém só o que for de lá.
        keep, remove, add = dryrun.compute_adaptation_plan(self.lines, "linux", False)
        self.assertEqual({l["platform"] for l in remove}, {"macos", "wsl_windows", "debian_binary_rename"})
        self.assertEqual(keep, [])
        self.assertFalse(add)  # linux não-debian não renomeia bat/fd

    def test_origem_igual_destino_mantem_tudo(self):
        # Origem WSL → destino WSL: as linhas WSL NÃO devem ser removidas.
        only_wsl = [L("wsl_windows"), L("wsl_windows")]
        keep, remove, _ = dryrun.compute_adaptation_plan(only_wsl, "debian", True)
        self.assertEqual(len(keep), 2)
        self.assertEqual(remove, [])

    def test_plataforma_desconhecida_conservador(self):
        keep, remove, _ = dryrun.compute_adaptation_plan([L("outro")], "macos", False)
        self.assertEqual(len(keep), 1)  # mantém o que não sabe classificar
        self.assertEqual(remove, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
