---
name: super.deep-research
description: "Optional upfront research stage of the superpowers pipeline. Use BEFORE designing when the user wants deep, multi-source investigation — state of the art, technology comparisons, library/approach trade-offs, fact-checked findings on a topic — so the brainstorming and design that follow are grounded in evidence. Persists a cited research artifact and hands off to super.brainstorming. Runs ahead of brainstorming and is reachable as its own path from triage."
argumentHint: "[optional: the topic or question to research]"
---

# Deep Research

Investigate a topic deeply and adversarially **before** any design work begins, then persist a cited, synthesized artifact the rest of the pipeline consumes. This is the **optional first stage**; the decisions distilled here flow into the design spec (`super.brainstorming`) and PRD (`super.generating-prd`).

```
super.deep-research (optional) → super.brainstorming → super.generating-prd → super.writing-plans → execution → QA → finishing
```

**Announce at start:** "I'm using the deep-research skill to investigate this before we design."

## When To Use This

Use when the user wants genuine investigation before committing to a design — not a quick fact lookup:

- "What's the state of the art for X?"
- "Compare these technologies / libraries / approaches before we pick one."
- "Research how others solve Y, with sources."
- "Do a deep dive on Z before we design."

Light, in-flight gap-filling during design belongs to `super.brainstorming`'s inline research, not here. See [Responsibility boundary](references/research-execution.md#responsibility-boundary).

## What This Stage Produces

A single persisted artifact: `docs/superpowers/<feature>/research/research-<feature>.md`

- `<feature>` is a kebab-case slug **established by this skill** (derived from the refined question).
- The artifact carries `created_at` / `updated_at` frontmatter in ISO 8601 with offset, generated deterministically from the host clock.
- `super.brainstorming` reuses this slug when `docs/superpowers/<feature>/research/` already exists, consuming the artifact as a high-priority input — skipping research it would otherwise duplicate.

> **Memory note:** research is an *input*, not a decision — excluded from the GateResync fingerprint, so editing or regenerating it never marks memory dirty (see Constraint 4).

## Constraints

<law>
1. Stay inside the internal superpowers flow. NEVER enter platform-native plan mode (EnterPlanMode / ExitPlanMode / `/plan`) from this skill.
2. NEVER invoke a platform-native research slash command (e.g. `/deep-research`, `/research`) from this procedure — slash commands are user-initiated only. Invoking native research as a *skill* via the platform skill mechanism IS allowed where supported (see the per-platform table in references/research-execution.md) — that is a skill call, not a slash command.
3. NEVER scaffold projects, write implementation code, or take any implementation action. This stage only investigates and persists a research artifact, then hands off.
4. Research is excluded from the GateResync fingerprint. Do not add `research/` to any memory inventory or manifest.
5. Degrade gracefully. If research / web tools are unavailable or out of quota, do NOT block the session — record the limitation in the artifact and proceed with what you have.
</law>

## Procedure

Complete these steps in order.

### Step 1 — Scope refinement

Before any research runs, narrow the scope: ask **2-3 high-level questions, ONE AT A TIME**, waiting for each answer. Good questions establish the decision the research must inform, hard constraints (stack, budget, compliance, timeline), and what "good enough" looks like. Prefer multiple-choice.

<conditional-block>
Do NOT dispatch any research fan-out until the scope is clear. If the user gave a precise, well-bounded question up front, ask a single confirming question and proceed. If the question is broad or ambiguous, keep refining until you can target the research.
</conditional-block>

### Step 2 — Establish feature slug & directory

Derive a kebab-case `<feature>` slug from the refined question (e.g. `realtime-sync-strategy`, `state-management-comparison`), then create the research directory deterministically:

```bash
node <super.deep-research-base-dir>/scripts/init-feature-dir.cjs --slug <slug>
```

The script is **idempotent**: if `docs/superpowers/<slug>/research/` already exists it reuses it (`alreadyExisted: true`) instead of failing. It prints JSON — read `path` and `slug` from it and carry them forward. (Your skill context header shows the base directory to build the absolute path above.)

### Step 3 — Parallel research

Run the investigation **in parallel** using your platform's native research mechanism, or the subagent fan-out fallback where no skill-invocable harness exists. The per-platform mechanism table, the fan-out + adversarial-verification protocol, and the graceful-degradation rules all live in [references/research-execution.md](references/research-execution.md). Two non-negotiables it enforces:

- **Verify adversarially** — seek a second independent source or a refutation before trusting a load-bearing claim.
- **Degrade gracefully** — if web/research tools are unavailable or rate-limited, note it in the artifact and continue; never block the session (Constraint 5).

### Step 4 — Synthesize & persist

Synthesize the findings yourself — **never paste raw subagent or harness output** — and write the result to `docs/superpowers/<feature>/research/research-<feature>.md`.

Required sections (template and example frontmatter in [references/research-execution.md](references/research-execution.md#artifact-template)):

1. **Question & Scope** — refined question + scope from Step 1.
2. **Key Findings** — synthesized, verified conclusions.
3. **Sources** — citations (title + URL/identifier) per finding.
4. **Open Questions** — unresolved items, plus any tool/quota limitations hit.
5. **Recommendation / Implications for design**.

**Frontmatter dates:** the report carries `created_at`/`updated_at`. For the date rules and the deterministic `frontmatter-utils.cjs` mechanics, read `../super.brainstorming/references/deterministic-scaffolding.md` (scripts are at `<super.deep-research-base-dir>/../super.brainstorming/scripts/`).

### Step 5 — Handoff

Tell the user the artifact path and offer the next step:

> "Research saved to `<path>`. I recommend we move into brainstorming next — I'll pass this research as a high-priority input so we don't re-investigate. Or we can stop here if this standalone research is all you needed."

- **Default:** proceed to `super.brainstorming`, passing the artifact path so it reuses the slug and consumes the findings instead of repeating the fan-out.
- **Standalone:** this stage is OPTIONAL — if the user only wanted research, stop here. Do not force the pipeline forward.

## Platform Adaptation

Whether native research is skill-invocable per platform (yes on Claude Code via `Skill`; subagent fan-out elsewhere) and the per-platform table are in [references/research-execution.md](references/research-execution.md#central-question). Concrete subagent/web-fetch tool names per platform: `super.using-superpowers/references/{copilot,codex,gemini}-tools.md`.

## Key Principles

- **Refine before you research** — scope first, fan-out second.
- **Verify adversarially** — a single source is a hypothesis, not a finding.
- **Synthesize, don't dump** — the artifact is your distilled, cited conclusion.
- **Optional and non-blocking** — degrade gracefully, and let the user stop after research.
