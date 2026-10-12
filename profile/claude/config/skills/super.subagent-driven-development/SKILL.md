---
name: super.subagent-driven-development
description: Execute a plan one task at a time, each task dispatched to an implementer and reviewed. The one subagent execution mode for a plan on disk; --single runs the whole plan on one implementer.
argument-hint: "[path-to-tasks-<feature>.md] [--single]"
---

# Subagent-Driven Development

Execute the plan by dispatching a fresh subagent per task, with one fresh task reviewer after each: spec compliance first, then code quality, two verdicts in one dispatch.

> **Cardinal rule — you orchestrate, you never implement.** Every task, including a one-line change or the last one, is implemented by a fresh implementer subagent; opening a source or test file to edit it yourself is the STOP signal — inline work skips the task review, the per-task model selection and the verification gate. Running the suite, typecheck or build to *observe* evidence is not implementing.

**Continuous execution — rulings, not stalls:** do not pause between tasks. A conflict, an ambiguity or a plan defect is decided by you with the spec as the binding authority and written to the ledger — the file at `ledger.path` in the start call's output, never a path you derive (`./references/execution-loop.md`, "The ledger on disk"). Only four things stop you: an irreversible or destructive operation, a security-sensitive action, a side effect outside this worktree (merge, push, publish), or a plan so broken that every path forward is a guess — never "should I continue?".

## When to Use

The execution mechanism for every plan on disk; only a bounded change, which never plans, runs inline with a combined gate (`super.using-superpowers/references/bounded-path.md`). The two entry guards (path guard; reverse path mismatch when a bounded change was announced this session) are in `./references/entry-routing.md` — read at entry, settled once execution starts. No classification (direct entry, or a plan already on disk) → the written plan is the authority, every task is dispatched. **`--single` after the index path (answer 3 at the execution gate)** → one implementer subagent runs every task with no per-task reviewer: `./references/single-implementer-mode.md` replaces the Execution Loop; the final stage is unchanged.

## The Process

### Read the plan

Tasks run **sequentially**, in index order. First, on a fresh start or a resume, one call reads the session, the plan, the progress and the branch:

> **Base dirs:** this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X` (never search for one); a gate script that will not run is a **STOP**, never a skipped gate.

```bash
node <super.subagent-driven-development-base-dir>/scripts/sdd-start.cjs \
  --tasks-index <path/to/tasks-<feature-name>.md> --platform <platform>
```

It returns `session` (`derive-session-state.cjs`), `plan` (`parse-plan.cjs`: *what each task needs* — per task `suggestedTier`; `errors` when a task's `**Consome:**` cites a later or missing task — fix the plan, never run around it), `tasks` (`parse-tasks.cjs`: *what is done*), `branch` (`branch-guard.cjs`) and `ledger` — rule on each `preflight.flagged` row before any dispatch (`./references/execution-loop.md`, "Pre-flight table"). A name in its `errors` is a gate that did not run: **STOP**. Every flag the loop needs is in this file: no `--help`, no reading a script.

- **Elected** — the user named this skill (invoking it by name **is** naming a mode), or an upstream election routed here → the mode is settled: **run the plan, silently.** Do not re-ask.
- **Not elected** (a description match, no mode named) → `./references/entry-routing.md`, "Mode election on a description match": the user has not passed the execution gate, so open it before running anything.

### Task Tracker Integration

The tasks index path is passed in context (`docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md`); if not, look for a `tasks-*.md` in the feature's `plans/`. In `tasks` (from the call above), `pending`+`inProgress` is what remains; resolve `mismatches` by hand first.

**`allDone: true` → the Execution Loop has nothing to run: go straight to the final stage and say so. Never restart at task 1 — `./references/execution-loop.md`, "Arriving at a finished plan". It also settles the mode election above: that verdict picks how to *run tasks*, and there are none.**

### Session State Re-Entry Guard

> **Restore it FIRST — before any dispatch.** Unconditionally, on a fresh start as much as on a resume: a wiped flag is indistinguishable from a deliberately-disabled one.

`<platform>` (`claude-code`, `copilot`, `codex`, `gemini`, `opencode` or `other`) is the value resolved by `super.using-superpowers`, "Platform Adaptation". Restore every `session_*` variable from `session.sessionState` (`derive-session-state.cjs`, in the start call's output) — the whole set, never a hand-mapped subset.

**Then, before any dispatch:** resume (never restart) any task left at `**Status:** IN_PROGRESS` — a task the QA gate reopened carries its story's `failure_details` into `## Review Findings to Address`.

