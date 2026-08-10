---
name: super.subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
argument-hint: "[path-to-tasks-<feature>.md]"
---

# Subagent-Driven Development

Execute the plan by dispatching a fresh subagent per task, with two-stage review after each: spec compliance first, then code quality.

**Why:** subagents get isolated, precisely-crafted context instead of inheriting your session history, so quality stays high, iteration stays fast, and your own context stays free for coordination.

> **Cardinal rule — you are the orchestrator, never the implementer.** You do NOT write, edit, or refactor production code or tests yourself. Your *only* mechanism for implementing a task is dispatching a fresh implementer subagent via the Agent/Task tool — **one subagent per task, no exception, even a plan with a single task or a one-line change.** If you catch yourself opening a file to edit, writing code in your turn, or thinking "this is small, I'll do it inline," STOP: that is the exact failure this skill prevents. Inline work silently skips the two-stage review, per-task model selection, and the verification gate — every quality mechanism below assumes a dispatched subagent produced the code. **Running read-only verification is NOT implementing** — `super.verification-before-completion` (and the serialized integration barrier in `super.parallel-subagent-in-tree`) require *you*, the controller, to run the test suite / typecheck / build and confirm evidence yourself. The prohibition is on *producing* code, never *observing* it. The lone exception is the **reviewers' findings loop**, which still dispatches a fresh implementer to fix each finding — never an inline patch.

**Continuous execution:** do not pause between tasks. The only reasons to stop: an unresolvable BLOCKED status, ambiguity that genuinely prevents progress, or all tasks complete. "Should I continue?" wastes time — execute the plan.

## When to Use

**Tier guard.** This skill — fan-out per task (implementer + two-stage reviewer per task) plus the separate final code review and `super.independent-verification` gates — is the **Large/Complex** execution mechanism. For **Small/Medium** features, the router uses the inline execution + combined gate instead (`super.using-superpowers/references/medium-inline-path.md`): the controller writes code directly, and one fresh Verifier subagent fuses the final review and IV into a single dispatch (QA stays a separate opt-in gate at every tier). Do **not** dispatch a per-task implementer/reviewer for a Small/Medium feature — that is the exact cost this tier guard exists to avoid. The rest of this skill, and everything below, describes the Large/Complex mechanism unchanged.

**Reverse tier mismatch guard (entry only).** If you arrived here but triage classified the feature **Micro/Small/Medium**, proceed only when the user chose this skill explicitly or `super.using-superpowers` routed here on a fan-out recommendation; otherwise the route was accidental — go to `super.using-superpowers/references/medium-inline-path.md`. Both guards, and the entry decision flow, are in `./references/entry-routing.md` (read at entry; settled once execution starts).

## The Process

### Parallelism check — use the right skill for the wave shape

This skill executes tasks **sequentially**. Before the first implementer dispatch, run `parse-waves.cjs` on the tasks index:

> **Resolving `<super.X-base-dir>`:** the skills are siblings — parent of your header's base directory + `/super.X`. Never `glob` for one (`glob` misses dotdirs); a gate script that will not run is a **STOP**, never a skipped gate.

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs \
  --tasks-index <path/to/tasks-<feature-name>.md> && \
node <super.subagent-driven-development-base-dir>/scripts/parse-tasks.cjs \
  --tasks-index <path/to/tasks-<feature-name>.md>
