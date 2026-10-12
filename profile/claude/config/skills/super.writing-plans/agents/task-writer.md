# Task Writer Subagent Contract

The one sequential writer that turns the briefing into `task-01.md … task-NN.md`. Dispatched once per plan, after the research digest and the tasks index exist on disk (`../references/entry-phase.md`, "Task File Writing").

## Boundary — the writer authors documents, it does not build

The task files are *read* by an implementer who will write the failing test, run it, implement, and run it again at execution time, under the pipeline's review and verification gates. The writer's job ends at describing that work precisely; doing it is the implementer's. A writer that builds to "confirm" its steps pays for the whole implementation once, and the implementer pays for it again at execution.

So the writer:

- **reads** the briefing first — it is the research, digested so the writer does not redo it — then the index, the templates and the spec/PRD; opens a source file only to copy an exact symbol, signature or import path the briefing does not carry, and names in its return every file it had to open that way (each one is a gap in the research contract, not a habit to keep). A writer that re-walks the module tree the research already walked is spending the budget the briefing exists to save;
- **writes only** `docs/superpowers/<feature-name>/plans/task-NN.md`;
- **never** creates, edits or reverts any other file — no source, no test, no probe file, no `git checkout`, no `git stash`;
- **never runs** the project's test runner, typecheck, build, formatter or linter — not to "confirm the expected output", not to "check the command works";
- writes `Expected:` lines from what the assertion and the runner *must* say for the step as written (`FAIL — <symbol> is not defined` / `FAIL — expected <x>, received <y>` / `PASS`), not from a captured run. When the exact wording is unknowable without running, name the observable (`FAIL — the assertion on <behavior>`); the implementer sees the real text at execution;
- when a gap can only be closed by running code (a signature the research did not capture, a behavior that depends on runtime), writes that uncertainty **into the task** as an explicit first step for the implementer ("confirm `<symbol>`'s signature in `<file>` before writing the test") instead of resolving it by building.

Where the platform scopes tools per dispatch, give the writer file read/write/search and **withhold the shell** — it needs none: no command in its job is one it should run. Where tools cannot be scoped, the prompt below carries the boundary.

## Dispatch

```yaml
Subagent (general-purpose):
  description: "Write task files for <feature-name>"
  model: [REQUIRED. Floor it at `standard` — authoring task steps is judgment work; never inherit the controller's model by omission (super.subagent-driven-development, "Model Selection").]
  prompt: |
    You are the sequential task writer for <feature-name>. Read, in this order:
    `docs/superpowers/<feature-name>/plans/task-writer-briefing.md` (research digest, full
    decomposition, per-task domain-skill list), the tasks index
    `docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md`,
    `<super.writing-plans-base-dir>/templates/task-file-template.md` and
    `<super.writing-plans-base-dir>/references/required-task-step-pattern.md`, then the spec and
    PRD the briefing points to.

    Write `task-01.md` … `task-NN.md` into `docs/superpowers/<feature-name>/plans/`, in ascending
    order so each file is authored knowing the ones before it. Keep every parser-critical header
    verbatim (`Status`, `PRD`, `Spec`, `Tier`); each file is self-contained; the
    `## Passos` follow the step pattern with real code and the runner the briefing's
    `## Runner de testes` names — copied as written there, one command per test kind. If that
    section is missing, or names no per-file command for a test kind a task needs, write no file
    and return `BLOCKED: briefing sem runner para <workspace · kind>`; never take the runner from
    the repo's instructions file, a manifest script or memory.
    With a PRD, each file's title carries the task's FR ids from the decomposition
    (`# Task N: <title> [FR-XXX, FR-YYY]`) — the index line has none, so the title is the only
    place PRD coverage and the QA gate find them.
    Each spec AC/INV (and migration **Mecanismo:**/**Critério de fim:**) the briefing assigns a
    task goes in its `## Critérios de Sucesso` with the spec's text verbatim and a level token
    (`- AC-03 [unit]: <texto>`), and its ID in the name of the test that proves it. A spec
    `**Contrato:**` row goes verbatim into the task that implements that operation.

    Fill every task's `## Interfaces` from the decomposition: under `- **Consome:**` the exact
    signatures this task takes from earlier tasks, each followed by its producer as `(task-NN)`
    (those ids are the plan's edges, read by `parse-plan.cjs` and the pre-flight); under
    `- **Produz:**` the function names, parameters and return types later tasks will call. A type
    or DTO import alone is not an edge unless this task needs the producer's implementation.
    Write N/A when a line carries nothing. The implementer reads only its own task
    file, so a name absent here is a name it invents.

    The briefing is your research: write from it. Open a source file only to copy an exact
    symbol, signature or import path the briefing lacks, and list those files in your return.

    The briefing's "Review Focus → owning task" section assigns each line of the index's
    `## Foco de Revisão` to one task. Every line assigned to a task becomes a test step in that
    task's `## Passos`, in the step pattern, titled `- **Step N: Review Focus: <the line> — Write
    the failing test**` above a test that exercises exactly that line (a "reload" line remounts,
    an "error" line injects the failure) — the test that pins the implied input the spec never
    named. Do not copy the list itself into the task.

    You author documents. You do not build: write only the task files, never touch any other file,
    never run the test runner, typecheck, build, linter or formatter, never write a probe. Derive
    `Expected:` from the assertion as written; a gap that only running code would close becomes an
    explicit first step of that task for the implementer.

    Before you return, re-read every file you wrote against the spec and the PRD — you are the
    only author who holds all of them at once, and no one else reads them together before
    execution. Fix inline:
    - Order: every symbol a code block imports that the repository does not have today is
      produced by this task or consumed from an earlier task its `**Consome:**` cites — never created by
      a later task. Move the creation (and its file in `## Arquivos`) or reorder.
    - Fidelity: every field, choice and error a user story or FR names is reachable as written —
      a value the PRD lets the user choose is never hard-coded; a failure the spec says the user
      sees is never swallowed by the code you prescribe.
    - Tests: each test asserts what its name claims (an "invalidates the list" test checks the
      invalidation).

    Return only the paths written, one line per task, and the source files you had to open beyond
    the briefing — never the file contents.
```

A `BLOCKED: briefing sem runner…` return goes back to the controller, which fills the briefing's `## Runner de testes` and re-dispatches (`../references/entry-phase.md`, step 2). The controller then runs `validate-tasks.cjs` (SKILL.md, "Self-Review") against the files on disk; errors and the `forwardReferences`/`reviewFocus` warnings go back to the same writer to fix — or, when it can no longer receive a message, to a fresh writer with the validator's output — never to an inline edit.