> **Compaction invariant:** the physical task files (`task-NN.md` and `tasks-<feature-name>.md`) are the single source of truth for completion — `Status: DONE` **and** `[x]`; session task-list entries and session memory do not count.

### Branch Guard

> **Run before the first implementer dispatch of every session, resume included.** Gate the *action* on the verdict, never on task status: a non-default branch is silent, so a resume mid-feature changes nothing.

Per-task commits land on this branch and finishing integrates from it. `branch` in the start call's output is the verdict of `<super.subagent-driven-development-base-dir>/scripts/branch-guard.cjs` (current vs default branch):

- **`action: create`** → run the returned `command` (`git checkout -b feat/<feature-name>`, the tasks index slug) and announce it in the user's language — a local branch is safe and reversible, so it is announced, never asked. Skip the creation only when the repo's instructions file pins work to the default branch. With `allDone: true` there is no first implementer to hold and no branch is created before the final stage — finishing's on-base-branch menu owns that integration.
- **`action: ask-existing`** → `feat/<feature-name>` already exists: ask (use it, or name another).
- **`action: ask-mismatch`** → you are on another feature's branch (`feat/<other>`, this slug absent from its name): ask — continue on it, or create `feat/<feature-name>` from here. Never stack two features on one branch in silence. These two and the pinned default branch are the only cases that ask.
- **`action: proceed`** → any other non-default branch, detached `HEAD` or a worktree: nothing to do; finishing handles integration.

> **User-facing language.** Surface each STOP, conflict, and option list in the user's language — the one they write in, or the one their harness instructions set. The English here is *structure*, not text to print verbatim.

> **Parts of this file may be missing from your context by the time you need them.** A section you cannot see is the expected failure, not an absent rule. **Recover, never reconstruct** — read, do not infer:
> `./references/model-selection.md` (tier→model) · `./references/review-cost-control.md` (one task reviewer per task, never skipped) · `./references/red-flag-procedures.md` (prohibitions and what to do when one fires) · `./references/final-stage.md` · `./references/execution-loop.md` · `./references/single-implementer-mode.md` (`--single`) · `./references/session-state.md` · `./references/commit-messages.md` · `./references/example-workflow.md`.

### Execution Loop

> **The core of the skill, unconditional.** `./references/execution-loop.md` carries the mechanics (status writes, the two silent dispatch failure modes, review-loop caps, opt-in passes); open it at the step that needs it.

**If a tracker exists:**
1. Tasks marked `[x]` are completed — skip them. For each remaining task, take number, title, file and tier from the parser output. Do **not** read the task file, PRD or spec — implementer and reviewers read them by absolute path; you carry only pointers.
2. **Pass the PRD and Spec paths** from `parse-tasks.cjs` (`specPath`/`prdPath`, absolute). The Spec is required — missing or `specResolves: false` → resolve it before dispatching. The PRD is optional (`N/A` is valid); only a non-`N/A` path that fails to resolve is an error.
3. A task's first implementer dispatch is rendered with `--start`, which writes `**Status:** IN_PROGRESS` in `task-NN.md` and the ledger's `started` line in the same call. When ALL gates pass (verification ✅ + spec review ✅ + code quality ✅), flip the index checkbox `[ ]` → `[x]` **and** set `**Status:** DONE` — both through `scripts/mark-task-status.cjs --verify -- <test command>`, where `<test command>` is the GREEN command in the implementer's `reportFile`, run from the directory it ran in — DONE is written only when that run exits 0 (`./references/execution-loop.md`, "Tracker writes are physical edits on disk"). A real file edit, never a session task-list entry.

