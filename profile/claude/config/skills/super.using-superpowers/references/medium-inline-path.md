# Medium Inline Path — inline execution + combined gate (Micro/Small/Medium)

For Micro/Small/Medium features, use the controller thread for implementation and **one fresh, blind Verifier subagent** for the final gate. This collapses the per-task fan-out (implementer + two-stage reviewer per task + final code review + IV) into a single combined gate — **same four verification lenses, lower token cost.**

Large/Complex features keep the existing fan-out unchanged.

## When it applies

Tier **Small** or **Medium** (see the tier table in `SKILL.md`): roughly ≤8 atomic implementation steps, no open architecture decision, known domain. Above that — or an open architecture decision, or a plan decomposed into **parallel waves** (authored for concurrent fan-out) — the feature is **Large**; use `super.subagent-driven-development`'s fan-out instead. Multiple *sequential* waves — a linear chain of dependent tasks with no parallelism — are fine inline: the controller runs them one after another.

## Hard stop — tier mismatch guard

This path is **only** for Micro/Small/Medium features. Before writing any code, run this deterministic guard:

1. **Check the triage tier.** If the feature was classified **Large** or **Complex** — even if it "looks simple now" — **STOP.** Do not use this path. Route to `super.subagent-driven-development` (or the parallel sibling the user chose).
2. **Count the implementation steps.** If the atomic step list or tasks index contains **more than ~8 steps**, **STOP.** The feature is oversized for inline execution; escalate to Large.
3. **Check wave structure.** If the plan has **cross-cutting concerns** or **ambiguous/open architecture decisions**, **STOP** and use fan-out. (Sequential dependent waves alone do not trigger this — the mechanical parallelism check is Guard 4.)
4. **Check for a plan authored for parallel fan-out.** If `parse-waves.cjs --tasks-index <path>` reports `maxParallelWave > 1` (equivalently `parallelizable: true`), **STOP** — the plan has concurrent waves and was written for parallel fan-out execution. A plan with `waveCount > 1` but `maxParallelWave: 1` (multiple *sequential* waves, a linear dependency chain) is **not** a fan-out plan — the Medium tier permits it and the controller runs the waves inline in order.

This guard is **not optional** and **not overridable by the controller's judgment**. Inline execution of a Large/Complex feature silently drops the per-task implementer + reviewer fan-out, the separate final code review, and the `super.independent-verification` gate structure required at that tier. When any guard fires, route immediately to `super.subagent-driven-development` and report the reason.

## Tripwire — re-classify if the count is wrong (checkpoint 3)

Before writing code, list the atomic implementation steps inline (mirrors the tlc `implement.md` tripwire). This is **checkpoint 3** of the checkpoint model in `../references/complexity-checkpoints.md` — run `<super.using-superpowers-base-dir>/scripts/assess-complexity.cjs --signals '{"steps":<N>}' --prior-tier <checkpoint-2-tier> --checkpoint 3` with the real step count. Escalate-only: if the list runs past ~8 steps, or the steps have complex cross-dependencies, or a genuine architecture fork appears — **stop and escalate to Large.** The tier assessment at an earlier checkpoint was wrong; do not force an oversized feature through the inline path. When the fork is about *intent/scope* rather than just step count (the "steps" turned out to hide a new subsystem), re-derive the full signal set via the `complexity-interpreter` subagent (`agents/complexity-interpreter.md`) instead of passing only `{"steps":<N>}`, then re-score.

## Planning (reduced mode)

- **No research fan-out** — one targeted codebase exploration, not a cluster.
- **PRD folded or skipped** — inline requirements when unambiguous.
- **No separate task-writer subagent** — the atomic step list is the plan. If it passes ~8 steps, escalate to Large.

## Execution

The controller implements directly in the main thread (TDD). **Zero implementer/reviewer subagents per task.**

- **Self-review per cluster.** After each cluster, checklist: Done-when criteria satisfied with `file:line` evidence? This bounds drift before the final blind gate.
- **Task boundary = behavior cluster.** One cluster can yield multiple tests; test density (one test per behavior/AC) is preserved.

