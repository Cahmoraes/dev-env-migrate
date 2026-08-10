# Review cost control — why the shape is computed, not judged

The SKILL.md carries the operational rule (run `parse-waves.cjs`, read `reviewShape`, the
three shapes, escalate-only-upward). This file carries the reasoning behind it and the
guarantees each shape preserves — read it when you are tempted to override a shape, or
when you need to justify to a reviewer why a task got one reviewer instead of two.

## The cost this exists to control

The default per-task fan-out is **implementer + 2 reviewers** (spec compliance, then code
quality). That is the conservative, maximum-rigor shape — and applying it uniformly is what
made the V11 benchmark's rate-limiter rerun cost **46 min / 27 subagents for 5 tasks**, even
though every acceptance criterion passed. Nothing was wrong with the reviews; the shape was
applied without regard to each task's actual risk.

The fix is not "review less". It is to stop deciding the shape by judgment call, because the
judgment is made under deadline pressure by the same agent that benefits from going faster.
`parse-waves.cjs` computes it from signals a careful human would use anyway — fan-in, critical
surface keywords, tier — without that conflict of interest.

## What `combined` preserves

The **combined** reviewer is still a **fresh, blind subagent** (author ≠ verifier) and still
reports findings with `file:line` evidence. All four review invariants hold:

1. fresh subagent,
2. blind to the implementer's self-assessment,
3. evidence-with-location,
4. findings-loop-until-clean.

`combined` fuses the two *passes* into one dispatch. It does not fuse the two *lenses*: the
prompt keeps spec compliance first, then code quality, because if the wrong thing was built
the quality of the wrong thing does not matter.

## What `none` relocates (it does not skip)

A leaf task's safety net is three reads that already happen:

- the implementer's own tests (still mandatory),
- the once-per-wave/batch full-suite checkpoint (`super.verification-before-completion`),
- the mandatory final code review + `super.independent-verification` gate after all tasks.

Those three already read every file in the diff. A fourth read by a per-task reviewer, on a
one-file, zero-dependency, spec-explicit task, is the redundant rigor the V11 benchmark
flagged as cost without quality gain. `none` fires only for that genuinely-leaf shape
("add this literal constant", "add this README line").

## Why overriding downward is forbidden and upward is free

**Never override a computed shape downward** (treating a `two-stage` task as `combined`
because "the domain feels known"). The script's signals are the same inputs a human reviewer
would use, computed without the temptation to save time.

**Overriding upward is always safe and never wrong** — keeping two reviewers on a task the
script marked `combined`/`none` costs tokens and buys certainty. When genuinely unsure,
escalate one shape. Same escalation-ladder principle as model tier.

## The two gates that no shape touches

The final code review and `super.independent-verification` are **never skipped and never
combined**, regardless of any individual task's `reviewShape`. They are separate dispatches
after all tasks, and they are what makes relocating per-task rigor safe in the first place.

## What the default fan-out buys, and what it costs

**Gains:** subagents follow TDD with fresh, curated context per task (no pollution, complete info upfront, parallel-safe); they can ask questions before and during work; the two-stage review (spec compliance prevents over/under-building, then code quality ensures it is well-built) plus self-review and review loops catch issues early.

**Cost:** more invocations (implementer + up to 2 reviewers per task), more controller prep, and review iterations — paid back by catching issues earlier (cheaper than debugging later). The shapes above provide safe levers to reduce this cost on mechanical tasks.
