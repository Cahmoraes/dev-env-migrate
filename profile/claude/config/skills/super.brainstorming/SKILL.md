---
name: super.brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

# Brainstorming Ideas Into Designs

Turn ideas into fully formed designs and specs through natural collaborative dialogue. Understand the project context first, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process — a todo list, a single-function utility, a config change, all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Memory recall (conditional) + Explore context + research** — first check for a pre-existing `super.deep-research` artifact (see Detect step below), then launch parallel subagents in one turn: memory recall (if `session_memory_enabled = true`), codebase exploration, context7 (external libraries), exa-web-search-free (best practices/web), user-referenced resources. If a research artifact exists, dispatch only gap-filling subagents plus codebase/memory recall. See [Research via Parallel Subagents](#research-via-parallel-subagents).
2. **Offer visual companion** — do NOT skip this evaluation. Check the topic against the **Visual signals** checklist in the Visual Companion section. If **any** signal matches, offering the companion is mandatory and is its **own message**, not combined with a clarifying question. If none match, record that it's text-only and move on. Deciding by gut feel instead of running the checklist is the failure mode this step removes.
3. **Ask clarifying questions** — one at a time; understand purpose/constraints/success criteria. **Read `./references/architecture-characteristics.md` before formulating questions** — it adds elicitation of architecture characteristics (scalability, availability, security...) that purpose/constraints questions alone miss. **When the topic has many interdependent decisions (migration, greenfield, brownfield with ripple), also read `./references/decision-tree-interviewing.md`** — it orders questions by dependency (roots before leaves) so a late root answer doesn't invalidate earlier ones; skip it for trivial/reversible changes (gate is in the reference).
4. **Propose 2-3 approaches** — with trade-offs and your recommendation. **Read `./references/tradeoff-analysis.md` first** — an approach presented only with benefits is an incomplete analysis.
5. **Present design** — in sections scaled to complexity, get user approval after each. **Before naming components, read `./references/logical-components.md`** — it provides the derivation cycle and validation tests (Entity Trap, responsibility statement).
6. **Write design doc** — save to `docs/superpowers/<feature-name>/specs/<feature-name>-design.md` and commit. **Read `./references/design-spec-structure.md` first** — it defines the Características Arquiteturais, Decisões Arquiteturais (ADR-lite), and Riscos sections.
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below).
8. **User reviews written spec** — ask the user to review the spec file before proceeding.
9. **Suggest PRD (optional, recommended)** — present it as optional and state the trade-off: it formalizes user stories/functional requirements and **enables the QA gate** (`super.user-story-verification`) at the end of the pipeline; skipping it skips the QA gate too. If the user agrees (default), invoke `super.generating-prd`. If they say "skip PRD" / "go straight to planning", skip this step.
10. **Transition to implementation** — invoke super.writing-plans to create the implementation plan.

## Process Flow

Explore context → (if any visual signal matches, offer the Visual Companion as its own message) → ask clarifying questions → propose 2-3 approaches → present design sections (revise and loop until the user approves) → write design doc → spec self-review (fix inline) → user reviews spec (if changes requested, loop back to write design doc) → on approval, suggest PRD: if the user skips, invoke super.writing-plans (terminal); otherwise generate the PRD via super.generating-prd, then invoke super.writing-plans (terminal).

**The terminal planning handoff is `super.writing-plans`.** `super.generating-prd` is a pre-planning formalization step — not an implementation skill. Do NOT invoke frontend-design, mcp-builder, or any other implementation skill. The only skills invoked from brainstorming are `super.generating-prd` (optional intermediate) and `super.writing-plans` (terminal).

## Research via Parallel Subagents

### Detect a pre-existing research artifact (do this first)

