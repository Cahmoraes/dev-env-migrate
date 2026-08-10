# Session State Re-Entry Guard & Caveman State Check — full mechanics

The SKILL.md carries the *actions* for both gates (the commands to run, in order) so a resume can
execute them without a round trip. This file carries the *mechanics*: why each step exists, the
failure mode it prevents, and the edge cases. Read it once if a step's intent is unclear, or when
a resume left you unsure whether a gate already ran.

Both gates run **before any dispatch**, in this order: session state first (it restores the
variables every later gate reads), caveman second (it consumes `session_caveman_*`).

---

## Session State Re-Entry Guard

### Why it runs unconditionally

It keeps execution correct when a session resumes **directly into this skill** after a compaction,
**without** re-entering `super.using-superpowers` — which normally derives `session_*` vars at
session start but does not run on a mid-execution resume.

Skip it and every variable reverts to `false`/default: caveman never activates, `/simplify` never
runs, the final `/code-review` pass never fires — silently, because **a wiped flag is
indistinguishable from a deliberately-disabled one**. That indistinguishability is exactly why the
gate must never be conditioned on whether the variables "still look intact": there is no way to
look and tell. Always re-derive the *entire* set in one call; never restore only caveman, and never
hand-map variables.

The script is deterministic, read-only and idempotent, so running it on a fresh start (where it is
redundant) costs one call and removes the judgment call about whether this is a resume.

### What the script owns

`derive-session-state.cjs` is the single source of truth for the `preferences.X.Y → session_*`
mapping and for platform gating (it returns the safe default for native vars that don't apply to
the current platform). That is why no per-variable table is kept in the SKILL.md: there is nothing
to keep in sync. Pass the `--platform` matching where you run (`claude-code`, or `copilot`,
`codex`, `gemini` elsewhere).

Restore each `session_*` variable from the script's `sessionState` object.

### The two caveman latches are NOT session state

`session_caveman_in_effect` and `session_caveman_prompted` are **runtime bookkeeping, not
configuration**, so they are deliberately absent from `sessionState`. A compaction wipes the live
caveman skill, so on resume treat both as `false`: the Caveman State Check then re-loads caveman
when `session_caveman_active` resolves true. Restoring `in_effect: true` from a stale value would
skip the re-load and leave the wave running without caveman while believing it is on.

### Interrupted work

**Resume any interrupted task.** A task at `**Status:** IN_PROGRESS` was interrupted before
the compaction. Re-read its `## Passos` and the current state of its touched files to *resume*
rather than restart — restarting re-does committed work and can conflict with it.

### Compaction invariant

The physical task files (`task-NN.md` and `tasks-<feature-name>.md`) are the single source of truth
for completion. A task is complete only if its file says `Status: DONE` **and**
`tasks-<feature>.md` shows `[x]`. Session task-list entries and session memory do not count — they
do not survive, and trusting them silently skips or repeats a task.

---

## Caveman State Check

Caveman is a **presentation preference**: it changes how agents write, never what the Execution
Loop does. When `session_caveman_active` is false this whole gate is a no-op.

### The three cases

1. **`active = false` AND `prompted = false`** — ask the dynamic question (see
   `super.using-superpowers`, Caveman Mode section) and record the result.
2. **`active = true` AND `in_effect = false`** — invoke the `caveman` skill at
   `session_caveman_level` (e.g. `/caveman full`), then set `in_effect = true`. **If `in_effect` is
   already `true`** (activated at the gate, or re-activated post-compaction by
   `super.using-superpowers`), **do not re-invoke** — it is already loaded and re-invoking only
   wastes tokens. Caveman stays active through all tasks, spec reviews, code-quality reviews and
   the QA gate.
3. **Before `super.finishing-a-development-branch`** — explicitly deactivate ("normal mode" /
   "stop caveman") and set `in_effect = false`. Finishing requires clear human-facing
   communication.

### Subagent propagation is deterministic — never hand-assembled

Every subagent prompt (implementer, spec reviewer, code-quality reviewer, QA subagents) gets its
Caveman Mode block from `render-caveman-block.cjs`, never from memory. Paste the script's `block`
field verbatim. When `session_caveman_active = false` the block is the empty string — omit the
section.

The wording lives in one place and the controller *copies* it; it does not compose it. The old
fill-in-the-blank placeholder was a judgment call the controller mis-filled, so dispatched
subagents never activated caveman at all.

### Render once per activation window, then reuse

The block is a pure function of `session_caveman_active` + `session_caveman_level`, and both are
constant for the whole window. So every task's implementer, spec reviewer, code-quality reviewer
and QA subagent gets the **same two strings**. Re-rendering per prompt multiplies an identical call
across the wave for an identical answer.

**Reuse means pasting the renderer's exact output you are holding** — never retyping it from
recollection, and never editing it; the bytes must still originate in the renderer.

**Re-render when, and only when, an input changes:** `session_caveman_level` changed, caveman was
deactivated/re-activated, or a compaction wiped the strings. If you cannot reproduce the output
verbatim, you do not have it — re-run the renderer.
