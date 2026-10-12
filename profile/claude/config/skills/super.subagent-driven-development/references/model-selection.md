# Model Selection — full policy

> Canonical model-selection policy for every dispatching skill — `super.dispatching-parallel-agents` defers to this, it does not redefine it. For ad-hoc parallel dispatches, run `super.dispatching-parallel-agents/scripts/validate-dispatch.cjs` before any `Task(...)` call to mechanically enforce the `model:` invariant, the tier↔model equality gate (pass `modelTiers` + each agent's `tier`; a `tier_model_mismatch` error is the script backstop for the pre-dispatch gate below), and write-set disjointness.

**Set an explicit `model:` on every dispatch — never inherit yours by omission.** The Task/Agent tool inherits the controller's model when `model:` is omitted, so a controller on the most-capable model silently runs *every* implementer and reviewer on it too — the over-provisioning bug this policy prevents: a mechanical task burned on the most expensive model wastes tokens for no quality gain. Resolve each task's tier to a model and pass it as `model:`. Omitting it is a Red Flag.

**Principle:** use the *least powerful* model that does each role well. Reserve the most capable ones for genuine judgment — architecture, design, ambiguous specs, review. Never blanket-escalate "to be safe" — that reinstates the bug.

**Forbidden is omission, not the model itself.** A tier may legitimately resolve to the same model the controller runs (e.g. controller on standard, a `standard`-tier task). That is correct — the model was chosen *for the task* and still passed explicitly. The bug is "inherited by omission, without resolving the tier." Resolve the tier first; if the answer equals your model, set it explicitly anyway.

> **Platform note — where the tier lands is not the same everywhere.** The policy is unchanged on every platform; only the *mechanism* that carries it differs, because not every dispatch tool has a `model` argument. **Claude Code / Copilot CLI:** `model:` on the dispatch, as written throughout this file. **Codex:** the v1 `spawn_agent` takes `model`; the v2 surface does not. **Gemini CLI:** a subagent's `model` defaults to `inherit` — literally the controller's model — so the tier needs a custom agent with an explicit `model:`. **opencode:** `task` has no `model` argument at all; the tier is carried by `subagent_type`, backed by one generated agent per tier (`scripts/generate-opencode-agents.cjs`). On any platform where the tier cannot be set at dispatch time, say so in-thread rather than dispatching silently, and record the model actually used in the `validate-dispatch.cjs` manifest so the mechanical gate stays meaningful. Per-platform detail: `super.using-superpowers/references/{codex,gemini,opencode}-tools.md`.

## Abstract tiers (decoupled from model names)

Reason in **tiers**, never hard-coded model names, so a rename or new release never breaks the policy:

| Tier | Role | Resolves to |
|---|---|---|
| `cheap` | Mechanical implementation (1-2 files, complete spec, no deps) | least-capable model that still codes competently |
| `standard` | Integration / multi-file / debugging judgment | a mid-capability model |
| `capable` | Architecture, design, no-spec, high fan-in | the most-capable model |

**Implementation runs cheap by default.** Mechanical tasks — the common case, a closed-scope task file whose spec, code, and commands are already written — resolve to `cheap`; only genuine design/integration judgment escalates to `standard`/`capable`. If a `cheap` implementer returns `BLOCKED` for lack of reasoning power, escalate one tier and re-dispatch (the escalation ladder) — never blanket-provision upward "to be safe".

**Validation gates run one family above the implementer, not at the most-expensive tier.** A per-task gate (spec review, code-quality review) runs at the task's tier **floored at `standard`** — so a `cheap` (mechanical) task is reviewed by the `standard` tier, one family up, not by the most-expensive `capable` tier. A strong-enough reviewer catches a weak model's loose ends without paying the top model to read mechanical code. Onboarding makes `standard` resolve a family above `cheap`, so this floor is a real step up, never the same model reviewing itself. `standard`/`capable` tasks are reviewed at their own tier; QA floors at `standard`. `capable` is reserved for genuine architecture/design work (implementing and reviewing `capable`-tier tasks) — it is not spent reviewing mechanical code. Read-and-report **exploration/research** subagents are *not* gates — they floor at `cheap`/`standard`.

**The one gate above the floor: the whole-branch final review.** The floor above is written **per
task**, and this gate has no task — it reads the integrated branch with no brief scoping what to
look at. It runs on `capable`, whatever tier the tasks carried, with `model:` explicit on the
dispatch. At `standard` this gate approves branches that `capable` sends back: it downgrades
what it does find and misses defects that only show across the whole branch. The re-grade rule
at final-stage gate 1 recovers the first half, never the second. The cost is **one dispatch per
branch**.
Per-task review is unaffected: a scoped diff with an explicit brief is exactly what the `standard`
floor is for.

## Each task carries its tier — read it, don't recompute it

The tier lives in the task file header as `**Tier:**` (`cheap` | `standard` | `capable`), written at planning time by `super.writing-plans`. **Read that field when dispatching** and resolve it to a model. `parse-plan.cjs` surfaces it as each task's `suggestedTier` (an explicit `**Tier:**` overrides the computed value; a missing/invalid one falls back to deterministic signals — spec presence, tasks cited in `**Consome:**`, fan-in, file count, design/architecture keywords):

```bash
node <super.writing-plans-base-dir>/scripts/parse-plan.cjs --tasks-index <path>
# each tasks[] entry → { explicitTier, suggestedTier, tierSignals, consumes, fanIn, specPresent, fileCount }
```

The tier decides the implementer's model. The task's reviewer runs at the same tier floored at `standard` (`super.subagent-driven-development/references/review-cost-control.md`).

**A written `**Tier:**` is binding, not a suggestion.** When the task file carries an explicit `**Tier:**`, the dispatched `model:` MUST equal that tier's resolution (`model_tiers.<tier>` or "auto") — you do NOT get to pre-emptively pick a higher model because a task "feels" integration-heavy, is later in the plan, or comes after a long chain. File count is an imperfect proxy and the *planner* already weighed it when writing the tier; second-guessing it at dispatch time is the silent over-provisioning this policy exists to stop. The **only** legitimate way to a higher model is the escalation ladder: dispatch at the written tier first, and *if* that implementer returns `BLOCKED` for lack of reasoning power (or a review keeps oscillating), escalate one tier, re-dispatch, and **record the reason in-thread** (which task, what the cheaper tier failed at). No recorded escalation → the written tier stands.

### Deterministic pre-dispatch gate (run before every implementer dispatch)

1. Read the task's `**Tier:**` (or `parse-plan.cjs` `suggestedTier` when the field is absent).
2. Resolve it to a model via `session_model_tier_<tier>`.
3. Set `model:` to **exactly** that resolution.
4. **STOP if** the `model:` you are about to pass differs from step 3's result. A higher model is allowed here *only* when this is a re-dispatch on the escalation ladder with a reason already recorded in-thread. Otherwise you have drifted (typically toward your own controller model on the sequential tail of a long session) — correct it to the resolved model before dispatching. Passing a model that does not equal the resolved tier, with no recorded escalation, is a Red Flag identical in severity to omitting `model:`.

## Resolving a tier to a concrete model

**Read the resolved variable, not the YAML** — `session_model_tier_<tier>`, never `model_tiers` raw. `derive-session-state.cjs` has already done the resolution, in this order: the user's `model_tiers.<tier>` when they wrote one this harness can serve; otherwise this platform's own rung alias for that tier. Either way what comes back is a model name you pass straight through as `model:`. Re-reading the raw mapping puts back a model the harness may not serve.

**`auto` is not a model — never dispatch the word, and never omit `model:` in its place.** It survives in the variable only on a platform that publishes no rung aliases, and there it means: pick the rung by ROLE from the models *your current harness* exposes — `cheap` = least-capable that still codes well, `standard` = in between, `capable` = strong enough for the judgment this role needs — and pass that name explicitly. Re-derive from what the harness offers now; never pin a name here.

**`capable` is not "the most capable model available."** The roles that resolve `capable` — the final reviewer, a spec-review lens — execute a written procedure, and turn count beats token price: the strongest rung is reached through the escalation ladder with a reason recorded, never as the default. A `capable` tier with no mapping puts every such role on the controller's own top model, which spends its wall-clock reasoning rather than running the checks.

**No tier available at all** (no `**Tier:**`, no `parse-plan.cjs`, no `model_tiers` — ad-hoc or hand-written plan): still never inherit your own model. Infer the tier from the task's signals (files, spec completeness, deps, design keywords), then resolve that tier as above. When genuinely ambiguous, default to **`standard`** — strong enough for real work, never the most expensive, trivially escalated to `capable` on `BLOCKED`. If the inferred tier resolves to the controller's model, use it — the wrong outcome is skipping the inference and defaulting to your own model.
