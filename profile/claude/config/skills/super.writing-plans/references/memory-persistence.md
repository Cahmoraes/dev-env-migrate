# Memory Persistence

> **Guard:** If `session_memory_enabled = false`, skip this document and go straight to Execution Handoff. The rest applies only when persistent memory is enabled.

After self-review and before the execution handoff, persist the key planning artifacts to `super.persistent-memory` so future brainstorming recalls prior decisions, constraints, and scope.

## Graceful Degradation

1. Run `pmem sync` to verify memory availability
2. If it fails with "database not found": run `pmem init`, then retry
3. If `pmem` is unavailable (not installed, broken): run the **Availability Gate (Ask-to-Install)** from `super.persistent-memory/SKILL.md` to offer installing the missing deps. If `session_pmem_available` is already `false` (user declined, or install failed), skip silently and proceed to Execution Handoff

## Dedupe Check

Before writing, search for existing memory:
```bash
pmem search "<feature-name>" --limit 3
```
If results exist for this exact feature (same slug in artifact paths), skip the write — already persisted. Only write for a new feature or a materially changed plan (new tasks, revised decisions).

## What to Persist

Persist **2-3 focused entries** (not one monolithic blob), each concise and retrieval-optimized:

**Entry 1 — Architectural decisions and constraints:**
```bash
pmem add "Feature: <feature-name>. Decisions: [list key architectural choices from the spec, e.g., 'Use Observer pattern for domain events', 'Repository pattern with Inversify DI']. Constraints: [list established rules, e.g., 'No exceptions for business logic — use Either', 'Maximum 3 dependencies per use case']." \
  --tags "architecture,decision,<feature-name>,<bounded-context>" \
  --source "assistant"
```

**Entry 2 — Feature scope and boundaries:**
```bash
pmem add "Feature: <feature-name>. Objective: [one-sentence goal from PRD]. Scope: [key user stories or capabilities]. Out-of-scope: [explicitly excluded items]. Bounded context: <context-name>." \
  --tags "scope,prd,<feature-name>,<bounded-context>" \
  --source "assistant"
```

**Entry 3 — Artifact paths (reference index):**
```bash
pmem add "Feature: <feature-name>. Artifacts — Spec: docs/superpowers/<feature-name>/specs/<feature-name>-design.md | PRD: docs/superpowers/<feature-name>/prd/prd-<feature-name>.md | Tasks: docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md | Task count: N." \
  --tags "artifacts,paths,<feature-name>" \
  --source "assistant"
```

## Atomic, Auditable Write (preferred)

Synthesizing the entries is your job; **executing the writes is the script's.** Three loose `pmem add` calls can each silently fail or be skipped mid-way, and each reloads the embedding model. Run them instead as one auditable operation via `persist-feature-memory.cjs`: it pipes all entries through a single `pmem add-batch` (model loads once, not three times — ~3x faster), classifies each result (added / skipped-duplicate / failed), and returns a deterministic exit code (0 = all added-or-skipped, 2 = a write failed) so you can confirm persistence happened:

```bash
node <super.persistent-memory-base-dir>/scripts/persist-feature-memory.cjs --input-file <entries.json>
```

where `entries.json` holds the entries synthesized above:

```json
{
  "feature": "<feature-name>",
  "entries": [
    { "content": "Feature: <name>. Decisions: ... Constraints: ...", "tags": "architecture,decision,<name>,<context>", "source": "assistant" },
    { "content": "Feature: <name>. Objective: ... Scope: ... Out-of-scope: ...", "tags": "scope,prd,<name>,<context>", "source": "assistant" },
    { "content": "Feature: <name>. Artifacts — Spec: ... | PRD: ... | Tasks: ...", "tags": "artifacts,paths,<name>", "source": "assistant" }
  ]
}
```

Inspect the JSON output: `failed` must be `0` before the Execution Handoff. If `pmemAvailable` is `false`, persistence degraded gracefully (pmem not installed) — acceptable per the guard above. Add `"deferEmbed": true` to insert instantly and let `pmem backfill-embeddings` build the vectors later (use when handoff latency matters more than immediate semantic recall). **Fallback:** run the `pmem add` commands manually if the script is unavailable. Re-running is always safe — pmem deduplicates by content hash, so prior entries return as skipped, not duplicated.

## Rules

- Keep each entry under 500 characters when possible — concise entries retrieve better
- Use concrete domain terms (not generic words like "the system" or "the module")
- Tags should include the feature slug and bounded context name for targeted retrieval
- If no PRD exists, omit Entry 2 or adapt it from the spec's scope section
- This step is automatic — no user confirmation required
