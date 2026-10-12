# Tarefas: [Feature Name]

**Spec:** `../specs/<feature-name>-design.md`

**PRD:** `../prd/prd-<feature-name>.md`

---

<!--
  The index is a tracker with a fixed shape: the header above, then exactly the three
  sections below, in this order — nothing else. No verification-command inventory (the
  executor resolves the project's own scripts), no justification of a validator warning, no
  note to the executor: none of it has a reader. validate-tasks.cjs fails the plan on an
  unknown heading or on prose outside a bullet. A warning is answered by changing the plan,
  never by writing the answer here. The test runner goes in the task-writer briefing, never
  here; the FR ids a task implements go in its task file's title, never on its line below.
-->

## Tarefas

- [ ] 1. [Task Title] → `task-01.md`
- [ ] 2. [Task Title] → `task-02.md`
- [ ] 3. [Task Title] → `task-03.md`

## Restrições Globais

<!--
  The spec's project-wide requirements — version floors, dependency limits, naming and copy
  rules, platform requirements, exact values and formats — one line each, copied VERBATIM from
  the spec (never paraphrased: the reviewer checks the exact value). Every task's requirements
  implicitly include this section; it is handed to every reviewer as its attention lens.
  Nothing task-specific, and nothing from the repo's instructions file (the final gate, lint or
  typecheck, a generation command): the task files and the final stage carry those.
  Keep the heading with no lines when the spec fixes none.
-->

- Node ≥ 20, sem dependências de runtime (spec, "Decisões")
- Saída da CLI: `palavra<TAB>n`, uma por linha, ordenada por n desc e empate alfabético (spec §3)

## Foco de Revisão

<!--
  The spec is a vision document: it says what the software must do, not everything it will
  meet, and its silence on an input is not permission for that input to break the program.
  Write here, ONCE, with the spec in front of you, the FIVE input classes or failure modes the
  spec implies but no task's tests exercise that are most likely to bite a person using this
  software — most likely first, one line each: the input or condition, the behavior a
  reasonable person would expect, and the task that owns the code. Then pin each line with a
  test step in that task's `## Passos` (the test step's title, `Review Focus: <item>`, above the test that exercises it). Five
  is a ceiling, not a quota: an empty section means you checked and found none, never that
  you skipped the check. This list is handed verbatim to the final reviewer.
-->

- Arquivo de entrada ilegível ou binário → mensagem de erro e saída não-zero, nunca traceback → `task-02`
- Entrada vazia → resultado vazio explícito, sem exceção → `task-03`
