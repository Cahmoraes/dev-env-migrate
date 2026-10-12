# Task N: [Task Title] [FR-XXX]

<!-- Default: one FR-XXX per task. Several FR tags on one task when the behaviors were
     coalesced (same file, sequential, one clean review — task-decomposition-granularity.md,
     Case 2) or are so tightly coupled that splitting leaves an intermediate state with no
     test; each FR still gets its own test. -->

**Status:** PENDING

**PRD:** `../prd/prd-<feature-name>.md`

**Spec:** `../specs/<feature-name>-design.md`

**Tier:** standard

<!-- Note: If no PRD exists, use **PRD:** N/A and omit [FR-XXX] tags from the title. -->
<!--
  **Tier:** is the abstract execution model tier for THIS task — `cheap`, `standard`,
  or `capable` (never a concrete model name; the harness maps tier→model at dispatch).
  It tells the executor which model to run the implementer on, so a mechanical task
  is not burned on a powerful model and a hard one is not starved of reasoning.
  Default it from `parse-plan.cjs`'s `suggestedTier` (run it after drafting tasks),
  then override when you know better:
    - cheap    → 1-2 files, complete spec, `Consome:` N/A (mechanical)
    - standard → multi-file integration / moderate judgment (the safe default)
    - capable  → architecture/design, no spec, or high fan-in (many tasks consume it)
  parse-plan.cjs reads this field and lets it OVERRIDE its own computed suggestion.
-->

## Visão Geral

<!--
  2-4 sentences for a human reader: what this task delivers and why. No FR-XXX ids and no
  labels such as "Decisão D2" or "Review Focus": the FR ids live in the title and in
  `## Critérios de Sucesso`, the decisions in the spec, the Review Focus in its test step.
-->

[What this task delivers and why]

## Arquivos

- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py`
- Test: `tests/exact/path/to/test.py`

## Interfaces

<!--
  The implementer of this task reads ONLY this file — never the neighboring task files.
  This block is how it learns the names its neighbors use. `Consome:` names what this task
  takes from earlier tasks — exact signatures, copied, not paraphrased, each followed by its
  producer as `(task-NN)`. Those ids are the plan's edges: the index order is the execution
  order, so each must be an EARLIER task (parse-plan.cjs rejects a forward or dangling one),
  and how many tasks cite a task (its fan-in) is a signal for its tier.
  `Produz:` names what later tasks will call: function names, parameter and return types.
  Write N/A on a line that carries nothing; never leave the line off.
-->

- **Consome:** [assinaturas exatas do que esta task usa de tasks anteriores, cada uma com `(task-NN)`] — ou N/A
- **Produz:** [nomes de função, parâmetros e tipos de retorno que tasks posteriores usarão] — ou N/A

### Skills a invocar

<!--
  MANDATORY — never leave empty, and never list a single skill by reflex.
  List the DOMAIN/CODE skills the implementer applies while writing this task — every
  available one whose scope overlaps, not just the most obvious one. Under-filling is the
  most common defect.

  1. DISCOVER the skills actually available in THIS repo (do NOT list from memory — the set
     of skills drifts over time). Inspect the skills available in the consuming
     repo (surfaced in your platform context), then read
     each skill's `description` to judge fit — match on the description, not the name.
  2. FILTER OUT every `super.*`-prefixed skill. Those are pipeline machinery the execution
     flow already runs automatically as per-task gates (super.verification-before-completion,
     super.test-driven-development, super.systematic-debugging, super.requesting-code-review,
     …). Listing one makes the implementer run it a SECOND time — duplicate work and wasted
     tokens. Keep only the domain/code skills (frontend, backend, refactoring, typing,
     validation, state, security, API clients…).
  3. List EVERY remaining domain skill whose scope overlaps this task. Most coding tasks
     match more than one. If you listed only one, re-check — you are likely missing some.

  Format one skill per line: `skill-name`: when/why it applies to THIS task.
  Replace the example lines below with the real, discovered skills for this task.
-->

- `skill-name`: quando/por que se aplica a esta task
- `skill-name`: quando/por que se aplica a esta task

### Fidelidade Visual

<!--
OPTIONAL — include only for UI/design tasks when a curated mockup or external design
exists (see super.writing-plans, "Visual & Design-Source Integration" section). Delete this
subsection entirely for non-visual tasks.

The mockup is a *norte* (directional), NOT the pixel-final screen. Build the real
fidelity here, ideally against the original design source if one exists.
Tool-agnostic: discover what THIS environment offers; never assume a specific tool.
-->

- **Mockup de referência:** `../specs/mockups/<file>` (baseline de layout/spacing/hierarquia/tokens)
- **Fonte de design original:** <URL da ferramenta de design / export / screenshot> — ou "nenhuma; seguir o mockup curado"
- **Confirmar com o usuário:** existe uma fonte de design original (ex.: URL) para esta tela?
- **Ferramentas de fidelidade visual (descobrir no ambiente):** <skills/MCPs de design-to-code ou teste visual configurados neste repo> — ou "nenhuma; construir manualmente a partir do mockup"
- **Decisões visuais já tomadas (não refazer):** <resumo da Especificação Visual do spec>

## Passos

[Full steps with code blocks, copied from the plan — not references.
Follow the required TDD step pattern — read `../references/required-task-step-pattern.md`.]

- **Step 1: Write the failing test**
...

## Critérios de Sucesso

- [Measurable success criteria]
- [Acceptance criteria linked to FR-XXX if PRD exists]
- [Each spec AC/INV this task makes true, the spec's text verbatim, level token `unit|int|db|unverified`: `- AC-03 [unit]: WHEN … THEN …` · `- INV-02 [db]: <enunciado> · Run: <comando>`]
- [When this task runs the spec's migration: `- **Mecanismo:** <texto da spec>` and `- **Critério de fim:** <texto da spec>`]
- [When this task implements an operation of the spec's `**Contrato:**`: its row, verbatim — `| POST /x/:id | entrada | 201 {…} | CODIGO → 409 |`]
