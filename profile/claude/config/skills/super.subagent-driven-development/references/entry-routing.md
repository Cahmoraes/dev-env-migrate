# Entry routing — is this skill the right mechanism for this feature?

Read at **entry only**. Once the plan is being executed, this file is settled: it answers "should
I be in this skill at all", never "what do I do next". That is why it is not in the eager SKILL.md
— on a mid-execution resume the question has already been answered, and the bytes would displace
the Execution Loop.

## Reverse tier mismatch guard

**First, is there a classification at all?** It is produced at checkpoint 0 of
`super.brainstorming` (`assess-complexity.cjs`). Two entry paths never cross that checkpoint: a
direct/standalone invocation of this skill, and `super.using-superpowers`' Execution Mode Election
(option 5) resuming a plan already on disk. In those, **there is no classification and this guard
does not fire** — the written task index is the authority, so run its tasks with the normal
per-task dispatch. Do **not** infer a complexity from the task count and re-route to
`medium-inline-path.md`: that path has the controller writing code itself, and a written plan is
exactly the case where the controller orchestrates instead. Review cost is scaled by each task's
`reviewShape` (`none`/`combined`/two-stage), not by collapsing the plan into inline work.

If the feature *was* classified **Micro/Small/Medium** at triage, **pause and
verify** before dispatching anything:

1. Did the user explicitly choose this skill ("execute com subagent-driven-development", "use
   fan-out", etc.)? If yes, proceed — the user overrode the default.
2. Did `super.using-superpowers` route here because the tasks index has `waveCount > 1`,
   `maxParallelWave > 1`, or the recommendation was fan-out? If yes, proceed.
3. Otherwise — the feature is Small/Medium and the route here was accidental — **route to
   `super.using-superpowers/references/medium-inline-path.md`** instead. Running a per-task fan-out
   for a Small/Medium feature wastes tokens and time without improving quality.

This guard prevents the inverse drift: fan-out being used for trivial features just because an
execution skill was invoked directly. It is the mirror of the forward tier guard in the SKILL.md
("do not dispatch a per-task implementer/reviewer for a Small/Medium feature").

## Decision flow

```dot
digraph when_to_use {
  "Have implementation plan?" [shape=diamond];
  "Tasks mostly independent?" [shape=diamond];
  "Stay in this session?" [shape=diamond];
  "super.subagent-driven-development" [shape=box];
  "Manual execution or brainstorm first" [shape=box];

  "Have implementation plan?" -> "Tasks mostly independent?" [label="yes"];
  "Have implementation plan?" -> "Manual execution or brainstorm first" [label="no"];
  "Tasks mostly independent?" -> "Stay in this session?" [label="yes"];
  "Tasks mostly independent?" -> "Manual execution or brainstorm first" [label="no - tightly coupled"];
  "Stay in this session?" -> "super.subagent-driven-development" [label="yes"];
}
```
