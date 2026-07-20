---
name: super.independent-verification
description: Always-on independent verification gate that runs once after the final code review, before the QA gate and before finishing a branch. A fresh, blind Verifier subagent (author != verifier) re-derives requirement coverage from the spec with an evidence-or-zero rule, runs a spec-anchored outcome check (each acceptance criterion mapped to file:line + the exact assertion expression and its spec-defined value), and runs a discrimination sensor (mutation testing in a git-scratch state) proving the tests actually kill regressions. Writes a persisted validation report, turns surviving mutants and spec-precision gaps into fix tasks (bounded fix->re-verify loop), and distills grounded lessons. Use after all tasks are implemented and the final code review passed, when verifying an implementation against its spec/PRD, or when asked to prove the tests catch bugs (mutation testing). Complements super.verification-before-completion (controller self-check) with a blind, independent second pair of eyes.
---

# Independent Verification

A fresh Verifier subagent (author ≠ verifier) re-derives coverage from the spec alone — proving
each acceptance criterion is asserted at a concrete `file:line` with the **spec-defined value**
(not just "an assertion exists") — and proves the tests **kill regressions** by injecting faults
and confirming the suite catches them. Separates "the tests pass" from "the tests test something."

## Iron Law

**A FEATURE IS NOT DONE UNTIL A BLIND VERIFIER RE-DERIVED ITS COVERAGE FROM THE SPEC AND THE
DISCRIMINATION SENSOR PROVED THE TESTS KILL REGRESSIONS.** Always-on, never prompted — unlike the
QA gate, the controller does not ask whether to run it. Runs once per feature (not per task),
after the final code reviewer's findings are resolved, before the QA gate and before
`super.finishing-a-development-branch`.

## When It Runs

In `super.subagent-driven-development` (and the two parallel variants), at **"After all tasks
done"**, immediately after step 1 (final code review) closes with no open Critical/Important
findings, and **before** the QA gate (step 2). One Verifier subagent per feature, dispatched by
the controller — never performed by the controller itself (defeats author ≠ verifier).

**Delivery mechanism by tier — same checks, different packaging.** Small/Medium
(`super.using-superpowers/references/medium-inline-path.md`): not a separate dispatch — the
spec-anchored coverage check and discrimination sensor below are items 1–2 of the single combined
Verifier dispatch, which also absorbs the final code review (QA stays separate at every tier).
Large/Complex: standalone gate, one dispatch, as described here. Same evidence-or-zero rule, same
mutation mechanism, both cases.

## Author ≠ Verifier (the non-negotiable)

Dispatch a **genuinely fresh subagent** that did **not** implement any task and did **not**
orchestrate the session. It inherits none of the author's assumptions.

**Context budget (keep minimal):**
- the **spec** (and PRD if one exists) - the acceptance criteria are the source of truth;
- the **git diff surface** of the feature, `BASE_SHA..HEAD_SHA` (the whole feature range, not one
  task);
- the **test files** in scope;
- its operating checklist (`agents/verifier.md`).

**Do NOT send:** full session transcript, prior task files, planning artifacts, or the complete
source tree. The Verifier re-derives coverage from the spec alone. Extra context only raises cost
and bias.

It re-derives coverage independently under an **evidence-or-zero** rule and returns a verdict. It
is **read-only for source and tests** (never edits them); its only writes are the persisted
`validation.md` report and - via `scripts/lessons.py` - the machine-owned lessons store. Mutation
faults are injected only in a **git-scratch state** and always reverted (see Discrimination
Sensor). Give it tools `Read, Grep, Glob, Bash` (Bash for read-only git inspection + the
scratch-state mutation cycle + running the test command + `lessons.py`). Set `model:` explicitly
by feature tier: **Micro/Small non-critical → `cheap`**, **Medium and Small security/critical → `standard`**,
**Large/Complex → `capable`**. **The tier is not a model — resolve it via `model_tiers.<tier>`
(surfaced as `session_model_tier_<tier>`) and pass that exact model. `capable` may resolve to
`sonnet`; it does NOT mean "the most capable model available," and IV being the feature's final
gate is not a licence to reach for a stronger model than the tier resolves to.** STOP and correct
if the `model:` you are about to pass differs from that resolution — a verifier dispatched on the
controller's own model (the classic drift: opus on a session driven by opus, when `model_tiers.capable`
is `sonnet`) is the same silent over-provisioning the binding gate exists to stop; the escalation
ladder with a reason recorded in-thread is the only path upward. See
`super.subagent-driven-development/references/model-selection.md` (the Pre-dispatch check) and
`super.using-superpowers/references/medium-inline-path.md` ("Verifier tier routing").