```

**Both parsers go in this one call.** Same index, neither consumes the other's output — splitting costs a round trip and buys nothing. `parse-waves.cjs` answers *what shape is the plan*; `parse-tasks.cjs` answers *what is already done*. Read both JSON objects off the one result.

- `parallelizable: true` and `maxParallelWave > 1` → the plan has independent tasks. **Prefer `super.parallel-subagent-development`** (isolated worktrees) or `super.parallel-subagent-in-tree` (shared tree, disjointness confirmed): same per-task gates, shorter wall-clock. Stay here only if the user chose it or the wave is tightly coupled.
- `waveCount === 1`, single sequential chain → this skill is correct.

Never run a parallelizable plan sequentially just because this skill was invoked — that wastes wall-clock without improving quality.

### Task Tracker Integration

**Discovery:** the path is passed explicitly in context (e.g. `docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md`); if not, look for a `tasks-*.md` in the feature's `plans/`.

> **Deterministic task parsing (preferred):** already run — it rode along with `parse-waves.cjs` above. Re-run standalone only if you entered without that call, or if task files changed since:
> ```bash
> node scripts/parse-tasks.cjs --tasks-index <path>
> ```
> Outputs `found`, `allDone`, `completed[]`, `pending[]`, `inProgress[]`, `mismatches[]`. `completed` skips done tasks (session resume); `pending`+`inProgress` is what remains. Any `mismatches` require manual resolution before proceeding.
> **Fallback:** parse the tasks index by hand if the script is unavailable.

### Session State Re-Entry Guard

> **Run this FIRST — before the Memory Gate, before Caveman, before any dispatch.** Unconditionally, on a fresh start as much as on a resume: a wiped flag is indistinguishable from a deliberately-disabled one, so "the variables still look intact" is not something you can check. Skip it and caveman, `/simplify` and the final `/code-review` pass all silently never fire.

```bash
node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs \
  --platform claude-code --repo-root "$(git rev-parse --show-toplevel)"
```

Restore every `session_*` variable from the script's `sessionState` object — the whole set, in one call, never a hand-mapped subset. Treat `session_caveman_in_effect` and `session_caveman_prompted` as `false`: they are runtime latches, deliberately not in `sessionState`.

**Then, before any dispatch:** resume (never restart) any task left at `**Status:** IN_PROGRESS`.

> **Compaction invariant:** the physical task files (`task-NN.md` and `tasks-<feature-name>.md`) are the single source of truth for completion — `Status: DONE` **and** `[x]`. Session task-list entries and session memory do not count.

> **Why each of those steps exists, and the failure mode it prevents:** `./references/session-state-and-caveman.md`. Read it if a step's intent is unclear — the actions above are complete on their own.

### Branch Guard

> **Run on a fresh start, before the first implementer dispatch.** Skip on a session resume — if any task is already `IN_PROGRESS` or `DONE`, the branch is already established (the "Session State Re-Entry Guard" path) and re-checking would only re-prompt mid-feature.

Implementers commit per task, so the branch you start on is where the **entire feature** lands. Before the first dispatch, confirm you are not about to commit feature work straight onto the repository's default branch:

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
DEFAULT=${DEFAULT:-$(git branch --list main master | tr -d ' *+' | head -1)}
echo "current=$BRANCH default=${DEFAULT:-<none>}"
```

- **`BRANCH` is `main`/`master`, or equals `DEFAULT`** → **STOP and ask the user before dispatching** — offer a feature branch (`git checkout -b <feature-name>`) or explicit consent to proceed on the default branch. Do not dispatch the first implementer until they choose. This is the *active* form of the "never start on main/master without consent" Red Flag: a deterministic check at the point of no return, not a reminder you can read past.
- **non-default branch** → proceed. **`HEAD` (detached) or a worktree** → externally-managed workspace; proceed (finishing handles integration).

> **User-facing language (applies to every consent gate and question in the execution skills).** Surface each STOP, conflict, and option list in the session's `communication.language` (`read-preferences.cjs`, default `pt-BR`). The English here is *structure*, not text to print verbatim.

> **What a compaction takes from THIS file, and where to get it back.** It re-injects only the first 20.000 characters, so everything from Model Selection's tail onward falls past the cut — along with the sentences that would have told you it exists. Recover, never reconstruct — read, do not infer:
> `./references/model-selection.md` (tier→model) · `./references/review-cost-control.md` (**how many reviewers a task gets**: `reviewShape`; downward override forbidden, upward safe) · `./references/red-flag-procedures.md` (**the prohibitions, and what to do when one fires**) · `./references/finish-tail.md` · `./references/code-analysis.md` · `./references/commit-messages.md` · `./references/example-workflow.md`.

