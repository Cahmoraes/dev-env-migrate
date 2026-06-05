#!/usr/bin/env python3
"""
reconcile.py — engine pura de RECONCILIAÇÃO DE REMOÇÃO (deleção propagada).

O export/import é aditivo: instala o que falta, pula o que já existe. Faltava a
terceira categoria — ÓRFÃO: algo que este tool colocou no destino numa importação
anterior e que SUMIU da origem (config/skill/cli/plugin removidos). Esta engine
detecta esses órfãos comparando dois manifests:

  prev  = recibo do último import aplicado NESTE destino (o que o tool colocou)
  curr  = manifest atual vindo da origem (o que a origem quer agora)

  órfão = id presente em `prev` e ausente em `curr`.

Usar o recibo (e não a realidade do disco) resolve a ambiguidade fatal do
"espelhamento" ingênuo: distingue "removido na origem" de "instalado localmente
pelo usuário" — só entram no plano os itens que o PRÓPRIO tool aplicou antes.

Função pura, sem I/O, O(N) — análoga a dryrun.compute_adaptation_plan. As
DIMENSÕES (quais categorias comparar, como extrair o id, qual ação aplicar) são
DADO: vêm do bloco `removal_policy.dimensions` dos catálogos. Adicionar categoria
= editar JSON, não este arquivo.
"""

from __future__ import annotations


def _navigate(manifest: dict, path: str):
    """Desce por um caminho pontilhado ('a.b.c') no manifest. None se não existir."""
    node = manifest
    for part in path.split("."):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node


def extract_ids(manifest: dict, dim: dict) -> set:
    """Extrai o conjunto de ids de uma dimensão, conforme seu `kind`.

    kinds suportados:
      list_dict    — lista de objetos; id = item[dim['id']]   (cli_tools, plugins…)
      list_scalar  — lista de strings; id = a própria string  (dotfiles, skills…)
      single_dict  — objeto único ou None; id = obj[dim['id']] (theme)
      dict_keys    — dict {chave: valor}; ids = as chaves       (security_flags)
    """
    node = _navigate(manifest, dim["path"])
    if node is None:
        return set()
    kind = dim["kind"]
    if kind == "list_dict":
        key = dim["id"]
        return {it[key] for it in node if isinstance(it, dict) and key in it}
    if kind == "list_scalar":
        return {x for x in node if isinstance(x, str)}
    if kind == "single_dict":
        key = dim.get("id")
        return {node[key]} if isinstance(node, dict) and key in node else set()
    if kind == "dict_keys":
        return set(node.keys()) if isinstance(node, dict) else set()
    return set()


def compute_removal_plan(prev: dict | None, curr: dict, dimensions: list) -> list:
    """Plano de remoção: ids presentes no recibo anterior e ausentes no manifest atual.

    Função PURA. Retorna lista de dicts ordenada de forma estável (por dimensão,
    depois por id) — cada item: {dimension, label, action, id}.

    `prev=None` (primeiro import, sem recibo) ⇒ plano vazio: nada foi aplicado
    ainda, logo nada a remover. Backward-compatible: dimensão ausente no recibo
    antigo vira conjunto vazio ⇒ não gera falso órfão.
    """
    if prev is None:
        return []
    plan = []
    for dim in dimensions:
        orphans = extract_ids(prev, dim) - extract_ids(curr, dim)
        for orphan in sorted(orphans):
            plan.append({
                "dimension": dim["path"],
                "label": dim["label"],
                "action": dim["action"],
                "id": orphan,
            })
    return plan


def split_by_action(plan: list) -> tuple[list, list]:
    """Separa o plano em (prompt_remove, report_only) — o destino age diferente:
    prompt_remove = remover com confirmação+backup; report_only = só avisar."""
    prompt = [p for p in plan if p["action"] == "prompt_remove"]
    report = [p for p in plan if p["action"] == "report_only"]
    return prompt, report
