# Task Decomposition Granularity — consolidation cases

Loaded on demand from `super.writing-plans/SKILL.md` (`## Task Granularity`) when cutting a plan into task files. Two consolidation cases below; both hold for every plan.

## Case 1 (every plan) — same-shape mechanical edits are one task

When the plan would list several tasks that are each a **small mechanical edit of the same kind** repeated across files — the same constant change, the same field addition, the same one-line fix in N places — write **one task with N files** in `## Arquivos` and **N checks** in its verification, never N tasks. Each such task has no judgment of its own, no test surface of its own and no review surface of its own: N dispatches would buy N fresh contexts for the same edit and N reviews of the same diff shape. The executor reviews the one task's diff file by file against `## Arquivos`, so nothing is lost.

Reserve one task per edit for work that needs its own judgment, its own tests, or its own review surface. A safety-relevant behavior (auth/security/middleware) keeps its own task and its own review regardless of how mechanical it looks.

## Case 2 (every plan) — coalesce adjacent behaviors, don't gate

"One task = one behavior" is the default, not an absolute. Before locking the task list, check adjacent behaviors against three signals together — merge only when **all three** hold:

1. They touch the same file(s) (no independent-file split available anyway).
2. There is a real implementation dependency between them (B always needs A done first — they were always going to run in order).
3. The combined diff still reviews cleanly in one pass — a reviewer can hold the whole change in mind and give evidence-with-location findings, not a shallow skim.

When all three hold, keep them as **one task with N tests** (one test per behavior, density stays non-negotiable) instead of N single-behavior tasks — paying full implementer+reviewer dispatch overhead per behavior buys no independence when the behaviors were always sequential and same-file. **Never** merge across an independent-file boundary, and never merge a critical-surface behavior (auth/security/middleware) into a task just to save a dispatch — safety-relevant behaviors keep their own task and their own review regardless of coupling. This is a decomposition-time judgment call made once, with full context — not a post-hoc budget gate reacting to a task count already fixed.

## Task Decomposition Granularity

Two concerns: **test density** (behaviors → tests) and **task boundary** (behaviors → task). Density is fixed: every FR-XXX or explicit acceptance criterion earns its own test, always. Task boundary follows the execution mechanism.

**Density — never negotiable.** Decompose by acceptance criterion, not by component or file. Never bundle multiple behaviors into one untested blob. This is a coverage floor, not a task-count target.

**Task boundary — one behavior per task, then consolidate.** Every plan is executed by `super.subagent-driven-development`, each task a separate dispatch: one task = one behavior = one test is the default, because each task gets an isolated implementer + reviewer pass. Adjacent behaviors coalesce into one task-with-N-tests when Case 2's three signals all hold (density stays non-negotiable) — **never** across an independent-file boundary and **never** a critical-surface behavior (auth/security/middleware), which keeps its own task and its own review regardless of coupling.

**Bad, decomposition by component:** a single "Build the checkout form" task bundles field validation, submit-disabled state, and error-message rendering into one file-shaped task; three behaviors compressed into one test, or none.

**Good, independent behaviors:** "Task 4: Reject submit when required fields are empty [FR-012]", "Task 5: Show inline error under empty required field [FR-013]", "Task 6: Enable submit once all required fields are filled [FR-014]": three tasks, three tests, each traceable to one FR, each its own dispatch.

**Good, coalesced (Case 2 holds — same file, sequential, one clean review):** the same three behaviors become "Task 2: Checkout form required-field validation [FR-012, FR-013, FR-014]" — one task, executed by dispatch in one fresh subagent, that produces three tests (one per FR) and one self-review checklist entry per behavior before the task is considered done.

File count is not the constraint. When several FRs are so tightly coupled that splitting produces a test-less intermediate state, keep them together and say why in the task's Visão Geral, in one sentence about the behaviors (the FR ids are already in the title).

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate. Fold setup, configuration, scaffolding and documentation steps into the task whose deliverable needs them — they have no reviewer of their own. Split only where a reviewer could meaningfully reject one task while approving its neighbor. Each task ends at a deliverable that can be tested on its own.

## Bite-Sized Task Granularity

**Each step is one action (2–5 minutes):** write the failing test → run it to confirm it fails → implement the minimal code to make it pass → run the tests to confirm they pass → commit.

**When writing `## Passos` sections in task files, read `./required-task-step-pattern.md` and follow the pattern exactly** — TDD steps with actual code blocks, exact run commands, and expected outputs. That file is the normative contract for step format.
