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
  "agents": [
    {
      "label":      "string (required)",
      "model":      "string (required — never omit; see model-selection policy)",
      "goal":       "string (required)",
      "writeFiles": ["optional — files this agent will modify"]
    }
  ]
}
```

The script exits 0 in all cases; read `valid` in the JSON output. **Do not dispatch when `valid: false`** — errors indicate either a missing `model:` (silent token waste) or a write-set conflict (concurrent corruption).

## Dispatch

Once `valid: true`, call one `Task(...)` per agent **all in the same response turn** — that is what makes them run concurrently. Dispatching them one at a time is sequential execution, not parallel.

Each agent prompt must be **self-contained** (agents never inherit your context — paste error messages and failing test names directly), **scope-constrained** ("fix only X" / "do NOT change production code"), and **output-specific** ("Return: root cause + summary of changes"). Vague prompts ("fix it") or unbounded scope ("fix all the tests") are the main failure modes.

Follow `super.subagent-driven-development/SKILL.md § Model Selection` for model assignment.

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