## Verification gate (combined)

One fresh, blind Verifier subagent fuses final code review + `super.independent-verification`:

1. **Spec-anchored FR/AC coverage** — evidence-or-zero, `file:line` + assertion.
2. **Discrimination sensor** — mutation testing in git-scratch state.
3. **Code-quality / architecture / security review.**
4. **Payload / conjunction rule** — findings with evidence.
5. **Persisted report** — compact verdict, no code edits by the Verifier.
6. **Structural self-check** — `check-verification-report.cjs --report <path> --spec <spec-path>`; fix and re-run until `valid:true` before returning any verdict (same enforcement as `agents/verifier.md` Step 4b).

**Controller re-check (mandatory).** After the Verifier returns, re-run the same
`check-verification-report.cjs` command yourself before accepting the verdict — its actual dispatch
prompt can drift from this list, so item 6 alone is not sufficient; `valid:false` or no report found
is a FAIL regardless of what the Verifier claimed.

**QA stays opt-in** at every tier (`super.user-story-verification`), never folded into this gate.

## Fix decision

On gate failure (mutant, uncovered AC, wrong value, spec-precision gap):

1. Verifier reports and stops — no self-patching.
2. Register grounded lesson via `scripts/lessons.py`.
3. Controller fixes simple/localized inline; delegates complex/cross-cutting to a fresh implementer subagent.
4. Re-verify with fresh blind Verifier, **≤3 rounds**.

## Session preferences

Inline path honors the same `session_*` flags: caveman mode, `/simplify`, and final `/code-review` pass still apply as configured.

## Context budget — assemble the handoff, don't make the Verifier explore

Follow `references/token-budget.md`. The controller **assembles the Verifier's input as a handoff** — spec + the feature diff (`git diff <base>..<head>`, or the working-tree diff when uncommitted) + the touched test files + the checklist — and hands exactly that in the dispatch. The controller already holds all of it from implementing inline, so assembling the handoff costs nothing. Never attach the full session transcript or planning artifacts.

The Verifier reviews **from the handed diff** — it does not re-explore the repository to reconstruct what changed. It still runs the suite and the mutation sensor, and it still uses *targeted* search (grep/LSP/ast-grep) for the two purposes that genuinely need the wider tree: locating a required behavior that appears **absent** from the diff, and checking whether new logic **duplicates** something elsewhere. Those are directed lookups, not a structural sweep of the tree to find the code. Handing the diff instead of a directory to explore is a measured token/latency win that scales with codebase size and preserves review rigor (validated: `docs/benchmarks/superpowers-v10-token-optimization/VALIDATION_20260718_172307_verifier-handoff.md`).

## Verifier tier routing

Choose the Verifier's execution tier by feature size and risk, **floored at `standard` for security/auth OR high-consequence paths — i.e. whenever the `criticalSurface` signal is true (financial, vital/medical, irreversible/destructive, legal/compliance, or security)**:

- **Micro** → `cheap` (one file, trivial logic).
- **Small** → `cheap` unless security/high-consequence (`criticalSurface`) → `standard`.
- **Medium** → `standard`.
- **Large/Complex** → `capable`.

These are tiers, not models: resolve the chosen tier via `model_tiers.<tier>` and pass that exact
model. `capable` may resolve to `sonnet` — never read `capable` as "the most capable model
available" and never let the Verifier inherit the controller's own model because it is the final
gate. Never use a `capable` model for mechanical verification of small features.

## The four invariants (never dropped, in any tier)

1. The gate that closes the feature is **always** a fresh, blind subagent — author ≠ verifier never collapses to self-grading.
2. The discrimination sensor / mutation testing **always** runs.
3. FR/AC coverage is **always** re-derived evidence-or-zero, never asserted from memory.
4. Test density — one test per behavior — is **always** preserved as a coverage requirement.

`tlc-spec-driven` is the empirical proof these four invariants hold up in a single combined gate: same mutation-kill rate, zero coverage gaps, on the same feature used to validate this design.
