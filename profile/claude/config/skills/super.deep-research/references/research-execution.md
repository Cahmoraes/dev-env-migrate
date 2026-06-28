# Research Execution Reference

Execution detail for `super.deep-research`: per-platform mechanism, fan-out + verification protocol, degradation rules, artifact template, and the `super.brainstorming` boundary (sections below).

## Per-platform research mechanism

Canonical mapping. Use exactly the mechanism for your platform.

| Platform | Research mechanism |
|---|---|
| Claude Code | `Skill` tool → `deep-research` skill (native harness: web-search fan-out, source fetch, adversarial verification, cited report). Fallback: subagent fan-out via `Task` using `WebSearch` + `WebFetch`. |
| Copilot CLI | No skill-invocable harness (`/research` is user-only). Subagent fan-out via `task` (agent_type general-purpose) using `web_fetch`, `exa-web-search-free`, `context7` with search-engine URLs. Mention the user may run `/research` manually. |
| Gemini CLI | Subagent fan-out via `@generalist` using `google_web_search` + `web_fetch`. |
| Codex | Subagent fan-out via `spawn_agent` + collection with `wait_agent`, using native web access. |

For exact tool names per platform, see `super.using-superpowers/references/copilot-tools.md`, `codex-tools.md`, `gemini-tools.md`.

## Central question

**"Can native research be invoked from inside a skill?"**

- **Claude Code — YES.** A running skill can invoke the `deep-research` skill via the `Skill` tool (only the `/deep-research` *slash command* is user-only), giving the full native harness in-flow.
- **Copilot CLI, Gemini CLI, Codex — NO.** No skill-invocable engine; fall back to the **subagent fan-out** in the table. The fallback equals the harness in capability — only the orchestration differs.

## Parallel fan-out + adversarial verification protocol

1. **Decompose** the refined question into 3-6 independent sub-questions (e.g. "current best practice", "leading alternatives", "known failure modes", "benchmarks/evidence", "ecosystem maturity").
2. **Dispatch in a single turn.** Launch all investigators in the same tool-calling turn so they run concurrently; give each only minimal context — no history, no file dumps. On the subagent fan-out (not a native harness), set an explicit `model:` on each investigator — floor it at `standard` (research is read-and-verify); never inherit the controller's model by omission (see super.subagent-driven-development § Model Selection).
3. **Cap each response.** Require a bounded summary (≈250-300 words or ≤8 bullets) with explicit sources (title + URL/identifier), not raw page dumps.
4. **Adversarially verify load-bearing claims.** For any finding the design hinges on, require a second independent source or a refutation. Treat single-source claims as hypotheses, not facts; flag uncorroborated ones.
5. **Synthesize centrally.** Reconcile agreements and conflicts yourself. When sources disagree, say which you weight higher and why. Never paste raw investigator output into the artifact.

## Graceful degradation rules

Research tools are best-effort, mirroring how `super.brainstorming` handles `context7` / `exa` being unavailable:

- If a web search/fetch tool is **unavailable, not installed, or out of quota**, do NOT block the session.
- Proceed with the best available knowledge and any partial results.
- **Record the limitation explicitly** in the artifact's *Open Questions* (e.g. "Web search rate-limited; benchmark comparison from model knowledge only, re-verify").
- Never fail the stage just because a tool was missing — the artifact may be thinner, but the pipeline continues.

## Artifact template

Persisted at `docs/superpowers/<feature>/research/research-<feature>.md`.

Frontmatter dates are ISO 8601 with offset from `get-current-datetime.cjs` (host clock). The block below is the **format**, not literal text — generate real values, preserving `created_at` on re-runs and refreshing `updated_at`.

```markdown
---
created_at: "2026-05-30T11:38:20-03:00"
updated_at: "2026-05-30T11:38:20-03:00"
---

# Research: <Feature Title>

## Question & Scope
The refined question and scope from Step 1 (decision it must inform, hard constraints,
what "good enough" means).

## Key Findings
Synthesized, verified conclusions, grouped by sub-question. Mark any single-source or
unverified claim.

## Sources
- [Source title](https://example.com/...) — what it supports
- [Another source](https://example.com/...) — what it supports

## Open Questions
- What remains unresolved.
- Any tool/quota limitations hit during research (graceful-degradation notes).

## Recommendation / Implications for design
What the findings mean for design: recommended direction, options for brainstorming,
trade-offs the spec must resolve.
```

## Responsibility boundary

Both `super.deep-research` and `super.brainstorming` touch "research", but differ:

| | `super.deep-research` | `super.brainstorming` inline research |
|---|---|---|
| Timing | Upfront, before design | During design, as needed |
| Depth | Broad, multi-source, adversarially verified | Light, targeted gap-filling |
| Persistence | Persisted artifact (`research/research-<feature>.md`) | Ephemeral — informs questions, not saved |
| Purpose | Ground the whole design in evidence | Fill a specific gap mid-conversation |

When a research artifact exists, `super.brainstorming` **consumes it** as high-priority input and **skips the overlapping fan-out** — never re-running investigation this stage already cited. Its inline research is reserved for new gaps surfacing during design.
