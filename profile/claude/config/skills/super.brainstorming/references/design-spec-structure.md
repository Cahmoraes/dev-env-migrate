# Design Spec Structure

Read when writing the design doc (checklist step 6). The spec is the architect's record: what is built, the decisions that shape it, and why — enough that `super.writing-plans` never re-asks what the interview settled. Every section maps to a lens of the interview (`grilling.md`); a section whose lens never opened is omitted, not filled with boilerplate. Sources for the enriched sections: *Fundamentals of Software Architecture*, 2nd ed., ch. 4-6, 21-22.

## Skeleton, scaled to what the interview opened

| Section | Included |
|---|---|
| `## Visão Geral` — problem, outcome, who it serves, how success is observed; the corrected understanding note (no separate "entendimento" section) | always |
| `## Escopo` — **Dentro** and **Fora de escopo**, each exclusion with its reason or the feature that owns it; `**Lentes fechadas:** <lente> (<motivo>); …` | always |
| `## Características Arquiteturais` | when the quality-attribute lens opened |
| `## Arquitetura e Fluxo` — the chosen approach, how data and control flow through it; the diagram from `diagram-enrichment.md` when warranted | always — a paragraph when the flow is straightforward |
| `## Componentes` — fields in `logical-components.md`, "Record each component" | always |
| `## Fronteiras e Contratos` — the **Contrato** of every operation the feature adds or changes, integrations, the meaning of every value that crosses a layer | when an operation is added or changed, or a value or call crosses a layer |
| `## Dados e Consistência` — source of truth, the **Modelo** of what is created, transaction boundary, concurrent writes, idempotency, migration of existing data | when state is persisted or changed |
| `## Falhas e Erros` — per failure: how it is detected, what the system does, what the user sees | when there is I/O, an external call or user input |
| `## Rollout e Compatibilidade` — who consumes it today, compatibility window, expand/contract order, flag, how to know it works in production | when a live contract, schema or behavior changes |
| `## Especificação Visual` | when a mockup or external design informed the feature |
| `## Decisões Arquiteturais` | when a decision rejected a real alternative |
| `## Riscos` | when a risk scores 3+ or its mitigation is a task or a human action |
| `## Testes` — the runner and the acceptance criteria | always |

The templates below share one illustrative domain (course certificates): copy their shape, never their content. Scale each section to its content: three lines is a valid section. A section that could be written for any feature ("seguir boas práticas", "tratar erros adequadamente") says nothing — write what this feature decided or drop the section.

**Each fact is written once,** in the section that owns it; any other section cites it (`D2`, `INV-03`, `AC-05`, "ver Rollout") instead of restating it. **Size follows the change:** a feature that persists nothing and changes one operation fits in a page — each always-on section a paragraph, no Decisões Arquiteturais block or local-decisions table for what the user already decided, no Riscos table for low risks nobody acts on. Interview bookkeeping (distance and volatility of a boundary, characteristics not prioritized, risk arithmetic) stays in the interview; the spec keeps the verdicts.

**Header.** Under the title, list each source artifact the spec builds on (research, curated mockup) as its own bullet, never joined on one line; omit the list when there is none:

```markdown
# Emissão de Certificados: Design

- **Pesquisa base:** `../research/research-emissao-certificados.md`
- **Norte visual:** `mockups/emissao-certificados-visual.md`
```

## Section: Características Arquiteturais

Output of `architecture-characteristics.md`. Right after Escopo — it justifies every structural decision that follows.

```markdown
## Características Arquiteturais

**Priorizadas (top 3):**

| Característica | Preocupação de domínio | Critério mensurável | Escopo |
|---|---|---|---|
| Disponibilidade (tolerância a falha) | Concluir o curso é o momento central do aluno; o gerador de PDF tem timeouts | Erro ou timeout do gerador nunca falha a conclusão; certificado disponível em até 10 min após o gerador voltar | emissão |
| Integridade dos dados | Certificado com carga horária errada invalida a comprovação | Certificado reflete nome e carga horária do momento da conclusão; reemitir devolve o mesmo código | emissão |
| Performance | "Meus certificados" concentra acessos no fim do semestre | p95 < 400 ms com 300 req/s | consulta |
```

## Section: Fronteiras e Contratos

Three parts; any may be empty.

