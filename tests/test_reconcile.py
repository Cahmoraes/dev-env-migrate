#!/usr/bin/env python3
"""
Testes da engine de RECONCILIAÇÃO DE REMOÇÃO (lib/reconcile.py) — a regra pura
"órfão = id no recibo anterior e ausente no manifest atual", por dimensão e por
ação (prompt_remove × report_only). Cobre os 4 kinds de extração e os invariantes
de segurança (primeiro import vazio; item adicionado localmente nunca vira órfão).

Rodar:  python3 -m unittest tests.test_reconcile
Usa só a stdlib.
"""

import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "lib"))
import reconcile  # type: ignore  # noqa: E402

# Dimensões de exemplo cobrindo os 4 kinds e as duas ações.
DIMS = [
    {"path": "cli_tools",     "kind": "list_dict",   "id": "name", "action": "report_only",   "label": "CLI"},
    {"path": "omz_plugins",   "kind": "list_dict",   "id": "name", "action": "prompt_remove", "label": "plugin OMZ"},
    {"path": "theme",         "kind": "single_dict", "id": "name", "action": "report_only",   "label": "tema"},
    {"path": "dotfiles",      "kind": "list_scalar",               "action": "prompt_remove", "label": "dotfile"},
    {"path": "security_flags","kind": "dict_keys",                 "action": "prompt_remove", "label": "flag"},
    {"path": "inv.skills",    "kind": "list_scalar",               "action": "prompt_remove", "label": "skill"},
]


def manifest(cli=(), plugins=(), theme=None, dotfiles=(), flags=(), skills=()):
    return {
        "cli_tools": [{"name": n} for n in cli],
        "omz_plugins": [{"name": n} for n in plugins],
        "theme": {"name": theme} if theme else None,
        "dotfiles": list(dotfiles),
        "security_flags": {k: True for k in flags},
        "inv": {"skills": list(skills)},
    }


class TestExtractIds(unittest.TestCase):
    def test_list_dict(self):
        ids = reconcile.extract_ids(manifest(cli=["bat", "fd"]), DIMS[0])
        self.assertEqual(ids, {"bat", "fd"})

    def test_single_dict_presente_e_ausente(self):
        self.assertEqual(reconcile.extract_ids(manifest(theme="dracula"), DIMS[2]), {"dracula"})
        self.assertEqual(reconcile.extract_ids(manifest(theme=None), DIMS[2]), set())

    def test_list_scalar(self):
        self.assertEqual(reconcile.extract_ids(manifest(dotfiles=[".zshrc"]), DIMS[3]), {".zshrc"})

    def test_dict_keys(self):
        self.assertEqual(reconcile.extract_ids(manifest(flags=["a", "b"]), DIMS[4]), {"a", "b"})

    def test_path_pontilhado_aninhado(self):
        self.assertEqual(reconcile.extract_ids(manifest(skills=["x"]), DIMS[5]), {"x"})

    def test_dimensao_ausente_no_manifest_antigo(self):
        # Recibo legado sem a chave → conjunto vazio, nunca KeyError.
        self.assertEqual(reconcile.extract_ids({}, DIMS[0]), set())


class TestComputeRemovalPlan(unittest.TestCase):
    def test_primeiro_import_sem_recibo_vazio(self):
        # prev=None (nunca importou aqui) ⇒ nada a remover, jamais.
        plan = reconcile.compute_removal_plan(None, manifest(cli=["bat"]), DIMS)
        self.assertEqual(plan, [])

    def test_item_removido_da_origem_vira_orfao(self):
        prev = manifest(cli=["bat", "fd"], plugins=["zsh-x"])
        curr = manifest(cli=["bat"], plugins=["zsh-x"])  # fd sumiu
        plan = reconcile.compute_removal_plan(prev, curr, DIMS)
        self.assertEqual([(p["label"], p["id"]) for p in plan], [("CLI", "fd")])

    def test_item_adicionado_no_destino_nao_eh_orfao(self):
        # curr tem MAIS que prev (origem cresceu) → nada a remover.
        prev = manifest(cli=["bat"])
        curr = manifest(cli=["bat", "fd", "rg"])
        self.assertEqual(reconcile.compute_removal_plan(prev, curr, DIMS), [])

    def test_lib_local_ausente_do_recibo_e_do_manifest_nunca_eh_tocada(self):
        # GARANTIA ESTRUTURAL: uma lib que o destino instalou por conta própria
        # ('rg-local') não está no recibo (prev = cópia do manifest da origem) nem
        # no manifest (curr). O plano só remove ids de `prev`, então ela é
        # impossível de aparecer — mesmo quando OUTRA remoção real acontece.
        prev = manifest(cli=["bat", "fd"], plugins=["zsh-x"])   # recibo (o que o tool aplicou)
        curr = manifest(cli=["bat"], plugins=["zsh-x"])         # origem removeu 'fd'
        plan = reconcile.compute_removal_plan(prev, curr, DIMS)
        ids = {p["id"] for p in plan}
        self.assertIn("fd", ids)              # a remoção real da origem acontece…
        self.assertNotIn("rg-local", ids)     # …mas a lib local jamais é tocada
        # Vale para item tool-owned local também (skill criada só no destino):
        prev2 = manifest(skills=["spec"])
        curr2 = manifest(skills=["spec"])     # 'skill-local' não está em nenhum dos dois
        plan2 = reconcile.compute_removal_plan(prev2, curr2, DIMS)
        self.assertEqual([p["id"] for p in plan2 if p["id"] == "skill-local"], [])

    def test_skill_removida_detectada_por_nome(self):
        prev = manifest(skills=["spec", "handoff"])
        curr = manifest(skills=["spec"])
        plan = reconcile.compute_removal_plan(prev, curr, DIMS)
        self.assertEqual([(p["label"], p["id"]) for p in plan], [("skill", "handoff")])

    def test_theme_removido(self):
        plan = reconcile.compute_removal_plan(manifest(theme="dracula"), manifest(), DIMS)
        self.assertEqual([(p["label"], p["id"]) for p in plan], [("tema", "dracula")])

    def test_security_flag_removida(self):
        prev = manifest(flags=["skipAutoPermissionPrompt"])
        plan = reconcile.compute_removal_plan(prev, manifest(), DIMS)
        self.assertEqual([(p["label"], p["id"]) for p in plan], [("flag", "skipAutoPermissionPrompt")])

    def test_ordem_estavel(self):
        # Mesma entrada → mesma saída ordenada (por dimensão, depois por id).
        prev = manifest(cli=["z", "a"], dotfiles=[".b", ".a"])
        curr = manifest()
        ids = [p["id"] for p in reconcile.compute_removal_plan(prev, curr, DIMS)]
        self.assertEqual(ids, ["a", "z", ".a", ".b"])


class TestSplitByAction(unittest.TestCase):
    def test_separa_prompt_de_report(self):
        # CLI (report_only) + plugin (prompt_remove) sumiram.
        prev = manifest(cli=["bat"], plugins=["zsh-x"])
        curr = manifest()
        prompt, report = reconcile.split_by_action(
            reconcile.compute_removal_plan(prev, curr, DIMS))
        self.assertEqual({p["id"] for p in prompt}, {"zsh-x"})
        self.assertEqual({p["id"] for p in report}, {"bat"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
