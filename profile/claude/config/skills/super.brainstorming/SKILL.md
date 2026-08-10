---
name: super.brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
user-invocable: false
---

# Brainstorming Ideas Into Designs

Turn ideas into fully formed designs and specs through natural collaborative dialogue. Understand the project context first, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

> **The flow overview, the research fan-out (step 1) and the interview guidance are at the END of this file**, under "# Opening Phase". They all run before the design exists, so a compaction cannot reach them mid-use. Everything above that heading is what a session resumed *after* the design still needs.

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process — a todo list, a single-function utility, a config change, all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Memory recall (conditional) + Explore context + research** — first check for a pre-existing `super.deep-research` artifact (see Detect step below), then launch parallel subagents in one turn: memory recall (if `session_memory_enabled = true`), codebase exploration, context7 (external libraries), exa-web-search-free (best practices/web), user-referenced resources. If a research artifact exists, dispatch only gap-filling subagents plus codebase/memory recall. See [Research via Parallel Subagents](#research-via-parallel-subagents).
2. **Offer visual companion** — do NOT skip this evaluation. Check the topic against the **Visual signals** checklist in the Visual Companion section. If **any** signal matches, offering the companion is mandatory and is its **own message**, not combined with a clarifying question. If none match, record that it's text-only and move on. Deciding by gut feel instead of running the checklist is the failure mode this step removes. **On acceptance this step stays open until a real screen is served** — launch, URL announcement and placeholders do not close it, and the open debt pre-empts step 3 (see **Settle the render debt**).
3. **Ask clarifying questions** — one at a time; understand purpose/constraints/success criteria. **Read `./references/architecture-characteristics.md` before formulating questions** — it adds elicitation of architecture characteristics (scalability, availability, security...) that purpose/constraints questions alone miss. **When the topic has many interdependent decisions (migration, greenfield, brownfield with ripple), also read `./references/decision-tree-interviewing.md`** — it orders questions by dependency (roots before leaves) so a late root answer doesn't invalidate earlier ones; skip it for trivial/reversible changes (gate is in the reference).
   - **Checkpoint 1 (binding tier assessment via the semantic gate).** **Settle any open render debt before dispatching anything here** — this checkpoint ends the turn with a question, so running it on an open debt strands the user at an empty browser. After the first 1-2 answers — or immediately, on the raw request text, if this brainstorming session was entered directly (triage option 2 free-form, no numbered Opening Triage) — **first dispatch the `complexity-interpreter` subagent** (`<super.using-superpowers-base-dir>/agents/complexity-interpreter.md`, `capable` tier) to derive the `signals` semantically from the request + answers, so an ambiguous intent ("API": build one or consume one?) is resolved rather than guessed. Then run `<super.using-superpowers-base-dir>/scripts/assess-complexity.cjs --signals '<interpreter.signals>' --checkpoint 1` (no `--prior-tier`: the triage read, if any, was advisory only — see `<super.using-superpowers-base-dir>/references/complexity-checkpoints.md`). **Revalidation loop:** if the interpreter returned non-empty `ambiguities` OR the script returned `requiresSignalCompletion: true`, ask the user the disambiguating question, re-dispatch the interpreter with the answer, and re-score (bound to ~2 rounds; when still ambiguous, take the heavier reading). This is the session's first binding tier commitment; it decides whether to continue the flat one-or-two-question pass or open the full interview (more questions, research fan-out, PRD-worthy framing). If the result carries `requiresConfirmation: true`, ask the confirming question before treating anything as Micro-trivial. If the result is `complex`, its `consentGates` carries `["deep-research"]`: offer `super.deep-research` before opening the full interview (defaulting to skip — it costs tokens), or fall back to brainstorming's own research fan-out if declined — see `<super.using-superpowers-base-dir>/references/complex-path.md`.
4. **Propose 2-3 approaches** — with trade-offs and your recommendation. **Read `./references/tradeoff-analysis.md` first** — an approach presented only with benefits is an incomplete analysis.
5. **Present design** — in sections scaled to complexity, get user approval after each: post each section as a normal chat message, then ask a short approval question via the structured question tool (e.g. "Approve this section?") — do not pack the section's full text inside the tool's `message` field. **Before naming components, read `./references/logical-components.md`** — it provides the derivation cycle and validation tests (Entity Trap, responsibility statement).
   - **Checkpoint 2 (tier re-assessment via the semantic gate).** This checkpoint is mandatory and blocking — do not proceed to step 6 (write design doc) until it has run and, if the revalidation loop fires, resolved. Once the design is approved and real scope (files touched, new abstractions, PRD-worthiness, open decisions) is known, **re-dispatch the `complexity-interpreter` subagent** with the now-concrete design as `## Repo Context` to re-derive `signals`, then run `assess-complexity.cjs --signals '<interpreter.signals>' --checkpoint 2 --prior-tier <checkpoint-1-tier>`. Same revalidation loop as checkpoint 1 (ambiguities / `requiresSignalCompletion` → ask, re-derive, re-score). Escalate-only — see `complexity-checkpoints.md` — with one controlled exception: pass `--allow-deescalation`; the script only honors a lower tier at `confidence: high`, never below the critical-surface floor, and when it fires, name in-thread which interpreter signal is being retracted and why (mirrors the escalation-ladder disclosure). If it escalates past Medium, stop here and hand off to `super.subagent-driven-development`'s fan-out instead of continuing the reduced-ceremony path; do not silently keep the lighter mechanism because the interview is already underway. Separately, if the result is `complex`, its `consentGates` field carries `["reviewing-specs"]` — once the design doc is written (step 6), proactively offer `super.reviewing-specs` before the `super.writing-plans` handoff (step 10): a single yes/no, defaulting to skip because it costs tokens. On consent, run it and apply agreed corrections first; otherwise proceed unchanged. See `<super.using-superpowers-base-dir>/references/complex-path.md`.
6. **Write design doc** — save to `docs/superpowers/<feature-name>/specs/<feature-name>-design.md` and commit. **Read `./references/design-spec-structure.md` first** — it defines the Características Arquiteturais, Decisões Arquiteturais (ADR-lite), and Riscos sections. **Before writing, run the Diagram Enrichment checklist in `./references/diagram-enrichment.md`** — for integrations, new components, complex refactors, ETL, or state machines, dispatch a subagent to generate a Mermaid diagram via `super.design-doc-mermaid` and embed it raw into the doc; skip it for trivial changes.
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below).
8. **User reviews written spec** — ask the user to review the spec file before proceeding.
9. **Suggest PRD (optional, recommended)** — present it as optional and state the trade-off: it formalizes user stories/functional requirements and **enables the QA gate** (`super.user-story-verification`) at the end of the pipeline; skipping it skips the QA gate too. If the user agrees (default), invoke `super.generating-prd`. If they say "skip PRD" / "go straight to planning", skip this step.
10. **Transition to implementation** — invoke super.writing-plans to create the implementation plan. **The PRD decision in step 9 is the single go/no-go gate for entering planning: whether the user generates the PRD or skips it, that answer already authorized the move to planning.** Do NOT open a further "continue with the plan?" / "proceed to planning?" / `{ continue: boolean }` confirmation before or inside super.writing-plans — invoke it directly. The next user-facing gate after this handoff is the execution-mode election (raised later by the execution pipeline), never a planning go/no-go.

