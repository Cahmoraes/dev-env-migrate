---
name: super.parallel-subagent-development
description: Use execute implementation plan in PARALLEL — running independent tasks concurrently, each isolated in its own git worktree, while dependent tasks stay sequential, then integrating everything into base branch. Trigger whenever user wants parallelize, speed up, run plan tasks same time instead one-by-one, mentions running tasks in worktrees, says some tasks independent / disjoint / don't depend on each other, or asks exploit parallelism / Execution Waves in plan — even don't name skill. Keeps SAME per-task quality gates super.subagent-driven-development (fresh implementer + spec review + code-quality review + verification-before-completion), just distributed across worktrees wave by wave. third execution option offered super.writing-plans, alongside subagent-driven (sequential) and inline execution. Use super.subagent-driven-development instead only when plan single dependent chain nothing parallelize.
---

# Parallel Subagent-Driven Development

Execute the implementation plan **wave by wave**. Tasks within a wave are independent (planner declared no dependencies), run **concurrently, each in its own isolated git worktree**, then integrate into the base branch. Waves run in order — a wave starts only once the previous one is fully integrated and verified.

This skill does not replace `super.subagent-driven-development`; it reuses the entire per-task quality machinery (fresh implementer → spec compliance review → code quality review → `super.verification-before-completion`) and only adds **wave orchestration + worktree isolation** so independent tasks don't wait on each other.

> **This mode does not honor `workflow.auto_commit: false`.** Each task commits on its own worktree branch (`wt/<feature>-task-NN`) — that commit is what gets merged into the base branch, so per-task commits are structurally required and cannot be skipped. If the user set `auto_commit: false` and you are in this mode, the work is still committed per task; only `super.subagent-driven-development` leaves tasks uncommitted. (The election handoff already warns about this; surface it again if the user is surprised.)

**Announce at start:** "I'm using super.parallel-subagent-development to execute the plan wave by wave."

**Core principle:** Parallelism is only safe across isolated workspaces — two implementers must never edit the same tree at once, so each parallel task gets its own worktree. Every task runs through a **dispatched implementer subagent** (Agent/Task tool) in its worktree, never inline; a single-task (sequential) wave holds exactly like a parallel one. A lone task is not "small enough to just do" — dispatch it with full per-task gates. If you catch yourself editing a file directly, STOP: inline work bypasses the spec review, code-quality review, model selection, and verification gate this skill enforces.

## When Use

```
tasks index Execution Waves?
├─ no (no waves / old plan) → super.subagent-driven-development
└─ yes → Any wave 2+ tasks?
   ├─ no (fully sequential) → super.subagent-driven-development
   └─ yes (parallelizable) → Stay in session?
      └─ yes → super.parallel-subagent-development
```

If `parse-waves.cjs` reports `parallelizable: false`, tell the user the plan has no parallelism to exploit and recommend `super.subagent-driven-development` (fully sequential work here adds worktree overhead for no speedup). Proceed only if the user still wants to.

## Process

### Step 1: Locate plan, compute waves

