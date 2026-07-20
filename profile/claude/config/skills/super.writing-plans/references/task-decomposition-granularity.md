# Task Decomposition Granularity — Large-tier consolidation

Loaded on demand from `super.writing-plans/SKILL.md` (`## Task Decomposition Granularity`) when decomposing a **Large** plan. Small/Medium plans do not need this file — they decompose by cohesive behavior **cluster** (N behaviors, N tests, one task), as the SKILL.md states inline.

## Consolidation judgment call (Large only) — coalesce, don't gate

"One task = one behavior" is the default, not an absolute. Before locking the task list, check adjacent behaviors against three signals together — merge only when **all three** hold:

1. They touch the same file(s) (no independent-file split available anyway).
2. There is a real implementation dependency between them (B always needs A done first — they were never going to land in different parallel waves).
3. The combined diff still reviews cleanly in one pass — a reviewer can hold the whole change in mind and give evidence-with-location findings, not a shallow skim.

When all three hold, keep them as **one task with N tests** (one test per behavior, density stays non-negotiable) instead of N single-behavior tasks. This is the same trade-off `super.subagent-driven-development`'s "Review cost control" section makes for `reviewShape` — paying full implementer+reviewer dispatch overhead per behavior buys no independence when the behaviors were always sequential and same-file. **Never** merge across an independent-file or parallel-wave boundary, and never merge a critical-surface behavior (auth/security/middleware — see `CRITICAL_SURFACE_KEYWORDS`) into a task just to save a dispatch — safety-relevant behaviors keep their own task and their own two-stage review regardless of coupling. This is a decomposition-time judgment call made once, with full context — not a post-hoc budget gate reacting to a task count already fixed.
