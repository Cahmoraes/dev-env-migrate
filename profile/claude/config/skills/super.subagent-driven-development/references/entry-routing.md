# Entry routing — is this skill the right mechanism for this feature?

Read at **entry only**. Once the plan is being executed, this file is settled: it answers "should
I be in this skill at all", never "what do I do next". That is why it is not in the eager SKILL.md
— on a mid-execution resume the question has already been answered, and the bytes would displace
the Execution Loop.

## Reverse path mismatch guard

**First, is there a classification at all?** It is the path announced at the triage or in
`super.brainstorming`'s "Three paths" (spike, bounded, architectural). Two entry paths never announce one: a
direct/standalone invocation of this skill, and `super.using-superpowers`' Execution Mode Election
(option 5) resuming a plan already on disk. In those, **there is no classification and this guard
does not fire** — the written task index is the authority, so run its tasks with the normal
per-task dispatch. Do **not** infer a path from the task count and re-route to
`bounded-path.md`: that path has the controller writing code itself, and a written plan is
exactly the case where the controller orchestrates instead: each task gets its own implementer
and task reviewer, never collapsed into inline work.

If the feature *was* announced **bounded** this session, **pause and verify** before dispatching anything:

1. Did the user explicitly choose this skill ("execute com subagent-driven-development", "roda o
   plano", etc.)? If yes, proceed — the user overrode the default.
2. Is there a plan on disk — the tripwire upgraded the feature and it went through
   `super.brainstorming` and `super.writing-plans`? If yes, proceed: a written plan is
   executed by dispatch, whatever path was first announced.
3. Otherwise — the feature is bounded and the route here was accidental — **route to
   `super.using-superpowers/references/bounded-path.md`** instead. Running a per-task dispatch chain
   for a bounded change wastes tokens and time without improving quality.

This guard prevents the inverse drift: per-task dispatch being used for a bounded change just because an
execution skill was invoked directly. It is the mirror of the hard stop in `bounded-path.md`
(an architectural feature never runs inline).

## Mode election on a description match

Applies only when **no mode was elected** — this skill matched by description, nobody named it
and no upstream election routed here. (Invoked by name = elected: run sequentially, silently — with `--single` after the index path, or after answer 3 at the gate, run `./single-implementer-mode.md` instead of the per-task loop;
and never read this section.)

A description match means nobody answered the execution gate yet, so **open it** — options 0
(deep review) / 1 (this skill, `(recommended)`) / 3 (single implementer, only when the
start call the SKILL.md just made says, under `plan` (`parse-plan.cjs`), `singleImplementer.eligible`), through the
platform's structured-question tool as the last call of the turn — exactly as
`super.using-superpowers`' "Execution Mode Election (option 5)" and `super.writing-plans`'
handoff do. Proceed on this skill only when the answer names it (or the question tool is absent
from the toolset, which takes option 1).

## Decision flow

A plan on disk (`tasks-<feature-name>.md` + `task-NN.md`) → this skill, sequentially, whatever the
tasks' coupling: a task that consumes an earlier one is executed after it, never in parallel,
and reads what it needs from the `## Interfaces` block the plan wrote. No plan → brainstorm and
plan first (`super.using-superpowers` routes there); this skill never improvises tasks from a
conversation.
