---
name: super.parallel-subagent-in-tree
description: Use this skill to execute a parallelized implementation plan IN-TREE — running wave tasks concurrently in the SAME working tree without git worktrees. Invoke whenever a tasks index has parallel execution waves and worktree isolation is impractical — pnpm/npm/yarn workspace monorepos (node_modules not shared across worktrees), CI environments forbidding extra checkouts, or plans whose wave tasks touch disjoint files. Safety relies on verified write-set disjointness + write-only/no-commit subagents + a serialized integration barrier per wave. Keeps the same per-task quality gates as super.subagent-driven-development. Use super.parallel-subagent-development when tasks must mutate shared files; use super.subagent-driven-development for fully sequential plans.
---

# Parallel Subagent-Driven Development (in-tree, no worktrees)

Execute an implementation plan **wave by wave**, running each wave's independent tasks **concurrently in the shared base working tree** — no git worktrees. This is the `parallel` + `no-isolation` execution cell; it reuses the per-task quality machinery of `super.subagent-driven-development`, differing only in where implementers run and how concurrency is made safe without isolation.

**Announce at start:** "I'm using the super.parallel-subagent-in-tree skill to execute the plan wave by wave, in the shared tree without worktrees."

**Core principle:** Without worktree isolation, concurrency is safe **only** when three invariants hold together (break one and parallel implementers corrupt each other):

1. **Verified write-set disjointness** — no two tasks in a wave WRITE the same file (checked deterministically from the plan, not by eye).
2. **Write-only / no-commit implementers** — subagents only create/edit their own files and run their scoped test; never `git add`/`commit`, repo-wide `lint:fix`/`format`/`build`, or another task's files.
3. **Serialized integration barrier** — after the wave, the orchestrator alone runs the heavy shared-state sequence once, commits, then runs the two-stage reviews.

> **This mode does not honor `workflow.auto_commit: false`.** The integration barrier commits once per wave by design (it is how the wave's concurrent work converges and gets reviewed), so there is no uncommitted-handoff variant here. If the user set `auto_commit: false` and you are in this mode, the work is still committed per wave — only `super.subagent-driven-development` leaves tasks uncommitted. **Step 2's auto-commit conflict gate surfaces this before any dispatch** — do not rely on the election handoff having warned, because this skill can be entered directly (standalone, or a named-mode triage handoff) with the election phase skipped.

> **Cardinal rule (inherited from the `super.subagent-driven-development` "Core principle" section) — you orchestrate, you never implement.** Every task is implemented by a **dispatched implementer subagent** (Agent/Task tool), never by you inline — this holds for a **single-task wave** as much as a parallel one (not "small enough to just do"; dispatched with the full per-task gates). If you catch yourself editing a file directly, STOP.

## When to Use

**Tier guard (election-time).** This skill — per-task subagent dispatch in-tree — is a **Large/Complex** execution mechanism. At election, **Small/Medium** features route to inline execution + combined gate (`super.using-superpowers/references/medium-inline-path.md`) instead of here. This gate governs *whether to enter*, consistent with the note below; it does not turn into a runtime escape hatch once the skill is deliberately invoked.

> **This section is the election phase — *whether to enter* this skill, NOT a runtime escape hatch.** Once the user has explicitly invoked `super.parallel-subagent-in-tree`, execute the plan **with this skill**: a sequential/single-task plan goes through Step 4's single-task branch (one dispatched subagent per task), never by bouncing to `super.subagent-driven-development` or collapsing into inline execution.

Decision flow:
- Tasks index with Execution Waves? → no / old plan: `super.subagent-driven-development`.
- Any wave with 2+ tasks? → no (fully sequential): `super.subagent-driven-development`.
- Worktree isolation cheap & available? → yes: `super.parallel-subagent-development`.
- Wave write-sets verified disjoint? → yes: `super.parallel-subagent-in-tree`. → no: run that wave sequentially via `super.subagent-driven-development`.

Why over worktrees: in a pnpm/npm/yarn **workspace monorepo** each worktree is a separate dir that doesn't inherit `node_modules` (workspace symlinks don't cross worktrees, so each needs its own install); when that cost — or a sandbox forbidding checkouts, or an N-way merge — outweighs the parallel work saved, stay in-tree. In-tree cannot parallelize a wave whose tasks must mutate shared files — use worktrees for those.