### Memory Gate Check

> **Conditional on `session_memory_enabled`** — false → skip to Caveman Mode Activation. (The guard above already restored it; never read `false` from a wiped variable.) **When enabled it is the entry guard for Executando and must not be skipped — one-shot per feature, before the first dispatch. Already ran? Skip: it is not a per-wave checkpoint, and after it execution writes no memory at all.**

Verify the planning artifacts are persisted:

```bash
pmem search "<feature-name>" --limit 3
```

- **Results for this feature** (decisions, scope, artifact paths): memory present — proceed.
- **No results**: planning did not persist. Do it now, before any dispatch — `super.writing-plans/SKILL.md`, "Memory Persistence", and `super.writing-plans/references/memory-persistence.md` hold the exact `pmem add` calls (3 entries: decisions, scope, artifact paths). Do not dispatch until all three are written.
- **Never per wave or per task** — no wave summaries, no review findings; the task files carry those. See `super.persistent-memory`, "Write boundary".

### Caveman Mode Activation

#### Caveman State Check

> **Conditional — caveman is opt-in.** When `session_caveman_active` is false this gate is a no-op: skip to the Execution Loop. Caveman is a presentation preference; it never changes what the loop does.

1. **`session_caveman_active = false` AND `prompted = false`** → ask the dynamic question (`super.using-superpowers`, Caveman Mode) and record the result.
2. **`session_caveman_active = true` AND `session_caveman_in_effect = false`** → invoke `caveman` at `session_caveman_level`, then set `session_caveman_in_effect = true`. Already `true` → **do not re-invoke**, it is loaded. Stays active through tasks, reviews and the QA gate.
3. **Before `super.finishing-a-development-branch`** → deactivate ("normal mode") and set `session_caveman_in_effect = false`, so a later session can re-activate.

**Subagent propagation — render both formats once per activation window, then reuse the two strings; do not re-run the renderer per dispatch, and never hand-assemble the block.** It is a pure function of `session_caveman_active` + `session_caveman_level`, so every subagent in the wave gets the same two strings — re-rendering buys an identical answer at N times the cost. Reuse means pasting the renderer's exact output you hold, never retyping it. **Re-render when, and only when, an input changes:** `session_caveman_level` changed, caveman was deactivated/re-activated, or a compaction wiped the strings (cannot reproduce them verbatim → you do not have them).

```bash
node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs \
  --active <session_caveman_active> --level <session_caveman_level>
node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs \
  --active <session_caveman_active> --level <session_caveman_level> --format field
```

Paste the `block` field verbatim; empty string when inactive → omit the section. Full mechanics and the mis-fill failure mode this replaced: `./references/session-state-and-caveman.md`.

### Execution Loop

> **This section is the core of the skill and is unconditional.** It is not part of the Caveman Mode Activation step above — caveman is a presentation preference; on or off changes nothing here. Run everything below on every execution.
>
> **Read `./references/execution-loop.md` once, before the first dispatch.** What follows is the running *order*; that file carries the mechanics each step needs — the deterministic status writes, the two silent dispatch failure modes, the review-loop caps and the opt-in passes.

**If a tracker exists:**
1. Read the tasks index (`tasks-<feature-name>.md`).
2. Tasks marked `[x]` are completed — skip them entirely (session resume).
3. For each remaining `[ ]` task, read the individual task file for full context.
4. **Read PRD and Spec from each task:** read the `**PRD:**` and `**Spec:**` fields from the task file header and include both files' content in the subagent's context alongside the task steps. The **Spec** is always required — missing, empty, or a path that does not resolve on disk → stop and resolve it before dispatching. The **PRD** is optional (`**PRD:** N/A` is valid; pass `N/A` through); only a non-`N/A` path that fails to resolve is an error. Never dispatch an implementer without its Spec context.
5. **Before dispatching each implementer:** write `**Status:** PENDING` → `**Status:** IN_PROGRESS` in `task-NN.md`, on disk.
6. When ALL gates pass (super.verification-before-completion ✅ + spec review ✅ + code quality ✅), make **two physical edits on disk**: flip the index checkbox `- [ ] N.` → `- [x] N.` in `tasks-<feature-name>.md` **and** set `**Status:** DONE` in `task-NN.md`.

   > Both writes go through `scripts/mark-task-status.cjs` — exact invocations, the JSON to inspect and the manual fallback are in `./references/execution-loop.md`, "Tracker writes are physical edits on disk". A real file edit, never a session task-list entry or a mental note: these edits are the authoritative audit record, and `super.finishing-a-development-branch` reads the index directly, so without them the branch cannot be finished and the history cannot be audited.

