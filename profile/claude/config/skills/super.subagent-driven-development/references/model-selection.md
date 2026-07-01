# Model Selection — full policy

> Canonical model-selection policy for all execution skills. `super.parallel-subagent-development`, `super.parallel-subagent-in-tree`, and `super.dispatching-parallel-agents` defer to this — they do not redefine it.

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

**Reviewers** (spec, code-quality, final): run at the **tier of the task under review, floored at `standard`**. Review is judgment work — never review a `cheap` task with a `cheap` model; a `capable`-tier task gets `capable` reviewers.

## Each task carries its tier — read it, don't recompute it

The tier lives in the task file header as `**Tier:**` (`cheap` | `standard` | `capable`), written at planning time by `super.writing-plans`. **Read that field when dispatching** and resolve it to a model. `parse-waves.cjs` surfaces it as each task's `suggestedTier` (an explicit `**Tier:**` overrides the computed value; a missing/invalid one falls back to deterministic signals — spec presence, `**Depends on:**` count, fan-in, file count, design/architecture keywords):

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index <path>
# each tasks[] entry → { explicitTier, suggestedTier, tierSignals, fanIn, specPresent, fileCount }
```

**Tier is the default, not the verdict.** File count is an imperfect proxy — a one-file task can still be hard. Override upward when a task needs more reasoning; if an implementer returns `BLOCKED` for lack of reasoning power, escalate one tier and re-dispatch.

## Resolving a tier to a concrete model ("auto" by default)

1. **If `.superpowers/preferences.yml` `model_tiers.<tier>` is set** (surfaced as `session_model_tier_<tier>` by `derive-session-state.cjs`) → use that exact model name (user's explicit override).
2. **If empty/null — the default, "auto"** → pick dynamically from the models *your current harness* exposes, ordered by capability: `cheap` = least-capable that still codes well, `capable` = most-capable, `standard` = in between. Re-derive from whatever the harness offers now — never pin a name.

Either way, pass the resolved model as `model:`. **"auto" is the expected default and fully sufficient — it does NOT mean "inherit the controller's model."** It means the controller chooses the least-powerful-sufficient model per task.

**No tier available at all** (no `**Tier:**`, no `parse-waves.cjs`, no `model_tiers` — ad-hoc or hand-written plan): still never inherit your own model. Infer the tier from the task's signals (files, spec completeness, deps, design keywords), then resolve via "auto". When genuinely ambiguous, default to **`standard`** — strong enough for real work, never the most expensive, trivially escalated to `capable` on `BLOCKED`. If the inferred tier resolves to the controller's model, use it — the wrong outcome is skipping the inference and defaulting to your own model.
