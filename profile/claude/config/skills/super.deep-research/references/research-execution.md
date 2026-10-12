# Research Execution Reference

Execution detail for `super.deep-research`: per-platform mechanism, fan-out protocol, source appraisal and triangulation (the judgment pass), the bounded second pass, confidence grades, degradation rules, artifact template, and the `super.brainstorming` boundary (sections below).

## Per-platform research mechanism

Canonical mapping. Use exactly the mechanism for your platform.

| Platform | Research mechanism |
|---|---|
| Claude Code | `Skill` tool → `deep-research` skill (native harness: web-search fan-out, source fetch, adversarial verification, cited report). Fallback: subagent fan-out via `Agent` using `WebSearch` + `WebFetch`. |
| Copilot CLI | No skill-invocable harness (`/research` is user-only). Subagent fan-out via `task` (agent_type general-purpose) using the session's web-search and fetch tools (or fetching search-engine URLs). Mention the user may run `/research` manually. |
| Gemini CLI | Subagent fan-out via `@generalist` using `google_web_search` + `web_fetch`. |
| Codex | Subagent fan-out via `spawn_agent` + collection with `wait_agent`, using native web access. |
| opencode | Subagent fan-out via `task` (`subagent_type: "general"`) using `webfetch`; `websearch` only when the session's model exposes it, else fetch search-engine URLs. |

For exact tool names per platform, see `super.using-superpowers/references/copilot-tools.md`, `codex-tools.md`, `gemini-tools.md`, `opencode-tools.md`.

## Central question

**"Can native research be invoked from inside a skill?"**

- **Claude Code — YES.** A running skill can invoke the `deep-research` skill via the `Skill` tool (only the `/deep-research` *slash command* is user-only), giving the full native harness in-flow.
- **Copilot CLI, Gemini CLI, Codex, opencode — NO.** No skill-invocable engine; fall back to the **subagent fan-out** in the table. The fallback equals the harness in capability — only the orchestration differs.

## Parallel fan-out + adversarial verification protocol