**Contrato** — one row per operation the feature adds or changes (HTTP route, event, message, command another module calls): what goes in, what comes out with its success status, and every domain error mapped to its transport status. For a changed operation, only the delta (`+ prazoEstimadoDias: int | null`). Fields carry type and unit when not obvious (centavos, dias úteis, ISO-8601 em UTC). The error codes are the ones Falhas e Erros names. An operation the feature only calls or reads unchanged has no row; with none added or changed: `**Contrato:** nenhuma operação nova ou alterada (<motivo>)`.

```markdown
**Contrato:**

| Operação | Entrada | Saída | Erros |
|---|---|---|---|
| `POST /matriculas/:id/certificado` | — | `202 {pedidoId, status: "PENDENTE"}` | `MATRICULA_NAO_CONCLUIDA` → 409; `MATRICULA_INEXISTENTE` → 404 |
| `GET /alunos/:id/certificados` | — | `200 [{codigo, curso, cargaHoras: int, emitidoEm: ISO-8601 UTC}]`, mais recente primeiro | nenhum novo |
| evento `CertificadoEmitido` | — | `{codigo, alunoId, cursoId, emitidoEm}` | — |
```

**Integrações** — one row per boundary the design creates or changes; the coupling analysis (`logical-components.md`, "Boundaries and coupling") decides the row, and only its verdict is written:

```markdown
| Fronteira (upstream → downstream) | O que atravessa |
|---|---|
| Cursos → Emissão | evento `CursoConcluido` (alunoId, cursoId, concluidoEm) |
| Emissão → gerador de PDF | contrato do fornecedor, atrás de um adaptador nosso (troca de fornecedor prevista) |
```

**Significados** — every value that crosses a layer, with one meaning: a date is a calendar day or an instant (and in whose timezone it is shown), money has its unit and precision, a status change names its target state or is declared a toggle, an identifier says who generates it, a failure names what the user sees. The gate's `Boundaries:` line is read from here.


## Section: Falhas e Erros

```markdown
| Falha | Detecção | Comportamento | O que o usuário vê | AC |
|---|---|---|---|---|
| Gerador de PDF fora ou lento | timeout de 10 s | pedido de emissão fica pendente; retentativa com backoff por até 24 h | "Certificado em processamento" | AC-02 |
| Mesma conclusão registrada duas vezes | código (aluno, curso) já emitido | devolve o certificado existente | o mesmo certificado | AC-03 |
```

Prefer defining an error out of existence (an idempotent operation, a clamped value, an empty result) over propagating it (Ousterhout ch. 10); an error that escapes a component says why the caller handles it better.

## Section: Dados e Consistência

A rule that holds for every persisted record is a row of one invariant table (no persisted state, no table); prose cites its ID. Category `limit`, `unique`, `preserve`, `idempotent`, `transition` or `roundtrip`; guarantor `app-pure`, `app`, `app+lock` (lock or transaction) or `db` (constraint, index, FK); a localized label may follow the token. Rede: the second layer, or `-`.

```markdown
| ID | Enunciado | Categoria | Garantidor | Rede |
|---|---|---|---|---|
| INV-01 | Uma matrícula concluída tem no máximo um certificado | unique | db | - |
| INV-02 | Reemitir devolve o mesmo código | idempotent | app+lock | INV-01 |

**Modelo:** `certificados` (tabela nova)

| Coluna | Tipo | Nulo | Restrição |
|---|---|---|---|
| `matricula_id` | uuid | não | UNIQUE · INV-01 |
| `codigo` | varchar(12) | não | gerado pela aplicação |
| `status` | `PENDENTE` \| `EMITIDO` | não | default `PENDENTE` |
| `emitido_em` | timestamptz | sim | preenchido ao emitir |

**Mecanismo:** lotes de 1.000 por `id > último`, `INSERT … ON CONFLICT DO NOTHING`, uma transação por lote.
**Volume e orçamento:** 80 mil matrículas (fato do usuário ("cerca de 80 mil")); até 20 min; sem lock de tabela.
**Critério de fim:** concluídas sem certificado (`SELECT count(*) …`) = 0.
**Legado que viola:** certificado manual duplicado vai para `certificados_descartados`.
```

**Modelo:** every table the feature creates, and only the new or changed columns of an existing one: type, nullability, and the constraint, with the INV it guarantees — every `db` invariant is cited by the row of its constraint. The migration labels only when existing data moves (order and window: Rollout). IDs are never renumbered or reused.

