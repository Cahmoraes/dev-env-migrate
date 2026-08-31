# Execution Loop — mechanics

Companion to the `### Execution Loop` section of `super.subagent-driven-development/SKILL.md`.
That section is the **running order** — what to do, in which sequence. This file is the
**mechanics**: how each step is written to disk, how a dispatch can fail without looking like
a failure, what bounds the review loops, and what the two opt-in native passes do.

Read it **once, at the start of an execution run**, before the first dispatch. The loop in
`SKILL.md` is deliberately terse, and terse is not the same as complete: running it without the
rules below is how the two silent failure modes here happen.

## Tracker writes are physical edits on disk

Every status transition is a **real file edit**, never a session task-list entry or a mental
note. A tracker that only exists in the session is not an audit record: it disappears with the
context and cannot be re-read after a compaction or a resume.

**Before dispatching each implementer** — `**Status:** PENDING` → `**Status:** IN_PROGRESS`.
The idempotent script anchors on the `**Status:**` line so it cannot corrupt an adjacent field,
and re-running it is a safe no-op:

```bash
node <super.subagent-driven-development-base-dir>/scripts/mark-task-status.cjs \
  --task-file <path/to/task-NN.md> --status IN_PROGRESS
```

**When all gates pass** — one call does both edits atomically and idempotently: it sets the task
file Status and flips the matching index checkbox (`[x]` for DONE):

```bash
node <super.subagent-driven-development-base-dir>/scripts/mark-task-status.cjs \
  --task-file <path/to/task-NN.md> --status DONE \
  --tasks-index <path/to/tasks-<feature-name>.md> --task-number N
```

Inspect the JSON: `statusChanged` and `indexUpdated` confirm the writes; any `errors` (e.g. task
number not found) require manual resolution. **Fallback:** make the edits by hand if the script
is unavailable — the edits are mandatory, the script is only the safe way to make them.

These edits are the authoritative audit record. `super.finishing-a-development-branch` reads the
index directly to verify every task is `[x]` — if the files are not edited on disk, the branch
cannot be finished and the history cannot be audited.

## Arriving at a finished plan

`parse-tasks.cjs` reports `allDone: true` when every task is `[x]` on the index **and**
`Status: DONE` in its own file. That is a distinct entry state, not a degenerate loop:
the loop below says "skip the `[x]` ones, run what remains", and when nothing remains it
reads as an empty procedure rather than as an instruction.

**Do not restart at task 1.** Every task being complete means the code is already on the
branch; re-dispatching implementers over it produces duplicate work, spurious diffs, and
review rounds against changes nobody asked for. The controller that hits this state has
finished the Execution Loop by definition and belongs in the finish tail.

What to do:

1. Say it plainly, in the session language — the plan is already complete, N tasks done.
2. Go to the finish tail. Its gates still apply in full: the done-state gate re-asserts
   `--assert-all-done`, and the independent-verification and QA gates run as usual. A
   finished implementation is not a verified one.
3. If the user expected pending work, the disagreement is about *which* plan or *which*
   feature — resolve that before touching anything. Never resolve it by re-implementing.

The mirror case matters too: `mismatches` non-empty means the index and the task files
disagree about completion. Resolve those before reading `allDone` at all — a mismatch
makes both `allDone: true` and `allDone: false` untrustworthy.

## Dispatch failure modes

### Platform note — "await, never poll" is Claude Code semantics

On a platform whose dispatch tool does **not** auto-reinvoke the orchestrator on completion
(Copilot CLI's `task`), "await its result" means dispatch in the **blocking/`sync` mode** so the
call returns the subagent's output directly — see `super.using-superpowers/references/copilot-tools.md`,
"Dispatching subagents".

**Never substitute a user-question tool (`ask_user`) as a wait/synchronization primitive** to
pause for a subagent — that turns an autonomous per-task dispatch (including the spec and
code-quality reviews) into a spurious approval prompt. The only `ask_user` calls the flow makes
are its named consent gates (Branch Guard on the default branch, QA gate).

### A dispatch that errors at launch has NOT run its gate

A `task`/Agent call can fail at *launch* — the harness rejects the tool call itself (truncated or
malformed arguments, an EOF-while-parsing error) and returns an error **in place of** a subagent
handle. This is not a subagent that ran and returned; it is a gate that never started.

When a dispatch returns an error instead of a result, treat that stage as **not run**:
re-dispatch it before advancing, and never let a spec review, code-quality review, or
verification stage count as satisfied unless its subagent actually launched and returned a
verdict. A silently swallowed dispatch error skips the gate with **no failing signal** — a real
session dropped a task's entire code-quality review this way (the dispatch call errored, the
controller read no result, and moved straight to the next task), recovering only by luck when
the task's spec review happened to force extra rounds.

## Review loop bounds

### The review loop is capped

If a reviewer keeps rejecting the same task across ~3 rounds without converging (each fix trades
one finding for another, or reintroduces a prior one), stop and treat it like a `BLOCKED`
implementer — apply `SKILL.md`, "Handling Implementer Status" (more context → more capable model
→ split the task → escalate to the human). A non-converging review means something deeper is
wrong, and another round will not find it.

### `reviewShape` scales steps 3-4

The two-stage pair (spec reviewer, then code-quality reviewer) is the `two-stage` shape. When
`parse-waves.cjs` marks a task:

- `combined` → dispatch **one** reviewer (`../agents/combined-reviewer.md`) that fuses steps 3
  and 4 into a single pass.
- `none` → skip both dedicated reviewers. The safety net is the implementer's own tests, the
  wave/batch full-suite checkpoint, the final review, and the `super.independent-verification`
  gate.

How the shape is chosen is in `SKILL.md`, "Review cost control". The findings-loop-until-✅ rule
is unchanged in every shape.

## Full-suite checkpoint — once per wave/batch, not per task

Per-task verification runs only the tests **affected** by that task. Run the **complete** suite
green **once** at the end of each wave/batch as a safety net against cross-task interaction — in
this sequential skill, once after the last task of the batch, immediately before the finish tail.

You, the controller, run it and confirm exit 0; running read-only verification is not
implementing. This is a net, not the terminal gate: the authoritative full run **plus** the
mutation sensor is `super.independent-verification`, which runs right after the final review and
may reuse this green result as its baseline, so the suite is not re-run yet again there.

## `/simplify` — opt-in, Claude Code only

Additive, never a review. When the session flag is set, run it on the task's changed files
between step 2 and step 3 — after the tests are green, before the reviews; skip no-code tasks.
It *applies* cleanups rather than reporting them, so it never duplicates the spec/quality gates.

The optional final review pass is handled by the finish tail, not here — see
`./finish-tail.md`. Flag off or a non-matching platform → skip. Tool details in
`super.using-superpowers/references/claude-code-tools.md` and `copilot-tools.md`.