**If no tracker exists:** extract tasks from the plan file and note "No task tracker found; using plan file directly." Mirror tasks into the session task list only if a task tool is already in the toolset; the task files on disk are the source of truth either way.

**Batch small same-shape tasks.** When consecutive pending tasks are each a small mechanical edit of the same kind (`**Tier:** cheap`, none citing another in `**Consome:**`, no test of their own that needs judgment), do not dispatch one implementer per task: compose ONE dispatch listing every task file, one task reviewer over the whole range, one `mark-task-status.cjs --task-number n1,n2,… --verify` (`./references/execution-loop.md`, "Batched dispatch"). Reserve one dispatch per task for work that needs its own judgment, its own tests, or its own review surface; in doubt, one per task.

**Every dispatch prompt is rendered, never written by you** — implementer, task reviewer, fix round, re-review and the final review (`./references/execution-loop.md`, "Rendered dispatches"):

```bash
node <super.subagent-driven-development-base-dir>/scripts/build-task-dispatch.cjs \
  --role <implementer|reviewer|final> --tasks-index <path/to/tasks-<feature-name>.md> \
  --task-number <N> --platform <platform> [--start] [--context "<1-3 lines>"] [--findings-file <f>]
```

Send its `prompt` **unchanged**, with its `model` and `description`; never open `promptFile`, never condense or re-type it — a paraphrase drops the rubric and the global constraints. The implementer writes its TDD evidence to `reportFile`; the reviewer reads that file and the review package (`diffFile`), never your summary.