## Section: Especificação Visual

**Optional — include only when a visual companion mockup, screenshot, or external design tool informed the feature.** Skip entirely for non-visual work (backend, data, config). Place near "Componentes" — it grounds component structure in the screen.

Durable record of visual decisions. Companion mockups are throwaway; this prose keeps the *design source* and *decisions already made* in the spec, so `super.writing-plans` carries them into UI tasks instead of re-deriving (and re-litigating) layout.

```markdown
## Especificação Visual

**Artefato curado:** `mockups/checkout-visual.md` (prosa + core HTML/JSX, relativo a este spec)

**Fonte de design original:** <URL da ferramenta de design / arquivo exportado / screenshot>
_— ou_ "Nenhuma; layout definido apenas via mockup do companion."

**Decisões visuais (norte, não pixel-final):**
- Layout: duas colunas — resumo fixo à direita, formulário à esquerda.
- Hierarquia: total do pedido é o maior elemento; CTA primário abaixo do resumo.
- Spacing/escala: grid de 8px; cards com radius do tema (`--radius-md`).
- Tokens: cor primária `--brand-500`, tipografia do design system.

**Fidelidade:** o mockup é um *norte*. A fidelidade final é construída na task de implementação, de preferência contra a fonte de design original se existir, usando ferramentas de fidelidade visual do ambiente (descobertas no plano — não acopladas a nenhuma ferramenta específica).
```

Two anchors prevent rework. **Fonte de design original** records whether a higher-fidelity source exists (design-tool URL, export, screenshot) so implementation can reach for it — tool-agnostic: name what this project used or state none exists. **Decisões visuais** captures layout, hierarchy, spacing, and applied tokens as prose, so visual choices don't die with the throwaway mockup. The heavier core (detailed prose + HTML/JSX) lives in the curated artifact under `mockups/`; this section stays concise and links to it.

## Section: Decisões Arquiteturais

An architecturally significant decision (triage in `tradeoff-analysis.md`) gets a block; leaves go in one table.

```markdown
## Decisões Arquiteturais

### D1. Vamos emitir o certificado de forma assíncrona, a partir de um pedido gravado na mesma transação da conclusão do curso

- **Contexto:** o gerador de PDF tem timeouts e a conclusão do curso não pode falhar por causa dele. Alternativas: gerar o PDF dentro da conclusão (rejeitada: acopla a disponibilidade da conclusão à do fornecedor); disparar a geração em memória após o commit (rejeitada: perde a emissão se o processo cair entre o commit e a chamada).
- **Decisão:** vamos gravar o pedido de emissão junto com a conclusão; um job gera o PDF e marca o pedido como emitido.
- **Justificativa:** técnica — atende Disponibilidade e Integridade priorizadas; de negócio — nenhum aluno fica sem certificado por instabilidade do fornecedor.
- **Consequências:** ganha isolamento de falhas e retentativa; aceita alguns minutos entre a conclusão e o certificado, e uma tabela e um job a operar.
- **Conformidade:** teste de integração derruba o gerador e verifica que a conclusão é gravada; regra de arquitetura impede o módulo de cursos de importar o adaptador do gerador.

**Decisões locais (reversíveis):**

| Decisão | Padrão escolhido | Gatilho para rever |
|---|---|---|
| Intervalo do job | 1 min | fila > 1.000 pendentes |
```

The decision is written in the affirmative ("vamos…") with its rejected alternatives in Contexto; the flow itself is described once, in Arquitetura e Fluxo, and the block cites it. Local decisions are the leaves the interview raised, never a list of defaults nobody questioned; a decision the user stated is a line of Escopo or Visão Geral, not a block. **Justificativa de negócio** stops the decision from being relitigated (cost, time to market, user satisfaction, strategic positioning — if none applies, question whether the decision should exist). **Consequências** records what the decision gives up, so a maintainer won't "fix" it back into the problem it avoided. **Conformidade** says how anyone can check the code honors the decision; `super.writing-plans` turns it into a test or a review item. Decisions here are feature-scoped; suggest the `to-adr` skill when one deserves organization-wide registration.

## Section: Riscos

Before Testes — high risks should generate test scenarios or tasks.

```markdown
## Riscos

| Risco | Score | Mitigação |
|---|---|---|
| Ninguém do time operou a fila de retentativa em produção | 9 🔴 | Alerta de fila parada (AC-02); spike de 1 dia (ação humana · tech lead · antes da task do job) |
| Fornecedor muda o contrato do gerador | 2 🟢 | Teste de contrato no adaptador |
```

