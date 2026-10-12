---
name: super.generating-prd
description: "Write the PRD (user stories, functional requirements, scope) from an approved spec. Use when the user wants FR traceability and the QA gate; skip on \"skip PRD\"."
argument-hint: "[path-to-<feature-name>-design.md]"
---

# Generating PRD

Produce a structured PRD from a validated design spec, bridging creative exploration (brainstorming) and implementation planning (super.writing-plans).

## Why This Stage Exists

Brainstorming produces a design spec (architecture, components, trade-offs), not a requirements document. Before super.writing-plans breaks work into granular tasks, we need a clear contract — **user stories**, **functional requirements**, **scope boundaries** — the plan can trace back to. The PRD is the accountability layer between "we agreed on a design" and "here's how we build it." Without it, super.writing-plans must infer requirements from the spec, losing traceability and making it harder to verify the plan covers all user-facing needs.

This stage is **optional but recommended**: the PRD also **enables the QA gate** at the end of the pipeline. `super.user-story-verification` verifies each PRD user story (US-NN) against the live implementation, producing a QA report with test evidence and screenshots. If no PRD exists, the gate has nothing to verify and is skipped — so generating a PRD unlocks user-story-level QA before merge.

## When This Skill Is Invoked

Activates in the pipeline when the user chose **approve + PRD** at brainstorming's approval gate (step 8), **before** super.writing-plans. The brainstorming skill orchestrates the transition; this skill hands off to planning itself.

```
brainstorming (spec approved + PRD chosen) → super.generating-prd → super.writing-plans
```

If the user chose "approve without PRD" (or says "skip PRD", "go straight to planning"), this skill is not invoked — brainstorming goes directly to super.writing-plans.

## Inputs

| Source | What it provides |
|--------|-----------------|
| Design spec (from brainstorming) | Architecture, components, data flow, error handling, testing approach |
| Visual spec & curated mockup (if present) | The spec's Especificação Visual section + curated artifact under `specs/mockups/` — design source and visual decisions already made |
| Brainstorming conversation context | User intent, constraints, decisions, trade-offs chosen |
| Corporate artifacts (if available) | Pre-existing user stories, business constraints, domain context, success metrics, scope boundaries from prior docs (PRDs, specs, wikis, ADRs, etc.) |

You already have all of the above — the spec was written and reviewed this session, and corporate artifacts (if provided during onboarding) were passed by `super.using-superpowers` in context.

**Precedence:** When converting corporate artifacts into the PRD template (user stories, acceptance criteria, and other content they may already document), apply the precedence rule in `../super.brainstorming/references/fr-corporate-fidelity.md` ("Corporate artifact precedence") — corporate wins on conflict with the approved spec or a session decision, but the conflict must be flagged, never resolved silently.

## Process

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

> **ID prefixes (used across PRD, spec, plan, QA report):** user stories `US-01`, `US-02`…; functional requirements `FR-001`, `FR-002`…; QA bugs `BUG-01`…. Write them exactly as shown. The spec's `AC-NN` (acceptance criteria) and `INV-NN` (invariants) are its own IDs: an FR cites the ones that close it, never re-coins them.
>
> `FR-NNN`/`RF-NNN` are the coverage validator's requirement tokens — it scans the whole PRD for that shape and demands a task cover each one. So reserve that shape for **our** requirements: when you cite a corporate source's own identifiers for provenance (converting a corporate artifact often means quoting its IDs), do **not** reuse the `FR-`/`RF-` shape — write them another way (e.g. "corp ref ROLE-7") so a citation is not mistaken for an uncovered requirement.

Reproduce the standard PRD structure from `references/prd-template.md` — sections (in Portuguese): Visão Geral, Objetivos, Histórias de Usuário, Funcionalidades Principais, Experiência do Usuário, Restrições Técnicas de Alto Nível, Fora de Escopo. The template marks which two are conditional and also defines the exact `US-NN` line shape (required by generate-slugs.cjs) and the `FR-NNN` numbering.

**Principles while drafting:**
- **The spec is the source; the PRD adds, never restates.** Stories, FRs and product objectives are the PRD's own; scope, exclusions, rules, numbers and characteristics the spec already states are cited by section, and an FR a spec AC/INV closes names the behavior in one clause and cites the ID. A paragraph that re-explains the spec is noise the next reader has to reconcile.
- Focus on **WHAT** and **WHY**, never **HOW** (implementation belongs to the tech spec / super.writing-plans).
- Every functional requirement must be testable and unambiguous.
- User stories must be traceable — super.writing-plans maps tasks to them.
- Keep the PRD short: the stories, the FR lines and a few lines around them.

