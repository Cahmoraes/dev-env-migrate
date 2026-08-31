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

> **The flow overview, the research fan-out (step 1) and the interview guidance are at the END of this file**, under "# Opening Phase". They all run before the design exists; everything above that heading is what a session resumed *after* the design still needs.

> **Resolving `<super.X-base-dir>`:** the skills are siblings — parent of your header's base directory + `/super.X`. Never `glob` for one (`glob` misses dotdirs); a gate script that will not run is a **STOP**, never a skipped gate.

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process — a todo list, a single-function utility, a config change, all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

You MUST work these items in order, skipping none:

1. **Feature history + Explore context + research** — load the confirmed lessons inline (one call). Only a `super.deep-research` handoff that already named a slug adds a second call, a `test -f` on that slug; **with no slug there is nothing to test, and no second call**. Then launch every applicable track as `task` calls **in a single message** — the same message that speaks to the user — see [Research via Parallel Subagents](#research-via-parallel-subagents).
2. **Offer visual companion** — do NOT skip this evaluation. **Preference gate — resolve it before evaluating any signal:** use `session_visual_companion_enabled` if this session derived it, otherwise run this now, this turn, and read `workflow.visual_companion` from the output:
   ```
   node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root <project-repo-root>
   ```
   `<project-repo-root>` is the repo the user is building in — the skill's own repo is the wrong answer. Disabled → step done: no signal fires, no offer, no mention of the browser, now or on any re-run. Enabled (the default, and what an absent file means) → run the **Visual signals** checklist (Visual Companion section). If **any** signal matches, offering the companion is mandatory and is its **own message**, not combined with a clarifying question. If none match, it's text-only for now — re-run the checklist when the conversation reaches the UI. **On acceptance this step stays open until a real screen is served** — see **Settle the render debt**, which also pre-empts step 3.
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

- **Diagram Enrichment:** (step 6) save each generated `.mmd` under `docs/superpowers/<feature-name>/specs/diagrams/`. A concern **separate from the Visual Companion**, and it **never creates a `specs/mockups/` artifact** — diagrams explain structure, mockups decide layout.
- **Spec self-review (step 7):** the inline pass, then **Run these eight additional checks** from `./references/design-spec-structure.md`, "Self-review additions" section — they close the ends a first draft leaves open.
## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, get approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense

## Visual Companion

A browser companion for mockups, diagrams and visual options. A tool, not a mode: accepting it makes the browser *available* for genuinely visual questions; it does NOT route every question through it.

**Preference gate (checklist item 2) decides whether this section applies at all** — with `workflow.visual_companion` off, no signal below fires and nothing about the browser is said, on this pass or any re-run.

**Visual signals — run this checklist (checklist item 2), and re-run it whenever the conversation reaches a new decision.** A signal fires on what the conversation has **established**, never on the topic's vocabulary: a feature noun ("analytics", "checkout") does not say whether the work touches a screen. **Surface unknown = no signal fires** — settle it with the one terminal question step 3 owes you anyway (frontend, backend or both), and a backend answer keeps the session text-only until the conversation reaches the frontend, where this checklist runs again. Once the surface includes UI, if **any** signal below is true the offer is **mandatory**:

- The feature has a **user-facing UI** — screens, pages, components, forms, dashboards, navigation, modals.
- The work involves **layout, visual hierarchy, spacing, theming, or styling** decisions.
- There are **competing visual designs/layouts to compare** (which arrangement, which wizard flow, which component variant).
- A **diagram would clarify structure or flow** — architecture, state machine, sequence, data flow, entity relationships. **For a non-UI feature** (backend, infra, data pipeline) this signal fires **only when you will actually render that diagram** to settle a specific decision — e.g. current-vs-proposed flow side by side; a dangling "a diagram might help" is not enough. Such a diagram is a **design aid, not a UI mockup**: it never becomes a `specs/mockups/` artifact or an Especificação Visual section (those describe *screens*), so it must not trigger `super.writing-plans`' visual-fidelity gate. To also keep it in the written spec, see **Diagram Enrichment** under "After the Design".
- A **multi-step or screen-by-screen flow** (onboarding, wizard, checkout) where the order and look of each screen matters.
- The user **references a visual artifact** — Figma, mockup, wireframe, screenshot, "looks like", "the design".

**Stay text-only (do not offer)** while the work is backend/API contracts, data models or config, and for any conceptual/requirements/tradeoff question. A UI-adjacent *concept* question ("what should 'archived' mean here?") is not a visual signal — the signal is about showing something, not discussing it.

**Readiness test — name the artifact.** A matched signal becomes an offer only when you can name the first thing you would draw ("the two dashboard layouts side by side"). If the honest answer is "options I could have typed in the terminal", you are not ready: ask it there and re-run the checklist later. An accepted offer is a commitment to show that artifact (see [**Settle the render debt**](#settle-the-render-debt)), never a free no-op.

**Offering the companion:** offer once for consent, and **name the artifact** in the offer:
> "To settle <the decision>, I can show you <the artifact> in a lightweight local preview instead of describing it — it stays open only for the questions that are genuinely visual. Want me to enable it? (Requires opening a local URL.)"

**This offer MUST be its own message** — only the offer, no clarifying question, no context summary. Wait for the answer before continuing; if they decline, proceed text-only.

**Once the user accepts**, read **[`./references/visual-companion-operation.md`](./references/visual-companion-operation.md)** before showing anything — per-question browser-vs-terminal routing and how to launch the server (cwd-independent `--reuse` command).

<a id="settle-the-render-debt"></a>
**Settle the render debt.** Acceptance is a debt, not a promise — settled **only by a real screen being served**, not by launching, not by announcing the URL, not by a placeholder. While the debt is open it **pre-empts every turn-ending step** (clarifying questions, the Checkpoint 1 complexity dispatch, the `super.deep-research` consent gate), and an explicit "me mostre" / "atualize o mockup" is blocking. It reopens whenever the screen falls behind the conversation. The three rules, the mandatory turn-end check (`scripts/check-visual-state.cjs`) and its reason codes are in [`./references/visual-companion-operation.md`](./references/visual-companion-operation.md) — read on acceptance, before showing anything.

> **Hard rule — the screen kind follows the question.** A **layout** question (positioning, spacing, hierarchy, appearance) **must** be a bespoke mockup: `scripts/render-screen.cjs` draws text cards, not layouts. **Text cards never settle the debt** — what settles it is the artifact you named; once that is up, the generator is fine for the conceptual choices that follow, and a conceptual question with nothing up yet belongs in the terminal. Full Layout gate: `./references/visual-companion.md`. The step-6 distillation artifact keeps only *core* snippets, never full page markup.

# Opening Phase

## Process Flow

Explore context → (if any visual signal matches, offer the Visual Companion as its own message; **on acceptance render before advancing**) → ask clarifying questions → propose 2-3 approaches → present design sections (revise and loop until the user approves) → write design doc → spec self-review (fix inline) → user reviews spec (if changes requested, loop back to write design doc) → on approval, suggest PRD: if the user skips, invoke super.writing-plans (terminal); otherwise generate the PRD via super.generating-prd, then invoke super.writing-plans (terminal).

**The terminal planning handoff is `super.writing-plans`.** `super.generating-prd` is a pre-planning formalization step — not an implementation skill. Do NOT invoke frontend-design, mcp-builder, or any other implementation skill. The only skills invoked from brainstorming are `super.generating-prd` (optional intermediate), `super.writing-plans` (terminal), and — for the `complex` tier only, and only on explicit user consent — `super.reviewing-specs` as a pre-planning spec-review gate (checkpoint 2; see `<super.using-superpowers-base-dir>/references/complex-path.md`).

The spec self-review in step 6 is brainstorming’s own inline fix pass. `super.reviewing-specs` (or triage option 6) is the separate, heavier route, cross-checking the spec against the real code and the tasks. For Micro through Large it is **not** part of this flow; mention it only if the user wants an independent validation. The one exception is the **`complex`** tier: checkpoint 2 sets `consentGates: ["reviewing-specs"]`, so offer it as a consent-gated gate before the planning handoff (same reference).

## Research via Parallel Subagents

Dispatch every applicable track as background subagents in a **single turn**, and close that turn with the message step 2 or 3 owes the user: the companion offer if a visual signal matches, otherwise your first clarifying question — neither waits on research. `task` is the only research mechanism here — no direct `view`/`grep`/`context7`/web-search in the main agent, and exactly two `bash` calls, both named in the fan-out reference.

**Reading a past feature counts as research**: the **feature-history recall** subagent owns `docs/superpowers/` — the index, the selection of *every* feature the topic touches, and their artifacts.

> **The rest of the Opening Phase is in references — read it, do not reconstruct it.**
> `./references/research-fan-out.md` (lessons load, dispatch table, conflict protocol, source precedence) · `./agents/feature-history-recall.md` (recall contract) · `./references/research-subagent-templates.md` (the other track prompts) · `./references/interview-process.md` (scope, approaches, design).

**Await the subagents — never poll for them.** The harness re-invokes you as each returns; never `sleep` or schedule a wakeup/timer to "check on" them — busy-polling harness-tracked work is wasted. **Each return is a turn needing visible text: one line naming the track that finished**, never a word about what is still pending.

**Interview rules a resume still needs:** one question per message; when a question has a small fixed set of answers, offer a selectable multiple-choice prompt with a free-text escape.