1. **Decompose** the refined question into 3-6 independent sub-questions (e.g. "current best practice", "leading alternatives", "known failure modes", "benchmarks/evidence", "ecosystem maturity"). For each sub-question, write down **what would change the decision** — the answer you are looking for, and the answer that would refute the leading hypothesis. Investigators that know what would refute a claim search for refutations; investigators that only know the topic collect confirmations.
2. **Dispatch in a single turn.** Launch all investigators in the same tool-calling turn so they run concurrently; give each only minimal context — no history, no file dumps. On the subagent fan-out (not a native harness), set an explicit `model:` on each investigator — floor it at `standard` (research is read-and-verify); never inherit the controller's model by omission (see super.subagent-driven-development, "Model Selection" section). **Then await the investigators — never poll.** They run in the background and the harness re-invokes you as each returns; simply wait. Do **not** `sleep` or schedule a wakeup/timer to "check on" investigators you just launched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow. Platforms with an explicit collect primitive (Codex `wait_agent`) use that, never a timed poll.
3. **Cap each response.** Require a bounded summary (≈250-300 words or ≤8 bullets) with explicit sources (title + URL/identifier), not raw page dumps. Each bullet carries **its own source and the source's date** — a finding without a source is a hypothesis the investigator formed, and must be labelled as such. Ask each investigator to name the **strongest counter-evidence** it met, even if it found none: "none found" is information; silence is not.
4. **Adversarially verify load-bearing claims.** For any finding the design hinges on, require a second independent source or a refutation. Treat single-source claims as hypotheses, not facts; flag uncorroborated ones.
5. **Appraise and triangulate before synthesizing** — the judgment pass in [Source appraisal](#source-appraisal) and [Triangulation and conflict resolution](#triangulation-and-conflict-resolution). It is a distinct step, after the reports are in and before any writing: synthesizing straight from the reports lets a confident single-source claim become a "finding" because it was worded well.
6. **Run one bounded second pass** on what the appraisal left open — [Gap-driven second pass](#gap-driven-second-pass). Then synthesize.
7. **Synthesize centrally.** Reconcile agreements and conflicts yourself. When sources disagree, say which you weight higher and why. Never paste raw investigator output into the artifact.

## Source appraisal

Investigators report what they found; **you decide what it is worth**. Before anything becomes a finding, rate every source that supports it on four axes. This is a reviewer's read, not a summary: you are looking for reasons the source could be wrong for *this* question.

| Axis | Ask | Weight higher | Weight lower |
|---|---|---|---|
| **Kind** | Is this the thing itself, or someone describing it? | Primary: official docs, changelogs, specs, RFCs, source code, benchmark repos, papers with method + data | Secondary: blog posts, tutorials, talks, aggregator answers, model knowledge with no citation |
| **Recency** | Could the claim have expired? | Dated, and newer than the last major release / spec version the claim depends on | Undated, or older than a change that could invalidate it (a major version, a deprecation, a new standard) |
| **Independence** | Does this source add evidence, or repeat another one? | Different author, organisation and underlying data from the corroborating source | Same vendor, same author, a rewrite of the same post, or a source that cites the other source as its evidence |
| **Interest** | Who benefits if the claim is believed? | Neutral party, or a vendor stating a limitation of its own product | Vendor comparison pages, sponsored benchmarks, "X vs Y" pieces written by the maker of X |

Two rules the table implies:

- **Two dependent sources are one source.** A vendor's docs and three tutorials paraphrasing them corroborate nothing. Corroboration needs a second source that would have been in a position to *disagree*.
- **A primary source beats any number of secondary ones on a factual claim** (does the API exist, what does the license say, what did the benchmark measure). Secondary sources earn weight on judgment claims (is it *worth* adopting, what breaks in practice) — and there, practitioner reports of failure outweigh success stories, which are selected for.

Record the appraisal as you go: the artifact's *Sources* section carries kind + date + what each source supports, so a reader can re-run your judgment instead of trusting it.

## Triangulation and conflict resolution

Line the investigators' reports up **against each other**, sub-question by sub-question, and sort every claim into one of four buckets. The bucket is what the artifact reports as the finding's **confidence grade**.

| Grade | Condition | How it appears in the artifact |
|---|---|---|
| **Established** | ≥2 independent sources agree, at least one primary, none credible contradicts | Stated as fact, sources listed |
| **Probable** | 1 primary source, or ≥2 secondary independent sources, no contradiction found | Stated with the grade, and what would confirm it |
| **Contested** | Credible sources disagree | Both positions stated, **your weighting and why** (appraisal axes above), and what the decision should assume |
| **Unverified** | Single secondary source, or model knowledge only | Listed as a hypothesis, never as a finding; goes to *Open Questions* if the design depends on it |

When sources disagree, resolve in this order before calling it *Contested*: (1) are they answering the same question — version, platform, scale, workload often differ; (2) is one of them newer than a change the other predates; (3) does one have an interest the other lacks. Most "conflicts" dissolve at step 1. The ones that survive all three are the real forks — name them explicitly in *Recommendation*, because they are exactly what the design spec will have to close.

Two failure modes, symmetric:

- **Confirmation drift** — reading the reports for support of the hypothesis you formed at scope refinement. Counter it by asking, for each *Established* finding, "which source would have said otherwise, and did anyone look?"
- **Manufactured doubt** — grading a well-supported finding *Contested* because one low-quality source disagrees. A refuted source is not a conflict; say it was considered and why it lost.

## Gap-driven second pass

The first fan-out is breadth. The appraisal tells you where depth is missing: load-bearing claims graded *Probable*/*Unverified*, *Contested* points whose resolution changes the recommendation, and sub-questions no report actually answered.

- **Exactly one more pass, targeted.** Dispatch investigators only for those gaps, with the specific claim to confirm or refute and the sources already seen (so they look elsewhere). Same rules as the first fan-out: single turn, capped responses, explicit `model:`, await never poll.
- **Bounded on purpose.** Two passes is the cap; a third does not happen. What is still open after the second pass is an *Open Question* — a documented gap is honest, a third round of search is a loop.
- **Skip it only when there is nothing to target** — every load-bearing claim already *Established* and no *Contested* fork. Say so in the artifact ("second pass not needed: …"), so a reader knows it was a judgment and not an omission.

## Critical review of the draft

After synthesizing and before persisting, review the draft **as its harshest reader** — the engineer who will build on it and get burned if it is wrong. Read it once end to end against this list; fix, do not annotate:

1. **Every finding has a grade, and the grade matches its sources.** An *Established* claim with one URL under it is mis-graded.
2. **The recommendation follows from the findings actually graded** *Established*/*Probable* — not from an *Unverified* one that happens to be convenient.
3. **The forks are named.** Anything *Contested* that affects the design appears in *Recommendation* as a decision the spec must make, with your weighting.
4. **The scope from Step 1 is answered**, not a neighbouring question that was easier to research.
5. **Nothing is smuggled in from model knowledge without a label.** Where you filled a gap yourself, it says so and it is graded *Unverified*.
6. **A reader could re-run your judgment** — sources carry kind and date; conflicts state both sides.

For research whose conclusion is high-stakes (it commits an architecture, a vendor, a compliance position) you may additionally dispatch **one read-only reviewer subagent** with the draft and this list, floored at `standard` with an explicit `model:`, and fold its findings into one fix round. This is optional; the inline review above is not.

## Graceful degradation rules

Research tools are best-effort, mirroring how `super.brainstorming` handles an unavailable library-docs or web-search tool:

- If a web search/fetch tool is **unavailable, not installed, or out of quota**, do NOT block the session.
- Proceed with the best available knowledge and any partial results.
- **Record the limitation explicitly** in the artifact's *Open Questions* (e.g. "Web search rate-limited; benchmark comparison from model knowledge only, re-verify").
- Never fail the stage just because a tool was missing — the artifact may be thinner, but the pipeline continues.

## Artifact template

Persisted at `docs/superpowers/<feature>/research/research-<feature>.md`.

The block below is the **format**, not literal text.

```markdown
# Research: <Feature Title>

## Question & Scope
The refined question and scope from Step 1 (decision it must inform, hard constraints,
what "good enough" means).

## Key Findings
Synthesized conclusions, grouped by sub-question. Every finding carries its confidence
grade — Established / Probable / Contested / Unverified — and, for Contested ones, both
positions and the weighting. Unverified items are hypotheses, not findings.

## Sources
- [Source title](https://example.com/...) — primary, 2026-03 — what it supports
- [Another source](https://example.com/...) — secondary (practitioner report), 2025-11 — what it supports

## Open Questions
- What remains unresolved after the second pass (or why the second pass was not needed).
- Any tool/quota limitations hit during research (graceful-degradation notes).

## Recommendation / Implications for design
What the findings mean for design: recommended direction, the forks the spec must close
(each Contested point that affects the decision, with your weighting), and the
assumptions the recommendation rests on.
```

## Responsibility boundary

Both `super.deep-research` and `super.brainstorming` touch "research", but differ:

| | `super.deep-research` | `super.brainstorming` inline research |
|---|---|---|
| Timing | Upfront, before design | During design, as needed |
| Depth | Broad, multi-source, appraised, triangulated and graded | Light, targeted gap-filling |
| Persistence | Persisted artifact (`research/research-<feature>.md`) | Ephemeral — informs questions, not saved |
| Purpose | Ground the whole design in evidence | Fill a specific gap mid-conversation |

When a research artifact exists, `super.brainstorming` **consumes it** as high-priority input and **skips the overlapping fan-out** — never re-running investigation this stage already cited. Its inline research is reserved for new gaps surfacing during design.
