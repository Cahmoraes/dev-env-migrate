---
name: super.parallel-subagent-development
description: Use execute implementation plan in PARALLEL — running independent tasks concurrently, each isolated in its own git worktree, while dependent tasks stay sequential, then integrating everything into base branch. Trigger whenever user wants parallelize, speed up, run plan tasks same time instead one-by-one, mentions running tasks in worktrees, says some tasks independent / disjoint / don't depend on each other, or asks exploit parallelism / Execution Waves in plan — even don't name skill. Keeps SAME per-task quality gates super.subagent-driven-development (fresh implementer + spec review + code-quality review + verification-before-completion), just distributed across worktrees wave by wave. third execution option offered super.writing-plans, alongside subagent-driven (sequential) and inline execution. Use super.subagent-driven-development instead only when plan single dependent chain nothing parallelize.
---

# Parallel Subagent-Driven Development

Execute the implementation plan **wave by wave**. Tasks within a wave are independent (planner declared no dependencies), run **concurrently, each in its own isolated git worktree**, then integrate into the base branch. Waves run in order — a wave starts only once the previous one is fully integrated and verified.

This skill does not replace `super.subagent-driven-development`; it reuses the entire per-task quality machinery (fresh implementer → spec compliance review → code quality review → `super.verification-before-completion`) and only adds **wave orchestration + worktree isolation** so independent tasks don't wait on each other.

> **This mode does not honor `workflow.auto_commit: false`.** Each task commits on its own worktree branch (`wt/<feature>-task-NN`) — that commit is what gets merged into the base branch, so per-task commits are structurally required and cannot be skipped. If the user set `auto_commit: false` and you are in this mode, the work is still committed per task; only `super.subagent-driven-development` leaves tasks uncommitted. **Step 2's auto-commit conflict gate surfaces this before any dispatch** — do not rely on the election handoff having warned, because this skill can be entered directly (standalone, or a named-mode triage handoff) with the election phase skipped.

**Announce at start:** "I'm using super.parallel-subagent-development to execute the plan wave by wave."

**Core principle:** Parallelism is only safe across isolated workspaces — two implementers must never edit the same tree at once, so each parallel task gets its own worktree. Every task runs through a **dispatched implementer subagent** (Agent/Task tool) in its worktree, never inline; a single-task (sequential) wave holds exactly like a parallel one. A lone task is not "small enough to just do" — dispatch it with full per-task gates. If you catch yourself editing a file directly, STOP: inline work bypasses the spec review, code-quality review, model selection, and verification gate this skill enforces.

## When Use

**Tier guard (election-time).** This skill — parallel per-task fan-out across worktrees — is a **Large/Complex** execution mechanism. For **Small/Medium** features the router routes to inline execution + combined gate (`super.using-superpowers/references/medium-inline-path.md`) instead of here: don't parallelize per-task dispatch for a feature small enough to write inline. This gate applies at election, before entering the skill; once deliberately invoked, follow the mechanism below unchanged.

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

- **Auto-commit conflict gate (run before any dispatch).** This mode commits per task by design and **cannot** honor `workflow.auto_commit: false` — each task commits on its own worktree branch so it can be merged. Because this skill can be entered directly (standalone, or a named-mode triage handoff that skips the election warning), never assume the user was told. Read the preference deterministically:
  ```bash
  node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root "$(git rev-parse --show-toplevel)"
  ```
  If `found: true` **and** `workflow.auto_commit` is `false`, **STOP before dispatching** and surface the conflict, then wait for an explicit choice — never commit silently under `auto_commit: false`:
  - **(a) Proceed** — accept per-task commits in this mode.
  - **(b) Switch** to `super.subagent-driven-development` (sequential), the only mode that leaves each task uncommitted.

  Surface the conflict and its options in the session's `communication.language` (the field the same `read-preferences.cjs` call above returns — default `pt-BR`); the English here is the gate's structure, not text to print verbatim. This is the shared user-facing-language rule (see `super.subagent-driven-development`, Branch Guard).

  If `workflow.auto_commit` is `true` or the file is absent (`found: false`), proceed without asking.

- **Memory gate** (only if `session_memory_enabled = true`): verify planning artifacts were persisted (`pmem search "<feature-name>"`); if absent, run the persistence procedure before dispatching. See `super.subagent-driven-development/SKILL.md`, "Memory Gate Check" section.