**Per task (sequential):**
1. Dispatch the implementer (`--role implementer --start`; a fix round passes `--findings-file` instead); if it asks questions, answer and re-dispatch. **After dispatching, await its result — never poll.** The harness re-invokes you when it returns; do not `sleep` or schedule a wakeup/timer — busy-polling harness-tracked work is wasted. An error returned *in place of* a subagent handle is a gate that never started: re-dispatch before advancing (`./references/execution-loop.md`, "Dispatch failure modes").
2. The implementer implements, tests, proves its tests kill 1-3 mutants plus the task's `Sabotage:` lines (`super.test-driven-development`, "MUTATE"; its report's `Mutation:` line) and self-reviews. Commit only when `workflow.auto_commit` is true; when false, neither the implementer nor the controller commits.
3. Dispatch the task reviewer (`--role reviewer`; BASE defaults to the task's ledger `started` line). The builder refuses a range it cannot hand over — HEAD not on BASE's line, or empty with auto-commit on — and that refusal is a **STOP** (`./references/execution-loop.md`, "Review range guard") — one fresh, blind reviewer per task, every task, two verdicts in one dispatch: spec compliance first, then code quality. Spec ❌ or a Critical/Important finding → the implementer fixes, handed every finding with its `file:line` pasted into its `## Review Findings to Address` section (fresh dispatch, or a follow-up message while the same implementer is still active) → re-review, scoped to the fix diff with the findings under verification (`--role reviewer --base <fix base> --findings-file <f>`; `./references/execution-loop.md`, "Re-review after a fix"); the re-review's render ledgers the round. A ⚠️ *cannot verify from diff* item is settled now or ledgered for the final review, never dropped; a Minor, and every `Declined to judge` line (`Task N: declined: …`), go to the same ledger, never the loop. Loop until ✅; the task is not complete while any finding is open, and an unverified fix is a claim. The final review is a separate dispatch after all tasks, never folded into this one (`./references/review-cost-control.md`). A reviewer rejecting the same task across ~3 rounds without converging → treat it as `BLOCKED` ("Handling Implementer Status"); `./references/execution-loop.md`, "Review loop bounds".
4. Run `super.verification-before-completion` on the task's affected tests, not the whole suite — once, as step 5's `--verify` command (its exit 0 is the evidence; no separate run before it). If the configured verification command is unavailable: `NOT_RUN`/`BLOCKED`; keep `IN_PROGRESS`, do not mark the task `DONE` or advance.
5. Update the tracker: `[x]` + `Status: DONE` with `--note "<review clean | R fix rounds | K parked>"` — the script writes the ledger's `started`/`complete` lines itself.

**Full-suite checkpoint — once per batch, not per task:** after the last task, you run the complete suite green and confirm exit 0.

**After all tasks done — the final stage.** Four gates, in this exact order, once per feature. **STOP — read `./references/final-stage.md` before running any of them.** It carries each fix loop and its round cap, the gate wording, PRD discovery order, the QA result table and the finishing handoff; the list is an index, not a substitute:

1. **Final code review** over the whole integrated implementation, always dispatched — `review_final` only adds the opt-in native pass on top, it never turns this gate off — findings are fixed (one fresh implementer with the whole list, never one per finding), not merely reported.
2. **QA gate** (`super.user-story-verification`) — runs when `session_qa_gate_enabled` is `true` **and** a PRD exists; the preference is the consent, not asked again (`session_qa_gate_ask: true` → one question at the gate); silent skip otherwise. `FAILED` → the QA skill ran its one fix round; still failing → **STOP** and report.
3. **Done-state gate** — `sdd-finish.cjs`: the gate, then rulings, ledger deletion, tracker commit. It refuses while a task's `minor (deferred)`/`unverified`/`parked` line has no `Task N <kind> closed|open` ruling below it: check each against the finished branch first.
4. **Finish the branch** — `super.finishing-a-development-branch`.

## Model Selection

**Set an explicit `model:` on every subagent you dispatch — never inherit yours by omission.** The tier is `**Tier:**` in the task file header; absent is normal — then `parse-plan.cjs`'s `suggestedTier` is the tier. **Whichever of the two applies is binding.** Resolve it via `session_model_tier_<tier>` (`auto` is never a model) and pass that as `model:`; the only path upward is the escalation ladder (`BLOCKED` for reasoning power, or an oscillating review), one tier up *with the reason recorded in-thread*. Pre-dispatch gate every time: read the tier → resolve → set `model:` → **STOP and correct if it differs with no recorded escalation**. Per-task reviewers and QA run at the task's tier floored at `standard` — `cheap` is reviewed one family up; no tier → `standard`. **The whole-branch final review is the exception: `capable`, always**, whatever tier the tasks carried. Full policy, the canonical one every dispatching skill defers to: `./references/model-selection.md`.

## Handling Implementer Status

**DONE:** proceed to spec compliance review. **DONE_WITH_CONCERNS:** read the doubts first; correctness or scope concerns are addressed before review, observations are noted. **NEEDS_CONTEXT:** provide the missing context and re-dispatch. **BLOCKED:** on a destructive operation (a database reset, a data wipe) → ask the user once; approved, run that one command yourself — an environment operation, not implementing; a subagent does not accept relayed consent — and resume the implementer; a context problem → more context, same model; needs more reasoning → one tier up; too large → split; the plan itself is wrong → rule on the correction, ledger it, re-dispatch with the ruling. Never retry unchanged.

## Handling Implementation Bugs

A verified bug, failing test or unexpected runtime behavior mid-task is a debugging problem, not a review nit: invoke **super.systematic-debugging** with the failing context, then resume the task's gates once root cause is found, fixed and verified. It caps attempts (~3 failed fixes); never paper over a symptom to keep moving.

## Suggesting Commit Messages

Only when `workflow.auto_commit` is false, after reviews pass **and step 5 `super.verification-before-completion` succeeds**, give the developer a ready-to-copy `git add` (explicit files; never `.`/`-A`) + `git commit` block. The developer executes it. Full format: `references/commit-messages.md`.

## Red Flags

Strictly sequential in a shared workspace — implementers are never dispatched in parallel; the Branch Guard, not a reminder, keeps a dispatch off `main`/`master`. Every other prohibition is the positive rule already stated above. What to do when one fires, and when a subagent asks questions or fails its task: `./references/red-flag-procedures.md`.

## Integration

Executes the plan `super.writing-plans` wrote. Per task: `super.test-driven-development` (inside the implementer), `super.verification-before-completion`; bugs → `super.systematic-debugging`. Final stage: `super.user-story-verification`, `super.finishing-a-development-branch`. `super.using-git-worktrees` is optional (a run that must not touch the main working tree).