Discover the tasks index as `super.subagent-driven-development` does (explicit path in context, else `docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md`, else `tasks-*.md` in the feature's `plans/`), then compute waves deterministically. The skill context header shows the base directory:

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index <path>
```

The JSON gives `waves` (execution order; inner entries run in parallel), `waveKinds` (per-wave kind, 1:1 with `waves`: `"parallel"`/`"sequential"`), `parallelizable`, `maxParallelWave`, and per-task `dependsOn`. Run `parse-tasks.cjs` to find tasks already `[x]` (session resume) and index/file mismatches — skip completed tasks.

### Step 2: Memory gate + caveman

Same policy as `super.subagent-driven-development` — apply it, don't reinvent it. Memory and caveman come from `.superpowers/preferences.yml`, so **honor whatever the user configured there** (caveman on/off, its level, memory enabled).

- **Memory gate** (only if `session_memory_enabled = true`): verify planning artifacts were persisted (`pmem search "<feature-name>"`); if absent, run the persistence procedure before dispatching. See `super.subagent-driven-development/SKILL.md § Memory Gate Check`.

- **Caveman** — run these two steps before dispatching any implementer (the same guard `super.subagent-driven-development` runs, inlined so a parallel session entered directly still honors the preference):
  1. **Session State Re-Entry Guard — restore ALL session variables, not just caveman.** Unconditionally re-derive the **entire** set in one deterministic call per `super.subagent-driven-development/SKILL.md § Session State Re-Entry Guard` — never first check whether the variables are still known, because a wiped flag reverted to `false` is indistinguishable from one the user deliberately disabled. Restoring only caveman is the silent-drop bug where `/simplify` (Step 4) and the final `/code-review` (Step 5) default off after a mid-execution resume:
     ```bash
     node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs \
       --platform claude-code --repo-root "$(git rev-parse --show-toplevel)"
     ```
     Restore each `session_*` variable from the script's `sessionState` object (the single source of truth for the mapping and platform gating). Also check for `**Status:** IN_PROGRESS` task files to resume mid-wave — and in worktree mode, check whether that task's branch (`wt/<feature>-task-NN`) already exists with commits before recreating it: if so, complete its merge when ready, else delete the branch and re-dispatch. Never recreate a worktree over an existing task branch.
  2. **State check (idempotent).** If `session_caveman_active = true` **and `session_caveman_in_effect = false`**, invoke `/caveman <session_caveman_level>` now and set `session_caveman_in_effect = true`; if already in effect (activated at the gate or re-activated post-compaction), **do not re-invoke**. Keep it active through every wave (implementers, spec and code-quality reviewers, QA gate) and propagate the caveman block into **every** subagent prompt you dispatch, so each parallel-worktree implementer runs at the **same** level. **Render the block deterministically — never hand-assemble it** (a parallel wave fans out many prompts at once, so a hand-fill mistake multiplies across the whole wave): `node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs --active <session_caveman_active> --level <session_caveman_level>` and paste its `block` field verbatim. If instead `session_caveman_active = false` and `session_caveman_prompted = false`, you may ask the dynamic question once (see `super.using-superpowers` Caveman Mode). Deactivate caveman ("normal mode") only before invoking `super.finishing-a-development-branch`.

  Full detail (exact subagent block, IN_PROGRESS resume, deactivation timing) lives in `super.subagent-driven-development/SKILL.md § Caveman Mode Activation`.

- **Model selection**: set an explicit `model:` on every implementer dispatch, resolved from that task's tier per `super.subagent-driven-development/SKILL.md § Model Selection` — **never omit it (omitting inherits your model and over-provisions)**. Each task's `**Tier:**` (surfaced as `parse-waves.cjs`'s `suggestedTier`) is the default; override when you know better. A parallel wave dispatches many at once, so inheriting an expensive model on mechanical tasks multiplies the waste.

### Step 3: Confirm the base branch and worktree strategy

Parallel work spawns worktrees off the **base branch** — the branch where the integrated result lands, so it is where the whole feature ultimately commits. Before the first wave, run the same deterministic check as the sequential skill's § Branch Guard (skip on resume, when a wave is already integrated):

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
DEFAULT=${DEFAULT:-$(git branch --list main master | tr -d ' *+' | head -1)}
echo "current=$BRANCH default=${DEFAULT:-<none>}"
```

If `BRANCH` is `main`/`master` or equals `DEFAULT`, **STOP and ask the user** before spawning any worktree — offer to create a feature branch (`git checkout -b <feature-name>`) or to integrate onto the default branch with their explicit consent.

Read `./references/integrating-worktrees.md` before the first parallel wave — it defines per-task worktree creation, integration/merge order, conflict handling, and the sandbox fallback. Worktree creation defers to `super.using-git-worktrees` (native tool first, `git worktree add` fallback), once per parallel task.

### Step 4: Execute wave by wave

For each wave, in order. **Branch strictly on `waveKinds[i]`** — that field, not your judgment about how "small" or "independent" a wave looks, decides whether it runs in-tree or in worktrees:

> **Worktree invariant (non-negotiable):** A `parallel` wave gets **one isolated worktree per task — always — whenever worktrees are available.** The only paths that legitimately touch the shared base tree are a `sequential` (single-task) wave and the explicit blocked-worktree fallback (§ Sandbox / no-worktree fallback). There is no third path. Running a `parallel` wave's tasks in the base tree — two at once *or one after another to "save" worktree setup* — is forbidden: it discards isolation, the clean per-task baseline, the per-task branch + `--no-ff` merge audit trail, and the merge-conflict-as-missed-dependency signal.

**Single-task wave (`waveKinds[i] === "sequential"`):** Run it exactly like `super.subagent-driven-development` runs a task — current working tree, no worktree. Set `Status: IN_PROGRESS`, dispatch the implementer with full task + PRD + Spec context, run spec review → code quality review → `super.verification-before-completion`, then mark `[x]` / `DONE` on disk. Nothing to parallelize, so don't pay worktree cost.

**Multi-task wave (`waveKinds[i] === "parallel"`):** Run the tasks concurrently, each isolated (worktrees mandatory here per the invariant). **Read `./references/wave-execution.md` and follow it** — it carries the exact script invocations, the PRD/Spec guard, the pre-merge gate, and the BLOCKED/failed-review handling (review-loop cap, route bugs to `super.systematic-debugging`, never block independent siblings). The ordered steps:
1. **Set status** — set every task's `task-NN.md` to `**Status:** IN_PROGRESS` on disk before dispatching (`mark-task-status.cjs`).
2. **One worktree per task** — branch off the base branch, each with its own setup + clean baseline (see `./references/integrating-worktrees.md`).
3. **Dispatch implementers in parallel** — one per task, pinned to its worktree, carrying the full task + PRD + Spec. PRD/Spec guard: `**Spec:**` must resolve on disk or stop; `**PRD:**` `N/A` is valid. Base prompt `super.subagent-driven-development/agents/implementer.md` + the worktree scoping block from `./agents/implementer.md`. Each implements, tests, commits inside its worktree, then self-reviews.
4. **Two-stage review per task** — spec compliance reviewer then code quality reviewer against the worktree diff (`spec-reviewer.md`, `code-quality-reviewer.md`); loops stay in the worktree, can run concurrently across the wave.
5. **Integrate** — run `check-integration.cjs` before touching the base branch; merge **only if** `readyToIntegrate: true`, then integrate one at a time in its `mergeOrder`. Sequential by design.
6. **Verify the merged result** — run `super.verification-before-completion` against the **base branch** (full suite), not just per-worktree results.
7. **Update the tracker** — only after the merged result verifies, set `- [x]` in the index and `Status: DONE` in `task-NN.md` (`mark-task-status.cjs`, atomic).
8. **Clean up worktrees** — remove them before the next wave.

> **`/simplify` (opt-in, Claude Code only; additive — never a review).** If `session_simplify_enabled`, run `/simplify` inside each task's worktree between step 3 (implementer committed + self-reviewed) and step 4 (that task's review), isolated like the rest of the task (skip no-code tasks). It *applies* cleanups, so it never duplicates the spec/quality gates. The optional final review pass (`/code-review` on Claude Code, `review` on Copilot CLI) is handled at the Finish step below. Off or non-matching platform → skip. See `super.using-superpowers/references/claude-code-tools.md` / `copilot-tools.md`.