**If no tracker exists:**
Extract tasks from a plan file if one was passed directly. Note in the log: "No task tracker found; using plan file directly."

**Setup:** Read plan + task tracker, extract tasks, skip completed ones. Mirror them into the session task list only if a task tool is already in the toolset — never spend a tool-discovery call on it; the task files on disk are the source of truth either way.

**Per task (sequential):**
1. Dispatch implementer subagent (`./agents/implementer.md`). If it asks questions → answer/provide context → re-dispatch. **After dispatching, await its result — never poll.** The subagent runs in the background and the harness re-invokes you when it returns; simply wait. Do **not** `sleep` or schedule a wakeup/timer to "check on" a subagent you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow.
   > **A dispatch that errors at launch has NOT run its gate — re-dispatch it before advancing.** An error returned *in place of* a subagent handle is a gate that never started, not a gate that passed; it skips the stage with no failing signal. Never let a spec review, code-quality review or verification count as satisfied unless its subagent actually launched and returned a verdict. That failure mode and what "await" means on a platform that does not auto-reinvoke are in `./references/execution-loop.md`, "Dispatch failure modes".
2. Implementer implements, tests, commits, self-reviews.
3. Dispatch spec reviewer subagent (`./agents/spec-reviewer.md`). If code does not match spec → implementer fixes, and you MUST hand it the reviewer's verdict — every finding with its `file:line` (paste into the implementer's `## Review Findings to Address` section on a fresh dispatch, or send as the follow-up message if the same implementer subagent is still active) — so a cheap implementer knows precisely what to correct → re-review. Loop until ✅; the task is not complete while any finding is open.
4. Dispatch code quality reviewer subagent (`./agents/code-quality-reviewer.md`). If not approved → implementer fixes, handed the reviewer's Critical/Important findings (with `file:line`) the same way → re-review. Loop until ✅.
   > **The loop is capped, and its shape varies.** A reviewer rejecting the same task across ~3 rounds without converging → stop and treat it like a `BLOCKED` implementer ("Handling Implementer Status" below). The pair above is the `two-stage` shape: `parse-waves.cjs` may instead mark a task `combined` (**one** fused reviewer, `./agents/combined-reviewer.md`) or `none` (skip both dedicated reviewers). The findings-loop-until-✅ rule is unchanged in every shape. See "Review cost control" below and `./references/execution-loop.md`, "Review loop bounds".