- **Score = impacto × probabilidade** (each 1-3), written as the product: 1-2 low (🟢), 3-4 medium (🟡), 6-9 high (🔴). A risk whose mitigation another section already holds (Rollout, Dados) cites it in one line instead of restating it.
- Assess impact first; when unsure about probability, use 3.
- **Unknown or unproven technology is automatically 9** — the team not knowing it is the risk. Mitigation: spike, training, or substitution.
- Derive risks from the prioritized characteristics: for each, "o que pode derrubar isto?". Confirm the SLA of an external dependency before trusting it.
- Every 🔴 risk's mitigation cites the `AC-NN`/`INV-NN` that tests it, ends with `(ação humana · <dono> · <prazo>)`, or says `aceito pelo usuário`. A production signal ("how we know it works") becomes an AC or goes out of scope.

## Section: Testes

The runner, then acceptance criteria observable from outside the component (two make a valid section). Origin: `D<n>`, `Falhas: <falha>`, `fato do usuário (<o que o usuário disse, em poucas palavras>)` or `corp ref <id>` (plus the consumer's ID, e.g. `CA001`); never `FR-`/`US-`. An INV guaranteed by `db` or `app+lock`, and a migration, are tested against a real database (the repo's test database, or one this spec adds) or by a query run by hand; only then the `**Banco de teste:**` line says which, citing the repo file that provides it or the user's answer as `fato do usuário (<resposta>)`. `**Níveis:**` says which criteria run as unit tests and which need the real database.

```markdown
**Runner:** `npm test`.
**Banco de teste:** Postgres do `docker-compose.test.yml`, URL em `TEST_DATABASE_URL`.
**Níveis:** unitário AC-02; banco real AC-01, AC-03, INV-01, INV-02.

- AC-01 · WHEN o curso é concluído THEN um pedido de emissão é gravado (origem: D1)
- AC-02 · WHEN o gerador fica fora THEN o aluno vê "Certificado em processamento" (origem: Falhas: Gerador de PDF fora ou lento)
- AC-03 · WHEN a conclusão chega duas vezes THEN sai o mesmo certificado (origem: fato do usuário ("reenvio do curso acontece"))
```

## Self-review additions

When running the spec self-review (checklist step 7), also verify:

1. Every prioritized characteristic traces to a domain concern and has a measurable criterion — performance with load and percentile, availability as behavior under a named failure.
2. Every architecturally significant decision names the alternatives it rejected, its Consequências (a decision listing only gains is incomplete) and its Conformidade.
3. Every 🔴 risk has a mitigation the plan can carry or an explicit user acceptance.
4. Every component has a non-trivial **Oculta**; no two components own the same rule, format or data; no logical component is named entity + Manager/Supervisor/Controller/Handler/Engine/Processor (`logical-components.md`).
5. If a visual companion or external design informed the feature, the spec has an Especificação Visual section recording the design source and visual decisions (not an architecture-only description), and the curated artifact under `specs/mockups/` exists and is linked.
6. Every hard decision the interview surfaced is closed: a structural one resolved with its trade-off, a reversible leaf with its default and revisit trigger, one blocked on external input as a 🔴 risk naming the task that unblocks it. A decision raised in the interview and absent from the spec, or left vague, is the leak the close-out rule in `grilling.md` forbids.
7. **The Testes section names the test runner, and the architecture names the framework the stack runs on** — or the manifest at `projectProfile.manifest` already declares them. `super.writing-plans` writes every task's `Run:` line from these sources and asks when all are silent; a greenfield spec that leaves them unnamed turns planning into a question that was the interview's to ask.
8. Every external call and every state change has its failure behavior in Falhas e Erros — what happens on timeout, on error, on a repeated request — or a line ruling it out with the reason.
9. `check-spec.cjs` (step 7) is `valid: true`, every warning fixed or judged.
10. Every operation the feature adds or changes has its **Contrato** row — payload, success status, each error mapped to its status — and every new table its **Modelo**: an implementer who would have to choose a status code, a field name or a column type is reading an unfinished spec.
11. A migration's **Mecanismo:** names the unit of work (per batch, per row) and its **Critério de fim:** is a query over an explicit universe: the plan copies both verbatim.