If `parse-waves.cjs` reports `parallelizable: false`, this skill offers no speedup over `super.subagent-driven-development` (per-task gates are identical). You may *note* that once, but — per the election-phase rule above — still execute here, one implementer subagent per task (a fully-sequential plan is just single-task waves, Step 4).

## The Process

### Step 1: Locate the plan and compute waves

Discover the tasks index as `super.subagent-driven-development` does (explicit path in context, else `docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md`, else a `tasks-*.md` in the feature's `plans/`). Compute the waves deterministically; the wave engine lives in the worktree skill and is shared verbatim — do not re-derive it:

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index <path>
```

Read `waves`, `waveKinds` (per-wave `"parallel"`/`"sequential"`, 1:1 with `waves`), `parallelizable`, `maxParallelWave`, per-task `dependsOn`, `suggestedTier`, and `errors`. **Read the kind from `waveKinds[i]`, never infer it from `wave.length`.** **Stop and fix the plan if `errors` is non-empty** — a cycle or dangling dependency makes parallel execution unsafe; send the user back to `super.writing-plans`. Also run `parse-tasks.cjs` to skip already-`[x]` tasks (session resume) and detect index/file mismatches.

### Step 2: Memory gate + caveman + model selection

Apply the policy from `super.parallel-subagent-development`, "Step 2" verbatim. In-tree delta: propagate the rendered caveman block into **every** subagent prompt when active — a parallel wave fans out many implementers, so one hand-fill mistake multiplies across the wave. Model selection (`model:` from `**Tier:**`) and the tier-binding gate are identical; see `super.subagent-driven-development/SKILL.md`, "Model Selection".

**Auto-commit conflict gate (in-tree delta — per wave, not per task):** the inherited Step 2 gate applies, but here the integration barrier commits **once per wave**. So if `read-preferences.cjs` reports `found: true` **and** `workflow.auto_commit: false`, **STOP before the first wave** and offer the same explicit choice — never commit silently under `auto_commit: false`: **(a) proceed** accepting per-wave commits, or **(b) switch** to `super.subagent-driven-development` (sequential), the only mode that leaves tasks uncommitted. Surface the conflict and its options in the session's `communication.language` (the field the same `read-preferences.cjs` call returns — default `pt-BR`); the English here is structure, not verbatim text — the shared user-facing-language rule (see `super.subagent-driven-development`, Branch Guard).

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

**Single-task wave (`waveKinds[i] === "sequential"):** run it exactly like `super.subagent-driven-development` does a task — dispatch a fresh implementer subagent in the shared tree, then spec review → code quality review → `super.verification-before-completion`, then the orchestrator marks status via `mark-task-status.cjs` (never the implementer). Run the mandatory `validate-dispatch.cjs` pre-flight first; the `single_agent` note is a warning, not an error, and the tier↔model gate still fires. The lone implementer may commit its own task's code normally, but must not touch tracker files.

**Multi-task wave (`waveKinds[i] === "parallel"`):** run the tasks concurrently in the shared tree, guarded by the three invariants. **Full procedure (bash, edge cases, commit conventions) in `./references/integration-barrier.md` — read it and follow it.** The steps:

