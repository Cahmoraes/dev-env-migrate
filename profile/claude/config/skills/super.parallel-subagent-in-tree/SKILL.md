---
name: super.parallel-subagent-in-tree
description: Use this skill to execute a parallelized implementation plan IN-TREE — running wave tasks concurrently in the SAME working tree without git worktrees. Invoke whenever a tasks index has parallel execution waves and worktree isolation is impractical — pnpm/npm/yarn workspace monorepos (node_modules not shared across worktrees), CI environments forbidding extra checkouts, or plans whose wave tasks touch disjoint files. Safety relies on verified write-set disjointness + write-only/no-commit subagents + a serialized integration barrier per wave. Keeps the same per-task quality gates as super.subagent-driven-development. Use super.parallel-subagent-development when tasks must mutate shared files; use super.subagent-driven-development for fully sequential plans.
argument-hint: "[path-to-tasks-<feature>.md]"
---

# Parallel Subagent-Driven Development (in-tree, no worktrees)

Execute an implementation plan **wave by wave**, running each wave's independent tasks **concurrently in the shared base working tree** — no git worktrees. This is the `parallel` + `no-isolation` execution cell; it reuses the per-task quality machinery of `super.subagent-driven-development`.

**Announce at start:** "I'm using the super.parallel-subagent-in-tree skill to execute the plan wave by wave, in the shared tree without worktrees."

**Core principle:** Without worktree isolation, concurrency is safe **only** when three invariants hold together (break one and parallel implementers corrupt each other):

1. **Verified write-set disjointness** — no two tasks in a wave WRITE the same file (checked deterministically from the plan, not by eye).
2. **Write-only / no-commit implementers** — subagents only create/edit their own files and run their scoped test; never `git add`/`commit`, repo-wide `lint:fix`/`format`/`build`, or another task's files.
3. **Serialized integration barrier** — after the wave, the orchestrator alone runs the heavy shared-state sequence once, commits, then runs the two-stage reviews.

> **This mode does not honor `workflow.auto_commit: false`.** The integration barrier commits once per wave by design, so there is no uncommitted-handoff variant here. Under `auto_commit: false` the work is still committed per wave — only `super.subagent-driven-development` leaves tasks uncommitted. **Step 2's auto-commit conflict gate surfaces this before any dispatch** — do not rely on the election handoff having warned, because this skill can be entered directly (standalone, or a named-mode triage handoff) with the election phase skipped.

> **Cardinal rule (inherited from the `super.subagent-driven-development` "Core principle" section) — you orchestrate, you never implement.** Every task is implemented by a **dispatched implementer subagent** (Agent/Task tool), never by you inline — this holds for a **single-task wave** as much as a parallel one (not "small enough to just do"; dispatched with the full per-task gates). If you catch yourself editing a file directly, STOP.

> **Entering this skill for the first time in this session — including a direct or standalone invocation, which skips the election handoff — read `./references/entry-and-integration.md` once, before Step 1.** It holds the election-time tier guard (a Small/Medium feature does not belong here), the routing decision tree, why in-tree beats worktrees in a workspace monorepo, `parallelizable: false` handling, and the workflow-skill integration list. A resumed run already passed that gate and skips the file; keeping it out of here holds Step 4 and Red Flags inside the 20k window.

> **Once that gate is passed, the plan runs here.** A fully-sequential plan is simply a series of single-task waves (Step 4, one dispatched implementer each) — never a bounce to `super.subagent-driven-development`, never a collapse into inline execution.

## The Process

### Step 1: Locate the plan and compute waves

