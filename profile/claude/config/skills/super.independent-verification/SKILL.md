---
name: super.independent-verification
description: "Use after all tasks are implemented and the final code review passed, when verifying an implementation against its spec/PRD, or when asked to prove the tests catch bugs (mutation testing). Always-on verification gate that runs once after the final code review, before the QA gate and before finishing a branch, via a fresh blind Verifier subagent (author != verifier). Complements super.verification-before-completion (controller self-check) with an independent second pair of eyes."
user-invocable: false
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

**When a fresh dispatch is impossible — declare the degradation, never hide it.** If the platform
or the session genuinely cannot dispatch a subagent, the gate does **not** silently become "the
controller reviews its own work". Two outcomes are acceptable; pretending is not:

- **Preferred — BLOCKED.** Report the gate as `NOT_RUN (no dispatch available)`, leave the feature
  **not done**, and say so to the user in `session_language`. Do not write a PASS.
- **Fallback — SELF-DEGRADED.** Only when the user accepts a weaker gate: the controller runs the
  same procedure, but MUST (a) read `agents/verifier.md` in full first, (b) execute every mutation
  for real (see the sensor rule below), and (c) record `**Verifier:** SELF-DEGRADED (author ==
  verifier)` in the report. A SELF-DEGRADED run can never produce a clean `PASS` — its best
  possible verdict is `PASS (degraded)`, which does **not** satisfy the Iron Law and must be
  re-run by a fresh verifier before `super.finishing-a-development-branch`.

The failure this closes: with no stated fallback, a runtime that cannot dispatch improvises an
inline gate and self-declares PASS. The consequence: the
sensor degenerated from *executed* to *argued* — the report reasoned about what a mutation "would"
break instead of injecting one — and a module carrying 27 live mutants shipped as "no blocking
defects found".

**Context budget (keep minimal):**
- the **spec** (and PRD if one exists) - the acceptance criteria are the source of truth;
- the **git diff surface** of the feature, `BASE_SHA..HEAD_SHA` (the whole feature range, not one
  task);
- the **test files** in scope;
- its operating checklist (`agents/verifier.md`).

Fill the `{SESSION_LANGUAGE}` placeholder in that checklist with `session_language` (from
`derive-session-state.cjs`; `communication.language` in preferences, default `pt-BR`) so the
persisted report's prose is written in the user's language. The report's structural skeleton
(section headings, field labels, status tokens, FR/AC identifiers) stays canonical regardless —
`check-verification-report.cjs` and the controller re-run key off it.

**Do NOT send:** full session transcript, prior task files, planning artifacts, or the complete
source tree. The Verifier re-derives coverage from the spec alone. Extra context only raises cost
and bias.

It re-derives coverage independently under an **evidence-or-zero** rule and returns a verdict. It
is **read-only for source and tests** (never edits them); its only writes are the persisted
`validation.md` report and - via `scripts/lessons.py` - the machine-owned lessons store. Mutation
faults are injected only in a **git-scratch state** and always reverted (see Discrimination
Sensor). Give it tools file reading, searching and the shell (Bash for read-only git inspection + the
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

**First, confirm the suite is green.** Pass the previous gate's full-suite result **with its SHA**
as `{BASELINE_GREEN}` (the integration barrier in `super.subagent-driven-development`). A blind
Verifier cannot reuse a green it was never shown: an omitted baseline buys a whole extra suite run
per dispatch, and again per re-verify round. It reuses only while `git status --porcelain` is empty
and `HEAD` matches; the sensor always runs its own. Full: `agents/verifier.md`, Step 1.

**Load the procedure before running either check.** Whoever executes checks 1–2 — the dispatched
Verifier, or the controller in SELF-DEGRADED mode — MUST read `agents/verifier.md` in full first.
This file states *what* the gate is; `agents/verifier.md` is *how* to run it (the exact
mutate→test→restore cycle, the 5-point evidence procedure, the report skeleton). Running the checks
off this description alone is the known failure mode: the prose here is satisfiable by reasoning
about what a mutation *would* do, and a sensor that is argued instead of executed proves nothing.

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
git-scratch state (the real working tree is never modified).

**A mutation counts only if it was executed.** Fault injected into the file, suite actually run,
exit status observed, tree restored. Writing that a mutation "would break test X" is analysis, not
a sensor reading — the `Killed?` column must carry an **observed** `killed`/`survived`, never a
predicted one, and a report whose sensor rows were reasoned rather than run is a **FAIL**.

**Depth scales with the surface, not only with the risk.** Floor: `max(3, one mutation per new
logic file in the diff)`, capped at 10 for a lightweight pass; P0/critical paths (payments, auth,
data integrity) run full (≥5, or a dedicated mutation tool if the stack has one). **Every new logic
file in the diff gets at least one mutation** — a barrel/re-export file is not logic. When the cap
binds, spend the budget on the files with the largest logical surface first (most branches and
operators), because that is where untested behavior hides. A feature decomposed into many small
modules does not earn a cheaper sensor; it earns a wider one.

**Depth also scales *within* a file, not just across files.** The per-file floor above proves
every file got *some* mutation — it does not prove a dense file got *enough*. Declare, per new
logic file, its own branch/operator count alongside its mutation count (`**Sensor depth**: <N>
mutations across <M> logic files — <file>: <mutations>/<branches> branches, …`); each file's
minimum is `max(1, min(5, ceil(branches / 3)))` — roughly one mutation per three branches/operators
in that file, capped at 5. A file with 12 branches cannot satisfy depth with the same single
mutation a 1-branch file uses to clear the floor. The consequence:
`hash-to-bucket.ts` and `lru-ttl-cache.ts` each concentrated 5 survivors out of ~8 mutants while
meeting the old per-file floor — the floor was satisfied, the file was not actually probed.
`check-verification-report.cjs` validates the breakdown: entry count matches the declared logic
file count, the per-file sum matches the declared total, and each file meets its own proportional
minimum.

A surviving mutant means the tests aren't discriminating for that behavior — it becomes a **fix
task**; the feature is not done while one survives. **Exception: a genuine equivalent mutant** —
the mutated branch/condition can never differ in observable behavior because an invariant enforced
elsewhere in the code guarantees its value (e.g. a `!== undefined` guard on a variable that is only
ever reached already-defined) — cannot be killed by any test, and treating it as a normal survivor
either stalls the fix→re-verify loop or pressures a change to working code just to force a kill.
Accept it only with a dedicated `## Equivalent Mutants` block per survivor: the invariant proof
(traced, not assumed) and the alternative test that was actually tried and still couldn't kill it.
Mark that sensor row `Equivalent` (not `Survived`) — a bare `Survived` row still fails the gate even
if you believe it's equivalent. `check-verification-report.cjs` cross-checks every `Equivalent` row
against its block by file:line and rejects placeholder invariants/attempts.

Mutation types and the runner (`scripts/run-mutation-batch.cjs` — isolated snapshots,
subset-first): `references/mutation-tooling.md`; full procedure: `agents/verifier.md`, Step 3.

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
   feedback goes to the lessons channel only — the validation report already carries the
   verdict and the evidence, so nothing else needs to restate them.
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
- Mutating the real tree, leaving it dirty, or running mutation cycles concurrently against one
  tree → isolated snapshots; concurrency there reports a real survivor as `killed`.
- Skipping this gate because the QA gate "already runs" → different lens; QA is consent-based and
  user-story-scoped, this is unconditional and spec-coverage-scoped.
- Recording a lesson on a clean PASS → no signal → no lesson.
