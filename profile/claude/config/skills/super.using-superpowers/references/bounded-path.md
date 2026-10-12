# Bounded Path — inline execution + one final review

For a bounded change, use the controller thread for implementation and **one fresh final code reviewer subagent** to close it. This collapses the per-task dispatch chain (implementer + task reviewer per task + final code review) into a single gate — **same four verification lenses, lower token cost.**

**Verification rigor does not scale down with the path — only the mechanism that delivers it does.** The same four lenses run on every path: (1) author ≠ reviewer on the final gate, (2) the mutation check of `super.test-driven-development` ("MUTATE"), (3) every behavior the change promises has a test that asserts it, `file:line` or it does not count, (4) test density (one test per behavior). The bounded path delivers all four here; an architectural feature delivers them through the fan-out — a subagent per task, each running the same TDD mutation step, then the final code review.

Every feature that has a plan on disk is executed by dispatch after the execution gate (`super.writing-plans/references/execution-handoff-message.md`), never here: a written plan is the case where the controller orchestrates instead of writing code.

## Done means: the fresh reviewer's verdict is in the thread

The inline path has **no user gate between entering it and finishing**: no execution-mode election, no "may I implement?", no "continue?". It has no pause at all: a bounded change is announced, not asked. What closes it is not the suite passing in your hands — you wrote the code, so your green run is the author's run — but the **final review below, dispatched to a subagent that did not write the code**, and then the final stage (QA when a PRD and `session_qa_gate_enabled` say so, done-state, `super.finishing-a-development-branch`). A feature whose last act was your own test run, lint and commit is **not done**: the reviewer dispatch is still owed, and it is the next call.

## When it applies

A **bounded** change (`session-start.md`, "Scope sizing (option 2)"): a flow that already exists in this repo, ~1–3 existing files, 1–3 atomic steps, no new component, reversible, no user story. Anything larger is architectural: it has a spec and a plan, and a plan is executed by dispatch — not here.

How a feature arrives here: straight from the bounded announcement (the triage, or `super.brainstorming`'s "Three paths"): no spec file, no plan. The announcement names the files and the atomic steps; that list **is** the plan, and the tripwire below runs on it.

## Hard stop — path mismatch guard

This path is **only** for bounded changes. Before writing any code, run this deterministic guard:

1. **Check the announced path.** If the feature was classified **architectural** — even if it "looks simple now" — **STOP.** Do not use this path. An architectural feature has a spec and a plan; the plan opens the execution gate and is executed by `super.subagent-driven-development` (per task, or `--single` when the user chose it).
2. **Check for a plan on disk.** If a tasks index exists for this feature (`node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>`), **STOP** — a written plan is executed by dispatch, whatever its size; the execution gate decides the mode.
3. **Count the implementation steps.** If the atomic step list runs past **~3 steps or ~3 files**, or a new component, an interface others depend on, an open architecture decision or a user story appears, **STOP.** The announcement under-read the request; say so and enter `super.brainstorming` as architectural (tripwire below).

This guard is **not optional** and **not overridable by the controller's judgment**. Inline execution of a planned feature silently drops the execution gate the user is owed, the per-task implementer + reviewer dispatches and the separate final code review an architectural feature requires. When any guard fires, route immediately and report the reason.

## Tripwire — the ratchet is one-way

Before writing code, list the atomic implementation steps inline and re-check them against guard 3. Hidden complexity found here or mid-task — steps with cross-dependencies, a genuine architecture fork, a "step" that turns out to hide a new subsystem — upgrades the path: stop, say so in one line, and enter `super.brainstorming` as architectural. Do not force an oversized feature through the inline path. Nothing downgrades: a feature that was announced architectural never drops back here.

## Planning (reduced mode)

- **No research fan-out** — one targeted codebase exploration, not a cluster.
- **No PRD, no spec** — the announcement's step list is the whole plan; requirements are inline and unambiguous by definition of the path.
- **No task files, no task-writer subagent** — the announced step list is the plan. If the list outgrows the path, escalate (tripwire above).

## Execution

The controller implements directly in the main thread with `super.test-driven-development`, **including its MUTATE step** once the change is green. **Zero implementer/reviewer subagents per task.**

- **Self-review per cluster.** After each cluster, checklist: Done-when criteria satisfied with `file:line` evidence? This bounds drift before the final review.
- **Task boundary = behavior cluster.** One cluster can yield multiple tests; test density (one test per behavior) is preserved.
- **Mutation line.** Keep the `Mutation:` line the MUTATE step produces; it goes to the reviewer with the diff.

## Final review gate

Dispatch the final code reviewer (`super.requesting-code-review`, fresh subagent, author ≠ reviewer) on tier `capable`: resolve the chosen tier via `model_tiers.<tier>` and pass that exact model. These are tiers, not models — `capable` may resolve to `sonnet`; never let the reviewer inherit the controller's own model because it is the final gate. Its checklist, beyond code quality / architecture / security:

1. **Behavior coverage** — every step of the announcement has a test that asserts it, `file:line`; a step with no asserting test is an Important finding.
2. **Mutation** — the `Mutation:` line is present; a survivor with no stated equivalence reason is an Important finding.
3. **Findings with evidence** — each finding carries `file:line` and the payload that proves it.

Fix its Critical/Important findings as in `super.subagent-driven-development/references/final-stage.md` gate 1 (simple/localized inline; complex/cross-cutting to a fresh implementer subagent), then re-dispatch a fresh reviewer, then continue to the QA gate.

**QA stays opt-in** on every path (`super.user-story-verification`), never folded into this gate.

## Session preferences

Inline path honors the same `session_*` flags: the final `/code-review` pass still applies as configured.

## Context budget — assemble the handoff, don't make the reviewer explore

Follow `references/token-budget.md`. The controller **assembles the reviewer's input as a handoff** — the announcement's step list + the feature diff (`git diff <base>..<head>`, or the working-tree diff when uncommitted) + the touched test files + the `Mutation:` line + the checklist above — and hands exactly that in the dispatch. Never attach the full session transcript.

The reviewer works **from the handed diff**; it searches the wider tree only to locate a promised behavior that appears **absent** from the diff, or to check whether new logic **duplicates** something elsewhere.

## The four invariants (never dropped by the path)

1. The gate that closes the feature is **always** a fresh subagent — author ≠ reviewer never collapses to self-grading.
2. The TDD mutation check **always** runs on new logic.
3. Coverage is **always** shown with `file:line`, never asserted from memory.
4. Test density — one test per behavior — is **always** preserved as a coverage requirement.

No path drops any of them.
