---
name: super.generating-prd
description: "Generates PRD (Product Requirements Document) validated design spec. Invoked automatically after brainstorming approves spec before super.writing-plans begins. Use transitioning design exploration implementation planning — PRD formalizes user stories, functional requirements, scope boundaries super.writing-plans can produce more precise traceable implementation plan."
---

Generating PRD

Produce a structured PRD from a validated design spec, bridging creative exploration (brainstorming) and implementation planning (super.writing-plans).

## Why This Stage Exists

Brainstorming produces a design spec (architecture, components, trade-offs), not a requirements document. Before super.writing-plans breaks work into granular tasks, we need a clear contract — **user stories**, **functional requirements**, **scope boundaries** — the plan can trace back to. The PRD is the accountability layer between "we agreed on a design" and "here's how we build it." Without it, super.writing-plans must infer requirements from the spec, losing traceability and making it harder to verify the plan covers all user-facing needs.

This stage is **optional but recommended**: the PRD also **enables the QA gate** at the end of the pipeline. `super.user-story-verification` verifies each PRD user story (US-NN) against the live implementation, producing a QA report with test evidence and screenshots. If no PRD exists, the gate has nothing to verify and is skipped — so generating a PRD unlocks user-story-level QA before merge.

## When This Skill Is Invoked

Activates in the pipeline **after** the user approves the design spec (brainstorming step 8) and **before** super.writing-plans is invoked (brainstorming step 9). The brainstorming skill orchestrates the transition.

```
brainstorming (spec approved) → super.generating-prd → super.writing-plans
```

If the user explicitly skips PRD generation (e.g., "skip PRD", "go straight to planning"), respect that and proceed directly to super.writing-plans.

## Inputs

| Source | What it provides |
|--------|-----------------|
| Design spec (from brainstorming) | Architecture, components, data flow, error handling, testing approach |
| Visual spec & curated mockup (if present) | The spec's Especificação Visual section + curated artifact under `specs/mockups/` — design source and visual decisions already made |
| Brainstorming conversation context | User intent, constraints, decisions, trade-offs chosen |
| Corporate artifacts (if available) | Pre-existing user stories, business constraints, domain context, success metrics, scope boundaries from prior docs (PRDs, specs, wikis, ADRs, etc.) |

You already have all of the above — the spec was written and reviewed this session, and corporate artifacts (if provided during onboarding) were passed by `super.using-superpowers` in context.

**Precedence:** Corporate artifacts are the company's source of truth and take precedence on conflict — but never silently. Use them to populate the PRD (especially user stories and acceptance criteria that may already be documented), converting their content into our PRD template. If a corporate artifact conflicts with the approved spec or a current-session decision, do **not** just follow the spec: flag the conflict to the user, present the corporate value as the recommended truth, and ask which one to follow. The user's answer governs.

## Process

**Announce at start:** "I'm using the super.generating-prd skill to formalize requirements before planning implementation."

### 1. Assess Need for Additional Clarification

Brainstorming already did deep clarification, but the PRD requires specific artifacts (user stories, acceptance criteria, measurable objectives) the spec may not capture explicitly.

If corporate artifacts are available in context, review them first — they may already contain personas, success metrics, and scope boundaries, reducing or eliminating questions.

Scan the design spec (and any corporate artifacts) for:
- Are user personas and goals clearly identified?
- Are success metrics stated?
- Are scope boundaries (what's in, what's out) explicit?

If critical gaps exist, ask **at most 2-3 focused questions** to fill them — do not repeat the full clarification cycle.

If the spec is missing key product inputs, inform the user: "The design spec is missing key product inputs needed for the PRD. I recommend revisiting brainstorming to clarify [specific gaps] before generating the PRD." Let the user decide whether to proceed on assumptions or go back.

### 2. Draft the PRD

