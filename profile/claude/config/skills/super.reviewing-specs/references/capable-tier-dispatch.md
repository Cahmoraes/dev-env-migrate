# Capable-tier dispatch — why, and how it is enforced

## Why spec review is always `capable`

Execution skills tier each *task* by shape: a mechanical, fully-specified 1-2 file change runs `cheap`; integration/multi-file judgment runs `standard`; architecture and ambiguous design run `capable`. That tier is written into the task file's `**Tier:**` header at planning time and read back at dispatch.

Spec review does not fit that model, for two reasons:

1. **There is no task to read a tier from.** The review runs *before or during* planning — the tasks may not exist yet, and even when they do, the thing under review is the *design*, not a task. There is no `**Tier:**` field to honor.
2. **The work itself is `capable` work.** `super.subagent-driven-development/references/model-selection.md` names the `capable` tier's role verbatim as *"Architecture, design, no-spec, high fan-in"* and reserves it for *"genuine judgment — architecture, design, ambiguous specs, review."* Judging whether a design closes its forks, agrees with the code, and is internally consistent is precisely that judgment. Running it on a cheaper model would trade away exactly the reasoning the review exists to apply.

So the reviewers are fixed at `capable`, unconditionally — independent of how the feature's tasks are tiered. A `cheap`-tiered task in the plan does **not** mean its spec is reviewed by a cheap model.

## Resolving `capable` to a concrete model

Follow the same resolution the execution skills use — never hard-code a model name:

1. **If `.superpowers/preferences.yml` sets `model_tiers.capable`** (surfaced as `session_model_tier_capable`, or as `capableModel` from `scripts/lite-reentry.cjs` when the skill runs standalone — see SKILL.md Step 2), use that exact name — the user's explicit override.
2. **Otherwise it is `"auto"` (the default):** the controller picks the most-capable model the current harness exposes. `"auto"` does **not** mean "inherit the controller's model" — it means "resolve to the most capable available and pass it explicitly." `lite-reentry.cjs` already normalizes an unset tier to `"auto"`.

Pass the result to `build-review-dispatch.cjs --capable-model <resolved-or-auto>`.

## Why caveman is NOT propagated to the reviewers

Caveman is active on execution/review subagents in general, so wiring it into these reviewers looks like an obvious win. It is not — measured, not assumed. Caveman is an **output-style** mode; a spec reviewer's cost is dominated by **input** (reading the spec, tasks, and real code) and **reasoning**, which caveman does not touch. In an A/B on this skill's own eval fixture it shaved ~11-13% off the reviewer's *emitted bytes* but left total `subagent_tokens` flat-to-higher (+2.7% overall across two lenses). Worse, a same-quality final report (which must be enriched pt-BR prose, not caveman) forces the controller to **re-expand** the compressed findings — extra generation plus reconstruction-drift risk the non-caveman path never pays. So reviewers emit normal final-quality prose directly; do not add a caveman block to `agents/spec-reviewer.md`.

## How the dispatch is gated

The bug this guards against, the one `model-selection.md` exists to stop: omitting `model:` on a `Task`/`Agent` dispatch silently inherits the controller's model. On a long session whose controller runs the most-capable model that is invisible; on a cheaper-controller session it silently *under*-provisions the review. Either way the tier drifted by omission.

`build-review-dispatch.cjs` prevents it by construction: it stamps every reviewer agent with `tier: "capable"`, an explicit `model:` equal to the resolved capable model, its lens as the `goal`, and the companion files as `readFiles`. It emits a manifest in exactly the shape `validate-dispatch.cjs` expects, with `modelTiers.capable` set to the same resolution — so the equality gate can fire.

Then `validate-dispatch.cjs` (in `super.dispatching-parallel-agents/scripts/`) is the mechanical backstop:

- **`empty_model` / `missing_field`** — a reviewer with no explicit model fails the dispatch.
- **`tier_model_mismatch`** — a reviewer whose `model:` differs from the `capable` resolution, with no recorded escalation, fails the dispatch. This is the drift-catcher.
- Reviewers are read-only, so they declare no `writeFiles`; the write-set conflict gates simply do not fire (nothing is written). `enforceWriteSets` stays off.

Proceed to dispatch only when `validate-dispatch` returns `valid: true`. When the resolution is `"auto"` (empty/harness-picks), the equality gate is intentionally skipped for that tier — `"auto"` is a legitimate "harness chooses" and there is no fixed name to compare against; the protection you still get is that every agent carries an explicit non-empty `model:` value (the harness's chosen capable model), never an inherited omission.