Dispatch payload and full operating procedure: `agents/verifier.md`.

## What the Verifier Does

**First, confirm the suite is green.** The Verifier **may reuse the wave/batch full-suite green**
from the gate immediately before it (`super.subagent-driven-development`, run just before the
final review) instead of re-running from scratch — but only if `git status --porcelain` is empty
and `HEAD` equals the verified SHA. A red or moved tree forces a fresh run; the discrimination
sensor below always runs its own test executions regardless. Full procedure: `agents/verifier.md`,
Step 1.

### 1. Spec-anchored outcome check (evidence-or-zero)

For every acceptance criterion (WHEN X THEN Y), every task "Done-when", and every listed edge case,
locate the exact `file:line` assertion and show the search before declaring anything absent —
evidence-or-zero, never a guess. Where the spec pins a precise value, the assertion must target it
exactly; where it doesn't, flag a spec-precision gap instead of a silent PASS. For side effects,
assert the payload's value/state, not merely that the call happened. Full 5-point procedure:
`agents/verifier.md`, Step 2.

Each criterion resolves to ✅ PASS / ❌ gap (uncovered or wrong value) / ⚠️ spec-precision gap.

### 2. Discrimination sensor (mutation testing)

Empirical proof the tests detect regressions, run after the gate is confirmed green, against a
git-scratch state (the real working tree is never modified). Depth is proportional: default
*lightweight* (1–3 behavior-level mutations on the highest-risk new logic); *full* (≥5, or a
dedicated mutation tool) for P0/critical paths. A surviving mutant means the tests aren't
discriminating for that behavior — it becomes a **fix task**; the feature is not done while one
survives. Mutation types, the per-mutation cycle (`scripts/run-mutation.cjs`), and the manual
fallback: `references/mutation-tooling.md`; full procedure: `agents/verifier.md`, Step 3.

### 3. Write the persisted report

`docs/superpowers/<feature-name>/qa/validation-<feature-name>.md` - PASS/FAIL, per-AC evidence
table (`file:line` + assertion + spec-defined value), the sensor table (each mutation, killed or
survived), the gate result, and the `BASE_SHA..HEAD_SHA` range. Always written - it is the
persisted evidence artifact. Template: `references/validation-report-template.md`.

### 3b. Self-check the report structurally

Before returning any verdict, the Verifier runs `scripts/check-verification-report.cjs` against its
own report and fixes it until `valid:true` - the earliest enforcement point on the diagram's
`Executando → VerificacaoIndependente` trigger, not something `super.finishing-a-development-branch`
discovers later. The controller re-runs the same script as a backstop that doesn't depend on the
dispatch having used the template correctly (see Integration). Full procedure: `agents/verifier.md`,
Step 4b.

### 4. Return a compact verdict

**Compute the verdict, don't assert it.** Before writing the top-line PASS/FAIL header (in both
the persisted report and the chat reply), re-scan your own per-AC table and sensor table: if
either contains any ❌ gap, ⚠️ spec-precision gap, or surviving mutant, the header **must** be
FAIL — never PASS. A PASS header next to an open gap or surviving mutant is a self-contradiction;
the rule text (not the header) governs the controller's fix→re-verify decision, but a mislabeled
header is still a defect in your own report and must not ship.

To the controller in chat: PASS/FAIL + ranked gap list only. Keep the chat verdict under ~200 tokens. The Verifier does not fix anything.

## Fix → Re-Verify Loop (controller-owned)

Gaps (uncovered AC, wrong-value assertion, surviving mutant) become **fix tasks**, each with
*What / Where / Verify / Done-when*. The controller owns the loop:

1. **Register the lesson first** — record one grounded lesson per signal (Distill Lessons below,
   `scripts/lessons.py`) before fixing, so recurrence is prevented even if the fix churns. Bug/gap
   feedback goes to the lessons channel only — not `super.persistent-memory` (which is for
   decisions, specs, PRDs, and artefact summaries, never implementer or bug feedback).
2. **Decide by complexity — fix or delegate.** A *simple, localized* gap (a missing test, a
   one-line assertion fix, a single-file slip) the controller may fix inline itself. A *complex or
   cross-cutting* gap (design gap, multi-file change, architecture fork) is dispatched to a fresh
   implementer (`super.subagent-driven-development/agents/implementer.md`); the controller
   orchestrates and does not patch those inline.
