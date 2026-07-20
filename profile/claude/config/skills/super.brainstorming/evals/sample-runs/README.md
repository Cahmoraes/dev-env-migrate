# Sample runs — specs geradas na simulação A/B

Specs de design geradas pela simulação diagnóstica do harness de eval (`../evals.json`), salvas para comparação **antes vs depois** do enriquecimento da entrevista da `super.brainstorming` (persona-especialista ancorada na pesquisa + invariante de fechamento).

## Como ler

Cada cenário tem dois (ou três) arquivos:

| Arquivo | Versão | O que representa |
|---|---|---|
| `as-is.md` | **antiga** | entrevista sem a persona-especialista — decision-tree genérico, perguntas de esclarecimento sólidas mas sem mineração de forks ocultos nem invariante de fechamento |
| `persona.md` | **nova** | entrevista com a persona-especialista ancorada na pesquisa (mineração de forks ocultos + failure modes + fechamento) |
| `persona-v2-new-format.md` | **nova (revisada)** | só em `migracao/` — a persona sob o invariante **final** (fecha toda ponta, sem seção "Questões em Aberto"; o leaf reversível D6 é resolvido com default+gatilho em vez de parqueado) |

`diff as-is.md persona.md` mostra concretamente o que a persona fecha a mais.

## Caveats (leia antes de interpretar)

- **São saídas de simulação, não sessões reais de brainstorming.** Um subagente rodou os dois braços por **self-play** (ele mesmo faz o papel do entrevistador e do usuário-simulado, seguindo o brief de ground-truth em `../files/brief-<cenário>.md`).
- **`as-is.md` é uma reconstrução simulada** do comportamento pré-enriquecimento, não um snapshot da skill antiga real. Serve para contraste direcional, não como prova.
- **1 trial por config.** Sinal direcional, não veredito estatístico. O gate formal (3 trials + custo ≤ +25% tokens) roda no harness real do skill-creator — ver `../../../CLAUDE.md`, seção "Brainstorming/entrevista".
- Os números de fechamento abaixo foram **verificados às cegas** por um segundo subagente independente (re-pontuação sem confiar nos receipts do self-play).

## Placar de fechamento (ground-truth) — verificado

| Cenário | N / ocultos | as-is closure | as-is ocultos | persona closure | persona ocultos |
|---|---|---|---|---|---|
| feature-existente | 5 / 2 | 3/5 | 0/2 | 5/5 | 2/2 |
| greenfield | 6 / 3 | 4/6 | 1/3 | 6/6 | 3/3 |
| migracao | 6 / 2 | 3/6 | 0/2 | 6/6 | 2/2 |
| armadilha | 5 / 4 | 1/5 | 0/4 | 5/5 | 4/4 |
| **Total** | **22 / 11** | **11/22 (50%)** | **1/11 (9%)** | **22/22 (100%)** | **11/11 (100%)** |

O ganho concentra-se exatamente nos forks **ocultos** (decisões que o fraseado do usuário assume away) — o valor do especialista. Baselines confirmados justos (não strawmen): o braço as-is fecha competentemente as decisões não-ocultas.

## `_new-version-only/`

Caminhos exercitados só na versão nova (sem par as-is, pois validam comportamento novo, não comparação):

- `onboarding-wizard-visual/` — caminho **visual** (wizard multi-tela): `design.md` com Especificação Visual + `mockups/` curados (1 por tela). Demonstra os forks de UI ocultos fechados e carregados via `### Fidelidade Visual`.
- `session-timeout-lightweight/` — caminho **lightweight** (mudança trivial): `design.md` curto e proporcional. Demonstra que a persona respeita o *complexity gate* (não faz tree-for-a-twig).