## After the Design

Steps 6-10 of the Checklist — write the design doc, spec self-review, user review, PRD suggestion, planning handoff. **Full procedure: `./references/after-the-design.md`** (file layout, mockup distillation into `specs/mockups/`, the **Especificação Visual** spec section, the self-review pass, and the Large-fast-path variant). Read it when you reach step 6.

- **Diagram Enrichment:** before writing the doc, run the checklist in `./references/diagram-enrichment.md` to decide whether the design warrants one or more Mermaid diagrams (integrations, new components, complex refactors, ETL pipelines, state machines — not trivial changes). When warranted, dispatch one background subagent per diagram to generate it via `super.design-doc-mermaid` (it auto-selects the diagram type) and validate with `--no-image`; embed the returned Mermaid code raw into the relevant spec section and save the `.mmd` under `docs/superpowers/<feature-name>/specs/diagrams/`. This is a concern **separate from the Visual Companion** and **never creates a `specs/mockups/` artifact** — diagrams explain structure, mockups decide layout.
- **Spec self-review (step 7):** a quick inline pass for placeholders, contradictions, ambiguity and scope, then **Run these eight additional checks** from `./references/design-spec-structure.md`, "Self-review additions" section — they close the ends a first draft leaves open.
## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, get approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense

## Visual Companion