1. **Disjointness gate** (before dispatching) — `node <super.parallel-subagent-in-tree-base-dir>/scripts/check-wave-disjoint.cjs --tasks-index <path> --tasks <wave-task-numbers>` (prefer `--tasks`; `--wave <N>` works only with an explicit `## Execution Waves` section). Parallelize **only if** `safeForInTreeParallel: true`; on `false` (a `writeOverlap` — two tasks write the same file; a `readWriteHazard` — one task reads what another writes, a stale-read risk; or an `unverifiable` task with no parseable `## Arquivos` write-set) **do not parallelize this wave in-tree**: run it sequentially or use `super.parallel-subagent-development`. Keep the per-task `writeSet` arrays for step 4.
2. **Set status** — before dispatching, flip each `task-NN.md` to `**Status:** IN_PROGRESS` via `mark-task-status.cjs --tasks-index <tasks-<feature>.md> --task-number N --status IN_PROGRESS`.
3. **Dispatch write-only implementers in parallel** — one per task in the **same base tree**, each carrying full task text + PRD + Spec (read the `**PRD:**`/`**Spec:**` fields; never make the subagent read the plan). **Dispatch pre-flight (mechanical model/tier gate — mandatory, run first):** build a dispatch manifest (`modelTiers` from preferences `model_tiers`; one agent per task with `label`, resolved `model`, written `tier`, and the step-1 `writeSet`; `escalationReason` only for an escalation-ladder re-dispatch) and run `node <super.dispatching-parallel-agents-base-dir>/scripts/validate-dispatch.cjs --dispatch <manifest.json>` — **do not dispatch while `valid:false`**. Here it is chiefly the **`tier_model_mismatch`** gate (write-set disjointness is already proven by step 1's `check-wave-disjoint.cjs`): a `model:` off its written tier with no recorded escalation is corrected to the tier's resolution before the fan-out. Deterministic backstop for the "Step 2" pre-dispatch gate. Once `valid:true`: **Per task before the fan-out:** `**Spec:**` must be present and resolve on disk — else **stop and resolve before dispatching that task** (`**PRD:**` is optional: `N/A` is valid; only a non-`N/A` path that fails to resolve is a stop). Prompt = `super.subagent-driven-development/agents/implementer.md` + the scoping block from `./agents/implementer.md`, which **forbids** `git add`/`commit`, repo-wide format/lint autofix/`build`, and touching other tasks' files; each runs **only its scoped test**.
4. **Scope verification gate** (mandatory, before the barrier; no merge-conflict net here) — `git -C "$(git rev-parse --show-toplevel)" status --porcelain`; every changed path must be in the union of step-1 write-sets, **excluding the tracker files you flipped in step 2** (`tasks-<feature>.md`, `task-NN.md`). Any other out-of-scope change means an implementer escaped scope and may have clobbered a sibling — **stop**, revert/reconcile it, re-dispatch that task.
5. **Integration barrier** (orchestrator only, once per wave, never per task) — after scope is verified, run the project's heavy shared-state sequence in order, stopping on the first failure: **format/lint autofix → typecheck → full test suite → build** (map to the project's scripts, e.g. `pnpm lint:fix && pnpm tsc:check && pnpm test && pnpm build`; skip a step only if the project lacks it). Commit (per task or grouped) **only** once green.
6. **Two-stage review per task** — after the barrier is green and committed, spec compliance then code quality reviewer per task (`super.subagent-driven-development/agents/spec-reviewer.md`, `.../code-quality-reviewer.md`); independent, may run concurrently. Per-task **`reviewShape`** from `parse-waves.cjs` scales this: `combined` dispatches one reviewer fusing both lenses (`.../combined-reviewer.md`) instead of the pair, `none` skips the dedicated reviewers — see "Review cost control" in `super.subagent-driven-development`.
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

## Integration

**Required workflow skills:** the shared finish-gate set (`super.writing-plans`,
`super.requesting-code-review`, `super.systematic-debugging`, `super.independent-verification`,
`super.user-story-verification`, `super.finishing-a-development-branch`) is documented once in
**`super.subagent-driven-development/references/finish-tail.md`** ("Required workflow skills"
section) — that file is the single source, do not re-list them here. Mode-specific additions
for this skill:
- **super.subagent-driven-development** — the per-task implementer/spec-reviewer/code-quality-reviewer templates, model-selection policy, and per-task quality contract this skill reuses (note: `super.writing-plans` also produces this skill's `## Arquivos` write-set data consumed by the disjointness gate)

**Shared engine:**
- **super.parallel-subagent-development/scripts/parse-waves.cjs** — single source of truth for wave derivation and `waveKinds` (read, not duplicated)

**Subagents should use:**
- **super.test-driven-development** — implementers follow TDD per task

**Alternatives:**
- **super.parallel-subagent-development** — parallel, one git worktree per task; use when wave tasks mutate shared files or full isolation is wanted
- **super.subagent-driven-development** — sequential, single-workspace; for fully sequential plans
