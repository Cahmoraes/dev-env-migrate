# Benchmark — spec-review end-to-end atravessando 4 complexidades (branch gilling)

Objetivo: a **alta qualidade da primeira passada** (brainstorming/spec + writing-plans/tasks desta
branch) faz a `super.reviewing-specs` **reportar cada vez menos** — confirmar em vez de corrigir?
Guarda de honestidade: um baseline surface por cenário prova que a review DISPARA quando a qualidade
é baixa (senão "poucos achados" é infalsificável).

## Desenho

- **4 cenários, 1 por faixa** da tabela de `decision-tree-interviewing.md`: feature-existente (cursor
  pagination), greenfield (presence service), migração (webhook sync→async RabbitMQ), armadilha
  (botão "exporta CSV" com forks ptBR/PII/streaming ocultos).
- **2 configs/cenário**, autor `sonnet` uniforme (isola a variável = qualidade do artefato):
  `enhanced` lê as referências reais das skills; `baseline` é surface ("engenheiro ocupado").
- **Revisor `capable` (opus) independente e cego** por cenário: lentes sem gabarito → findings por
  severidade; depois closure-rate vs gabarito (7 forks/cenário), A/B randomizado.
- **Fase determinística** por cenário×config: `resolve-review-targets` → `build-review-dispatch
  --capable-model` → `validate-dispatch` (prova de dispatch capable) + `validate-tasks`.

## Prova de dispatch capable (requisito)

Em **8/8** artefatos reais: `build-review-dispatch` carimba **4 lentes, todas `tier=capable` + modelo
explícito**; `validate-dispatch` retorna `valid:true`, 0 drift. Lens 3 (spec↔tasks) só aparece com
tasks — presente nos 8. Invariante comprovado por-artefato, não só em teste unitário.

## Resultado

| # | Complexidade | Config | Closure | Findings | high | med | low | tasksValid | sharedRes gate |
|---|---|---|---|---|---|---|---|---|---|
| 1 | feature-existente | **enhanced** | **7/7** | **1** | 0 | 0 | 1 | true | ok |
| 1 | feature-existente | baseline | 3/7 | 7 | 2 | 4 | 1 | false | ok |
| 2 | greenfield | **enhanced** | **7/7** | **2** | 0 | 0 | 2 | true | ok |
| 2 | greenfield | baseline | 1/7 | 6 | 1 | 2 | 3 | false | ok |
| 3 | migração | **enhanced** | **7/7** | **0** | 0 | 0 | 0 | true | ok |
| 3 | migração | baseline | 1/7 | 8 | 1 | 4 | 3 | false | ok |
| 4 | armadilha | **enhanced** | **7/7** | **6** | 1 | 2 | 5 | true | ok |
| 4 | armadilha | baseline | 1/7 | 9 | 1 | 4 | 4 | false | ok |

**Agregado:** findings baseline **30** vs enhanced **9** (−70%); severidade alta **5** vs **1**
(−80%); closure enhanced **7/7 em todas**, baseline 1/7–3/7. Dispatch capable ✓ nos 4.

## Leitura honesta

- **Vale em severidade e closure, nas 4 complexidades.** A review passa de **corretiva** (forks
  abertos, HIGH bloqueantes) para **confirmatória + polimento**. Em migração (S3) o enhanced fechou
  7/7 e a review voltou **literalmente vazia** ("sem mudanças necessárias" honesto, 0 manufatura).
- **Qualidade alta NÃO garante review zero — e isso é bom.** No enhanced ainda achou: 1 low real em
  S1 (`CREATE INDEX` sem `CONCURRENTLY` trava escritas no deploy) e, em S4, **6 findings de nível de
  IMPLEMENTAÇÃO** via Lens 3 (relações não hidratadas; timezone D6 fechado na spec mas não wired entre
  task-02/05; wiring de módulo/DI omitido). **A spec fechou os forks; as tasks reabriram decisões
  fechadas.** Argumento forte para MANTER a review — e origem do espelho shift-left #4d (check
  task→spec de reabertura).
- **Gate determinístico — fronteira revelada.** O baseline S3 tem durable-clash por **omissão**:
  `task-02 assertQueue(Q,{durable:true})` vs `task-04 assertQueue(Q)` (default `durable:false` →
  PRECONDITION_FAILED). O gate v1 ficou `ok` (só compara flags literais presentes); **a review capable
  Lens 3 pegou como Critical** — design em camadas: script pega divergência literal, review pega
  omissão semântica.
- **Honestidade preservada nos dois sentidos.** Ninguém manufaturou achado na spec sã; o revisor de
  S2/S4 recusou flagar ausência de DLQ/fila durável para soft-state (over-build). Lens 2 (spec↔code)
  ficou não-verificável em todos (sem codebase real) — limitação simétrica auto-reportada.

Fôlego dos artefatos: specs enhanced 16.8–29.8 KB / 5–9 tasks; baseline 2.9–4.2 KB / 3–5 tasks
(`tasksValid:false` nos 4 por falta de headers de rastreabilidade).

## Ações tomadas a partir dos achados

**1. Gate de recurso compartilhado v2 — IMPLEMENTADO** (`validate-tasks.cjs`
`validateSharedResourceConsistency`), warning-level e FP-guarded:
- **Nome bareword:** `RESOURCE_DECL_RE` casa nome como string OU const (`assertQueue(WEBHOOK_QUEUE,
  {...})`) — o baseline S3 escapava por usar const.
- **Divergência por omissão:** flag de infra (allowlist `durable/exclusive/autoDelete/persistent/
  unique/nullable/primary/cascade`) com valor numa task e o MESMO recurso re-declarado *bare* noutra
  → warning. Guardas de FP: só a allowlist; só com irmão declarado; keyed por fn+nome. +5 testes.
  **Re-rodando o sim, o baseline S3 agora acusa `conflicts:1` (durable)** — o clash que o v1 deixava
  passar é pego deterministicamente.

**2. Espelho task→spec #4d (prosa) — IMPLEMENTADO + validado com eval do skill-creator.** Item
"Spec decision honored — no silent reopening" no `self-review-checklist.md`, com as três formas
(mecanismo divergente, flag caída pro default, shape sub-hidratado). A/B prose-isolated (4 self-reviews
cegos sonnet):
- **Sem lift de captura (teto de self-play, 3ª medição):** na fixture defeituosa (S4) baseline E
  enhanced pegaram a reabertura D6; o 4d só melhora **ATRIBUIÇÃO + SEVERIDADE** (ranqueou #1 HIGH vs
  enterrado #2 no baseline).
- **Honestidade preservada:** sem manufatura, com lista "Clean on" explícita. Garantia author-blind =
  o gate determinístico, não a prosa. Ver [[shift-left-prose-hits-self-play-ceiling]].

## Pendências de medição

- Lift da prosa #4d em **tiers baratos** (executor foi sonnet; o teto mascara em capable/sonnet).
- **Gate v2:** monitorar falso-positivo em planos reais (allowlist conservadora, mas bareword+omissão
  pode pegar re-asserts idempotentes legítimos — warning-level mitiga).
- Interlocutor/autor ainda subagente não-interativo (mesma fronteira do harness de brainstorming).
