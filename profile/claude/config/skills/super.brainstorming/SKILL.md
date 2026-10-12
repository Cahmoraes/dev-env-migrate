---
name: super.brainstorming
description: "Turn a feature, refactor or behavior change into an approved design spec through a short interview. Use before planning or writing code for new behavior."
user-invocable: false
---

# Brainstorming Ideas Into Designs

Understand the project context first, ask what the request leaves open, write the design, get it approved once.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until the written design has been approved by the user. **A reply approves the stage actually presented:** approving an idea or a scope does not approve a spec that does not exist yet, and an approved spec licenses only `super.writing-plans` — the plan opens its own execution gate. Resume at the earliest incomplete stage; read-only project exploration is allowed meanwhile.
</HARD-GATE>

> **Base dirs:** this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X` (never search for one); a gate script that will not run is a **STOP**, never a skipped gate.

## Three paths

Classify before your first question — the same three paths the triage uses. The label stays internal: the user sees what the path does and can override it.

- **Spike** — a feasibility question whose output is an answer, not code you keep: the question and the probe in 2-3 sentences, a nod, a recommendation; anything built stays labeled throwaway.
- **Bounded** — a change to a flow that already exists in this repo to read: no new component, no interface others depend on, no open decision, no user story, reversible, ~1-3 files. It leaves this skill with the bounded announcement and runs `<super.using-superpowers-base-dir>/references/bounded-path.md`.
- **Architectural** — everything else; the checklist below.

When in doubt between two paths, take the heavier one. Bounded measures the repo, not your familiarity with the kind of app; reaching for a label to skip work is the doubt. The ratchet is one-way: hidden complexity found mid-task upgrades the path — stop, say so, step up. Nothing downgrades mid-task. The design is always written and approved once — it can be a paragraph — and the plan that follows it opens the execution gate.

**The user is paused at exactly these points:** the grilling rounds (the companion or deep-research offer rides inside one of them), the choice of approach, and the approval gate on the written spec (step 8). Everything else — the design doc, the self-review, the handoff to planning — is announced and done in the same turn. A "does this look right?" after each design section, a "shall I continue?" before planning, or a "read the file and tell me" without options is a gate nobody asked for.

## Checklist

Work these items in order, skipping none:

1. **Research fan-out** — a `super.deep-research` handoff that already named a slug gets one `test -f` on it (with no slug there is nothing to test, and no shell call at all). Then launch every applicable track as dispatch calls **in a single message** — the same message that asks the user your first question (see [Research via Parallel Subagents](#research-via-parallel-subagents)).
2. **Offer visual companion** — **Preference gate — resolve it before evaluating any signal:** use `session_visual_companion_enabled` if this session derived it, otherwise run this now, this turn, and read `workflow.visual_companion` from the output:
   ```
   node <super.using-superpowers-base-dir>/scripts/read-preferences.cjs --repo-root <project-repo-root>
   ```
   Disabled → step done: no signal fires, no offer, no mention of the browser, now or on any re-run. Enabled (the default; an absent file means enabled) → run the **Visual signals** checklist in the Visual Companion section. A matched signal makes the offer mandatory: its own paragraph, naming the artifact, in the same turn as the first clarifying question. No match → text-only for now; re-run the checklist when the conversation reaches the UI. On acceptance this step stays open until a real screen is served — see **Settle the render debt**, which also pre-empts step 3.
3. **Grill in rounds — the architect's interview.** Keep a tree of the decisions the spec needs (a node's children are the decisions its answer changes) and ask its **frontier** each round: every open decision whose parents are settled, at most four per message (a selectable multiple-choice prompt when the answers are fixed), roots first, numbered, each with your recommended answer and the fact, priority or risk behind it. **Facts are looked up, never asked:** what the code, the repo's instructions or the research answers is stated with its source, and an unverified claim is labeled an assumption. The user decides intent, priorities and trade-offs, and supplies what only they know — volumes, deadlines, consumers outside the repo, how a provider behaves in production. The opening round asks only what no research can answer; questions that need a report wait for it. An unanswered question takes the recommendation. Recompute after every answer; stop when only reversible leaves remain, each closed with a safe default. **Lenses a senior architect opens when the conversation establishes them:** quality attributes (a volume, deadline, money, external dependency or personal data → recommend a top 3, each with a measurable criterion — never chosen silently), ownership and source of truth, integration and coupling, failure behavior (what fails, what the user sees, retries and duplicates), data consistency and migration (volume, growth, downtime), rollout for live consumers, security and privacy. A rule that holds for every persisted record (a limit, a uniqueness, what is preserved) is named as an invariant with who guarantees it: application, lock or database; a feature that persists nothing has none. Round format, lenses, depth: `./references/grilling.md`; characteristics: `./references/architecture-characteristics.md`. **Stack unknown** (`projectProfile.stack` empty and no manifest) → first question; **framework open** (manifest silent) → next: `./references/interview-process.md`, "Stack fork", "Framework fork".
   - **Reflect the understanding before proposing anything.** Knowing the kind of thing asked for does not say why the user wants it. After the first answers, write back in 3-5 lines the intended outcome, who it is for, what success looks like and the constraints, separating what the user said from what you are assuming, and invite correction — as the opening of the approaches question (step 4) unless an earlier question already carried it, never as a round trip of its own; no approach is proposed before the user has seen the note. A request that already carries its purpose (or arrived with research or feature-history context) is reflected, not re-asked. Procedure: `./references/interview-process.md`, "Reflect the understanding".
   - **A node no research answered** — a provider's production behavior, a regulation, a domain the repo never touched — earns the `super.deep-research` offer inside its round, skipped unless accepted (`./references/grilling.md`, "Depth — the tree decides"). Settle any open render debt before offering it — the offer ends the turn, and ending it on an open debt strands the user at an empty browser.
4. **Propose 2-3 approaches** — radically different in shape (where the boundary sits, who owns the data, sync or async), never variations of one library or column choice; trade-offs and your recommendation; every option lists what it costs, not only what it gains (`./references/tradeoff-analysis.md`). A premise every option shares (where data lives, whether it persists, who calls it) is stated in the note for correction, never baked into all of them. Ask which to take. The chosen approach opens children — failure behavior of its external calls, idempotency, consistency, migration: grill them (step 3) before step 5.
5. **Present the design once** — one message, sections scaled to complexity (a paragraph when straightforward, up to ~300 words per section when nuanced), and **no question with it**: steps 6-7 run in the same turn and the single approval gate is step 8, where the user reads the spec file. A "design approved?" question here is a second gate for the same decision. Components by what each owns and hides, with the coupling named at every boundary (`./references/logical-components.md`).
6. **Write design doc** — `docs/superpowers/<feature-name>/specs/<feature-name>-design.md`, committed, structured per `./references/design-spec-structure.md`. Before writing, run the Diagram Enrichment checklist in `./references/diagram-enrichment.md`: integrations, new components, complex refactors, ETL or state machines get a Mermaid diagram from a subagent via `super.design-doc-mermaid`, embedded raw; trivial changes skip it. File layout, mockup distillation, the Especificação Visual section and the companion shutdown: `./references/after-the-design.md`.
7. **Spec self-review** — read the committed spec back, fix, report the outcome. Checks, on the file as read: placeholders or a decision the interview raised and the spec never closes; sections contradicting each other or the mockup; a requirement readable two ways; **boundaries** — every value crossing a layer has one written meaning (a date is a calendar day or an instant, and in whose timezone; money has its precision; a status change names its target state or is declared a toggle; a failure names what the user sees); scope for one plan. The remaining rows: `./references/after-the-design.md`, "Spec Self-Review". Then run the mechanical checks and fix every error (warnings are judged): criteria as `AC-NN · WHEN … THEN … (origem: …)` in Testes, invariants as `INV-NN` rows with category and guarantor, a `**Contrato:**` row per operation added or changed (payload, success status, each error → status), a `**Modelo:**` row naming the constraint of every `db` invariant, the four migration labels when existing data moves:
   ```
   node <super.brainstorming-base-dir>/scripts/check-spec.cjs docs/superpowers/<feature-name>/specs/<feature-name>-design.md
   ```
8. **Approval gate — one question, outcomes named.** Open with the `Self-review:` line, then `Boundaries: <value> = <meaning>; ...` (an entry the spec cannot fill is a fix, not a line), and the spec path — this pause is for the user to read the file — then ask ONE question whose options name what each produces: **(a) approve and generate the PRD** (recommended — enables the QA gate), **(b) approve without PRD** (no QA gate; the plan traces the spec's AC/INV), **(c) adjust the spec** (say what), and always a fourth, never recommended: **(d) deep review by a subagent first** (`super.reviewing-specs`, costs credits, then PRD as chosen). Never split this into a "review the spec" question followed by a PRD question.
9. **Transition to planning** — (a) → invoke `super.generating-prd` (it opens the PRD's own single approval gate, then hands off to `super.writing-plans` itself); (b) → invoke `super.writing-plans` directly, in this same turn; (c) → edit, re-run step 7, re-open step 8. The next user-facing decision is the execution gate `super.writing-plans` opens once the plan is on disk — nothing is asked before it.

## After the Design

Steps 6-9: design doc, spec self-review (read back, fix, report), one approval gate, handoff. Full procedure and the gate wording: `./references/after-the-design.md`, read when you reach step 6.

- **Diagram Enrichment:** (step 6) save each generated `.mmd` under `docs/superpowers/<feature-name>/specs/diagrams/` — separate from the Visual Companion, and it never creates a `specs/mockups/` artifact: diagrams explain structure, mockups decide layout.
- **Spec self-review (step 7):** read the spec file back (a pass from memory is not a review), fix only what would lead to a flawed plan, commit, and open the user gate with the `Self-review:` outcome line — never without it.

YAGNI throughout: remove unnecessary features from every design.

## Visual Companion

A browser companion for mockups, diagrams and visual options — a tool, not a mode: accepting it makes the browser *available* for genuinely visual questions. The preference gate (checklist item 2) decides whether this section applies at all — with `workflow.visual_companion` off, nothing here fires, this pass or any re-run.

**Visual signals — run this checklist (checklist item 2), and re-run it whenever the conversation reaches a new decision.** A signal fires on what the conversation has **established**, never on the topic's vocabulary: a feature noun ("analytics", "checkout") does not say whether the work touches a screen. **Surface unknown = no signal fires** — settle it with the one terminal question step 3 owes you anyway (frontend, backend or both); a backend answer keeps the session text-only until the conversation reaches the frontend, where this checklist runs again. Once the surface includes UI, any signal below makes the offer mandatory:

- The feature has a **user-facing UI** — screens, pages, components, forms, dashboards, navigation, modals.
- The work involves **layout, visual hierarchy, spacing, theming, or styling** decisions.
- There are **competing visual designs/layouts to compare**.
- A **diagram would clarify structure or flow** — architecture, state machine, sequence, data flow, entities. For a non-UI feature this fires only when you will actually render that diagram to settle a specific decision (e.g. current-vs-proposed side by side). Such a diagram is a design aid, not a UI mockup: it never creates a `specs/mockups/` artifact or an Especificação Visual section — to keep it in the spec, see **Diagram Enrichment** under "After the Design".
- A **multi-step or screen-by-screen flow** (onboarding, wizard, checkout) where the order and look of each screen matters.
- The user **references a visual artifact** — Figma, mockup, wireframe, screenshot, "looks like", "the design".

Stay text-only while the work is backend/API contracts, data models or config, and for any conceptual/requirements/tradeoff question — the signal is about showing something, not discussing it.

**Readiness test — name the artifact.** A matched signal becomes an offer only when you can name the first thing you would draw ("the two dashboard layouts side by side"). If the honest answer is "options I could have typed in the terminal", ask it there and re-run the checklist later. An accepted offer is a commitment to show that artifact, never a free no-op.

**Offering the companion:** offer once for consent, and **name the artifact** in the offer:
> "To settle <the decision>, I can show you <the artifact> in a lightweight local preview instead of describing it — it stays open only for the questions that are genuinely visual. Want me to enable it? (Requires opening a local URL.)"

The offer is its own paragraph and may share the turn with the first clarifying question; if they decline, proceed text-only; on acceptance render before advancing, after reading [`./references/visual-companion-operation.md`](./references/visual-companion-operation.md) — browser-vs-terminal routing per question and the cwd-independent `--reuse` launch.

<a id="settle-the-render-debt"></a>
**Settle the render debt.** Acceptance is a debt, not a promise — settled only by a real screen being served, not by launching, not by announcing the URL, not by a placeholder. While open it pre-empts every turn-ending step (clarifying questions, the `super.deep-research` offer), and an explicit "me mostre" / "atualize o mockup" is blocking. It reopens whenever the screen falls behind the conversation. The three rules, the turn-end check (`scripts/check-visual-state.cjs`) and its reason codes: [`./references/visual-companion-operation.md`](./references/visual-companion-operation.md) — read on acceptance, before showing anything.

> **The screen kind follows the question.** A layout question (positioning, spacing, hierarchy, appearance) must be a bespoke mockup: `scripts/render-screen.cjs` draws text cards, not layouts. **Text cards never settle the debt** — what settles it is the artifact you named; once that is up, the generator is fine for the conceptual choices that follow, and a conceptual question with nothing up yet belongs in the terminal. Full Layout gate: `./references/visual-companion.md`.

# Opening Phase

Nothing else is invoked from here — no frontend-design, mcp-builder or other implementation skill; `super.reviewing-specs` (also triage option 6) only through option (d) of the step-8 gate, or when the user wants an independent, code-aware validation beyond the step-7 self-review.

## Research via Parallel Subagents

Dispatch every applicable track as background subagents in a **single turn**, and close that turn with the message step 2 or 3 owes the user: the companion offer when a visual signal matches, in the same turn as your first clarifying question — neither waits on research. Subagent dispatch is the only research mechanism here — no direct file reads, code search, library-docs or web search in the main agent, and at most one shell call, named in the fan-out reference. Reading a past feature counts as research: the feature-history recall subagent owns `docs/superpowers/` — the index, the selection of *every* feature the topic touches, and their artifacts.

Procedure and prompts: `./references/research-fan-out.md` (dispatch table, conflict protocol, source precedence) · `./agents/feature-history-recall.md` (recall contract) · `./references/research-subagent-templates.md` (the other track prompts) · `./references/interview-process.md` (scope, approaches, design).

**Await the subagents — never poll for them.** The harness re-invokes you as each returns; never `sleep` or schedule a wakeup/timer to "check on" them — busy-polling harness-tracked work is wasted. Each return is a turn needing visible text: one line naming the track that finished, never a word about what is still pending.