Discover the tasks index as `super.subagent-driven-development` does (explicit path in context, else `docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md`, else a `tasks-*.md` in the feature's `plans/`). Compute the waves deterministically; the wave engine lives in the worktree skill and is shared verbatim — do not re-derive it:

> **Resolving `<super.X-base-dir>`:** the skills are siblings — parent of your header's base directory + `/super.X`. Never `glob` for one (`glob` misses dotdirs); a gate script that will not run is a **STOP**, never a skipped gate.

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index <path> && \
node <super.subagent-driven-development-base-dir>/scripts/parse-tasks.cjs --tasks-index <path>
```

**Both parsers go in this one call** — same index, neither consumes the other's output; splitting costs a round trip and buys nothing.

Read `waves`, `waveKinds` (per-wave `"parallel"`/`"sequential"`, 1:1 with `waves`), `parallelizable`, `maxParallelWave`, per-task `dependsOn`, `suggestedTier`, and `errors`. **Read the kind from `waveKinds[i]`, never infer it from `wave.length`.** **Stop and fix the plan if `errors` is non-empty** — a cycle or dangling dependency makes parallel execution unsafe; send the user back to `super.writing-plans`. `parse-tasks.cjs`'s JSON (same call) gives the already-`[x]` tasks to skip (session resume) and any index/file mismatches.

### Step 2: Memory gate + caveman + model selection

Same policy as `super.parallel-subagent-development`'s "Step 2" — run it here, from the scripts named below rather than from memory, because a wave fans out many prompts at once and multiplies anything you rebuild by hand.

- **Session State Re-Entry Guard — first, one call, unconditional.** `node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs --platform claude-code --repo-root "$(git rev-parse --show-toplevel)"` restores **every** `session_*` variable from its `sessionState` object. Never check first whether they are still known — a wiped flag reverted to `false` is indistinguishable from one the user deliberately disabled. Its output already carries `preferencesFound`, `session_auto_commit` and `session_language`, so nothing else in this step spends a second preferences call. Also look for `**Status:** IN_PROGRESS` task files, to resume mid-wave.

- **Auto-commit conflict gate (in-tree delta — per wave, not per task).** The integration barrier commits **once per wave**, so when that guard output reports `preferencesFound: true` **and** `session_auto_commit: false`, **STOP before the first wave** and offer an explicit choice — never commit silently under `auto_commit: false`: **(a) proceed**, accepting per-wave commits, or **(b) switch** to `super.subagent-driven-development` (sequential), the only mode that leaves tasks uncommitted. Put the conflict and its options in `session_language` — the session's `communication.language`, carried by the same guard output (default `pt-BR`); the English here is structure, not text to print verbatim (the shared user-facing-language rule, see `super.subagent-driven-development`, Branch Guard).

- **Memory gate** (only when `session_memory_enabled = true`): confirm the planning artifacts were persisted (`pmem search "<feature-name>"`), and persist them before dispatching if they were not. See `super.subagent-driven-development/SKILL.md`, "Memory Gate Check".

- **Caveman.** With `session_caveman_active = true` **and** `session_caveman_in_effect = false`, invoke `/caveman <session_caveman_level>` and set `session_caveman_in_effect = true`; already in effect (activated at the gate, or re-activated post-compaction) means do not re-invoke. Render the block deterministically — `node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs --active <session_caveman_active> --level <session_caveman_level>` — and paste its `block` field verbatim into **every** subagent prompt, so each implementer in the wave runs at the same level; one hand-assembled block multiplies across the fan-out. Deactivate ("normal mode"), resetting `session_caveman_in_effect = false`, only before invoking `super.finishing-a-development-branch`. Full detail: `super.subagent-driven-development/SKILL.md`, "Caveman Mode Activation".

- **Model selection.** Identical to the sequential skill: an explicit `model:` on every dispatch, resolved from that task's written `**Tier:**`, which is binding rather than a default to override at will — `super.subagent-driven-development/SKILL.md`, "Model Selection". Step 4's `validate-dispatch.cjs` pre-flight is the mechanical backstop.

### Step 3: Confirm the base branch

All work happens on the **base branch** in the shared tree — every wave commits straight onto it, so starting on the wrong branch lands the whole feature there. Before the first wave, run the same deterministic check as the sequential skill's "Branch Guard" section (skip on resume, when a wave is already committed):

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
DEFAULT=${DEFAULT:-$(git branch --list main master | tr -d ' *+' | head -1)}
echo "current=$BRANCH default=${DEFAULT:-<none>}"
```

If `BRANCH` is `main`/`master` or equals `DEFAULT`, **STOP and ask the user** before the first wave — offer to create a feature branch (`git checkout -b <feature-name>`) or to proceed on the default branch with their explicit consent.

There is no worktree step — that is the whole point of this mode; `super.using-git-worktrees` is **not** invoked.

### Step 4: Execute wave by wave

For each wave, in order. **Branch strictly on `waveKinds[i]`** (never on `wave.length`).

**Single-task wave (`waveKinds[i] === "sequential"):** run it exactly like `super.subagent-driven-development` does a task — dispatch a fresh implementer subagent in the shared tree, then spec review → code quality review → `super.verification-before-completion`, then the orchestrator marks status via `mark-task-status.cjs` (never the implementer). Run the mandatory `validate-dispatch.cjs` pre-flight first; the `single_agent` note is a warning, not an error, and the tier↔model gate still fires. The lone implementer may commit its own task's code normally, but must not touch tracker files. **The heavy run is still the barrier's** — alone in the tree removes the *race*, not the *duplication*: append `./agents/implementer.md` (it states its own single-task exception) so the implementer runs **only its scoped test**, then run `barrier.cjs --changed "<the task's write-set>"` yourself, once (step 5). Reading its JSON **is** the `super.verification-before-completion` evidence and satisfies that gate; never re-run a green to confirm it, and **never put a suite/typecheck/build command in a subagent prompt** — skip it and the same green gets proven three times.

**Multi-task wave (`waveKinds[i] === "parallel"`):** run the tasks concurrently in the shared tree, guarded by the three invariants. **Full procedure (bash, edge cases, commit conventions) in `./references/integration-barrier.md` — read it and follow it.** The steps:

1. **Disjointness gate** (before dispatching) — `node <super.parallel-subagent-in-tree-base-dir>/scripts/check-wave-disjoint.cjs --tasks-index <path> --tasks <wave-task-numbers>` (prefer `--tasks`; `--wave <N>` works only with an explicit `## Execution Waves` section). Parallelize **only if** `safeForInTreeParallel: true`; on `false` (a `writeOverlap` — two tasks write the same file; a `readWriteHazard` — one task reads what another writes, a stale-read risk; or an `unverifiable` task with no parseable `## Arquivos` write-set) **do not parallelize this wave in-tree**: run it sequentially or use `super.parallel-subagent-development`. Keep the per-task `writeSet` arrays for step 4.
2. **Set status** — before dispatching, flip each `task-NN.md` to `**Status:** IN_PROGRESS` via `mark-task-status.cjs --tasks-index <tasks-<feature>.md> --task-number N --status IN_PROGRESS`.
3. **Dispatch write-only implementers in parallel** — one per task in the **same base tree**, each carrying full task text + PRD + Spec (read the `**PRD:**`/`**Spec:**` fields; never make the subagent read the plan). **Dispatch pre-flight (mechanical model/tier gate — mandatory, run first):** build a dispatch manifest (`modelTiers` from preferences `model_tiers`; one agent per task with `label`, resolved `model`, written `tier`, and the step-1 `writeSet`; `escalationReason` only for an escalation-ladder re-dispatch) and run `node <super.dispatching-parallel-agents-base-dir>/scripts/validate-dispatch.cjs --dispatch <manifest.json>` — its `--help` prints a fill-in manifest skeleton, so never read its source for the shape — **do not dispatch while `valid:false`**. Here it is chiefly the **`tier_model_mismatch`** gate (disjointness is already proven by step 1): a `model:` off its written tier with no recorded escalation is corrected to the tier's resolution before the fan-out — the deterministic backstop for the "Step 2" pre-dispatch gate. Once `valid:true`: **Per task before the fan-out:** `**Spec:**` must be present and resolve on disk — else **stop and resolve before dispatching that task** (`**PRD:**` is optional: `N/A` is valid; only a non-`N/A` path that fails to resolve is a stop). Prompt = `super.subagent-driven-development/agents/implementer.md` + the scoping block from `./agents/implementer.md` — that block is the single source of what an implementer may not do here; do not restate or relax it.
4. **Scope verification gate** (mandatory, before the barrier; no merge-conflict net here) — `git -C "$(git rev-parse --show-toplevel)" status --porcelain`; every changed path must be in the union of step-1 write-sets, **excluding the tracker files you flipped in step 2** (`tasks-<feature>.md`, `task-NN.md`). Any other out-of-scope change means an implementer escaped scope and may have clobbered a sibling — **stop**, revert/reconcile it, re-dispatch that task.
5. **Integration barrier** (orchestrator only, once per wave, never per task) — after scope is verified, run `node <super.parallel-subagent-in-tree-base-dir>/scripts/barrier.cjs --repo-root "$(git rev-parse --show-toplevel)" --changed "<union of the wave's write-sets>"`. It runs **format/lint autofix → typecheck → test suite → build** in that order, stops at the first failing phase, parallelises the independent workspaces within a phase, and returns per-job exit codes as JSON (exit 0 green, 2 failed — read `failedPhase`). Passing `--changed` scopes the run to the workspaces that could have broken **and their dependents**; omitting it is the conservative full scope. Commit (per task or grouped) **only** once green. Full rationale and the by-hand fallback: `./references/integration-barrier.md`.
6. **Two-stage review per task** — after the barrier is green and committed, spec compliance then code quality reviewer per task (`super.subagent-driven-development/agents/spec-reviewer.md`, `.../code-quality-reviewer.md`); independent, may run concurrently. Per-task **`reviewShape`** from `parse-waves.cjs` scales this: `combined` dispatches one reviewer fusing both lenses (`.../combined-reviewer.md`) instead of the pair, `none` skips the dedicated reviewers — see "Review cost control" in `super.subagent-driven-development`. **A reviewer's `model:` floors at `standard`**: a `cheap` task is reviewed one family up, never by the tier that wrote it.
7. **Verify** — `super.verification-before-completion` against the base branch.
8. **Update the tracker** — only after the wave verifies, mark each task `DONE` via `mark-task-status.cjs … --status DONE` (flips `[ ]`→`[x]`, `IN_PROGRESS`→`DONE`).

> **`/simplify` (opt-in, Claude Code only; additive — never a review).** If `session_simplify_enabled`, the orchestrator runs `/simplify` on the wave's changed files between step 4 (scope verified) and step 5 (barrier) — never the concurrent implementers, so the barrier validates and commits the simplified code (skip if no code changed). It *applies* cleanups, so it never duplicates the spec/quality gates; the optional final review pass is handled at Finish. Off or non-matching platform → skip. See `super.using-superpowers/references/claude-code-tools.md` / `copilot-tools.md`.

If a task in a parallel wave is BLOCKED or fails review repeatedly, use the same status logic and **review-loop cap** as the sequential skill: a reviewer rejecting a task across ~3 non-converging rounds is escalated like a `BLOCKED` implementer, never looped forever. A verified bug or failing test while implementing is a debugging problem, not a review nit — route it to **super.systematic-debugging** (capped 4-phase loop), then resume the task's gates. A BLOCKED implementer that needs another wave task's output means the wave was mis-classified as independent — serialize it; never let it write a sibling's files.

### Step 5: Finish

The finish tail is **identical** to the other execution skills. Run the five finishing gates
in order — final code review → `super.independent-verification` → preference-gated, consent-based QA gate
(`super.user-story-verification`, skipped silently when `session_qa_gate_enabled` is false) →
done-state gate (`parse-tasks.cjs --assert-all-done`) →
deactivate caveman + `super.finishing-a-development-branch` — exactly as specified in the
single canonical source:

> **Follow `super.subagent-driven-development/references/finish-tail.md`** for the full,
> verbatim gate semantics (fix loops, caps, PRD discovery, QA result table, script
> invocations). Do not re-describe the gates here — that file is the source of truth.

**Mode delta (in-tree, no worktrees):** here **the integrated target** is the **shared tree** —
the waves are done, so Critical/Important fix implementers dispatched by gate 1 run **on the
integrated shared tree**. This mode has no worktree/merge step; concurrency safety came from the
per-wave integration barrier (`./references/integration-barrier.md`), which has already run.

## Continuous Execution

Shared with the other execution skills — see the "Continuous Execution" section of
`super.subagent-driven-development/references/finish-tail.md`. In short: do not pause between
tasks or waves; stop only for an unresolvable BLOCKED status, genuine ambiguity, a
`parse-waves.cjs` error, a `safeForInTreeParallel: false` wave you cannot reclassify, or
completion.

## Red Flags

**Never:**
- **Implement a task's code yourself instead of dispatching an implementer subagent** — applies to a single-task wave as much as a parallel one. Inline work skips model selection, both reviews, and the verification gate.
- **Parallelize a wave `check-wave-disjoint.cjs` reports as `safeForInTreeParallel: false`.** A `writeOverlap` or `unverifiable` task means disjointness is unproven; run it sequentially or use worktrees.
- **Let a parallel implementer `git add`/`commit`, run repo-wide format/lint autofix/`build`, or touch a file outside its own write-set.** Those mutate shared state and are the orchestrator's job at the barrier.
- **Mark a task `[x]` before the barrier-verified result passes `super.verification-before-completion`.**

All other process prohibitions are stated in the steps above; see `./references/integration-barrier.md` and `super.subagent-driven-development/references/finish-tail.md` for the full safety checklists.
