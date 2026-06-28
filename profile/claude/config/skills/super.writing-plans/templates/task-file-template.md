# Task N: [Task Title] [FR-XXX, FR-YYY]

**Status:** PENDING
**PRD:** `../prd/prd-<feature-name>.md`
**Spec:** `../specs/<feature-name>-design.md`
**Tier:** standard
**Depends on:** N/A

<!-- Note: If no PRD exists, use **PRD:** N/A and omit [FR-XXX] tags from the title. -->
<!--
  **Tier:** is the abstract execution model tier for THIS task — `cheap`, `standard`,
  or `capable` (never a concrete model name; the harness maps tier→model at dispatch).
  It tells the executor which model to run the implementer on, so a mechanical task
  is not burned on a powerful model and a hard one is not starved of reasoning.
  Default it from `parse-waves.cjs`'s `suggestedTier` (run it after drafting tasks),
  then override when you know better:
    - cheap    → 1-2 files, complete spec, no dependencies (mechanical)
    - standard → multi-file integration / moderate judgment (the safe default)
    - capable  → architecture/design, no spec, or high fan-in (many tasks depend on it)
  parse-waves.cjs reads this field and lets it OVERRIDE its own computed suggestion.
-->

<!--
  **Depends on:** lists the tasks whose output THIS task needs before it can start.
  Format: a comma-separated list of task ids (e.g. `task-01, task-03`) or `N/A` when the
  task touches no files or symbols produced by an earlier task. This field is what lets
  super.parallel-subagent-development decide which tasks may run concurrently in isolated
  worktrees and which must run in order. Be honest: declare a dependency whenever this task
  reads, imports, or extends something an earlier task creates. A missing-but-real dependency
  makes parallel worktrees diverge; a spurious one only costs lost parallelism.
-->

## Visão Geral

[Brief description of what this task accomplishes]

## Arquivos

- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py`
- Test: `tests/exact/path/to/test.py`

### Conformidade com as Skills Padrão

<!--
  MANDATORY — never leave empty, and never list a single skill by reflex.
  List the DOMAIN/CODE skills the implementer applies while writing this task — every
  available one whose scope overlaps, not just the most obvious one. Under-filling is the
  most common defect.

  1. DISCOVER the skills actually available in THIS repo (do NOT list from memory — the set
     of skills drifts over time). Inspect the skill locations configured in the consuming
     repo's `chat.agentSkillsLocations` (and surfaced in your platform context), then read
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
exists (see super.writing-plans § Visual & Design-Source Integration). Delete this
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
