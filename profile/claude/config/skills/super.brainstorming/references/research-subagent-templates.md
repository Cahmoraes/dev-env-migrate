# Research Subagent Prompt Templates

Use these when dispatching the parallel research subagents (see SKILL.md, "Research via Parallel Subagents" section). The **Feature history recall** track carries a full agent contract of its own — tier, steps and output shape — and lives in `../agents/feature-history-recall.md`.

> **`explore` is an agent TYPE, never a tool.** Dispatch with your platform's subagent tool and pass the type in whatever parameter that tool uses for it (`super.using-superpowers/references/*-tools.md` names both, per platform). Calling `explore` — or `Explore` — as a tool fails with *"No such tool available"*; if you see that error naming an agent type, re-issue it as the argument instead of hunting for the tool. The type name is per-platform too, so when your harness has no `explore`, use its read-only/search agent, or its general-purpose one.

**General rules:** Provide only the minimum context each subagent needs — no conversation history, no full file dumps. Cap every response at ~300 words or 8 bullets (summaries, not raw output). Set an explicit `model:` on each dispatch — research is read-and-report, so floor it at `cheap` (location/inventory) or `standard` (synthesis); never inherit the controller's model by omission (see super.subagent-driven-development, "Model Selection" section). When a subagent needs to locate or verify a named code symbol (class, function, hook, store selector, route), instruct it to search the code anchored to the class/file name (not just the bare symbol) to avoid false positives, with whatever search capability its session has, in one pass and without spending calls loading a new tool.

## Codebase exploration — dispatch a subagent, agent type `explore`

```
Explore [path] for [topic]. Return (max 8 bullets, summaries only):
- relevant files/modules and their purpose
- patterns and conventions in use
- recent commits related to [topic]
To find a named symbol, search anchored to its class/file name with whatever search capability you already have; never spend a call hunting for a specific search tool.
No raw file contents.
```

## Library / API docs — dispatch a subagent, agent type `explore`, instructed to use the session's library-docs tool

```
Use the library-docs tool or skill this session has (fall back to the official docs on the web). Library: [name]. Question: [specific API or usage question].
Return (max ~250 words): the 2–3 most relevant API details, one code example, and key version caveats.
```

## Web research — dispatch a subagent, agent type `explore`, instructed to use the session's web-search tool

```
Use the web-search tool or skill this session has. Query: [specific question about technology or pattern].
Context: [one sentence describing what we're designing].
Return (max ~300 words): key findings, relevant patterns, open questions, and caveats.
```
