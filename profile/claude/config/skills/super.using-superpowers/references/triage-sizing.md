# Triage Sizing — tier table and the rigor invariant

Read this when the triage (or `super.brainstorming`) has produced a tier and you need to know
what that tier *provisions*: which artifacts get built, which reference drives each path, and how
verification is delivered. The router itself does not need any of it — it only needs the tier —
so it lives here instead of in the eager SKILL.md.

The signal rubric that *computes* the tier stays in the SKILL.md ("Classification checklist"),
because it is needed to fill `assess-complexity.cjs --signals` at checkpoint 0.

## Tier table

| Tier | Criteria | Spec/PRD | Design | Tasks | Execution + Gates |
|---|---|---|---|---|---|
| **Micro** | 1 existing file, trivial/reversible tweak, no new abstraction, no user story | **skip** `super.brainstorming` and `super.writing-plans` | inline mental model | none — atomic step list inline | **inline + combined gate** (`references/medium-inline-path.md`) |
| **Small** | ~1-3 existing files, no new component, reversible, no PRD-worthy behavior | `super.brainstorming` (single targeted exploration), **skip PRD** | inline | `super.writing-plans` in reduced modes | **inline + combined gate** (`references/medium-inline-path.md`) |
| **Medium** | clear feature, few components, known domain, no real ambiguity | `super.brainstorming` (single targeted exploration, no research fan-out), **PRD optional** (skip if unambiguous) | few-section design, inline | `super.writing-plans` (single exploration; tasks listed inline, no separate task-writer subagent) | **inline + combined gate** (`references/medium-inline-path.md`) |
| **Large** | multi-component feature, real architecture decisions | brainstorming + PRD (*fast path*: when the domain is known and no decision is open, settle the PRD decision **here at triage** — outcome-framed, `generate / no PRD / decide later` — and auto-dispatch on `generate`; never raise that question after the spec) | enriched design doc | `super.writing-plans` with wave planning | **full gates** |
| **Complex** | novel domain, ambiguity, or cross-cutting risk | brainstorming + PRD, with `super.deep-research` (before) and `super.reviewing-specs` (after design) offered as **consent-gated** stages — `references/complex-path.md` | enriched design doc | `super.writing-plans` with waves | **full gates** |

The **Execution + Gates** column now varies the *delivery mechanism* by tier (see the rigor invariant below). Full criteria and confirming questions: `references/lightweight-path.md` (Small), `references/medium-inline-path.md` (Micro/Small/Medium inline execution + combined gate), `references/large-known-domain-fast-path.md` (Large fast path), `references/complex-path.md` (Complex consent-gated research + spec-review front end), `references/token-budget.md` (context discipline for all subagents), `references/complexity-checkpoints.md` (how the tier itself is assessed and re-assessed across triage and brainstorming — read this one first). The Micro path has no separate reference — it is Medium Inline with zero planning artifacts.

**Verification rigor does not scale down with the tier — only the mechanism that delivers it does.** The same four lenses run at every tier: (1) author ≠ verifier on the final gate, (2) the discrimination sensor / mutation-testing check, (3) spec-anchored FR/AC coverage re-derived evidence-or-zero, (4) test density (one test per behavior, preserved as a coverage requirement). **Small/Medium** deliver all four inline: the controller writes code directly in the main thread with a per-cluster self-review checklist, then a single fresh, blind Verifier subagent fuses the final code review and `super.independent-verification` into one combined gate — see `references/medium-inline-path.md`. QA (user-observable acceptance) is **not** in this gate; it stays a separate **opt-in** gate at every tier — offered, and run only on user consent. **Large/Complex** deliver the same four lenses through today's fan-out mechanism, unchanged: a subagent per task, plus the final code review and the `super.independent-verification` gate as separate dispatches after all tasks. Auto-sizing now adjusts planning depth **and** execution mechanism — never the lenses themselves.