### Step 5: Finish

After all waves are integrated and verified on the base branch, the tail is identical to `super.subagent-driven-development`:
1. **Final code review over the entire integrated implementation.** Always dispatch the final code reviewer subagent (broad: architecture / security / testing / project principles). **Then, as an extra bug-focused pass: if `session_code_review_final_enabled` (Claude Code) → also run `/code-review <session_code_review_effort>` (default `medium`); if `session_copilot_review_final_enabled` (Copilot CLI) → also run the native `review` skill.** Complementary layers (broad review + focused bug net), not duplicate.

   **Findings are fixed, not just reported.** Pool the findings from every pass that ran. For each **Critical / Important** finding, dispatch a fresh implementer subagent to fix it **on the integrated base branch** (the waves are done — no worktree), then re-run the review pass that raised it. Loop until no Critical/Important findings remain — **capped**: if the same finding survives ~2 fix rounds (a fix reintroduces it or fails to clear it), stop and route it to **super.systematic-debugging** or escalate to the human; never loop on an oscillating finding. **Minor** findings: fix if cheap, else list them for the user; they do not block. Do not proceed to the QA gate or finishing while a Critical/Important finding is open. The per-task spec + quality gates already ran and are unaffected.
2. **QA gate** — if a PRD exists, ask the user whether to run `super.user-story-verification` (consent-based). `PASSED`/`PARTIAL` → continue; `FAILED` → stop and report.
3. **Done-state gate (deterministic — before handoff).** Run `<super.subagent-driven-development-base-dir>/scripts/parse-tasks.cjs --assert-all-done --tasks-index <path>`; it exits non-zero if any task is not `[x]`/`Status: DONE` or if the index and a task file disagree. Parallel waves make a missed checkbox especially easy — fix any open or mismatched task with `mark-task-status.cjs` before handoff.
4. Deactivate caveman if active ("normal mode"), set `session_caveman_in_effect = false`, then invoke `super.finishing-a-development-branch`, passing the tasks index path (it re-runs the same gate as a backstop).