A browser-based companion for showing mockups, diagrams, and visual options during brainstorming. A tool, not a mode: accepting it means the companion is *available* for questions that benefit from visual treatment; it does NOT mean every question goes through the browser.

**Visual signals — run this checklist (checklist item 2).** Right after exploring project context, evaluate the topic against these signals instead of relying on a gut sense of whether it "feels visual". If **any** is true, the offer is **mandatory**:

- The feature has a **user-facing UI** — screens, pages, components, forms, dashboards, navigation, modals.
- The work involves **layout, visual hierarchy, spacing, theming, or styling** decisions.
- There are **competing visual designs/layouts to compare** (which arrangement, which wizard flow, which component variant).
- A **diagram would clarify structure or flow** — architecture, state machine, sequence, data flow, entity relationships. **For a non-UI feature** (backend, infra, data pipeline) this signal fires the offer **only when you will actually render that diagram** to settle a specific decision — e.g. current-vs-proposed flow side by side. If the flow will just be discussed in prose, stay text-only: a dangling "a diagram might help" is not enough. Such a diagram is a **design aid, not a UI mockup** — it never becomes a `specs/mockups/` artifact or an Especificação Visual section (those describe *screens*), so it must not trigger `super.writing-plans`' visual-fidelity gate. If the diagram shown here also belongs permanently in the written spec, that's a separate step — see **Diagram Enrichment** under "After the Design" (`./references/diagram-enrichment.md`), which validates and embeds it as Mermaid source rather than a browser render.
- A **multi-step or screen-by-screen flow** (onboarding, wizard, checkout) where the order and look of each screen matters.
- The user **references a visual artifact** — Figma, mockup, wireframe, screenshot, "looks like", "the design".

**Stay text-only (do not offer)** when the topic is purely non-visual: backend/API contracts, data models, config changes, or conceptual/requirements/tradeoff questions with no UI or diagram dimension. A UI-adjacent *concept* question ("what should 'archived' mean here?") is not a visual signal — the signal is about showing something, not discussing it.