### 3. Save the PRD

Save in the feature's `prd/` subdirectory, deriving the path from the spec location:

- Spec lives at `docs/superpowers/<feature-name>/specs/<feature-name>-design.md`
- PRD goes to `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`
- Example: spec `…/toggle-light-dark-theme/specs/toggle-light-dark-theme-design.md` → PRD `…/toggle-light-dark-theme/prd/prd-toggle-light-dark-theme.md`
- If the feature directory structure doesn't exist yet, create it.

**Pass the exact PRD path forward in context** so super.writing-plans doesn't rediscover it. State explicitly: "PRD saved to `<path>`. This path will be provided to super.writing-plans."

### 4. Self-Review

Quick inline check before presenting:

1. **Completeness**: Every section filled? No placeholders or TBDs?
2. **Traceability**: Can each functional requirement be traced to a user story?
3. **No implementation**: Does any section prescribe HOW to build something? Remove it.
4. **Measurability**: Are objectives and acceptance criteria measurable?
5. **Consistency with spec**: Does the PRD contradict the design spec anywhere? Apply the "FR mechanism fidelity" rule from `../super.brainstorming/references/fr-corporate-fidelity.md` to every FR that names a concrete mechanism, and fix the FR text (or name the deliberate deviation explicitly) before moving on. With a curated mockup (`specs/mockups/`), every field or choice an FR says the user informs is an input there, not only a displayed value — a mismatch is resolved in the PRD or the mockup now, never left for the plan to pick.
6. **ID prefixes**: Is every user story `US-NN` and every functional requirement `FR-NNN`? Fix any drift.
7. **Nothing restated**: read each section against the spec. A sentence the spec already says (a scope line, an exclusion, a number, a characteristic, the flow) is replaced by a citation or deleted; Experiência do Usuário without a UI story and Restrições Técnicas with nothing beyond the spec are removed.
8. **Named-but-open scan**: Apply the "Named-but-dropped fork" rule from `../super.brainstorming/references/fr-corporate-fidelity.md` to every capability the PRD names in prose (a retry, a deduplication, an ordering guarantee, an audit trail, a rate limit) — promote it to an FR or rule it out under "Fora de Escopo" with a reason.

Fix issues inline.

### 5. Approval Gate (one question — outcomes named)

The PRD is the contract the plan and the QA gate trace back to, so the user reviews it once. Open the gate with the path and a compact summary — one line per user story (`US-NN — <title>`) and the FR count — then ONE question whose options name what each produces; render it in the session language, with a selectable multiple-choice prompt when the harness has one (the labels are meanings to translate, not literal tokens):

> "PRD saved to `<path>` — N user stories, M functional requirements: US-01 …, US-02 ….
>
> How do you want to proceed? (approve and plan / adjust)
> - **approve and plan** — I go on to the implementation plan with this PRD.
> - **adjust** — tell me what to change (a story, a requirement, the scope); I edit, re-run the self-review and ask again.
>
> _Planning can also run in a new session: `super.writing-plans docs/superpowers/<feature-name>/specs/<feature-name>-design.md docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`_"

The resume hint lives inside that same message — never as a second question. This is the only gate between the PRD and the plan: **approve and plan** → invoke `super.writing-plans` in the same turn, passing the PRD path — no further "proceed to planning?" confirmation. **adjust** →
- **Clarification-only edits** (rewording, adding detail, fixing ambiguity): apply them, re-run the self-review, re-open this gate.
- **Scope/architecture changes** (adding features, changing behavior, modifying boundaries): flag that these conflict with the approved design spec and ask whether to update the spec to match or revert the PRD change. The design spec remains the source of truth for architecture; the PRD is authoritative for user-facing requirements within that architecture.

## Key Principles

- **Leverage prior work** — brainstorming already clarified intent; don't re-ask what's answered.
- **Accountability layer** — the PRD is the contract super.writing-plans implements against.
- **Traceable requirements** — numbered functional requirements (FR-001…) enable plan-to-requirement mapping.
- **No implementation** — if you catch yourself writing "use X library" or "implement via Y pattern", stop and remove it.
- **User stories drive tasks** — super.writing-plans decomposes user stories into implementable tasks.
