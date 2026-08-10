# In-Tree Parallel: Disjointness Gate & Integration Barrier

Two deterministic mechanisms make `super.parallel-subagent-in-tree` safe without worktree isolation: the **disjointness gate** before a wave, the **integration barrier** after. The gates replace worktree isolation so the orchestrator never *infers* safety: **provably disjoint writes** in (gate reads the plan), a **single serialized convergence** out (barrier serializes every shared-state mutation).

## Disjointness gate (before dispatching a parallel wave)

Before any implementer runs, confirm the wave's tasks write disjoint files — read-only, from the plan:

```bash
node <super.parallel-subagent-in-tree-base-dir>/scripts/check-wave-disjoint.cjs \
  --tasks-index <tasks-index-path> --wave <wave-number>
```

(Equivalently, pass `--tasks <N,N,...>` with the wave's task numbers from `parse-waves.cjs`.)

It builds each task's **write-set** from its `## Arquivos` section — paths under write verbs (Create/Modify/Test, pt-BR Criar/Modificar/Teste); other verbs (Read/Reference) are read-only and never collide — and reports:

- `safeForInTreeParallel: true` → every task has a parseable write-set and no two write the same file. **Only then** may the wave run in-tree concurrently.
- `safeForInTreeParallel: false` → **do not parallelize this wave in-tree.** The boolean is the authority: when it is `false`, do not parallelize regardless of which list below is populated. Three cases:
  - `writeOverlaps` non-empty → two "independent" tasks write the same file; they cannot share the tree. Run them sequentially or use `super.parallel-subagent-development` (worktrees). A real overlap also signals wrong `**Depends on:**` fields.
  - `readWriteHazards` non-empty → one task reads a file another task writes (stale-read risk): run concurrently, the reader may see a half-written or pre-change version. Run them sequentially (reader after writer) or use worktrees.
  - `unverifiable` non-empty → a task has no `## Arquivos` write-set, so disjointness is unprovable. Do not parallelize: add `## Arquivos` or run the wave sequentially.

A shared **read** is fine only when no task writes that file; a file one task writes and another reads (read∩write) or that two tasks write (write∩write) breaks disjointness. The gate is the in-tree analogue of `parse-waves.cjs`/`check-integration.cjs`.

## Write-only / no-commit implementers

Dispatch each implementer with `super.subagent-driven-development/agents/implementer.md` plus the scoping block from `../agents/implementer.md`. That block pins the subagent to its write-set and forbids operations that mutate shared state in the shared tree:

- no `git add`/`commit`/`stash`/`checkout` (the git index is shared)
- no repo-wide `lint:fix`/`format`/`build`/codegen (they touch files other tasks own)
- no full-suite runs (they race with siblings); only the task's **scoped** test

It creates/edits only its files, confirms them with its scoped test, and returns the files it wrote — **no commit SHAs** (it does not commit).

**After dispatching the wave, await the implementers — never poll.** They run in the background and the harness re-invokes you as each returns; simply wait for their results before the scope-verification gate. Do **not** `sleep` or schedule a wakeup/timer to "check on" implementers you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow.

## Scope verification (after the wave, before the barrier)

Worktree mode would catch an under-declared dependency as a **merge conflict** (`check-integration.cjs` flags overlapping diffs); the shared tree overwrites silently. So before the barrier, verify the implementers wrote only what the plan declared:

```bash
git -C "$(git rev-parse --show-toplevel)" status --porcelain
```

Take the union of the per-task `writeSet` arrays `check-wave-disjoint.cjs` emitted (already proven pairwise disjoint). Every changed path must belong to that union, **except the tracker files the orchestrator itself edited before dispatching** — the feature's `tasks-<feature>.md` and the `task-NN.md` files under `plans/`, flipped to `IN_PROGRESS` in the set-status step; ignore those. Any *other* out-of-union change — a barrel/`index.ts` re-export, a codegen artifact, a shared config — means an implementer escaped its scope and may have clobbered a sibling's file. **Stop, reconcile or revert the out-of-scope change, and re-dispatch the offending task** before the barrier.

## Integration barrier (after scope is verified, orchestrator only)

Once scope is verified, the orchestrator — **once for the whole wave, never per task, never inside a concurrent subagent** (steps 1–4 touch shared state across all tasks; running them concurrently reintroduces the race) — runs the project's heavy shared-state sequence in order, stopping at the first failure.

**Run it with the script, not by hand:**

```bash
node <super.parallel-subagent-in-tree-base-dir>/scripts/barrier.cjs \
  --repo-root "$(git rev-parse --show-toplevel)" \
  --changed "<comma-separated union of the wave's write-sets>"
```

It resolves each phase to the project's own script name, runs the independent workspaces of a phase **concurrently**, stops at the first failing phase, and returns JSON with a per-job `exitCode` — the evidence `super.verification-before-completion` requires. Exit 0 = green, 2 = a phase failed (read `failedPhase`). Add `--plan` to see the resolved plan without running it. If the script is unavailable, fall back to running the four phases by hand in the order below.

**Why `--changed` matters.** Passing the wave's write-set scopes the run to the workspaces that could have broken — measured waste without it: a backend-only wave still ran the frontend's full suite, every wave, all feature long. The scoping is only safe because two things hold: the write-set was already proven by `check-wave-disjoint.cjs` upstream, and the script widens automatically in the two cases where narrowing would lose coverage — **a path owned by no workspace** (root config, lockfile: can break anything) and **the dependents of a changed workspace** (a shared package's consumers are in its blast radius; a change to `packages/api-types` that broke the frontend typecheck is exactly the miss this encodes). Omit `--changed` and you get the conservative full scope.

1. **Format/lint autofix** — safe now that no subagent is writing.
2. **Typecheck** — catches cross-task type breakage scoped tests cannot see.
3. **Test suite** — where cross-task interaction surfaces once the code coexists.
4. **Build** — final integration check; always repo-wide (proving one workspace builds proves nothing about the repo).

Only after the sequence is green does the orchestrator **commit** — per task (preferred, for auditable history) or grouped if changes are tightly related. Use the project's commit conventions. **If you commit grouped,** the per-task two-stage review then sees a cumulative diff spanning sibling tasks — pass each task's `WRITE_SET` (its `## Arquivos`/`## Files` paths) to the reviewers so findings are attributed to the right task. Per-task commits make this unnecessary (each diff is already isolated).

If the barrier fails (type error, failing test, build break), treat it like a review failure: identify the owning task, re-dispatch its implementer with the failure context (still write-only/no-commit), re-run the barrier. A recurring cross-task failure signals a missed dependency — correct the `**Depends on:**` fields so the next plan serializes them.

## Two-stage review, verification, tracker

After the barrier is green and committed, the tail matches `super.subagent-driven-development`:

1. **Two-stage review per task** — spec compliance reviewer, then code quality reviewer, against each task's diff; per-task and independent, so they may run concurrently.
2. **`super.verification-before-completion`** against the base branch — the explicit completion gate.
3. **Tracker edits** — only after verification, mark each task done on disk: `tasks-<feature>.md` `[ ]`→`[x]` and `task-NN.md` `IN_PROGRESS`→`DONE` (via `mark-task-status.cjs`).

Ordering: disjoint writes → concurrent write-only implementers → one serialized barrier → review → verify → mark done — concurrent progress in a single tree, convergence through one auditable step.