Before dispatching research subagents, check whether `super.deep-research` already ran an upfront pass for this topic — look for a persisted artifact at `docs/superpowers/<feature>/research/research-<feature>.md` (the `<feature>` slug may already be set by `super.deep-research` — see [Reconcile the feature slug](#reconcile-the-feature-slug)). That pass is **broad, adversarially verified, and persisted**; brainstorming's own research is **ephemeral, synthesized in context, not persisted** — focused on filling remaining gaps.

- **If it exists:** read it and treat it as a **high-priority distilled input**. Do NOT re-run the wide fan-out. Skip the subagents whose ground it already covers (web research, library/API docs); dispatch only for **gaps it doesn't cover**, plus codebase exploration and memory recall (which target this workspace regardless of prior research).
- **If no artifact exists:** proceed with the full fan-out below.

Dispatch all research as background subagents in a **single turn** before your first clarifying question — keeping it out of the main agent preserves context budget for clarifying questions, trade-offs, spec content, and review.

**Exception:** If the request is underspecified and you can't determine the tech stack or problem domain, ask one scoping question first, then launch research.

<RESEARCH-GATE>
Do NOT call `view`, `glob`, `grep`, `bash`, `context7`, or any web-search tool directly in the main agent during this phase. All high-volume retrieval — codebase exploration, library docs, web research, user-provided URLs, and local documents — must be dispatched via the `task` tool as background subagents. The `task` tool is the only permitted mechanism for research during brainstorming.
</RESEARCH-GATE>

### Corporate Artifacts

Check whether corporate artifacts are available in context — `super.using-superpowers` passes them when present (a message like _"Corporate artifacts are available: [list]"_). They have **no fixed format** — a ready PRD, a wiki HTML export, an API schema, an ADR, loose notes, anything — so **never couple to their structure**. Treat them as source material to RECOVER and CONVERT into our own templates (the design spec here, the PRD in `super.generating-prd`); it is our converted artifact — never the raw corporate file — that we later validate and extract identifiers/keywords from. Their purpose is to let us **reuse** existing specs/PRDs/decisions instead of recreating them, always brought into the superpowers format. If they exist, include each as part of the User-referenced resources subagent dispatch, treated exactly like user-provided paths and URLs:
- Local path → inspect via `view`
- Public URL → fetch
- Inaccessible URL → ask the user for an excerpt

**Precedence — corporate artifacts win on conflict, but never silently.** When a corporate artifact conflicts with another source (a current-session decision, the spec, recalled memory, or research), do **not** resolve it on your own and do **not** just follow the session: corporate artifacts are the company's source of truth, so **stop, tell the user a conflict exists, present the corporate value as the recommended truth, and ask which one to follow.** The user's answer is your instruction now (precedence #1) and stands for the rest of the session. (Full priority ordering in [After all subagents complete](#after-all-subagents-complete).)

### What to dispatch in parallel

All applicable tracks must be launched in the **same tool-calling turn**:

| Subagent | When | Agent type |
|----------|------|-----------|
| **Memory recall** | If `session_memory_enabled = true` — retrieves prior decisions, ADRs, specs, and constraints from `super.persistent-memory`. Skip entirely when memory is disabled. | `task` (see template below) |
| Codebase exploration | Always for existing projects; skip for clearly greenfield work | `explore` |
| Library / API docs | Topic involves external libraries or frameworks | `explore` instructed to use `context7` (when available) |
| Web research | Needs current best practices, comparisons, or technology state | `explore` instructed to use `exa-web-search-free` (when available) |
| User-referenced resources & corporate artifacts | User mentions URLs or docs, OR corporate artifacts are available in context: public URL → fetch; local path → inspect; inaccessible → ask for an excerpt | `explore` |

**Project constitution (binding):** the codebase-exploration subagent must also surface the consuming repo's **`CLAUDE.md` / `AGENTS.md`** (root and any nested ones). Their declared principles and conventions (DDD, Design-by-Contract guards, CQS, SOLID, naming, layering, explicit "always/never" rules) are the **constitution your design must honor** on the *engineering* plane (*how* you build), the peer of corporate artifacts, which bind the *product* plane (*what* you build) — ranked in the precedence list below. If the design must deviate from a stated rule, surface the conflict to the user instead of silently breaking it.

If `context7` or `exa-web-search-free` are unavailable or hit quota, continue with best available knowledge — don't block the session.

### Subagent prompt templates

Dispatch each subagent with the minimum context it needs (no conversation history, no file dumps) and cap responses at ~300 words / 8 bullets (summaries, not raw output). The exact prompt templates for memory recall, codebase exploration, library/API docs, and web research are in **[`./references/research-subagent-templates.md`](./references/research-subagent-templates.md)** — including the memory-recall **Availability Gate (Ask-to-Install)** that must run in the main thread (subagents cannot ask the user) before the memory subagent is dispatched.

<a id="after-all-subagents-complete"></a>
### After all subagents complete

Synthesize findings internally before proceeding — do not relay raw subagent output to the user; let the research inform your questions and approach proposals.

**Source precedence.** When recalled memories contain decisions, constraints, or scope boundaries that affect the topic, respect them as established context and, when one materially shapes a recommendation, briefly mention its existence (e.g., "Based on a prior decision to use Clean Architecture with Inversify..."). Full priority order (highest first):

1. Latest user instruction (highest) — including the user's answer when you surface a conflict
2. Corporate artifacts (*what* to build) and the project constitution `CLAUDE.md`/`AGENTS.md` (*how* to build) — each the source of truth on its own plane; on conflict with anything below, never silently override — apply the conflict protocol above (surface, recommend the authoritative value, ask the user; their answer is then your instruction at #1 and stands for the rest of the session)
3. Approved spec / current-session decisions
4. Recalled memory (prior decisions, ADRs, constraints)
5. Persisted research artifact (distilled `super.deep-research` findings — a strong, verified input, but not the final word on what the user wants)
6. External research (lowest)

**Pre-send check:** Before the first clarifying question, verify you used the `task` tool for all research. Any direct `view`/`grep`/`context7` calls in the main agent are still usable, but they violated the gate and inflate context for the rest of the session.

---

## The Process

**Understanding the idea:**

- Run Research via Parallel Subagents first — all tracks in one parallel turn before asking any questions.
- Assess scope before detailed questions: if the request describes multiple independent subsystems (e.g., "a platform with chat, file storage, billing, and analytics"), flag it immediately and don't refine details of a project that needs decomposing first. If it's too large for a single spec, help decompose into sub-projects (independent pieces, how they relate, build order); brainstorm the first one through the normal flow — each sub-project gets its own spec → plan → implementation cycle.
- For appropriately-scoped projects, ask one question at a time. For interdependent decisions (migration, greenfield, brownfield with ripple), map a dependency tree and resolve roots before leaves per `./references/decision-tree-interviewing.md`; for trivial/reversible changes keep a flat one-or-two-question pass.
- Prefer multiple choice questions when possible, but open-ended is fine too. When a clarifying question has a small set of fixed answers, present them as a selectable multiple-choice prompt so the user can pick instead of typing (keep a free-text escape for open-ended replies). This is the **terminal** path; genuinely visual choices still go through the Visual Companion (below).
- Only one question per message — break a topic needing more exploration into multiple questions.
- Focus on purpose, constraints, success criteria — **and architecture characteristics**. Use `./references/architecture-characteristics.md` to translate domain concerns into characteristics ("milhões de usuários" → scalability), surface implicit ones, and get the user to prioritize a top 3 — these become the tiebreaker for every later trade-off.

**Exploring approaches:**

- Propose 2-3 approaches with trade-offs (follow `./references/tradeoff-analysis.md`). Every option must list what it costs, not only what it gains — the prioritized architecture characteristics are the tiebreaker.
- Present options conversationally, leading with your recommended option and the reasoning — referencing the trade-off, not just the benefits.

**Presenting the design:**

- Once you believe you understand what you're building, present the design. Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced. Ask after each section whether it looks right so far.
- Cover: architecture characteristics (prioritized top 3), components, data flow, key decisions with trade-offs, risks, error handling, testing.
- Derive components using `./references/logical-components.md` — name them by responsibility (not "Manager"/"Handler"/"Service"), and validate each with the responsibility-statement test.
- Be ready to go back and clarify if something doesn't make sense.

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently. For each, you should be able to answer: what does it do, how do you use it, what does it depend on?
- Can someone understand a unit without reading its internals, and can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are easier to work with — you reason better about code you can hold in context at once, and edits are more reliable when files are focused. A file growing large often signals it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes; follow existing patterns.
- Where existing code has problems that affect the work (a file grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design — the way a good developer improves code they're working in. Don't propose unrelated refactoring; stay focused on what serves the current goal.

## After the Design

**Documentation:**

- Write the validated design (spec) to `docs/superpowers/<feature-name>/specs/<feature-name>-design.md`.
  - Structure it with the enriched sections from `./references/design-spec-structure.md` — Características Arquiteturais, Decisões Arquiteturais (with trade-offs), and Riscos — alongside the usual architecture/components/testing sections. Add the **Especificação Visual** section when a mockup or external design informed the feature.
  - `<feature-name>` is a kebab-case slug defined during this session (e.g., `toggle-light-dark-theme`).
  - <a id="reconcile-the-feature-slug"></a>**Reconcile the feature slug:** if `docs/superpowers/<feature-name>/research/` already exists (created upfront by `super.deep-research`), reuse that same slug for `specs/`, `prd/`, and `plans/` instead of coining a new one. Only mint a fresh slug when no prior research directory is present.
  - Create the feature directory structure: `specs/`, `prd/`, and `plans/` under `docs/superpowers/<feature-name>/`.
  - Include a dated YAML frontmatter block (`created_at`/`updated_at`) at the very top of the file. **For the date rules and the deterministic `frontmatter-utils.cjs` mechanics, read `./references/deterministic-scaffolding.md`** (within this skill the scripts are at `<super.brainstorming-base-dir>/scripts/`).
  - (User preferences for spec location override this default.)
- **If a mockup or external design informed the feature** (bespoke via the visual companion, or an external source like a Figma file or screenshot the user approved): distill it into a curated artifact at `docs/superpowers/<feature-name>/specs/mockups/<feature-name>-visual.md` (prose instructions + core HTML/JSX when available + design tokens + original design source link), and add the **Especificação Visual** section to the spec linking it. Fires on the **same condition** as that spec section — a section without a `specs/mockups/` artifact silently bypasses the visual-fidelity gate that `super.writing-plans` enforces. For a multi-screen flow, write **one file per approved screen** so each maps to a screen a UI task references by name. **Do not copy the ephemeral session wholesale** — curate, dropping waiting/placeholder/option screens; leave the companion session dir untouched (see `./visual-companion.md` § Distilling the approved mockup). The artifact is a directional reference (*norte*), not the pixel-final screen — it exists so super.writing-plans and the implementer reuse the decided layout/spacing/tokens instead of re-deriving them.
- Use the `super.writing-clearly-and-concisely` skill if available.
- Commit the design document to git.

**Spec Self-Review:**
After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two ways? If so, pick one and make it explicit.
5. **Architecture sections check:** Run the five additional checks from `./references/design-spec-structure.md` § Self-review additions (measurable characteristics, trade-offs recorded, 🔴 risks mitigated, no Entity Trap names, and — when a visual companion or external design informed the feature — the Especificação Visual section with its curated `specs/mockups/` artifact). `super.writing-plans` enforces this last one deterministically via `find-feature-files.cjs`' `visual-spec-without-artifact` warning, so never let the section ship without the artifact.
6. **Constitution check:** Does the design honor the consuming repo's `CLAUDE.md` / `AGENTS.md` principles and conventions? If it deviates from any stated rule, is the deviation explicitly flagged for the user rather than silently baked in?

Fix any issues inline. No need to re-review — just fix and move on.

**User Review Gate:**
After the spec review loop passes, ask the user to review the written spec:

> "Spec written and committed to `<path>`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."

Wait for their response. If they request changes, make them and re-run the spec review loop; only proceed once they approve.

**PRD Generation (optional — recommended):**

After the user approves the spec, **suggest** generating the PRD as an optional step, making the trade-off explicit so the user can decide with full context:

> "Spec aprovada. Agora recomendo gerar uma **PRD** para formalizar as user stories (US-NN) e os requisitos funcionais (FR-NNN).
>
> _Esta etapa é **opcional**, mas é o que **habilita o gate de QA** (`super.user-story-verification`) no final do pipeline: esse gate verifica cada user story da PRD contra a implementação real e produz um relatório de QA com evidências de teste e screenshots. **Sem PRD, o gate de QA é pulado** e o plano perde a rastreabilidade FR/US._
>
> Quer que eu gere a PRD, ou prefere ir direto para o planejamento?"

- **If the user agrees (default):** invoke the `super.generating-prd` skill. The PRD is saved in the feature's `prd/` subdirectory (e.g., `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`). Wait for user approval of the PRD before proceeding.
- **If the user explicitly skips** ("skip PRD", "go straight to planning"): proceed directly to super.writing-plans. The QA gate is skipped automatically since no PRD exists.

The routing rule for this handoff is stated once above ("The terminal planning handoff is `super.writing-plans`").

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
- A **diagram would clarify structure or flow** — architecture, state machine, sequence, data flow, entity relationships.
- A **multi-step or screen-by-screen flow** (onboarding, wizard, checkout) where the order and look of each screen matters.
- The user **references a visual artifact** — Figma, mockup, wireframe, screenshot, "looks like", "the design".

**Stay text-only (do not offer)** when the topic is purely non-visual: backend/API contracts, data models, config changes, or conceptual/requirements/tradeoff questions with no UI or diagram dimension. A UI-adjacent *concept* question ("what should 'archived' mean here?") is not a visual signal — the signal is about showing something, not discussing it.

When in doubt, **offer** — the companion is consent-based and the user can decline in one word, so a false offer is cheap while a missed one silently degrades the session to text.

**Offering the companion:** When at least one visual signal matches, offer it once for consent:
> "Some of what we're working on might be easier to explain visually. I can spin up a lightweight local preview for mockups, diagrams, and side-by-side comparisons — used only for the questions that are genuinely visual, so it stays inexpensive. Want me to enable it? (Requires opening a local URL.)"

**This offer MUST be its own message.** Do not combine it with clarifying questions, context summaries, or any other content. The message should contain ONLY the offer above and nothing else. Wait for the user's response before continuing. If they decline, proceed with text-only brainstorming.

**Once the user accepts**, read **[`./references/visual-companion-operation.md`](./references/visual-companion-operation.md)** before showing anything — it covers the per-question browser-vs-terminal decision (even after acceptance, not every question is visual), how to launch the server (cwd-independent `--reuse` command), and how to render screens from a JSON spec to keep markup out of context.