- **Caveman** — run these two steps before dispatching any implementer (the same guard `super.subagent-driven-development` runs, inlined so a parallel session entered directly still honors the preference):
  1. **Session State Re-Entry Guard — restore ALL session variables, not just caveman.** Unconditionally re-derive the **entire** set in one deterministic call per `super.subagent-driven-development/SKILL.md`, "Session State Re-Entry Guard" section — never first check whether the variables are still known, because a wiped flag reverted to `false` is indistinguishable from one the user deliberately disabled. Restoring only caveman is the silent-drop bug where `/simplify` (Step 4) and the final `/code-review` (Step 5) default off after a mid-execution resume:
     ```bash
     node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs \
       --platform claude-code --repo-root "$(git rev-parse --show-toplevel)"
     ```
     Restore each `session_*` variable from the script's `sessionState` object (the single source of truth for the mapping and platform gating). Also check for `**Status:** IN_PROGRESS` task files to resume mid-wave — and in worktree mode, check whether that task's branch (`wt/<feature>-task-NN`) already exists with commits before recreating it: if so, complete its merge when ready, else delete the branch and re-dispatch. Never recreate a worktree over an existing task branch.
  2. **State check (idempotent).** If `session_caveman_active = true` **and `session_caveman_in_effect = false`**, invoke `/caveman <session_caveman_level>` now and set `session_caveman_in_effect = true`; if already in effect (activated at the gate or re-activated post-compaction), **do not re-invoke**. Keep it active through every wave (implementers, spec and code-quality reviewers, QA gate) and propagate the caveman block into **every** subagent prompt you dispatch, so each parallel-worktree implementer runs at the **same** level. **Render the block deterministically — never hand-assemble it** (a parallel wave fans out many prompts at once, so a hand-fill mistake multiplies across the whole wave): `node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs --active <session_caveman_active> --level <session_caveman_level>` and paste its `block` field verbatim. If instead `session_caveman_active = false` and `session_caveman_prompted = false`, you may ask the dynamic question once (see `super.using-superpowers` Caveman Mode). Deactivate caveman ("normal mode") only before invoking `super.finishing-a-development-branch`.

  Full detail (exact subagent block, IN_PROGRESS resume, deactivation timing) lives in `super.subagent-driven-development/SKILL.md`, "Caveman Mode Activation" section.

