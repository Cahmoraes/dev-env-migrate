# Review cost control — one task reviewer per task

The SKILL.md carries the operational rule (step 3 of the per-task loop). This file carries the
reasoning behind it — read it when you are tempted to add a second reviewer to a task, or to skip
the one it gets.

## The rule

Every task gets **one** task reviewer (`../agents/task-reviewer.md`): a fresh subagent, blind to the
implementer's self-assessment, returning two verdicts in a single dispatch — spec compliance
first, then code quality — with `file:line` evidence, looping until clean. It is never skipped, not
for a one-line task and not for the last one, and never split into two dispatches. The order of
the lenses lives inside the prompt: if the wrong thing was built, the quality of the wrong thing
does not matter.

## Why not two reviewers

A second per-task reviewer found no Critical/Important finding that the whole-branch final review
missed, at four to seven times the cost. Deciding *which* tasks earned the second reviewer was
worse than the reviewer itself: a judgment call made under deadline pressure by the party that
benefits from going faster, or a keyword scan that escalated on fixture names and inline code
while missing the authorization task it existed for. One reviewer, always, removes the decision.

## Why not zero

The task reviewer is the task-scoped gate: it reads one diff against one brief while both are
small enough to hold in full. The final review reads the whole branch and cannot attribute a
propagated defect to the task that introduced it, and the implementer's own green run is the
author's run. Neither replaces the per-task read.

## The gate that is never folded in

The final code review is a separate dispatch after all tasks, whatever the per-task reviews
found.

## Where the cost is controlled

- **The reviewer's tier.** It runs at the task's tier floored at `standard`, and moves up only by
  the escalation ladder (`./model-selection.md`) — never pre-emptively.
- **The task's size.** Several small, same-kind, same-file edits are one task with N tests when
  the planner merges them at decomposition time (`super.writing-plans`, task granularity), so the
  reviewer reads one diff instead of N. That is the planner's call, made once with full context;
  the executor never re-cuts the plan to save a dispatch.
- **What crosses the controller's context.** Diffs and task text move as file paths; the reviewer
  returns a short verdict, never the code it read.