## Continuous Execution

As in the sequential skill: do not pause to check in between tasks or waves. Execute every wave without stopping for "should I continue?" prompts. Stop only for an unresolvable BLOCKED status, genuine ambiguity, a `parse-waves.cjs` error, or completion.

## Red Flags

**Never:**
- Run two implementers against the **same** working tree at once — parallelism requires one worktree per task.
- Run a `parallel` wave's tasks in the shared base tree **serially** to skip worktree setup. "Not at once" does not make it safe — a `parallel` wave (per `waveKinds`) requires one worktree per task whenever worktrees are available; the only sanctioned in-tree paths are a `sequential` wave or the blocked-worktree fallback.
- Infer a wave's kind from `wave.length` instead of reading `waveKinds[i]`.
- Parallelize tasks `parse-waves.cjs` placed in different waves — a later wave depends on an earlier one and must wait.
- Proceed when `parse-waves.cjs` reports `errors` — fix the dependency graph in `super.writing-plans` first.
- Integrate a worktree whose task has not passed both reviews, or before `check-integration.cjs` reports `readyToIntegrate: true`.
- Mark a task `[x]` before the **merged** result passes `super.verification-before-completion` — per-worktree green is necessary but not sufficient.
- Skip the tracker edits, the final review, or the consent-based QA gate.
- Start parallel work on `main`/`master` without explicit user consent — Step 3 enforces this with a deterministic check before the first worktree; do not spawn worktrees until it passes (or the user consents).

**Sandbox / no-worktree fallback:** If worktree creation is blocked (sandbox denial, no native tool, `git worktree add` permission error), tell the user parallel isolation is unavailable and fall back to sequential execution of the remaining tasks in dependency order — i.e., behave like `super.subagent-driven-development`. Never simulate parallelism inside a single tree.

## Integration

**Required workflow skills:**
- **super.using-git-worktrees** — creates the isolated workspace for each parallel task (once per parallel-wave task)
- **super.subagent-driven-development** — supplies the per-task implementer/spec-reviewer/code-quality-reviewer prompt templates and the per-task quality contract this skill reuses
- **super.writing-plans** — produces the `**Depends on:**` fields and `## Execution Waves` section this skill consumes
- **super.requesting-code-review** — code review template for reviewer subagents
- **super.user-story-verification** — consent-based QA gate before finishing (when a PRD exists)
- **super.finishing-a-development-branch** — completes development after all waves

**Subagents should use:**
- **super.test-driven-development** — implementers follow TDD for each task

**Alternatives:**
- **super.subagent-driven-development** — sequential, single-workspace; for fully sequential plans or when worktrees are unavailable