- **Model selection**: set an explicit `model:` on every implementer dispatch, resolved from that task's tier per `super.subagent-driven-development/SKILL.md`, "Model Selection" section — **never omit it (omitting inherits your model and over-provisions)**. Each task's written `**Tier:**` (surfaced as `parse-waves.cjs`'s `suggestedTier`) is **binding, not a default you may override at will**: run the deterministic pre-dispatch gate — read `**Tier:**` → resolve via `model_tiers.<tier>` (or "auto") → set `model:` to exactly that → **STOP and correct if the model differs and no escalation reason is recorded**. A higher model is legitimate only via the escalation ladder (`BLOCKED`/oscillating review, re-dispatch one tier up with the reason recorded), never a pre-emptive choice because a task feels harder, is later in the plan, or sits in a sequential single-task wave. This skill is the exact place the rule erodes: parallel waves (early) honor the tier, then sequential single-task waves on the session's tail silently drift to the controller's own model — apply the gate per dispatch to stop it. A parallel wave dispatches many at once, so inheriting or upgrading an expensive model on mechanical tasks multiplies the waste.

### Step 3: Confirm the base branch and worktree strategy

Parallel work spawns worktrees off the **base branch** — the branch where the integrated result lands, so it is where the whole feature ultimately commits. Before the first wave, run the same deterministic check as the sequential skill's "Branch Guard" section (skip on resume, when a wave is already integrated):

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

> **Worktree invariant (non-negotiable):** A `parallel` wave gets **one isolated worktree per task — always — whenever worktrees are available.** The only paths that legitimately touch the shared base tree are a `sequential` (single-task) wave and the explicit blocked-worktree fallback (the "Sandbox / no-worktree fallback" section). There is no third path. Running a `parallel` wave's tasks in the base tree — two at once *or one after another to "save" worktree setup* — is forbidden: it discards isolation, the clean per-task baseline, the per-task branch + `--no-ff` merge audit trail, and the merge-conflict-as-missed-dependency signal.

**Single-task wave (`waveKinds[i] === "sequential"`):** Run it exactly like `super.subagent-driven-development` runs a task — current working tree, no worktree. Set `Status: IN_PROGRESS`, then **run the same mandatory dispatch pre-flight** (`validate-dispatch.cjs` on a one-agent manifest carrying this task's `tier` + resolved `model` — a lone-agent manifest still fires the tier↔model gate; `single_agent` is only a warning, not an error) before dispatching. **This is the exact cell where the drift happened** — sequential single-task waves on the session's tail silently upgraded `cheap`→controller model; the pre-flight blocks it here too. Once `valid:true`, dispatch the implementer with full task + PRD + Spec context, run spec review → code quality review → `super.verification-before-completion`, then mark `[x]` / `DONE` on disk. Nothing to parallelize, so don't pay worktree cost.

**Multi-task wave (`waveKinds[i] === "parallel"`):** Run the tasks concurrently, each isolated (worktrees mandatory here per the invariant). **Read `./references/wave-execution.md` and follow it** — it carries the exact script invocations, the PRD/Spec guard, the pre-merge gate, and the BLOCKED/failed-review handling (review-loop cap, route bugs to `super.systematic-debugging`, never block independent siblings). The ordered steps:
1. **Set status** — set every task's `task-NN.md` to `**Status:** IN_PROGRESS` on disk before dispatching (`mark-task-status.cjs`).
2. **One worktree per task** — branch off the base branch, each with its own setup + clean baseline (see `./references/integrating-worktrees.md`).
3. **Dispatch implementers in parallel** — one per task, pinned to its worktree, carrying the full task + PRD + Spec. **Dispatch pre-flight (mechanical model/tier gate — mandatory, run first):** build a dispatch manifest (`modelTiers` from preferences `model_tiers`; one agent per task with its `label`, resolved `model`, written `tier`, `writeFiles`; add `escalationReason` only for an escalation-ladder re-dispatch) and run `node <super.dispatching-parallel-agents-base-dir>/scripts/validate-dispatch.cjs --dispatch <manifest.json>` — **do not dispatch while `valid:false`**. A `tier_model_mismatch` means a `model:` drifted off its written tier with no recorded escalation (correct it to the tier's resolution); `empty_model`/`missing_field` = omitted model; `write_conflict` = two tasks share a file. This is the deterministic backstop for the "Step 2" pre-dispatch gate — it catches the drift even when the prose gate is forgotten on a long session's tail. Then, once `valid:true`: PRD/Spec guard (`**Spec:**` must resolve on disk or stop; `**PRD:**` `N/A` is valid), base prompt `super.subagent-driven-development/agents/implementer.md` + the worktree scoping block from `./agents/implementer.md`. Each implements, tests, commits inside its worktree, then self-reviews.
4. **Two-stage review per task** — spec compliance reviewer then code quality reviewer against the worktree diff (`spec-reviewer.md`, `code-quality-reviewer.md`); loops stay in the worktree, can run concurrently across the wave. Per-task **`reviewShape`** from `parse-waves.cjs` scales this: `combined` dispatches one reviewer fusing both lenses (`combined-reviewer.md`) instead of the pair, `none` skips the dedicated reviewers — see "Review cost control" in `super.subagent-driven-development`.
5. **Integrate** — run `check-integration.cjs` before touching the base branch; merge **only if** `readyToIntegrate: true`, then integrate one at a time in its `mergeOrder`. Sequential by design.
6. **Verify the merged result** — run `super.verification-before-completion` against the **base branch** (full suite), not just per-worktree results.
7. **Update the tracker** — only after the merged result verifies, set `- [x]` in the index and `Status: DONE` in `task-NN.md` (`mark-task-status.cjs`, atomic).
8. **Clean up worktrees** — remove them before the next wave.

> **`/simplify` (opt-in, Claude Code only; additive — never a review).** If `session_simplify_enabled`, run `/simplify` inside each task's worktree between step 3 (implementer committed + self-reviewed) and step 4 (that task's review), isolated like the rest of the task (skip no-code tasks). It *applies* cleanups, so it never duplicates the spec/quality gates. The optional final review pass (`/code-review` on Claude Code, `review` on Copilot CLI) is handled at the Finish step below. Off or non-matching platform → skip. See `super.using-superpowers/references/claude-code-tools.md` / `copilot-tools.md`.

### Step 5: Finish

After all waves are integrated and verified on the base branch, the finish tail is
**identical** to the other execution skills. Run the five finishing gates in order — final
code review → `super.independent-verification` → preference-gated, consent-based QA gate
(`super.user-story-verification`, skipped silently when `session_qa_gate_enabled` is false) →
done-state gate (`parse-tasks.cjs --assert-all-done`) →
deactivate caveman + `super.finishing-a-development-branch` — exactly as specified in the
single canonical source:

> **Follow `super.subagent-driven-development/references/finish-tail.md`** for the full,
> verbatim gate semantics (fix loops, caps, PRD discovery, QA result table, script
> invocations). Do not re-describe the gates here — that file is the source of truth.

**Mode delta (worktrees):** here **the integrated target** is the **base branch** — the waves
are done, so Critical/Important fix implementers dispatched by gate 1 run **on the integrated
base branch, no worktree**. Integration/merge order and worktree cleanup are governed by
`./references/integrating-worktrees.md`.

## Continuous Execution

Shared with the other execution skills — see the "Continuous Execution" section of
`super.subagent-driven-development/references/finish-tail.md`. In short: do not pause between
tasks or waves; stop only for an unresolvable BLOCKED status, genuine ambiguity, a
`parse-waves.cjs` error, or completion.

## Red Flags

**Never:**
- Run two implementers against the **same** working tree at once — parallelism requires one worktree per task.
- Run a `parallel` wave's tasks in the shared base tree **serially** to skip worktree setup. "Not at once" does not make it safe — a `parallel` wave (per `waveKinds`) requires one worktree per task whenever worktrees are available; the only sanctioned in-tree paths are a `sequential` wave or the blocked-worktree fallback.
- Infer a wave's kind from `wave.length` instead of reading `waveKinds[i]`.
- Parallelize tasks `parse-waves.cjs` placed in different waves — a later wave depends on an earlier one and must wait.
- Proceed when `parse-waves.cjs` reports `errors` — fix the dependency graph in `super.writing-plans` first.
- Integrate a worktree whose task has not passed both reviews, or before `check-integration.cjs` reports `readyToIntegrate: true`.
- Mark a task `[x]` before the **merged** result passes `super.verification-before-completion` — per-worktree green is necessary but not sufficient.
- Skip the tracker edits, the final review, or the QA gate while it is enabled (`session_qa_gate_enabled` true) — when the `workflow.qa_gate` preference is off, skipping QA silently is the correct behavior, not a violation.
- Start parallel work on `main`/`master` without explicit user consent — Step 3 enforces this with a deterministic check before the first worktree; do not spawn worktrees until it passes (or the user consents).

**Sandbox / no-worktree fallback:** If worktree creation is blocked (sandbox denial, no native tool, `git worktree add` permission error), tell the user parallel isolation is unavailable and fall back to sequential execution of the remaining tasks in dependency order — i.e., behave like `super.subagent-driven-development`. Never simulate parallelism inside a single tree.

## Integration

**Required workflow skills:** the shared finish-gate set (`super.writing-plans`,
`super.requesting-code-review`, `super.systematic-debugging`, `super.independent-verification`,
`super.user-story-verification`, `super.finishing-a-development-branch`) is documented once in
**`super.subagent-driven-development/references/finish-tail.md`** ("Required workflow skills"
section) — that file is the single source, do not re-list them here. Mode-specific additions
for this skill:
- **super.using-git-worktrees** — creates the isolated workspace for each parallel task (once per parallel-wave task)
- **super.subagent-driven-development** — supplies the per-task implementer/spec-reviewer/code-quality-reviewer/combined-reviewer prompt templates and the per-task quality contract (including the `reviewShape` scaling) this skill reuses

**Subagents should use:**
- **super.test-driven-development** — implementers follow TDD for each task

**Alternatives:**
- **super.subagent-driven-development** — sequential, single-workspace; for fully sequential plans or when worktrees are unavailable
