# Required Task Step Pattern

Every `## Passos` section in a task file MUST follow this TDD pattern exactly. Do not summarize or abbreviate — copy the structure below and fill it with real code, real commands, and real expected outputs.

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

- **Step 5: Commit** *(sequential execution only — in a parallel wave the orchestrator
  commits at the integration barrier. If your prompt says you are one of several
  implementers in a shared tree, skip this step and report the files instead.)*

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

The step list ends here. **Do not add a step that runs the whole suite, the typecheck/compile
step, the build, or the formatter/linter in fix mode** — see "Steps you must never write" below.

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
**integration barrier already runs once per wave**.

Never write a step (or a success criterion) that runs:

- **the whole test suite** — the barrier runs it once, scoped to the affected workspaces;
- **the typecheck/compile step** — whatever this repo calls it (`tsc --noEmit`, `mypy`,
  `go build ./...`, `cargo check`);
- **the build**;
- **the formatter or linter in FIX mode** — the variant that rewrites files, usually spelled
  `--write`, `--fix`, `-w`, or a `*:fix` script (`eslint --fix`, `ruff format`, `gofmt -w`,
  `cargo fmt`). In a parallel wave this also corrupts sibling tasks: it rewrites files the
  implementer does not own.

The consuming repo's `AGENTS.md`/`CLAUDE.md` often states those four as the definition of "task
complete". They are — but they are the **barrier's** obligation, discharged once for the whole
wave, not a step you copy into each task. Do not restate them as `## Critérios de Sucesso`
either; a criterion is what the code must *do*, not which pipeline command must run.

## Naming a test command that actually narrows

Every `Run:` line that executes tests must name a **target**: the narrowest unit this runner
accepts. Which unit that is differs per ecosystem — a file (`vitest run <file>`), a file plus a
test id (`pytest path/test_x.py::test_name`), a package path (`go test ./internal/user`). What
never counts as a target is the whole tree (`./...`) or a workspace selector (`--filter <app>`
picks a project, then runs all of its tests). Two more shapes look scoped and are not:

- a **name-only filter** (`-t "<name>"`, `--testNamePattern`, `pytest -k`) with no target: the
  runner still collects every test file;
- a **wrapper that swallows the path** — passing the path through a package script
  (`<pm> test -- <path>`) can drop it before the runner sees it.

Both were measured on a real repo: `pnpm test -- --run <file>` collected **130 files** while
naming one; the direct runner form collected **1**. Run the command once and read the **file
count** in its output before you write it into the plan. If the count is the whole suite, use
the direct runner form instead of the package script.

## Rules

- Every step is one action (2–5 minutes max).
- Steps that involve code **must** include the actual code block — never describe what the code should do without showing it.
- Run commands must include the exact command and the expected output.
- Never use "TBD", "TODO", "similar to Task N", or vague phrases like "add error handling."
- Repeat code across tasks if needed — engineers may read tasks out of order.
