# Task Decomposition Granularity — Large-tier consolidation

Loaded on demand from `super.writing-plans/SKILL.md` (`## Task Decomposition Granularity`) when decomposing a **Large** plan. Small/Medium plans do not need this file — they decompose by cohesive behavior **cluster** (N behaviors, N tests, one task), as the SKILL.md states inline.

## Consolidation judgment call (Large only) — coalesce, don't gate

"One task = one behavior" is the default, not an absolute. Before locking the task list, check adjacent behaviors against three signals together — merge only when **all three** hold:

1. They touch the same file(s) (no independent-file split available anyway).
2. There is a real implementation dependency between them (B always needs A done first — they were never going to land in different parallel waves).
3. The combined diff still reviews cleanly in one pass — a reviewer can hold the whole change in mind and give evidence-with-location findings, not a shallow skim.

When all three hold, keep them as **one task with N tests** (one test per behavior, density stays non-negotiable) instead of N single-behavior tasks. This is the same trade-off `super.subagent-driven-development`'s "Review cost control" section makes for `reviewShape` — paying full implementer+reviewer dispatch overhead per behavior buys no independence when the behaviors were always sequential and same-file. **Never** merge across an independent-file or parallel-wave boundary, and never merge a critical-surface behavior (auth/security/middleware — see `CRITICAL_SURFACE_KEYWORDS`) into a task just to save a dispatch — safety-relevant behaviors keep their own task and their own two-stage review regardless of coupling. This is a decomposition-time judgment call made once, with full context — not a post-hoc budget gate reacting to a task count already fixed.

## Task Decomposition Granularity

Two concerns: **test density** (behaviors → tests) and **task boundary** (behaviors → task). Density is fixed: every FR-XXX or explicit acceptance criterion earns its own test, always. Task boundary varies by execution tier.

**Density — never negotiable.** Decompose by acceptance criterion, not by component or file. Never bundle multiple behaviors into one untested blob. This is a coverage floor, not a task-count target.

**Task boundary — tracks the execution mechanism.**
- **Large** (`super.subagent-driven-development` fan-out, each task a separate dispatch): one task = one behavior = one test. Fine-grained boundaries pay for themselves because each task gets an isolated implementer + reviewer pass.

  **Consolidation judgment call (Large only).** "One task = one behavior" is the default,
  not an absolute — adjacent behaviors may coalesce into one task-with-N-tests (density stays
  non-negotiable), but **never** across an independent-file or parallel-wave boundary and
  **never** a critical-surface behavior (auth/security/middleware — see
  `CRITICAL_SURFACE_KEYWORDS`), which keeps its own task and two-stage review regardless of
  coupling. **When decomposing a Large plan, read
  `./references/task-decomposition-granularity.md`** for the three-signal merge test and rationale.

- **Small/Medium** (inline execution, `super.using-superpowers/references/medium-inline-path.md`): decompose by cohesive behavior **cluster**, not one task per AC. One task delivers a whole cluster's worth of behaviors and their tests — N behaviors, N tests, one task. There is no per-task dispatch to isolate, so splitting a cluster into one-task-per-AC only multiplies context-switch overhead in the main thread without buying independence.

**Bad, decomposition by component (any tier):** a single "Build the checkout form" task bundles field validation, submit-disabled state, and error-message rendering into one file-shaped task; three behaviors compressed into one test, or none.

**Good for Large:** "Task 4: Reject submit when required fields are empty [FR-012]", "Task 5: Show inline error under empty required field [FR-013]", "Task 6: Enable submit once all required fields are filled [FR-014]": three tasks, three tests, each traceable to one FR, each its own dispatch.

**Good for Small/Medium:** the same three behaviors become "Task 2: Checkout form required-field validation [FR-012, FR-013, FR-014]" — one task, executed inline, that produces three tests (one per FR) and one self-review checklist entry per behavior before the cluster is considered done.

File count is not the constraint. When several FRs are so tightly coupled that splitting produces a test-less intermediate state, keep them together and say why in the task's Visão Geral.

## Bite-Sized Task Granularity

**Each step is one action (2–5 minutes):** write the failing test → run it to confirm it fails → implement the minimal code to make it pass → run the tests to confirm they pass → commit.

**When writing `## Passos` sections in task files, read `./references/required-task-step-pattern.md` and follow the pattern exactly** — TDD steps with actual code blocks, exact run commands, and expected outputs. That file is the normative contract for step format.
