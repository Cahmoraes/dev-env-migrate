# Execution Waves — dependency analysis and the `## Execution Waves` section

This is the normative reference for the `**Depends on:**` task field and the `## Execution Waves` section of the tasks index. Both exist so `super.parallel-subagent-development` can run independent tasks concurrently in isolated git worktrees while keeping dependent tasks in order. Get this right during planning — the execution skill trusts it and does not re-derive dependencies from code.

## 1. Deciding dependency edges

For each task, ask: *does this task read, import, extend, or otherwise consume a file or symbol that an earlier task creates or changes?*

- **Yes** → it depends on that earlier task. List every such task in `**Depends on:**`.
- **No** (it touches a disjoint set of files and needs nothing from earlier tasks) → `**Depends on:** N/A`.

Two tasks are **independent** when neither consumes the other's output and they do not write the same files. Only independent tasks are safe to parallelize: each runs in its own worktree and the worktrees are merged afterward, so overlapping writes would conflict.

**Bias toward declaring dependencies.** A missing-but-real edge lets two worktrees edit assumptions out from under each other and surfaces as a merge conflict or broken integration. A spurious edge merely costs some parallelism. The asymmetry favors caution.

Common real dependencies that are easy to miss:
- Task B imports a module, type, or function that task A introduces.
- Task B adds a migration that assumes a column task A created.
- Task B wires a route to a handler task A wrote.
- Task B's test fixture reuses a factory task A added.

Things that are **not** dependencies (do not over-couple):
- Both tasks happen to live in the same subsystem but edit different files.
- Both tasks follow the same pattern but produce separate, non-importing units.
- A later task is conceptually "after" an earlier one but shares no code.

## 2. Deriving the waves (topological grouping by level)

Use Kahn's algorithm grouped by level so each level becomes one wave:

1. **Wave 1** = every task whose `**Depends on:**` is `N/A`.
2. **Wave k+1** = every not-yet-placed task whose dependencies are all already placed in waves `1..k`.
3. Repeat until all tasks are placed.

A wave holding 2+ tasks is labeled `(parallel)`; a wave holding exactly one task is `(sequential)`.

If you ever cannot place a remaining task (its dependency was never placed), you have a **cycle** or a reference to a nonexistent task — fix the `**Depends on:**` fields before continuing. A valid dependency graph is always a DAG.

## 3. The `## Ondas de Execução` format

Place this section in the tasks index (`tasks-<feature-name>.md`) right after the `## Tarefas` list. One line per wave, in execution order:

```markdown
## Ondas de Execução

- **Wave 1** (parallel): 1, 2, 3
- **Wave 2** (parallel): 4, 5
- **Wave 3** (sequential): 6
```

> The parser (`parse-waves.cjs`, `check-wave-disjoint.cjs`) accepts **both** the Portuguese
> heading `## Ondas de Execução` (what `tasks-template.md` emits) and the English
> `## Execution Waves` (used by older plans). The wave lines keep the English keyword `**Wave N**`.

Rules the parser enforces:
- Every task in `## Tarefas` appears in exactly one wave.
- Wave numbers are sequential starting at 1.
- Task numbers referenced must exist in `## Tarefas`.
- A task's wave must be strictly greater than the wave of every task it depends on.

## 4. Worked examples

**Example A — diamond (mixed):**

```
Depends on:
  task-01: N/A
  task-02: N/A
  task-03: task-01
  task-04: task-01, task-02
  task-05: task-03, task-04
```

```markdown
## Ondas de Execução

- **Wave 1** (parallel): 1, 2
- **Wave 2** (parallel): 3, 4
- **Wave 3** (sequential): 5
```

**Example B — fully sequential chain (no parallelism available):**

```
Depends on:
  task-01: N/A
  task-02: task-01
  task-03: task-02
```

```markdown
## Ondas de Execução

- **Wave 1** (sequential): 1
- **Wave 2** (sequential): 2
- **Wave 3** (sequential): 3
```

This is the correct, valid output for inherently sequential work. Note it for the user — the parallel option will simply run everything in order with no speedup, so option 1 (`super.subagent-driven-development`) is the simpler choice.

**Example C — fully independent (maximum parallelism):**

```
Depends on:
  task-01: N/A
  task-02: N/A
  task-03: N/A
```

```markdown
## Ondas de Execução

- **Wave 1** (parallel): 1, 2, 3
```

## 5. Verifying

After writing the waves, confirm they are consistent with the `**Depends on:**` fields:

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs \
  --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
```

The script reports the parsed waves, whether any wave is parallelizable, and any inconsistency between the declared `## Execution Waves` section and the per-task `**Depends on:**` fields (cycle, dangling reference, task missing from a wave, or a dependency landing in a later wave than its dependent). Fix reported errors before handing off to execution.
