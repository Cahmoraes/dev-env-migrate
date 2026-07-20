# Model Selection — full policy

> Canonical model-selection policy for all execution skills. `super.parallel-subagent-development`, `super.parallel-subagent-in-tree`, and `super.dispatching-parallel-agents` defer to this — they do not redefine it. For ad-hoc parallel dispatches, run `super.dispatching-parallel-agents/scripts/validate-dispatch.cjs` before any `Task(...)` call to mechanically enforce the `model:` invariant, the tier↔model equality gate (pass `modelTiers` + each agent's `tier`; a `tier_model_mismatch` error is the script backstop for the pre-dispatch gate below), and write-set disjointness.

**Set an explicit `model:` on every dispatch — never inherit yours by omission.** The Task/Agent tool inherits the controller's model when `model:` is omitted, so a controller on the most-capable model silently runs *every* implementer and reviewer on it too — the over-provisioning bug this policy prevents: a mechanical task burned on the most expensive model wastes tokens for no quality gain. Resolve each task's tier to a model and pass it as `model:`. Omitting it is a Red Flag.

**Principle:** use the *least powerful* model that does each role well. Reserve the most capable ones for genuine judgment — architecture, design, ambiguous specs, review. Never blanket-escalate "to be safe" — that reinstates the bug.

**Forbidden is omission, not the model itself.** A tier may legitimately resolve to the same model the controller runs (e.g. controller on standard, a `standard`-tier task). That is correct — the model was chosen *for the task* and still passed explicitly. The bug is "inherited by omission, without resolving the tier." Resolve the tier first; if the answer equals your model, set it explicitly anyway.

## Abstract tiers (decoupled from model names)

Reason in **tiers**, never hard-coded model names, so a rename or new release never breaks the policy:

| Tier | Role | Resolves to |
|---|---|---|
| `cheap` | Mechanical implementation (1-2 files, complete spec, no deps) | least-capable model that still codes competently |
| `standard` | Integration / multi-file / debugging judgment | a mid-capability model |
| `capable` | Architecture, design, no-spec, high fan-in | the most-capable model |

**Implementation runs cheap by default.** Mechanical tasks — the common case, a closed-scope task file whose spec, code, and commands are already written — resolve to `cheap`; only genuine design/integration judgment escalates to `standard`/`capable`. If a `cheap` implementer returns `BLOCKED` for lack of reasoning power, escalate one tier and re-dispatch (the escalation ladder) — never blanket-provision upward "to be safe".

**Validation gates run one family above the implementer, not at the most-expensive tier.** A gate (spec review, code-quality review, final review) runs at the task's tier **floored at `standard`** — so a `cheap` (mechanical) task is reviewed by the `standard` tier, one family up, not by the most-expensive `capable` tier. A strong-enough reviewer catches a weak model's loose ends without paying the top model to read mechanical code (the eval bore this out: a `standard`-class reviewer caught a build-breaking import that did not need `capable`). Onboarding makes `standard` resolve a family above `cheap`, so this floor is a real step up, never the same model reviewing itself. `standard`/`capable` tasks are reviewed at their own tier; QA floors at `standard`. `capable` is reserved for genuine architecture/design work (implementing and reviewing `capable`-tier tasks) — it is not spent reviewing mechanical code. Read-and-report **exploration/research** subagents are *not* gates — they floor at `cheap`/`standard`.

## Each task carries its tier — read it, don't recompute it

The tier lives in the task file header as `**Tier:**` (`cheap` | `standard` | `capable`), written at planning time by `super.writing-plans`. **Read that field when dispatching** and resolve it to a model. `parse-waves.cjs` surfaces it as each task's `suggestedTier` (an explicit `**Tier:**` overrides the computed value; a missing/invalid one falls back to deterministic signals — spec presence, `**Depends on:**` count, fan-in, file count, design/architecture keywords):

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index <path>
# each tasks[] entry → { explicitTier, suggestedTier, tierSignals, fanIn, specPresent, fileCount,
#                        reviewShape, reviewSignals }
```

The same call also resolves **who reviews the task**, not just which model implements it — `reviewShape` (`two-stage` | `combined` | `none`), documented in `super.subagent-driven-development/SKILL.md`'s "Review cost control" section. The two fields are independent: model tier answers "how capable must the implementer be", review shape answers "how much dedicated review does this specific task's risk warrant". A `cheap`-tier task can still be `two-stage` (e.g. a one-file auth middleware edit), and a `standard`-tier task can be `none` (e.g. a well-specified leaf with no fan-in).

**A written `**Tier:**` is binding, not a suggestion.** When the task file carries an explicit `**Tier:**`, the dispatched `model:` MUST equal that tier's resolution (`model_tiers.<tier>` or "auto") — you do NOT get to pre-emptively pick a higher model because a task "feels" integration-heavy, is later in the plan, or runs in a sequential wave. File count is an imperfect proxy and the *planner* already weighed it when writing the tier; second-guessing it at dispatch time is the silent over-provisioning this policy exists to stop. The **only** legitimate way to a higher model is the escalation ladder: dispatch at the written tier first, and *if* that implementer returns `BLOCKED` for lack of reasoning power (or a review keeps oscillating), escalate one tier, re-dispatch, and **record the reason in-thread** (which task, what the cheaper tier failed at). No recorded escalation → the written tier stands.

### Deterministic pre-dispatch gate (run before every implementer dispatch)

1. Read the task's `**Tier:**` (or `parse-waves.cjs` `suggestedTier` when the field is absent).
2. Resolve it to a model via `model_tiers.<tier>` or "auto".
3. Set `model:` to **exactly** that resolution.
4. **STOP if** the `model:` you are about to pass differs from step 3's result. A higher model is allowed here *only* when this is a re-dispatch on the escalation ladder with a reason already recorded in-thread. Otherwise you have drifted (typically toward your own controller model on the sequential tail of a long session) — correct it to the resolved model before dispatching. Passing a model that does not equal the resolved tier, with no recorded escalation, is a Red Flag identical in severity to omitting `model:`.

## Resolving a tier to a concrete model ("auto" by default)

1. **If `.superpowers/preferences.yml` `model_tiers.<tier>` is set** (surfaced as `session_model_tier_<tier>` by `derive-session-state.cjs`) → use that exact model name (user's explicit override).
2. **If empty/null — the default, "auto"** → pick dynamically from the models *your current harness* exposes, ordered by capability: `cheap` = least-capable that still codes well, `capable` = most-capable, `standard` = in between. Re-derive from whatever the harness offers now — never pin a name.

Either way, pass the resolved model as `model:`. **"auto" is the expected default and fully sufficient — it does NOT mean "inherit the controller's model."** It means the controller chooses the least-powerful-sufficient model per task.

**No tier available at all** (no `**Tier:**`, no `parse-waves.cjs`, no `model_tiers` — ad-hoc or hand-written plan): still never inherit your own model. Infer the tier from the task's signals (files, spec completeness, deps, design keywords), then resolve via "auto". When genuinely ambiguous, default to **`standard`** — strong enough for real work, never the most expensive, trivially escalated to `capable` on `BLOCKED`. If the inferred tier resolves to the controller's model, use it — the wrong outcome is skipping the inference and defaulting to your own model.
