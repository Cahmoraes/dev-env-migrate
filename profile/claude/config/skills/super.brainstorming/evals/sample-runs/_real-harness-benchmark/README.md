# Real skill-creator harness — benchmark

Este diretório é o resultado do **harness real do skill-creator** (não self-play), nível "executor+grader separados". Gerado com os scripts oficiais do skill-creator (`aggregate_benchmark.py` + `eval-viewer/generate_review.py`).

## O que torna isto "real" (vs as simulações self-play anteriores)

1. **Executor lê os ARQUIVOS reais da skill.** O braço `with_skill` seguiu `SKILL.md` + `decision-tree-interviewing.md` (com a persona) + `design-spec-structure.md` do repo; o braço `without_skill` seguiu uma cópia **baseline** com as seções de enriquecimento removidas (pré-persona) — não uma paráfrase minha.
2. **Grader SEPARADO do executor.** Um subagente diferente pontuou cada spec contra as `expectations` do `evals.json`, sem viés de auto-pontuação (a maior fraqueza do self-play).
3. **Scripts oficiais.** `benchmark.json`/`benchmark.md` produzidos por `aggregate_benchmark.py`; `eval-viewer.html` por `generate_review.py --static`.

## Resultado (4 cenários — feature-existente id:1, greenfield id:2, migração id:3, armadilha id:4 — 3 runs/config = 24 runs)

| Métrica | With Skill (persona) | Without Skill (baseline) | Delta |
|---|---|---|---|
| **Pass Rate** | **100% ± 0%** | **32% ± 16%** | **+0.68** |
| Tokens (executor/run) | 31804 ± 2010 | 25897 ± 2371 | **+5907 (+22.8%)** |
| Tempo | 77.1s ± 7.6s | 44.6s ± 4.6s | +32.4s |

Por cenário (persona vs baseline pass_rate): feature-existente **1.00 vs 0.43** · greenfield **1.00 vs 0.24** · migração **1.00 vs 0.48** · armadilha **1.00 vs 0.14**. A persona bate 1.00 em todos; o baseline varia 0.14–0.48 (média 0.32) e é onde a variância vive.

## Leitura honesta do custo

O self-play media +12.7% (armadilha). No harness real, o slice de 2 cenários (armadilha+greenfield) deu +25.9%; **os 4 cenários dão +22.8%** — a armadilha (+39%) era outlier, e a média dos 4 cai para dentro até do teto original de +25%. Duas razões pro custo extra:
1. O executor `with_skill` lê os arquivos enriquecidos da skill (persona + close-every-end) — custo **fixo de leitura** que não escala com a entrevista.
2. A persona faz entrevista muito mais completa (fecha 100% vs 32%) — custo **genuíno** da funcionalidade.

As faixas de tokens **não se sobrepõem** (persona [29.8K–33.8K] vs baseline [23.5K–28.3K]), então o aumento é real. **Decisão tomada: guardrail = +30%** — a medição real (+22.8% nos 4; +25.9% no pior slice) cabe com folga, e ir de **32%→100%** de fechamento por ~+23% de tokens é valor claramente favorável. Aparar a prosa da persona (reduzir o overhead fixo de leitura) fica como otimização futura, não bloqueante.

## Ainda pendente

- **Interlocutor ainda simulado** (self-play dentro do executor; grader é que foi separado). O nível 2 (2 agentes turn-based) e sessões com humano real seguem não-feitos.
- Modelo único; tiers baratos / copilot-codex-gemini não testados.

## Arquivos

- `eval-viewer.html` — abra no navegador; aba "Benchmark" (quantitativo) + aba "Outputs" (clique por spec). Autocontido.
- `benchmark.json` / `benchmark.md` — saída dos scripts oficiais.
- `specs/<cenário>/<config>/run-N.md` — as 12 specs geradas (compare with_skill vs without_skill).
