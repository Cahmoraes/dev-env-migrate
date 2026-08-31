# Research Subagent Prompt Templates

Use these when dispatching the parallel research subagents (see SKILL.md, "Research via Parallel Subagents" section). The **Feature history recall** track carries a full agent contract of its own — tier, steps and output shape — and lives in `../agents/feature-history-recall.md`.

> **`explore` is an agent TYPE, never a tool.** Dispatch with your platform's subagent tool and pass the type in whatever parameter that tool uses for it (`super.using-superpowers/references/*-tools.md` names both, per platform). Calling `explore` — or `Explore` — as a tool fails with *"No such tool available"*; if you see that error naming an agent type, re-issue it as the argument instead of hunting for the tool. The type name is per-platform too, so when your harness has no `explore`, use its read-only/search agent, or its general-purpose one.

**General rules:** Provide only the minimum context each subagent needs — no conversation history, no full file dumps. Cap every response at ~300 words or 8 bullets (summaries, not raw output). Set an explicit `model:` on each dispatch — research is read-and-report, so floor it at `cheap` (location/inventory) or `standard` (synthesis); never inherit the controller's model by omission (see super.subagent-driven-development, "Model Selection" section). When a subagent needs to locate or verify a named code symbol (class, function, hook, store selector, route), instruct it to use `grep`, anchored to the class/file name (not just the bare symbol) to avoid false positives — measured cheaper and more reliable in this pipeline's real dispatch conditions than chasing a symbol-lookup tool. If the platform's symbol-lookup tool (`LSP`, or Serena's `find_symbol` / `get_symbols_overview`) is already loaded, one opportunistic attempt is fine, but abandon it after that single try and fall back to `grep` — never spend extra calls loading or retrying it (per-platform tool names: `super.using-superpowers/references/*-tools.md`).

## Codebase exploration — dispatch a subagent, agent type `explore`

```
Explore [path] for [topic]. Return (max 8 bullets, summaries only):
- relevant files/modules and their purpose
- patterns and conventions in use
- recent commits related to [topic]
To find a named symbol, use grep (anchored to a class/file name); a symbol-lookup tool, if already loaded, is worth one quick opportunistic try but not worth chasing further.
No raw file contents.
```

## Library / API docs — dispatch a subagent, agent type `explore`, instructed to use context7

```
Use the context7 skill. Library: [name]. Question: [specific API or usage question].
Return (max ~250 words): the 2–3 most relevant API details, one code example, and key version caveats.
```

## Web research — dispatch a subagent, agent type `explore`, instructed to use exa-web-search-free

```
Use the exa-web-search-free skill. Query: [specific question about technology or pattern].
Context: [one sentence describing what we're designing].
Return (max ~300 words): key findings, relevant patterns, open questions, and caveats.
```
