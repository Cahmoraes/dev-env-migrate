# Research Subagent Prompt Templates

Use these when dispatching the parallel research subagents (see SKILL.md § Research via Parallel Subagents).

**General rules:** Provide only the minimum context each subagent needs — no conversation history, no full file dumps. Cap every response at ~300 words or 8 bullets (summaries, not raw output). Set an explicit `model:` on each dispatch — research is read-and-report, so floor it at `cheap` (location/inventory) or `standard` (synthesis); never inherit the controller's model by omission (see super.subagent-driven-development § Model Selection).

## Memory recall — dispatch via `task` (task agent)

Only dispatch if `session_memory_enabled = true`. Skip this template entirely when memory is disabled. Before dispatching, run the **Availability Gate (Ask-to-Install)** from `super.persistent-memory/SKILL.md` in the main thread (subagents cannot ask the user). If pmem stays unavailable (declined / install failed) or search returns nothing, continue without memory context — don't block.

This subagent uses the `super.persistent-memory` CLI to check for prior knowledge relevant to the topic: it ensures the database exists, then runs targeted searches.

```
Retrieve prior decisions, specs, and constraints relevant to: [feature-topic].

Steps:
1. Run: pmem sync
   - If it fails with "database not found" or similar, run: pmem init
   - If pmem is not installed or completely unavailable, return: "Memory unavailable — skip."
2. Run 2-3 targeted searches (adapt queries to the specific domain):
   - pmem search "[feature-name or domain noun]" --limit 5
   - pmem search "[bounded-context or component name] architecture decision" --limit 5
   - pmem search "[feature-name] spec PRD constraint" --limit 3
3. Deduplicate results and return (max 8 bullets):
   - Key architectural decisions or rules that constrain this domain
   - Paths to existing artifacts (specs, PRDs, ADRs) — just paths, not full content
   - Established scope boundaries or out-of-scope items
   - Any relevant constraints or patterns previously decided

If all searches return empty, return: "No prior memory found for this topic."
Do not return raw pmem output — synthesize into actionable bullets.
```

## Codebase exploration — dispatch via `task` (explore agent)

```
Explore [path] for [topic]. Return (max 8 bullets, summaries only):
- relevant files/modules and their purpose
- patterns and conventions in use
- recent commits related to [topic]
No raw file contents.
```

## Library / API docs — dispatch via `task` (explore agent, instructed to use context7)

```
Use the context7 skill. Library: [name]. Question: [specific API or usage question].
Return (max ~250 words): the 2–3 most relevant API details, one code example, and key version caveats.
```

## Web research — dispatch via `task` (explore agent, instructed to use exa-web-search-free)

```
Use the exa-web-search-free skill. Query: [specific question about technology or pattern].
Context: [one sentence describing what we're designing].
Return (max ~300 words): key findings, relevant patterns, open questions, and caveats.
```