5. Run `super.verification-before-completion` at **per-task scope** — the tests **affected** by this task (its touched file/module + what imports it), not the whole suite (see that skill's "Scope" section). The complete suite is **not** re-run here; it runs once as the wave/batch safety net below.
6. Update task tracker: flip `[x]` + set `Status: DONE`.

> **Full-suite checkpoint — once per wave/batch, not per task.** Per-task verification runs only the *affected* tests, so run the **complete** suite green **once** after the last task of the batch, immediately before "After all tasks done". You, the controller, run it and confirm exit 0 — running read-only verification is not implementing. It is a net, not the terminal gate: the authoritative full run plus the mutation sensor is `super.independent-verification`, which may reuse this green result as its baseline.

> **`/simplify` (opt-in, Claude Code only; additive — never a review).** If `session_simplify_enabled`, run `/simplify` on the task's changed files between step 2 and step 3 (after tests green, before the reviews; skip no-code tasks). Off or non-matching platform → skip. Details in `./references/execution-loop.md`.

**After all tasks done — the finish tail.** Five gates, in this exact order, once per feature. Do not reorder, merge or drop one:

1. **Final code review** over the whole integrated implementation, plus the opt-in native pass — findings are fixed, not merely reported.
2. **Independent verification** (`super.independent-verification`) — always-on, never asked, runs even with no PRD; the controller then re-runs `check-verification-report.cjs` itself rather than trusting the Verifier's self-report.
3. **QA gate** (`super.user-story-verification`) — only when `session_qa_gate_enabled` is `true` **and** a PRD exists **and** the user consents; silent skip otherwise. On `FAILED` → **STOP** and report the failing user stories.
4. **Done-state gate** — `parse-tasks.cjs --assert-all-done`, deterministic, before any handoff.
5. **Finish the branch** — deactivate caveman, then `super.finishing-a-development-branch`.

**STOP — read `./references/finish-tail.md` before running any of them.** It is the canonical, mode-agnostic procedure the three execution modes share, so they cannot drift apart, and it carries what this index omits: each fix loop and its round cap, the exact gate wording, PRD discovery order, the QA result table, the caveman handoff. **The list above is an index, not a substitute — running a gate from this list alone is a skipped gate.**

## Model Selection

**Set an explicit `model:` on every subagent you dispatch — never inherit yours by omission.** Omitting `model:` makes the Task/Agent tool inherit the controller's model, so a capable-tier controller silently runs *every* implementer and reviewer on it too, wasting tokens for no quality gain. Resolve each task's tier to a model and pass it explicitly; omission is a Red Flag. Use the *least powerful* model that does each role well, reserving capable models for genuine judgment (architecture, design, ambiguous specs, review).

Each task carries a `**Tier:**` (`cheap` | `standard` | `capable`) in its file header (written by `super.writing-plans`; surfaced by `parse-waves.cjs` as `suggestedTier`). Read it, resolve via preferences `model_tiers.<tier>` or "auto" (dynamic by harness capability), and pass as `model:`. **A written `**Tier:**` is binding — the dispatched `model:` MUST equal that tier's resolution, never a higher model chosen because a task feels integration-heavy or runs late in the plan.** The only path upward is the escalation ladder (`BLOCKED` for reasoning power, or an oscillating review), re-dispatching one tier up *with the reason recorded in-thread*. Pre-dispatch gate every time: read `**Tier:**` → resolve → set `model:` to exactly that → **STOP and correct if it differs with no recorded escalation** (silent drift toward the controller's own model on a long sequential tail is as severe as omitting `model:`). Validation gates (spec, code-quality, final review) run one family up, floored at `standard` (QA floors at `standard` too). No tier available → default `standard` if ambiguous, never silently downgrade to `cheap`.

> Full policy (tier table, reviewer rules, `parse-waves.cjs` fields, "auto" resolution, no-tier fallback): **`references/model-selection.md`**. This is the canonical policy that `super.parallel-subagent-development`, `super.parallel-subagent-in-tree`, and `super.dispatching-parallel-agents` defer to.

## Handling Implementer Status

Implementer subagents report one of four statuses:

**DONE:** Proceed to spec compliance review.

**DONE_WITH_CONCERNS:** Completed but flagged doubts. Read them first. If about correctness or scope, address before review. If observations (e.g., "this file is getting large"), note and proceed.

**NEEDS_CONTEXT:** Provide the missing context and re-dispatch.

**BLOCKED:** Assess the blocker:
1. Context problem → provide more context, re-dispatch with the same model.
2. Needs more reasoning → re-dispatch with a more capable model.
3. Too large → break into smaller pieces.
4. Plan itself is wrong → escalate to the human.

**Never** ignore an escalation or force the same model to retry without changes. If the implementer is stuck, something needs to change.

## Handling Implementation Bugs