When in doubt, **offer** — the companion is consent-based and the user can decline in one word, so a false offer is cheap while a missed one silently degrades the session to text. **But "cheap" assumes a decline.** An offer the user *accepts* is a commitment to show something (see [**Settle the render debt**](#settle-the-render-debt)); accepting and never acting leaves a dangling expectation, not a free no-op. So offer freely — but only when you are genuinely ready to render something if they say yes.

**Offering the companion:** When at least one visual signal matches, offer it once for consent:
> "Some of what we're working on might be easier to explain visually. I can spin up a lightweight local preview for mockups, diagrams, and side-by-side comparisons — used only for the questions that are genuinely visual, so it stays inexpensive. Want me to enable it? (Requires opening a local URL.)"

**This offer MUST be its own message.** Do not combine it with clarifying questions, context summaries, or any other content. The message should contain ONLY the offer above and nothing else. Wait for the user's response before continuing. If they decline, proceed with text-only brainstorming.

**Once the user accepts**, read **[`./references/visual-companion-operation.md`](./references/visual-companion-operation.md)** before showing anything — it covers the per-question browser-vs-terminal decision (even after acceptance, not every question is visual) and how to launch the server (cwd-independent `--reuse` command).

<a id="settle-the-render-debt"></a>
**Settle the render debt.** Acceptance is a debt, not a promise — settled **only by a real screen being served**, not by launching, not by announcing the URL, not by a placeholder. While the debt is open it **pre-empts every turn-ending step** (clarifying questions, the Checkpoint 1 complexity dispatch, the `super.deep-research` consent gate), and an explicit "me mostre" / "atualize o mockup" is blocking. It reopens whenever the screen falls behind the conversation. The three rules, the mandatory turn-end check (`scripts/check-visual-state.cjs`) and its reason codes are in [`./references/visual-companion-operation.md`](./references/visual-companion-operation.md) — read on acceptance, before showing anything.

> **Hard rule — the screen kind follows the question.** **Conceptual** choices (scope, A/B/C, pros and cons) render from a compact JSON spec via `scripts/render-screen.cjs`, keeping markup out of your context. A **layout** question (positioning, spacing, hierarchy, appearance) **must** be a bespoke mockup: the generator draws text cards, not layouts. Full Layout gate: [`./visual-companion.md`](./visual-companion.md). The step-6 distillation artifact keeps only *core* snippets, never full page markup.

# Opening Phase

> **Why this block is last, and mostly in references.** A compaction re-injects only the **first 20.000 characters** of a SKILL.md and drops the rest silently. Everything below runs once, at the start — so it sits last, and its bulk lives in `./references/`, where a resume can read it back instead of losing it.

## Process Flow

Explore context → (if any visual signal matches, offer the Visual Companion as its own message; **on acceptance render before advancing**) → ask clarifying questions → propose 2-3 approaches → present design sections (revise and loop until the user approves) → write design doc → spec self-review (fix inline) → user reviews spec (if changes requested, loop back to write design doc) → on approval, suggest PRD: if the user skips, invoke super.writing-plans (terminal); otherwise generate the PRD via super.generating-prd, then invoke super.writing-plans (terminal).

**The terminal planning handoff is `super.writing-plans`.** `super.generating-prd` is a pre-planning formalization step — not an implementation skill. Do NOT invoke frontend-design, mcp-builder, or any other implementation skill. The only skills invoked from brainstorming are `super.generating-prd` (optional intermediate), `super.writing-plans` (terminal), and — for the `complex` tier only, and only on explicit user consent — `super.reviewing-specs` as a pre-planning spec-review gate (checkpoint 2; see `<super.using-superpowers-base-dir>/references/complex-path.md`).

The spec self-review in step 6 is brainstorming’s own inline fix pass. `super.reviewing-specs` (or triage option 6) is the separate, heavier route — several read-only lenses in parallel at the `capable` tier, cross-checking the spec against the real code and the tasks. For Micro through Large it is **not** part of this flow; mention it only if the user wants an independent validation. The one exception is the **`complex`** tier: checkpoint 2 sets `consentGates: ["reviewing-specs"]`, so offer it as a consent-gated gate before the planning handoff (see `<super.using-superpowers-base-dir>/references/complex-path.md`) — a novel design is exactly where a blind second read pays off before the expensive fan-out.

## Research via Parallel Subagents

Dispatch every applicable track as background subagents in a **single turn**, before the first clarifying question. The `task` tool is the only permitted mechanism for research here — no direct `view`/`grep`/`bash`/`context7`/web-search in the main agent.

> **The rest of the Opening Phase is in references — read it, do not reconstruct it.**
> `./references/research-fan-out.md` (what to dispatch, corporate-artifact conflict protocol, source precedence) · `./references/research-subagent-templates.md` (per-track prompts, memory-recall gate) · `./references/interview-process.md` (scope, approaches, presenting the design).

**Await the subagents — never poll for them.** The harness re-invokes you as each returns. Do **not** `sleep` or schedule a wakeup/timer to "check on" them — busy-polling harness-tracked work is wasted and a malformed wakeup errors out mid-flow.

**Interview rules a resume still needs:** one question per message; when a question has a small fixed set of answers, offer a selectable multiple-choice prompt with a free-text escape.
