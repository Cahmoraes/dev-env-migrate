# Session State Re-Entry Guard — full mechanics

The SKILL.md carries the *action* for this gate (the command to run) so a resume can execute it
without a round trip. This file carries the *mechanics*: why each step exists, the failure mode it
prevents, and the edge cases. Read it once if a step's intent is unclear, or when a resume left you
unsure whether the gate already ran.

The gate runs **before any dispatch**: it restores the variables every later gate reads.

### Why it runs unconditionally

It keeps execution correct when a session resumes **directly into this skill** after a compaction,
**without** re-entering `super.using-superpowers` — which normally derives `session_*` vars at
session start but does not run on a mid-execution resume.

Skip it and every variable reverts to `false`/default: the final `/code-review` pass never
fires, the QA gate reads its default — silently, because **a wiped flag is
indistinguishable from a deliberately-disabled one**. That indistinguishability is exactly why the
gate must never be conditioned on whether the variables "still look intact": there is no way to
look and tell. Always re-derive the *entire* set in one call; never restore a subset, and never
hand-map variables.

The script is deterministic, read-only and idempotent, so running it on a fresh start (where it is
redundant) costs one call and removes the judgment call about whether this is a resume.

### What the script owns

`derive-session-state.cjs` is the single source of truth for the `preferences.X.Y → session_*`
mapping and for platform gating (it returns the safe default for native vars that don't apply to
the current platform). That is why no per-variable table is kept in the SKILL.md: there is nothing
to keep in sync. `sdd-start.cjs` receives `--platform` with the value the SKILL.md names (the
platform `super.using-superpowers` resolved).

Restore each `session_*` variable from the script's `sessionState` object.

### Interrupted work

**Resume any interrupted task.** A task at `**Status:** IN_PROGRESS` was interrupted before
the compaction. Re-read its `## Passos` and the current state of its touched files to *resume*
rather than restart — restarting re-does committed work and can conflict with it.

### Compaction invariant

The physical task files (`task-NN.md` and `tasks-<feature-name>.md`) are the single source of truth
for completion. A task is complete only if its file says `Status: DONE` **and**
`tasks-<feature>.md` shows `[x]`. Session task-list entries and session memory do not count — they
do not survive, and trusting them silently skips or repeats a task.
