---
name: super.parallel-subagent-in-tree
description: Use this skill to execute a parallelized implementation plan IN-TREE — running wave tasks concurrently in the SAME working tree without git worktrees. Invoke whenever a tasks index has parallel execution waves and worktree isolation is impractical — pnpm/npm/yarn workspace monorepos (node_modules not shared across worktrees), CI environments forbidding extra checkouts, or plans whose wave tasks touch disjoint files. Safety relies on verified write-set disjointness + write-only/no-commit subagents + a serialized integration barrier per wave. Keeps the same per-task quality gates as super.subagent-driven-development. Use super.parallel-subagent-development when tasks must mutate shared files; use super.subagent-driven-development for fully sequential plans.
---

# Parallel Subagent-Driven Development (in-tree, no worktrees)

Execute an implementation plan **wave by wave**, running each wave's independent tasks **concurrently in the shared base working tree** — no git worktrees. The **`parallel` + `no-isolation`** cell of the execution matrix:

|              | sequential                          | parallel                                     |
|--------------|-------------------------------------|----------------------------------------------|
| **in-tree**  | super.subagent-driven-development   | **super.parallel-subagent-in-tree** (this)   |
| **worktree** | —                                   | super.parallel-subagent-development          |

It reuses the per-task quality machinery of `super.subagent-driven-development` (fresh implementer → spec review → code quality review → `super.verification-before-completion`); only **where** implementers run (one shared tree, not N worktrees) and **how** it is made safe without isolation change.

**Announce at start:** "I'm using the super.parallel-subagent-in-tree skill to execute the plan wave by wave, in the shared tree without worktrees."

**Core principle:** Without worktree isolation, concurrency is safe **only** when three invariants hold together (break one and parallel implementers corrupt each other):

1. **Verified write-set disjointness** — no two tasks in a wave WRITE the same file (checked deterministically from the plan, not by eye).
2. **Write-only / no-commit implementers** — subagents only create/edit their own files and run their scoped test; never `git add`/`commit`, repo-wide `lint:fix`/`format`/`build`, or another task's files.
3. **Serialized integration barrier** — after the wave, the orchestrator alone runs the heavy shared-state sequence once, commits, then runs the two-stage reviews.

