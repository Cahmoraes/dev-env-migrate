# Capable-tier dispatch — why, and how it is enforced

## Why spec review is always `capable`

The execution skill tiers each *task* by shape: a mechanical, fully-specified 1-2 file change runs `cheap`; integration/multi-file judgment runs `standard`; architecture and ambiguous design run `capable`. That tier is written into the task file's `**Tier:**` header at planning time and read back at dispatch.

Spec review does not fit that model, for two reasons:

1. **There is no task to read a tier from.** The review runs *before or during* planning — the tasks may not exist yet, and even when they do, the thing under review is the *design*, not a task. There is no `**Tier:**` field to honor.
2. **The work itself is `capable` work.** `super.subagent-driven-development/references/model-selection.md` names the `capable` tier's role verbatim as *"Architecture, design, no-spec, high fan-in"* and reserves it for *"genuine judgment — architecture, design, ambiguous specs, review."* Judging whether a design closes its forks, agrees with the code, and is internally consistent is precisely that judgment. Running it on a cheaper model would trade away exactly the reasoning the review exists to apply.

So the reviewers are fixed at `capable`, unconditionally — independent of how the feature's tasks are tiered. A `cheap`-tiered task in the plan does **not** mean its spec is reviewed by a cheap model.

## Resolving `capable` to a concrete model

Follow the same resolution the execution skill uses — never hard-code a model name:

1. **If `.superpowers/preferences.yml` sets `model_tiers.capable`** (surfaced as `session_model_tier_capable`, or as `capableModel` from `scripts/lite-reentry.cjs` when the skill runs standalone — see SKILL.md Step 2), use that exact name — the user's explicit override.
`--platform` is what lets step 1 be trusted: `preferences.yml` is per-repo but model names are per-harness, so a `capable` configured on another CLI can name a model this one does not serve. Passed the running platform, the script drops that name instead of handing a nonexistent model to the dispatch; omit the flag and nothing is dropped.

2. **Otherwise it is this platform's own `capable` rung alias** — `lite-reentry.cjs` supplies it, so `capableModel` is a concrete model name, not a placeholder. Only a platform that publishes no aliases still returns `"auto"`, and there `"auto"` does **not** mean "inherit the controller's model": it means resolve the rung by role and pass that name explicitly.

Pass the result to `build-review-lead-dispatch.cjs --capable-model <resolved>`; the lead hands the same value to `build-review-dispatch.cjs` for every lens.

## How the dispatch is gated

The bug this guards against, the one `model-selection.md` exists to stop: omitting `model:` on a `Task`/`Agent` dispatch silently inherits the controller's model. On a long session whose controller runs the most-capable model that is invisible; on a cheaper-controller session it silently *under*-provisions the review. Either way the tier drifted by omission.

Two dispatches carry the tier, and both are stamped by a script. `build-review-lead-dispatch.cjs` gives the controller's single dispatch, the lead, the resolved model. Inside the lead, `build-review-dispatch.cjs` prevents the drift by construction: it stamps every reviewer agent with `tier: "capable"`, an explicit `model:` equal to the resolved capable model, its lens as the `goal`, and the companion files as `readFiles`. It emits a manifest in exactly the shape `validate-dispatch.cjs` expects, with `modelTiers.capable` set to the same resolution — so the equality gate can fire.

Then `validate-dispatch.cjs` (in `super.dispatching-parallel-agents/scripts/`) is the mechanical backstop:

- **`empty_model` / `missing_field`** — a reviewer with no explicit model fails the dispatch.
- **`tier_model_mismatch`** — a reviewer whose `model:` differs from the `capable` resolution, with no recorded escalation, fails the dispatch. This is the drift-catcher.
- Reviewers are read-only, so they declare no `writeFiles`; the write-set conflict gates simply do not fire (nothing is written). `enforceWriteSets` stays off.

Proceed to dispatch only when `validate-dispatch` returns `valid: true`. On a platform with no rung aliases the resolution is still `"auto"`, and there the equality gate is intentionally skipped for that tier — `"auto"` is a legitimate "harness chooses" and there is no fixed name to compare against; the protection you still get is that every agent carries an explicit non-empty `model:` value (the harness's chosen capable model), never an inherited omission.