The per-task review loop handles spec and code-quality *findings*. A different failure — a verified bug, failing test, or unexpected runtime behavior surfacing while a task is implemented — is a debugging problem, not a review nit. Invoke **super.systematic-debugging** with the failing context (`DepurandoExec` state in the diagram); once root cause is found, fix applied, and verified, resume the task's normal gates. Follow super.systematic-debugging's own discipline and **caps** attempts — ~3 failed fixes stops to question architecture or the human, so this never loops forever. Don't paper over a symptom to keep moving.

## Prompt Templates

- `./agents/implementer.md` - Dispatch implementer subagent
- `./agents/spec-reviewer.md` - Dispatch spec compliance reviewer subagent
- `./agents/code-quality-reviewer.md` - Dispatch code quality reviewer subagent
- `./agents/combined-reviewer.md` - Dispatch one reviewer fusing both lenses (used when `reviewShape: combined`)

Each template above embeds a condensed code-search priority ladder (LSP/Serena > ast-grep > ripgrep
> grep) so the dispatched subagent locates symbols, call sites, and existing tests precisely instead
of skimming files by eye. Full guidance and examples: `references/code-analysis.md`.

## Suggesting Commit Messages

This applies **only when `workflow.auto_commit` is false** — when it is true the implementer already committed each task (see `agents/implementer.md`), so skip this. When auto-commit is off: after a task's code quality review is approved, give the developer a ready-to-copy `git add` (explicit files — never `git add .`/`-A`) + `git commit` block, with a pt-BR imperative message `tipo(escopo): descrição`. The developer executes it. Full format, type list, and guidelines: `references/commit-messages.md`.

## Review cost control

The default per-task fan-out is **implementer + 2 reviewers** (spec compliance, then code quality) — the maximum-rigor shape, and applying it uniformly is what made one benchmark rerun cost 46min/27 subagents for 5 tasks with every AC already passing. **Do not decide the review shape by judgment call** (the judgment gets made under deadline pressure by the agent that benefits from going faster). `parse-waves.cjs` computes it deterministically per task — read `reviewShape` off its output, the same call already made for the parallelism check and `suggestedTier`:

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index <path>
# each tasks[] entry → { ..., reviewShape: "two-stage"|"combined"|"none", reviewSignals }
```

| `reviewShape` | Dispatch | When it fires |
|---|---|---|
| `two-stage` | implementer + spec reviewer + code-quality reviewer (default, unchanged) | `capable` tier; **or** a critical-surface title keyword (auth/security/middleware/session/cors/csrf/jwt/credential/permission) — checked independently of the task's tier field, so a planner mis-tiering a security task as `standard` never buys it a lighter review; **or** `fanIn > 0` (another task depends on this one — an error here propagates, so it is never reviewed lighter than default) |
| `combined` | implementer + **one** reviewer with a fused spec + code-quality lens (`./agents/combined-reviewer.md`) | `cheap`/`standard` tier, not a structural node (`fanIn === 0`), but not a fully self-contained leaf either (has its own dependency, or touches more than one file) |
| `none` | implementer only — no dedicated reviewer subagent | `cheap`/`standard` tier, exactly one file, zero dependencies, zero fan-in, explicit spec present — a genuine leaf task (e.g. "add this literal constant", "add this README line") |

`combined` fuses the two *passes* into one dispatch, never the four review invariants: it is still a **fresh, blind subagent** (author ≠ verifier) reporting `file:line` evidence, spec lens first. `none` does not skip verification, it **relocates** it to three reads that already happen (implementer's own tests, the wave's full-suite checkpoint, the final review + IV gate).

**Never override a computed shape downward** — the script's signals are the inputs a human would use, minus the temptation to save time. **Overriding upward is always safe**: when unsure, escalate one shape. **The final code review and `super.independent-verification` are never skipped or combined**, whatever any task's `reviewShape` says.

> Why each shape is safe, what the V11 benchmark measured, and the full guarantee list: `./references/review-cost-control.md`.

## Red Flags

**Never:**
- **Write, edit, or refactor a task's code or tests yourself instead of dispatching an implementer subagent** — even for a single trivial task, a one-line change, or the last task in a plan. Inline work skips model selection, both reviews, and the verification gate. You orchestrate; the subagent codes. (Running the test suite / typecheck / build to *verify* is fine and required by the verification gate — the rule forbids *producing* code, not *observing* it.)
- Start implementation on main/master without explicit user consent — the "Branch Guard" section enforces this with a deterministic check before the first dispatch; do not dispatch the first implementer until it passes (or the user consents).
- Skip reviews (spec compliance OR code quality).
- Proceed with unfixed issues.
- **Dispatch multiple implementation subagents in parallel in this shared workspace ad hoc** — this skill is strictly sequential; use `super.parallel-subagent-development` (worktrees) or `super.parallel-subagent-in-tree` (disjointness-checked) instead.
- Make the subagent read the plan file (provide full text instead).
- Skip scene-setting context (subagent needs to understand where the task fits).
- Ignore subagent questions (answer before letting them proceed).
- Accept "close enough" on spec compliance (spec reviewer found issues = not done).
- Skip review loops (reviewer found issues = implementer fixes = review again).
- Let implementer self-review replace actual review (both are needed).
- **Start code quality review before spec compliance is ✅** (wrong order).
- Move to next task while either review has open issues.
- **Mark task `[x]` before super.verification-before-completion confirms evidence** — reviewers read code, they do not run it.
- **Skip updating the task tracker** — physically edit both `tasks-<feature-name>.md` (`[ ]` → `[x]`) and `task-NN.md` (`Status:` → `DONE`) on disk before the next task. A session task-list entry or knowing mentally does not count.
- **Skip super.user-story-verification without asking when a PRD exists AND `session_qa_gate_enabled` is `true`** — always present the consent question first; skipping after the user declines is valid, skipping silently is not. (When the preference is `false`, silent skip IS correct — it already decided.)

**If a reviewer finds issues (per-task or final loop):** re-dispatch the implementer with every finding + `file:line` pasted into its `## Review Findings to Address` section. Reuse the same implementer while it is still active (it holds the code in context); the **final** review loop, whose per-task subagents have already returned, uses a **fresh** implementer instead. Re-review after each fix — capped at ~3 non-converging rounds, then escalate. Never skip the re-review: an unverified fix is a claim.