> **This mode does not honor `workflow.auto_commit: false`.** The integration barrier commits once per wave by design (it is how the wave's concurrent work converges and gets reviewed), so there is no uncommitted-handoff variant here. If the user set `auto_commit: false` and you are in this mode, the work is still committed per wave — only `super.subagent-driven-development` leaves tasks uncommitted. (The election handoff already warns about this; surface it again if the user is surprised.)

> **Cardinal rule (inherited from `super.subagent-driven-development` § Core principle) — you orchestrate, you never implement.** Every task is implemented by a **dispatched implementer subagent** (Agent/Task tool), never by you inline — this holds for a **single-task wave** as much as a parallel one (not "small enough to just do"; dispatched with the full per-task gates). If you catch yourself editing a file directly, STOP.

## When to Use

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

Identical policy to `super.parallel-subagent-development § Step 2` — apply it, don't reinvent it. The **Session State Re-Entry Guard** runs **unconditionally** on resume and restores the FULL `session_*` set (not just caveman): run `derive-session-state.cjs` (single source of truth for the mapping and platform gating) per `super.subagent-driven-development/SKILL.md § Session State Re-Entry Guard`, otherwise `/simplify` and the final `/code-review` silently default off on a mid-execution resume. Run the memory gate only if `session_memory_enabled = true`. Caveman is idempotent — invoke `/caveman` only when `session_caveman_in_effect = false`, then set it true; never re-invoke if already in effect. Render the caveman block deterministically (`node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs --active <session_caveman_active> --level <session_caveman_level>`, paste the `block` field) and propagate it into **every** subagent prompt when active — never hand-assemble it; a parallel wave fans out many implementers, so one hand-fill mistake multiplies across the wave. Model: set an explicit `model:` per dispatch from each task's `**Tier:**` (`parse-waves.cjs`'s `suggestedTier`), **never omit it** (omitting inherits your model and over-provisions the wave).

### Step 3: Confirm the base branch

All work happens on the **base branch** in the shared tree — every wave commits straight onto it, so starting on the wrong branch lands the whole feature there. Before the first wave, run the same deterministic check as the sequential skill's § Branch Guard (skip on resume, when a wave is already committed):

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

**Single-task wave (`waveKinds[i] === "sequential"`):** run it exactly like `super.subagent-driven-development` does a task — **dispatch a fresh implementer subagent** (carrying its resolved `model:` + full task text + PRD + Spec) in the shared tree, then spec review → code quality review → `super.verification-before-completion`, then mark `[x]` / `DONE`. *Dispatch one subagent* — NOT implement it yourself inline, NOT hand the plan to `super.subagent-driven-development`. With no concurrency to protect, this lone implementer may commit its own task normally (no scoping block, no barrier), but it is still a dispatched subagent.

**Multi-task wave (`waveKinds[i] === "parallel"`):** run the tasks concurrently in the shared tree, guarded by the three invariants. **Full procedure (bash, edge cases, commit conventions) in `./references/integration-barrier.md` — read it and follow it.** The steps:

1. **Disjointness gate** (before dispatching) — `node <super.parallel-subagent-in-tree-base-dir>/scripts/check-wave-disjoint.cjs --tasks-index <path> --tasks <wave-task-numbers>` (prefer `--tasks`; `--wave <N>` works only with an explicit `## Execution Waves` section). Parallelize **only if** `safeForInTreeParallel: true`; on `false` (a `writeOverlap` — two tasks write the same file; a `readWriteHazard` — one task reads what another writes, a stale-read risk; or an `unverifiable` task with no parseable `## Arquivos` write-set) **do not parallelize this wave in-tree**: run it sequentially or use `super.parallel-subagent-development`. Keep the per-task `writeSet` arrays for step 4.
2. **Set status** — before dispatching, flip each `task-NN.md` to `**Status:** IN_PROGRESS` via `mark-task-status.cjs --tasks-index <tasks-<feature>.md> --task-number N --status IN_PROGRESS`.
3. **Dispatch write-only implementers in parallel** — one per task in the **same base tree**, each carrying full task text + PRD + Spec (read the `**PRD:**`/`**Spec:**` fields; never make the subagent read the plan). **Per task before the fan-out:** `**Spec:**` must be present and resolve on disk — else **stop and resolve before dispatching that task** (`**PRD:**` is optional: `N/A` is valid; only a non-`N/A` path that fails to resolve is a stop). Prompt = `super.subagent-driven-development/agents/implementer.md` + the scoping block from `./agents/implementer.md`, which **forbids** `git add`/`commit`, repo-wide format/lint autofix/`build`, and touching other tasks' files; each runs **only its scoped test**.
4. **Scope verification gate** (mandatory, before the barrier; no merge-conflict net here) — `git -C "$(git rev-parse --show-toplevel)" status --porcelain`; every changed path must be in the union of step-1 write-sets, **excluding the tracker files you flipped in step 2** (`tasks-<feature>.md`, `task-NN.md`). Any other out-of-scope change means an implementer escaped scope and may have clobbered a sibling — **stop**, revert/reconcile it, re-dispatch that task.
5. **Integration barrier** (orchestrator only, once per wave, never per task) — after scope is verified, run the project's heavy shared-state sequence in order, stopping on the first failure: **format/lint autofix → typecheck → full test suite → build** (map to the project's scripts, e.g. `pnpm lint:fix && pnpm tsc:check && pnpm test && pnpm build`; skip a step only if the project lacks it). Commit (per task or grouped) **only** once green.
6. **Two-stage review per task** — after the barrier is green and committed, spec compliance then code quality reviewer per task (`super.subagent-driven-development/agents/spec-reviewer.md`, `.../code-quality-reviewer.md`); independent, may run concurrently.
7. **Verify** — `super.verification-before-completion` against the base branch.
8. **Update the tracker** — only after the wave verifies, mark each task `DONE` via `mark-task-status.cjs … --status DONE` (flips `[ ]`→`[x]`, `IN_PROGRESS`→`DONE`).

> **`/simplify` (opt-in, Claude Code only; additive — never a review).** If `session_simplify_enabled`, the orchestrator runs `/simplify` on the wave's changed files between step 4 (scope verified) and step 5 (barrier) — never the concurrent implementers, so the barrier validates and commits the simplified code (skip if no code changed). It *applies* cleanups, so it never duplicates the spec/quality gates; the optional final review pass is handled at Finish. Off or non-matching platform → skip. See `super.using-superpowers/references/claude-code-tools.md` / `copilot-tools.md`.

If a task in a parallel wave is BLOCKED or fails review repeatedly, use the same status logic and **review-loop cap** as the sequential skill: a reviewer rejecting a task across ~3 non-converging rounds is escalated like a `BLOCKED` implementer, never looped forever. A verified bug or failing test while implementing is a debugging problem, not a review nit — route it to **super.systematic-debugging** (capped 4-phase loop), then resume the task's gates. A BLOCKED implementer that needs another wave task's output means the wave was mis-classified as independent — serialize it; never let it write a sibling's files.

### Step 5: Finish

Identical tail to `super.subagent-driven-development`:
1. **Final code review over the entire integrated implementation.** Always dispatch the final code reviewer subagent (broad: architecture / security / testing / project principles). **Then, as an extra bug-focused pass: if `session_code_review_final_enabled` (Claude Code) → also run `/code-review <session_code_review_effort>` (default `medium`); if `session_copilot_review_final_enabled` (Copilot CLI) → also run the native `review` skill.** Complementary layers (broad review + focused bug net), not duplicate.

   **Findings are fixed, not just reported.** Pool the findings from every pass that ran. For each **Critical / Important** finding, dispatch a fresh implementer subagent to fix it **on the integrated shared tree** (the waves are done), then re-run the review pass that raised it. Loop until no Critical/Important findings remain — **capped**: if the same finding survives ~2 fix rounds (a fix reintroduces it or fails to clear it), stop and route it to **super.systematic-debugging** or escalate to the human; never loop on an oscillating finding. **Minor** findings: fix if cheap, else list them for the user; they do not block. Do not proceed to the QA gate or finishing while a Critical/Important finding is open. The per-task spec + quality gates already ran and are unaffected.
2. **QA gate** — if a PRD exists, ask the user whether to run `super.user-story-verification` (consent-based). `PASSED`/`PARTIAL` → continue; `FAILED` → stop and report.
3. **Done-state gate (deterministic — before handoff).** Run `<super.subagent-driven-development-base-dir>/scripts/parse-tasks.cjs --assert-all-done --tasks-index <path>`; it exits non-zero if any task is not `[x]`/`Status: DONE` or the index and a task file disagree. Concurrent waves make a missed checkbox easy — fix any open/mismatched task with `mark-task-status.cjs` first.
4. Deactivate caveman if active ("normal mode"), set `session_caveman_in_effect = false`, then invoke `super.finishing-a-development-branch`, passing the tasks index path (it re-runs the same gate as a backstop).

## Continuous Execution

As in the sequential skill: do not pause between tasks or waves. Stop only for an unresolvable BLOCKED status, genuine ambiguity, a `parse-waves.cjs` error, a `safeForInTreeParallel: false` wave you cannot reclassify, or completion.

## Red Flags

**Never:**
- **Implement a task's code yourself instead of dispatching an implementer subagent** — applies to a single-task wave as much as a parallel one. No task is "small enough to do inline"; inline work skips model selection, both reviews, and the verification gate.
- **Silently switch to `super.subagent-driven-development` (or any other execution skill) after the user explicitly invoked this one** just because the remaining waves are sequential/single-task. Execute here per Step 4's single-task branch; *note* the lack of speedup once, but do not abandon the chosen skill.
- Parallelize a wave `check-wave-disjoint.cjs` reports as `safeForInTreeParallel: false`. A `writeOverlap` or `unverifiable` task means disjointness is unproven; running it concurrently in one tree is the exact corruption this mode avoids. Run it sequentially or use worktrees.
- Let a parallel implementer `git add`/`commit`, run repo-wide format/lint autofix/`build`, or touch a file outside its own write-set. Those mutate shared state and are the orchestrator's job at the barrier — concurrent subagents doing them clobbers the shared tree.
- Skip the **scope verification gate** (step 4) and run the barrier on faith. With no merge-conflict net, confirming actual changes ⊆ declared write-sets is the only thing that catches an under-declared `## Arquivos` or an out-of-scope write before it corrupts a sibling.
- Run the integration barrier per-task instead of once per wave, or commit before the project's format/lint → typecheck → test → build sequence is green.
- Infer a wave's kind from `wave.length` instead of reading `waveKinds[i]`.
- Parallelize tasks `parse-waves.cjs` placed in different waves, or proceed when it reports `errors`.
- Skip the two-stage review, the final review, the consent-based QA gate, or the tracker edits.
- Mark a task `[x]` before the barrier-verified result passes `super.verification-before-completion`.
- Start parallel work on `main`/`master` without explicit user consent — Step 3 enforces this with a deterministic check before the first wave; do not commit a wave until it passes (or the user consents).

**No-disjointness fallback:** when a wave is not provably disjoint (overlap or unverifiable), the safe degradation is **sequential execution of that wave** in dependency order (behave like `super.subagent-driven-development` for it), or escalate to `super.parallel-subagent-development` if isolation is worth its cost. Never "just run them concurrently anyway" — sequential-but-correct beats parallel-but-corrupt.

## Integration

**Required workflow skills:**
- **super.subagent-driven-development** — the per-task implementer/spec-reviewer/code-quality-reviewer templates, model-selection policy, and per-task quality contract this skill reuses
- **super.writing-plans** — produces the `**Depends on:**`, `## Arquivos`, and `## Execution Waves` data this skill consumes
- **super.requesting-code-review** — code review template for reviewer subagents
- **super.user-story-verification** — consent-based QA gate before finishing (when a PRD exists)
- **super.finishing-a-development-branch** — completes development after all waves

**Shared engine:**
- **super.parallel-subagent-development/scripts/parse-waves.cjs** — single source of truth for wave derivation and `waveKinds` (read, not duplicated)

**Subagents should use:**
- **super.test-driven-development** — implementers follow TDD per task

**Alternatives:**
- **super.parallel-subagent-development** — parallel, one git worktree per task; use when wave tasks mutate shared files or full isolation is wanted
- **super.subagent-driven-development** — sequential, single-workspace; for fully sequential plans