3. **Re-verify** by re-dispatching a fresh Verifier over the new range.

Bounded: at most **3** fix→re-verify rounds; if gaps persist after 3, **stop and escalate to the
human** (a persistent gap is a spec or design problem, not a nit) or route to
`super.systematic-debugging`. Spec-precision gaps that cannot be resolved from the spec are
escalated, not guessed.

## Distill Lessons (grounded only)

Immediately after `validation.md` is written, for **each grounded signal** - surviving mutant,
spec-precision gap, failed/uncovered AC, or a `// SPEC_DEVIATION` marker - record **one** terse,
general lesson via `scripts/lessons.py`. A clean PASS with no signal records **nothing** (no
signal → no lesson; an ungrounded lesson is opinion and the script rejects it). Confirmed lessons
are loaded back at `super.brainstorming` and `super.writing-plans` to prevent recurrence. Command
and full workflow: `references/lessons.md`.

## No-Overlap With Existing Gates

Superpowers gates are layers with distinct lenses over the same invariant - they do not overlap.

| Gate | Lens | Who runs it |
|---|---|---|
| `super.verification-before-completion` | "evidence before claims" self-check | controller (same session) |
| per-task spec + code-quality review | this task matches its plan / quality | fresh reviewer, per task |
| final code reviewer | whole implementation: architecture / security / testing | fresh reviewer, once |
| **super.independent-verification** | **blind re-derivation of spec coverage + do the tests kill bugs** | **fresh Verifier, once** |
| `super.user-story-verification` (QA) | user-facing acceptance against the PRD | fresh QA subagents (consent-based) |

Only gate that (a) is performed by an agent re-deriving truth from the spec with no prior model,
(b) empirically proves the tests discriminate. Does **not** replace final code review (different
lens) or the QA gate (QA verifies user stories with human consent; this verifies spec coverage
unconditionally).

**Cross-consumption:** runs before QA, so QA **consumes**
`docs/superpowers/<feature-name>/qa/validation-<feature-name>.md` as its source of FR/AC coverage
and assert-level fidelity instead of re-deriving them (QA only re-derives in the fallback where
this report is absent).

## Code Analysis

Locating the exact `file:line` of each assertion (the whole spec-anchored check depends on it) and
confirming symbols exist is done with the most precise tool available, degrading gracefully:
semantic/LSP (Serena `find_symbol` / `find_referencing_symbols`, IDE diagnostics) → ast-grep
(`sg`, structural) → ripgrep → grep. Full guidance and Verifier-specific usage:
`references/code-analysis.md`.

## Integration

**Invoked by:**
- **super.subagent-driven-development** - at "After all tasks done", between the final code review
  and the QA gate. **Large/Complex only** - the mechanism described in this skill. Also re-runs
  `check-verification-report.cjs` itself, controller-side, after the Verifier returns.
- **super.parallel-subagent-development** / **super.parallel-subagent-in-tree** - same position;
  they defer to the same final gates (`references/finish-tail.md`), including the controller-side
  re-check. **Large/Complex only.**
- **super.using-superpowers/references/medium-inline-path.md** - **Small/Medium**: this skill's
  checks (spec-anchored coverage, discrimination sensor) run as part of the single combined
  Verifier dispatch, not as a standalone gate; same controller-side re-check applies.

**Depends on:**
- **super.requesting-code-review** - the read-only dispatch pattern the Verifier template builds on.
- **super.subagent-driven-development** - the implementer template for fix tasks and the
  model-selection policy.
- **super.finishing-a-development-branch** - re-checks that this gate passed as a backstop before
  merge/PR.

**Feeds:**
- **super.brainstorming** / **super.writing-plans** - load confirmed lessons at the start (READ).

## Red Flags - STOP

- The controller "verifies" the feature itself, or reuses an implementer/reviewer that saw the
  build → **not blind, not independent.** Dispatch a fresh Verifier.
- Marking a criterion covered without a `file:line` + assertion expression → evidence-or-zero
  violation.
- "Tests pass, so we're done" without the discrimination sensor → you proved the tests run, not
  that they catch bugs.
- Injecting a mutation in the real working tree, or leaving the tree changed after the sensor →
  always use a git-scratch state and restore.
- Skipping this gate because the QA gate "already runs" → different lens; QA is consent-based and
  user-story-scoped, this is unconditional and spec-coverage-scoped.
- Recording a lesson on a clean PASS → no signal → no lesson.
