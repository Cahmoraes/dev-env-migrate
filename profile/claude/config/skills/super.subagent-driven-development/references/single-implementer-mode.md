# Single-implementer mode (`--single`, answer 3 at the execution gate)

One implementer subagent runs every task of the plan in order, with **no reviewer between
tasks**. The controller still orchestrates: it dispatches once, waits, and then runs the final
stage exactly as the per-task loop would — the whole-branch final review on the `capable` tier
(the rule for every run, not a privilege of this mode — `./model-selection.md`),
the implementer's own mutants, QA and finishing are the safety net this mode relies on. The cardinal
rule holds: you never implement; you dispatch one implementer instead of N.

This mode replaces the SKILL.md **Execution Loop** only. Everything before it (parsers, tracker,
branch guard, model selection) and everything after it (`./final-stage.md`) is unchanged.

## When it runs

- The user answered **3** at the execution gate, or invoked this skill with `--single` after the
  tasks index path. Either is naming a mode: do not re-open the gate.
- It is never the recommended mode. If you reached this file any other way, you are not in it:
  go back to the SKILL.md Execution Loop.

## Pre-conditions (re-checked here, from the parser you already ran)

Read `singleImplementer` from the start call's `plan` (the `parse-plan.cjs` output the SKILL.md just produced):

- `singleImplementer.eligible: true` → proceed.
- `false` → **STOP.** Say which reason in `singleImplementer.reasons[]` blocks it (more than six
  tasks, a task on the `capable` tier), and re-open the execution gate with options 0/1 only. The plan changed since the gate was rendered, or the answer was given
  to a plan this mode was never offered for; either way the user picks again. Never downgrade the
  blocking task's review to run the plan anyway.

Tasks already `[x]` in the index are done: the dispatch below names the first pending task as its
starting point, and the implementer skips nothing before it and redoes nothing already marked.

## The dispatch (one, then wait)

Dispatch `../agents/whole-plan-implementer.md` once, with:

- the absolute paths of the tasks index, the spec and the PRD (or `N/A`);
- the number of the first pending task;
- `model:` resolved from `session_model_tier_standard` — this mode runs on the `standard` tier
  whatever the individual tasks' tiers say, because one context carries the whole chain; a plan
  that needs `capable` on a task is not eligible;
- `workflow.auto_commit` as the implementer's commit rule (true → one commit per task; false →
  no commits, the controller reports the pending commit).

**After dispatching, await its result — never poll.** The harness re-invokes you when it returns;
do not `sleep` or schedule a wakeup. An error returned *in place of* a subagent handle is a gate
that never started: re-dispatch before advancing.

## Reading the report

The implementer reports **per task**, in order:

- **DONE** for every task → the full-suite checkpoint is already in the report (the implementer's
  last `--verify` run); confirm `verify.exitCode: 0` in the last JSON the report quotes and go to
  `./final-stage.md`.
- **DONE_WITH_CONCERNS** on any task → read the concern before the final stage; a correctness or
  scope concern is handed to the final reviewer as context, never silently dropped.
- **BLOCKED** on task N → the implementer stopped there and lists the later tasks as not started.
  Handle it as the SKILL.md "Handling Implementer Status" says (more context, one tier up, split,
  or escalate to the human); when the cause is settled, re-dispatch this mode from task N. Never
  finish a plan with a BLOCKED task in it, and never implement task N yourself.
- A report that marks a task done while its task file still lacks `**Status:** DONE` (only
  `mark-task-status.cjs --verify` writes it, and only on exit 0) is a claim, not a result:
  the tracker is the record. **STOP** and re-dispatch from that task.

Then `./final-stage.md`, gate 1 onward, unchanged: the final reviewer receives the plan's
`## Foco de Revisão` verbatim and the whole branch range; fixes go to a fresh implementer.
