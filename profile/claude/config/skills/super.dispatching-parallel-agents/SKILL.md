---
name: super.dispatching-parallel-agents
description: Use when 2+ independent tasks can run without shared state or sequential dependencies.
user-invocable: false
---

# Dispatching Parallel Agents

## Pre-flight gate (mandatory)

> **Base dirs:** this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X` (never search for one); a gate script that will not run is a **STOP**, never a skipped gate.

Before dispatching, build a manifest JSON and validate it:

```bash
node <super.dispatching-parallel-agents-base-dir>/scripts/validate-dispatch.cjs --dispatch <manifest.json>
```

Manifest shape:
```json
{
  "modelTiers": { "cheap": "<model_tiers.cheap>", "standard": "<model_tiers.standard>", "capable": "<model_tiers.capable>" },
  "enforceWriteSets": true,
  "agents": [
    {
      "label":            "string (required)",
      "model":            "string (required — never omit; see model-selection policy)",
      "goal":             "string (required)",
      "tier":             "optional — the task's written **Tier:** (cheap|standard|capable)",
      "escalationReason": "optional — non-empty only when this is an escalation-ladder re-dispatch",
      "writeFiles":       ["optional — files this agent will modify"],
      "readFiles":        ["optional — files this agent reads; enables the read∩write gate"],
      "readOnly":         "optional — true for an agent that writes nothing (reviewer, verifier)"
    }
  ]
}
```

**A read-only fan-out must be declared, not skipped.** Most fan-outs here are entirely non-writing — review lenses over a spec, investigators over a question, verifiers over a story list — and every one of those agents is marked `readOnly: true`: it writes nothing, so it is trivially disjoint from every writer and has no write-set to prove, but it stays in the read∩write check — which is the hazard a concurrent reader actually runs (reading a file something else is mid-rewrite). Without the flag, `enforceWriteSets` reports `unverifiable_writeset` for each of them and the whole safe dispatch looks invalid; the failure mode that follows is skipping the pre-flight altogether rather than fixing the manifest. Declaring `readOnly: true` together with a non-empty `writeFiles` is a contradiction and fails with `readonly_with_writeset`.

Pass `modelTiers` and each agent's `tier` so the script enforces the tier↔model equality gate mechanically. **Copy the three values verbatim out of `session_model_tier_{cheap,standard,capable}`** (the bootstrap's already-resolved `model_tiers`, which drops any model the running harness cannot serve to `auto`) — the tiers are abstract and the mapping is per-harness and per-vendor, so a model name you assume, remember, or re-read raw from another harness's mapping is the one thing that must never appear here. A tier whose value is empty or `auto` means the harness picks, and no equality is enforced for it. **Always pass `readFiles`** on a 2+ agent dispatch, wherever it comes from: it is the only thing that turns on the `read_write_hazard` check, and a stale read is the hazard that leaves no trace — an agent that reads a file a sibling is rewriting gets the pre-change version, reports on it confidently, and nothing downstream contradicts it. Every dispatch here is ad-hoc, so **any fan-out that carries a writer also sets `enforceWriteSets: true`**: this closes the gap where `write_conflict` alone (write∩write only) would miss a **`read_write_hazard`** (one agent reads what another writes — stale read) or an **`unverifiable_writeset`** (an agent with no declared write-set, so disjointness is unprovable). The script exits 0 in all cases; read `valid` in the JSON output. **Do not dispatch when `valid: false`** — errors indicate a missing `model:` (silent token waste), a **`tier_model_mismatch`** (an explicit model different from what the written tier resolves to, with no escalation recorded — the exact drift the prose gate targets), a **`write_conflict`** / **`read_write_hazard`** / **`unverifiable_writeset`** (concurrent corruption or unprovable disjointness), or a **`readonly_with_writeset`** (an agent claiming both). A `tier_escalation` **warning** (not an error) records a legitimate escalation-ladder move for the audit trail.

**Run this pre-flight for every concurrent dispatch of 2+ agents — no exceptions for "small" or "obviously safe" ones.** A two-agent dispatch is exactly where the check gets skipped by eye and exactly where an undeclared overlap is invisible; the script costs one call and is the only thing standing between a mixed dispatch and a silently corrupted sibling.

## Dispatch

Once `valid: true`, make one call to the dispatch tool per agent **all in the same response turn** — that is what makes them run concurrently. Dispatching them one at a time is sequential execution, not parallel.

**Then await their results — never poll.** The harness runs these subagents in the background and re-invokes you as each returns; simply wait for their results. Do **not** `sleep`, and do **not** schedule a wakeup/timer to "check on" agents you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow. If your platform exposes an explicit collect primitive (e.g. Codex `wait_agent`), use that; a timed poll is never the mechanism.

Each agent prompt must be **self-contained** (agents never inherit your context — paste error messages and failing test names directly), **scope-constrained** ("fix only X" / "do NOT change production code"), and **output-specific** ("Return: root cause + summary of changes"). Vague prompts ("fix it") or unbounded scope ("fix all the tests") are the main failure modes.

Follow `super.subagent-driven-development/SKILL.md`, "Model Selection" section, for model assignment.

## When to use — decision chain (judgment, not scriptable)

All three must hold:

1. **N independent units of reading, investigation or verification** — one review lens, one research question, one story to verify, one failure to diagnose per agent, each understandable without context from the others.
2. **No shared state** — agents would not interfere (no same files written, no shared resources).
3. **Parallel is faster** — sequential would waste wall-clock time.

**Do NOT use when:**
- **The units are a plan's tasks** — implementation is never concurrent. `super.subagent-driven-development` executes a plan one implementer at a time, and that is the only skill that executes one.
- **The units are related** — resolving one may resolve the others; investigate together first.
- **Need full context** — understanding requires seeing the whole system.
- **Exploratory** — you do not yet know what is broken, or what each agent would be looking for.

## After agents return

1. **Review each summary** — understand what changed and confirm scope was respected.
2. **Check for cross-agent conflicts** — did any agent touch code another agent also touched?
3. **Run the full test suite** — verify all fixes work together (individual fixes can interact).
4. **Spot check** — agents can make systematic errors; sample the actual diffs.
