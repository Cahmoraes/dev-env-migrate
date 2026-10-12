# Required Task Step Pattern

Every `## Passos` section in a task file MUST follow this TDD pattern exactly. Do not summarize or abbreviate — copy the structure below and fill it with real code, real commands, and the expected outputs those steps produce. The pattern is *executed* by the implementer at execution time; the writer describes it (`../agents/task-writer.md`).

**Level by guarantor.** A criterion's token says where its test runs: `[unit]` for pure logic, `[int]` for application code with I/O or a lock (two real transactions for a lock), `[db]` for what a constraint, index or FK guarantees (provoke the violation against a real database), `[unverified]` with the reason and `conferência: <consulta>` when the spec decided no test database. A fake may stand in for storage, never for a constraint, lock or effect the spec gives the database; a test of SQL text is a form check and covers no INV; a suite that skips itself on a missing env var is `[unverified]`, not green. A migration runs `up`, `down` and the end query in a throwaway database the step creates by command, never the development one; the suite of the previous release against the new schema belongs to the final gate, not to a task.

## Pattern

The `## Passos` section contains **only the steps below**. Do **not** re-emit the `# Task N`
title or the `## Arquivos` list here — the task-file template already provides both, and
repeating them produces a duplicate heading plus a second, differently-formatted file list.

````markdown
- **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- **Step 5: Commit** *(only when `workflow.auto_commit` is true — the implementer's prompt
  says so; otherwise skip this step and report the files instead.)*

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

The step list ends here. **Do not add a step that runs the whole suite, the typecheck/compile
step, the build, or the formatter/linter in fix mode** — see "Steps you must never write" below.

## Property tasks (an INV guaranteed by `app-pure`)

A spec invariant on pure logic (a decision core `decide(state, command) → new state | error`, an idempotent operation, a mapping round-trip, domain arithmetic) gets one property step next to its example tests. It pays on state under a sequence of commands checked against a small reference model; it is noise on pass-through CRUD, a controller, delegated validation, an oracle that repeats the implementation, or anything against a storage fake.

- **Step N: Property: INV-03 — <the rule>** — the test names `INV-03`; values or commands come from a domain generator (never a filtered raw primitive), with a fixed seed and a run cap. With no property library in the manifest (research item 9), enumerate every command sequence up to length k over a small alphabet, deterministically; adding a library is the spec's decision.
- **Sabotage:** `<file>:<line>` — `<the change that breaks the rule>`: apply it, run the property, see it fail with a counterexample, revert. It is a mandatory mutant: the implementer runs it in the MUTATE step of `super.test-driven-development`.

## Visual-fidelity tasks (when a mockup exists)

For a UI task that has a `### Fidelidade Visual` subsection, the `## Passos` must, **before** the TDD loop, include one action that pins down fidelity inputs — and it stays tool-agnostic:

- **Step 0: Confirm design source & fidelity tools**

  Read the design source and fidelity tools already recorded in `### Fidelidade Visual` (the plan author discovered them once, at plan time). Confirm the original design source with the user — only this needs the user and so belongs at execution — and fill any gap the plan left open (re-run tool discovery only if the field was left blank, inspecting the available skills + connected MCP tools; match by capability, never hardcode a tool). If a source URL or a fidelity tool exists, use it; otherwise build to the curated mockup at `../specs/mockups/<file>` manually. The mockup is the *norte* — reuse its decided layout, spacing, and tokens; do not re-derive them.

This step never blocks: "no source / no tooling available" is a valid answer that routes to manual implementation against the mockup.

## Steps you must never write

A task file's `## Passos` is **pasted verbatim into the implementer's prompt**, and the same
text reaches the reviewer as its requirements. So a step here does not read as a suggestion —
it reads as an instruction, and it outranks the execution skill's prohibition against the same
command. This is how a plan makes every implementer and every reviewer re-run work that the
**full-suite checkpoint already runs once per batch**.

Never write a step (or a success criterion) that runs:

- **the whole test suite** — the checkpoint runs it once, scoped to the affected workspaces;
- **the typecheck/compile step** — whatever this repo calls it (`tsc --noEmit`, `mypy`,
  `go build ./...`, `cargo check`);
- **the build**;
- **the formatter or linter in FIX mode** — the variant that rewrites files, usually spelled
  `--write`, `--fix`, `-w`, or a `*:fix` script (`eslint --fix`, `ruff format`, `gofmt -w`,
  `cargo fmt`). It rewrites files the implementer does not own, and the diff under review
  stops matching the task.

The consuming repo's `AGENTS.md`/`CLAUDE.md` often states those four as the definition of "task
complete". They are — but they are the **checkpoint's** obligation, discharged once for the
whole batch, not a step you copy into each task. Do not restate them as `## Critérios de Sucesso`
either; a criterion is what the code must *do*, not which pipeline command must run.

## Naming a test command that actually narrows

Every `Run:` line that executes tests must name a **target**: the narrowest unit this runner
accepts. Start from the runner the briefing's `## Runner de testes` records (on a plan of at most four tasks, which the controller writes without a briefing, the one the controller resolved) — the controller resolved it from the repo's instructions file (`AGENTS.md`/`CLAUDE.md`), the manifest (`projectProfile.manifest`) or the spec, and asked when all were silent; never substitute one the briefing does not name; the paragraphs below are how to
check the form narrows, and what to write when the runner has no per-file form. Which unit that is differs per ecosystem — a file (`vitest run <file>`), a file plus a
test id (`pytest path/test_x.py::test_name`), a package path (`go test ./internal/user`). What
never counts as a target is the whole tree (`./...`) or a workspace selector (`--filter <app>`
picks a project, then runs all of its tests). Two more shapes look scoped and are not:

- a **name-only filter** (`-t "<name>"`, `--testNamePattern`, `pytest -k`) with no target: the
  runner still collects every test file;
- a **wrapper that swallows the path** — passing the path through a package script
  (`<pm> test -- <path>`) can drop it before the runner sees it.

For example, `pnpm test -- --run <file>` can collect the whole suite (**130 files**) while
naming one, where the direct runner form collects **1**. The narrowing form is settled once, at
research time: the research subagent runs the per-file form and reports the collected file
count (`../references/research-subagent-prompt.md`, item 3), and the briefing records the form
alone — the count is evidence and stays in the report. Copy that form; the writer never runs the runner to check it.

## Rules

- Every step is one action (2–5 minutes max).
- Steps that involve code **must** include the actual code block — never describe what the code should do without showing it.
- Run commands must include the exact command and the expected output. The expected output is what the assertion and the runner *must* say for the step as written (`FAIL — <symbol> is not defined`, `PASS`) — derived by reading, never captured by running the step yourself; the implementer sees the real text at execution.
- Never use "TBD", "TODO", "similar to Task N", or vague phrases like "add error handling."
- Repeat code across tasks if needed — engineers may read tasks out of order.
