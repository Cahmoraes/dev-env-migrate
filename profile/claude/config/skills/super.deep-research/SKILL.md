---
name: super.deep-research
description: "Deep, multi-source investigation before designing — 'pesquise sobre X', 'compare X e Y'. Not for a quick fact lookup or a known domain."
argument-hint: "[optional: the topic or question to research]"
---

# Deep Research

Investigate a topic deeply and adversarially **before** any design work begins, then persist a cited, graded, synthesized artifact the rest of the pipeline consumes. This is the **optional first stage**; the decisions distilled here flow into the design spec (`super.brainstorming`) and PRD (`super.generating-prd`).

You act as the **researcher**, not the search engine: investigators collect, you appraise the sources, cross-check the reports against each other, grade each finding by the evidence behind it, and only then write. The artifact is trusted downstream *because* it says how sure it is and why.

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
- `super.brainstorming` reuses this slug when `docs/superpowers/<feature>/research/` already exists, consuming the artifact as a high-priority input — skipping research it would otherwise duplicate.

## Constraints

<law>
1. Stay inside the internal superpowers flow; this skill does not enter the harness's native plan mode.
2. Do not invoke a platform-native research slash command (e.g. `/deep-research`, `/research`) from this procedure — slash commands are user-initiated only. Invoking native research as a *skill* via the platform skill mechanism IS allowed where supported (see the per-platform table in references/research-execution.md) — that is a skill call, not a slash command.
3. Do not scaffold projects, write implementation code, or take any implementation action: this stage only investigates and persists a research artifact, then hands off.
4. Degrade gracefully. If research / web tools are unavailable or out of quota, record the limitation in the artifact and proceed with what you have; the session does not block on it.
</law>

## Procedure

Complete these steps in order.

### Step 1 — Scope refinement

Before any research runs, narrow the scope: ask **2-3 high-level questions** — independent ones with fixed answer sets may share one message; interdependent ones go in order. Good questions establish the decision the research must inform, hard constraints (stack, budget, compliance, timeline), and what "good enough" looks like. Prefer multiple-choice.

<conditional-block>
Do NOT dispatch any research fan-out until the scope is clear. If the user gave a precise, well-bounded question up front, ask a single confirming question and proceed. If the question is broad or ambiguous, keep refining until you can target the research.
</conditional-block>

### Step 2 — Establish feature slug & directory

> **Base dirs:** this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X` (never search for one); a gate script that will not run is a **STOP**, never a skipped gate.

Derive a kebab-case `<feature>` slug from the refined question (e.g. `realtime-sync-strategy`, `state-management-comparison`), then create the research directory deterministically:

```bash
node <super.deep-research-base-dir>/scripts/init-feature-dir.cjs --slug <slug>
```

The script is **idempotent**: if `docs/superpowers/<slug>/research/` already exists it reuses it (`alreadyExisted: true`) instead of failing. It prints JSON — read `path` and `slug` from it and carry them forward.

### Step 3 — Parallel research (breadth)

Decompose the refined question into 3-6 sub-questions — for each, note what answer would **refute** the leading hypothesis, so investigators hunt for counter-evidence and not only confirmation — then run them **in parallel** using your platform's native research mechanism, or the subagent fan-out fallback where no skill-invocable harness exists. Every investigator returns a capped, per-bullet-sourced summary and names the strongest counter-evidence it met. The per-platform mechanism table, the fan-out protocol, and the graceful-degradation rules live in [references/research-execution.md](references/research-execution.md). Two non-negotiables it enforces:

- **Verify adversarially** — seek a second independent source or a refutation before trusting a load-bearing claim.
- **Degrade gracefully** — if web/research tools are unavailable or rate-limited, note it in the artifact and continue; never block the session (Constraint 4).

### Step 4 — Appraise, triangulate, grade (judgment)

Read [Source appraisal](references/research-execution.md#source-appraisal) and [Triangulation and conflict resolution](references/research-execution.md#triangulation-and-conflict-resolution) **before** touching the reports. This is a separate step from synthesis, on purpose: written straight from the reports, a well-worded single-source claim becomes a finding.

- **Appraise every source** on kind (primary vs secondary), recency, independence and interest. Two dependent sources are one source; a vendor's docs plus tutorials paraphrasing them corroborate nothing.
- **Cross-check the reports against each other**, sub-question by sub-question, and **grade each claim**: *Established* (≥2 independent sources, one primary, nothing credible against), *Probable*, *Contested* (credible disagreement — state both sides and your weighting), *Unverified* (single secondary source or model knowledge — a hypothesis, never a finding).
- **Resolve apparent conflicts** before calling them contested: same question (version, scale, platform)? one newer than a change the other predates? one with an interest the other lacks? What survives is a real fork the design spec will have to close.

### Step 5 — Second pass (depth, bounded)

Run **one** targeted fan-out on what Step 4 left open — load-bearing claims graded *Probable*/*Unverified*, *Contested* forks whose resolution changes the recommendation, sub-questions nobody answered — giving investigators the specific claim and the sources already seen. Two passes is the cap; what is still open afterwards is an Open Question, not a third round. Skip only when nothing needs targeting, and say so in the artifact. Rules in [Gap-driven second pass](references/research-execution.md#gap-driven-second-pass).

### Step 6 — Synthesize, review, persist

Synthesize the findings yourself — **never paste raw subagent or harness output** — then review the draft as its harshest reader against [Critical review of the draft](references/research-execution.md#critical-review-of-the-draft) (grades match sources, recommendation follows from graded findings, forks named, scope answered, model knowledge labelled) and fix what fails. For high-stakes conclusions you may add one read-only reviewer subagent, floored at `standard`; the inline review is not optional. Write the result to `docs/superpowers/<feature>/research/research-<feature>.md`.

Required sections (template and example frontmatter in [references/research-execution.md](references/research-execution.md#artifact-template)):

1. **Question & Scope** — refined question + scope from Step 1.
2. **Key Findings** — synthesized conclusions, each with its confidence grade; contested ones with both positions and your weighting.
3. **Sources** — citations (title + URL/identifier) with kind and date, per finding.
4. **Open Questions** — what the second pass left open (or why it was not needed), plus any tool/quota limitations hit.
5. **Recommendation / Implications for design** — direction, the forks the spec must close, the assumptions it rests on.

### Step 7 — Handoff

Report the artifact path in one line. Then:

- **The session came from a feature request** (a feature was asked for alongside the research, or the deep-research offer inside `super.brainstorming` sent it here): invoke `super.brainstorming` now, in the same turn, passing the artifact path so it reuses the slug and consumes the findings instead of repeating the fan-out. No "shall we continue?" — the feature request already answered it.
- **The user asked for research alone** ("pesquise sobre X" with no feature behind it): the artifact is the deliverable; stop.

## Platform Adaptation

Whether native research is skill-invocable per platform, and the per-platform table, are in [references/research-execution.md](references/research-execution.md#central-question). Concrete subagent/web-fetch tool names per platform: `super.using-superpowers/references/{copilot,codex,gemini,opencode}-tools.md`.

## Key Principles

- **Refine before you research** — scope first, fan-out second.
- **Judge before you write** — appraise sources, cross-check reports, grade every claim; a single source is a hypothesis, not a finding.
- **Depth is one bounded pass, not a loop** — a documented open question beats a third round of search.
- **Synthesize, don't dump** — the artifact is your distilled, graded, cited conclusion, reviewed as its harshest reader would.
- **Non-blocking** — degrade gracefully; missing tools are noted in the artifact, never a reason to stop the session.
