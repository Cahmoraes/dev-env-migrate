---
name: super.dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

# Dispatching Parallel Agents

## Pre-flight gate (mandatory)

Before dispatching, build a manifest JSON and validate it:

```bash
node <super.dispatching-parallel-agents-base-dir>/scripts/validate-dispatch.cjs --dispatch <manifest.json>
```

Manifest shape:
```json
{
  "modelTiers": { "cheap": "haiku", "standard": "sonnet", "capable": "sonnet" },
  "enforceWriteSets": true,
  "agents": [
    {
      "label":            "string (required)",
      "model":            "string (required — never omit; see model-selection policy)",
      "goal":             "string (required)",
      "tier":             "optional — the task's written **Tier:** (cheap|standard|capable)",
      "escalationReason": "optional — non-empty only when this is an escalation-ladder re-dispatch",
      "writeFiles":       ["optional — files this agent will modify"],
      "readFiles":        ["optional — files this agent reads; enables the read∩write gate"]
    }
  ]
}
```

Pass `modelTiers` (from preferences `model_tiers`) and each agent's `tier` so the script enforces the tier↔model equality gate mechanically. For an **ad-hoc parallel dispatch** — which has no `check-wave-disjoint.cjs` wave pre-flight upstream — also pass `readFiles` and set `enforceWriteSets: true` to get the same write-set safety the in-tree mode has: this closes the gap where `write_conflict` alone (write∩write only) would miss a **`read_write_hazard`** (one agent reads what another writes — stale read) or an **`unverifiable_writeset`** (an agent with no declared write-set, so disjointness is unprovable). The script exits 0 in all cases; read `valid` in the JSON output. **Do not dispatch when `valid: false`** — errors indicate a missing `model:` (silent token waste), a **`tier_model_mismatch`** (an explicit model different from what the written tier resolves to, with no escalation recorded — the exact drift the prose gate targets), or a **`write_conflict`** / **`read_write_hazard`** / **`unverifiable_writeset`** (concurrent corruption or unprovable disjointness). A `tier_escalation` **warning** (not an error) records a legitimate escalation-ladder move for the audit trail.

## Dispatch

Once `valid: true`, call one `Task(...)` per agent **all in the same response turn** — that is what makes them run concurrently. Dispatching them one at a time is sequential execution, not parallel.

**Then await their results — never poll.** The harness runs these subagents in the background and re-invokes you as each returns; simply wait for their results. Do **not** `sleep`, and do **not** schedule a wakeup/timer to "check on" agents you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow. If your platform exposes an explicit collect primitive (e.g. Codex `wait_agent`), use that; a timed poll is never the mechanism.

Each agent prompt must be **self-contained** (agents never inherit your context — paste error messages and failing test names directly), **scope-constrained** ("fix only X" / "do NOT change production code"), and **output-specific** ("Return: root cause + summary of changes"). Vague prompts ("fix it") or unbounded scope ("fix all the tests") are the main failure modes.

Follow `super.subagent-driven-development/SKILL.md`, "Model Selection" section, for model assignment.

## When to use — decision chain (judgment, not scriptable)

All three must hold:

1. **Multiple independent failures** — each has a distinct root cause, understandable without context from the others.
2. **No shared state** — agents would not interfere (no same files written, no shared resources).
3. **Parallel is faster** — sequential would waste wall-clock time.

**Do NOT use when:**
- **Related failures** — fixing one may fix others; investigate together first.
- **Need full context** — understanding requires seeing the whole system.
- **Exploratory debugging** — you don't yet know what's broken.

## After agents return

1. **Review each summary** — understand what changed and confirm scope was respected.
2. **Check for cross-agent conflicts** — did any agent touch code another agent also touched?
3. **Run the full test suite** — verify all fixes work together (individual fixes can interact).
4. **Spot check** — agents can make systematic errors; sample the actual diffs.
