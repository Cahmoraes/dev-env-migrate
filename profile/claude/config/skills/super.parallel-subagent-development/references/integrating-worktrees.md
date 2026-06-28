# Integrating Parallel Worktrees

How a parallel wave's worktrees are created, merged into the base branch, and how conflicts and the no-worktree fallback are handled. Tasks progress concurrently in isolation, then converge in one sequential step.

## Vocabulary

- **Base branch** — where the integrated feature lands (the branch you started execution on, e.g. a `feature/<name>` branch off `main`). All wave worktrees branch from it; all integration merges into it.
- **Task worktree** — one isolated working tree per task, on its own short-lived branch (e.g. `wt/<feature>-task-03`).

## Creating worktrees (one per parallel task)

Defer creation to `super.using-git-worktrees` — do not hand-roll `git worktree add` if a native worktree tool exists. For each task:

1. Invoke `super.using-git-worktrees` for a workspace off the base branch, with a deterministic, auditable name: `wt/<feature-name>-task-NN`.
2. Let that skill run project setup (install deps) and confirm a clean test baseline. A task must start green — if the baseline fails, report it and do not dispatch the implementer until resolved.
3. Record the mapping `task-NN → worktree path → branch name`. The implementer is pinned to this path and commits only inside it.

## Dispatching implementers

Each implementer gets the standard `super.subagent-driven-development/agents/implementer.md` content plus the scoping block from `../agents/implementer.md`: the absolute worktree path to work in, no `cd` out of it, and a commit on its task branch before returning. Reviews run against that worktree's diff (`git -C <worktree> diff <base>...HEAD`).

## Pre-merge gate (deterministic)

Before integrating, run the deterministic gate. Read-only, from git state, it reports which task branches exist, whether each carries committed work, the merge order, and whether any "independent" siblings touch shared files:

```bash
node <super.parallel-subagent-development-base-dir>/scripts/check-integration.cjs \
  --base <base-branch> --feature <feature-name> --tasks <wave-task-numbers> \
  --repo-root "$(git rev-parse --show-toplevel)"
```

- `readyToIntegrate: false` → do **not** merge. Each `blockers` entry is a hard stop: a missing `wt/<feature>-task-NN` branch means the implementer never committed; `no commits beyond base` means the task produced nothing.
- `alreadyMerged: true` on a task → its work is **already in base** (you are resuming a partial integration). **Skip it — do not re-merge**, and do not treat it as a blocker. The gate distinguishes this from an empty branch (which still blocks) via `commitsBehind`.
- `missedDependencySignals` non-empty → two tasks the planner declared independent changed the **same file**, surfaced *before* the merge. Expect a conflict, inspect those files first, and after the run consider correcting the `**Depends on:**` fields so the next plan serializes them.
- `baseSafe: false` → you are about to integrate onto `main`/`master`; stop unless the user explicitly consented.
- `mergeOrder` is the deterministic ascending order to merge in — follow it.

## Integration order

Integrate **only after every task in the wave passed both reviews and the gate reports `readyToIntegrate: true`**. Merge **one worktree at a time** into the base branch in the gate's `mergeOrder` (ascending task number) — serializing keeps any conflict attributable to a single task. For each task worktree:

```bash
# from the base branch working tree
git merge --no-ff wt/<feature-name>-task-NN -m "merge(task-NN): <short task title>"
```

`--no-ff` keeps a per-task merge commit so each contribution stays auditable and revertible.

After each merge, run the task's own tests (fast feedback). After **all** merges in the wave are done, run the full suite via `super.verification-before-completion` against the base branch (independent tasks can still interact once their code coexists).

## Conflict handling

If dependency analysis was correct, same-wave tasks touch disjoint files and merge cleanly. A conflict signals a missed dependency — real information, not noise:

1. **Resolve on the base branch**, favoring a correct integrated result over either side verbatim. Mechanical conflicts (imports, adjacent additions) resolve directly.
2. **If it reveals a true semantic dependency** (one task genuinely needed the other's output), the wave grouping was wrong. Resolve correctly, then suggest the user fix the `**Depends on:**` fields in `super.writing-plans` so the next plan serializes those tasks. Do not silently absorb a recurring conflict pattern.
3. **Re-run the affected task's tests and the full suite** after resolving — a conflict resolution is a code change; verify it.
4. **If you choose not to resolve in place** (the dependency needs the task re-dispatched, not hand-merged) — abort with `git merge --abort` so the base returns to pre-merge state. Never re-dispatch a task or start the next wave with a merge in progress. If a *clean* merge later fails `super.verification-before-completion`, revert that task's `--no-ff` merge commit (`git revert -m 1 <merge-sha>`) to restore a clean base before re-dispatching.

## Tracker updates

Only after the merged wave passes full verification do you mark its tasks done — both edits per task, on disk:
- `tasks-<feature-name>.md`: `- [ ] N.` → `- [x] N.`
- `task-NN.md`: `**Status:** IN_PROGRESS` → `**Status:** DONE`

Verify the merge, then mark done — never the reverse.

## Resume after an interrupted integration

A session can die mid-wave — some worktrees merged, others not, the tracker stale. On resume, assume nothing; re-derive state:

1. **Re-run the pre-merge gate** (`check-integration.cjs`). Tasks reporting `alreadyMerged: true` are already in base — skip them. Tasks with commits but not merged are the remaining work; empty/missing branches still block.
2. **Re-run both reviews on any not-yet-merged worktree before merging it.** "Reviews passed" is not durable across a crash or compaction — never merge on a remembered approval; re-run spec + code-quality review.
3. Integrate the remaining tasks in `mergeOrder` as usual, and update the tracker.

## Cleanup

Remove the wave's worktrees before starting the next wave so they don't accumulate:
- Native tool: use its teardown (it reclaims unchanged worktrees automatically).
- Git fallback: `git worktree remove <path>` for each; the task branch can be deleted after its merge commit lands (`git branch -d wt/<feature-name>-task-NN`).

The next wave branches off the now-updated base, so it must see every prior wave's output.

## No-worktree fallback

If worktree creation is unavailable — sandbox denial, no native tool and `git worktree add` fails on permissions, or the platform forbids it — do not fake parallelism inside one tree. Instead:

1. Tell the user parallel isolation is unavailable and why.
2. Fall back to **sequential** execution of all remaining tasks in dependency order (flatten the waves, respecting `dependsOn`) — behave like `super.subagent-driven-development` for the rest of the run.
3. Keep every other gate (two-stage review, verification-before-completion, tracker edits, QA gate) identical.

Sequential-but-correct always beats parallel-but-corrupt.