**The other two procedures, and why the non-obvious prohibitions exist:** `./references/red-flag-procedures.md` (subagent asks questions / subagent fails its task).

## Integration

**Required workflow skills:**
- **super.using-git-worktrees** - Ensures isolated workspace (creates one or verifies existing)
- **super.writing-plans** - Creates the plan this skill executes
- **super.requesting-code-review** - Code review template for reviewer subagents
- **super.systematic-debugging** - Invoked when a verified bug or failing test surfaces during a task (see Handling Implementation Bugs)
- **super.independent-verification** - Always-on verification gate after the final review and before the QA gate: a fresh Verifier (author != verifier) re-derives spec coverage (evidence-or-zero) and runs the mutation-testing discrimination sensor; unconditional (runs even with no PRD)
- **super.user-story-verification** - QA Gate: verifies user stories from PRD before finishing branch (runs only when `session_qa_gate_enabled` is true and a PRD exists and the user consents; skipped silently when `workflow.qa_gate` is off, or when no PRD / user declines)
- **super.finishing-a-development-branch** - Complete development after all tasks

**Subagents should use:**
- **super.test-driven-development** - Subagents follow TDD for each task

**Alternative workflow:**
- **super.parallel-subagent-development** - Same per-task quality gates, but runs a wave's independent tasks concurrently in isolated git worktrees (then integrates). Use when the plan's `## Execution Waves` has a parallel wave and you want the speedup with full isolation; this skill stays right for fully sequential plans.
- **super.parallel-subagent-in-tree** - Same per-task quality gates, runs a wave's independent tasks concurrently in **this** working tree (no worktrees), guarded by a write-set disjointness check + write-only/no-commit implementers + a single serialized integration barrier. Use when worktree isolation is too expensive (workspace monorepos where each worktree needs its own `node_modules`) and the wave's files are disjoint.