> **ID prefixes (used across PRD, spec, plan, QA report):** user stories `US-01`, `US-02`…; functional requirements `FR-001`, `FR-002`…; QA bugs `BUG-01`…. Write them exactly as shown.
>
> `FR-NNN`/`RF-NNN` are the coverage validator's requirement tokens — it scans the whole PRD for that shape and demands a task cover each one. So reserve that shape for **our** requirements: when you cite a corporate source's own identifiers for provenance (converting a corporate artifact often means quoting its IDs), do **not** reuse the `FR-`/`RF-` shape — write them another way (e.g. "corp ref ROLE-7") so a citation is not mistaken for an uncovered requirement.

Reproduce the standard PRD structure from `references/prd-template.md` — sections (in Portuguese): Visão Geral, Objetivos, Histórias de Usuário, Funcionalidades Principais, Experiência do Usuário, Restrições Técnicas de Alto Nível, Fora de Escopo, plus `created_at`/`updated_at` frontmatter. The template also defines the exact `US-NN` line shape (required by generate-slugs.cjs) and the `FR-NNN` numbering.

**Principles while drafting:**
- Focus on **WHAT** and **WHY**, never **HOW** (implementation belongs to the tech spec / super.writing-plans).
- Every functional requirement must be testable and unambiguous.
- User stories must be traceable — super.writing-plans maps tasks to them.
- Keep the PRD under 2,000 words — concise and actionable.

**Frontmatter dates:** the PRD carries `created_at`/`updated_at`. **For the date rules and the deterministic `frontmatter-utils.cjs` mechanics, read `../super.brainstorming/references/deterministic-scaffolding.md`** (from this skill the scripts are at `<super.generating-prd-base-dir>/../super.brainstorming/scripts/`).

### 3. Save the PRD

Save in the feature's `prd/` subdirectory, deriving the path from the spec location:

- Spec lives at `docs/superpowers/<feature-name>/specs/<feature-name>-design.md`
- PRD goes to `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`
- Example: spec `…/toggle-light-dark-theme/specs/toggle-light-dark-theme-design.md` → PRD `…/toggle-light-dark-theme/prd/prd-toggle-light-dark-theme.md`
- If the feature directory structure doesn't exist yet, create it.

**Pass the exact PRD path forward in context** so super.writing-plans doesn't rediscover it. State explicitly: "PRD saved to `<path>`. This path will be provided to super.writing-plans."

(User preferences for PRD location override this default.)

### 4. Self-Review

Quick inline check before presenting:

1. **Completeness**: Every section filled? No placeholders or TBDs?
2. **Traceability**: Can each functional requirement be traced to a user story?
3. **No implementation**: Does any section prescribe HOW to build something? Remove it.
4. **Measurability**: Are objectives and acceptance criteria measurable?
5. **Consistency with spec**: Does the PRD contradict the design spec anywhere?
6. **ID prefixes**: Is every user story `US-NN` and every functional requirement `FR-NNN`? Fix any drift.

Fix issues inline.

### 5. User Review

Present the PRD:

> "PRD generated and saved to `<path>`. Please review it — particularly the user stories and functional requirements. These will directly inform the implementation plan. Any changes before we proceed to planning?"

Wait for approval. If changes are requested:
- **Clarification-only edits** (rewording, adding detail, fixing ambiguity): apply them and re-run self-review.
- **Scope/architecture changes** (adding features, changing behavior, modifying boundaries): flag that these conflict with the approved design spec. Ask: "This change affects scope/architecture. Should I update the design spec to match, or revert the PRD change?" The design spec remains the source of truth for architecture; the PRD is authoritative for user-facing requirements within that architecture.

Only proceed once approved.

### 6. Transition to Writing-Plans

After approval, invoke the `super.writing-plans` skill. The PRD path is now available in context for it to consume.

## Key Principles

- **Leverage prior work** — brainstorming already clarified intent; don't re-ask what's answered.
- **Accountability layer** — the PRD is the contract super.writing-plans implements against.
- **Traceable requirements** — numbered functional requirements (FR-001…) enable plan-to-requirement mapping.
- **No implementation** — if you catch yourself writing "use X library" or "implement via Y pattern", stop and remove it.
- **User stories drive tasks** — super.writing-plans decomposes user stories into implementable tasks.
