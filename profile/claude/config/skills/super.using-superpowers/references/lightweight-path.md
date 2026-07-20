# Lightweight Path — trivially-scoped feature/refactor (option 2)

The pipeline routes every option-2 request (feature, behavior change, migration, refactor) through the full ceremony: a wide research fan-out in brainstorming, an enriched-section design doc, an optional PRD, the visual companion, then a second research fan-out in writing-plans. For a small, bounded change that ceremony is the dominant context cost and buys little. This path collapses it — **without dropping any per-task quality gate**.

The lean modes it uses already exist inside the skills (brainstorming's flat one-or-two-question pass for trivial/reversible changes, its "a few sentences if straightforward" design sizing, and its optional PRD). What this path adds is a deterministic scope check *at triage time* so the model actually elects those lean modes instead of defaulting into the full ceremony.

## When it applies (ALL must hold)

Assess at triage, before invoking `super.brainstorming`. Take the lightweight path only when EVERY criterion holds:

- **Bounded files** — the change touches roughly 1–3 existing files; no sprawling edit.
- **No new architectural unit** — no new bounded context, service, module boundary, or logical component; you are modifying what already exists.
- **Reversible** — easy to revert; no data migration, no public API/contract change, no irreversible side effect.
- **No new user story** — the behavior change is small enough it would not earn its own PRD user story (a tweak, not a capability).

If ANY criterion is uncertain or fails — a new abstraction, a cross-cutting change, unclear requirements, a security/auth surface — do NOT take this path. Use the full `super.brainstorming` pipeline. **When in doubt, go full.**

## Confirming question

The user decides — offer it explicitly, in the preferred language:

> This looks like a small, bounded change (~1–3 files, no new architecture). I can take the **lightweight path** — a quick design and a minimal plan, skipping the full brainstorming/PRD ceremony — while keeping the same test-first quality gates. Or we run the full pipeline. Lightweight? (yes / full)

If the user picks full, or does not confirm, run the full pipeline.

## What changes (and what does NOT)

Route through the SAME skills, in reduced mode:

- **`super.brainstorming`** — flat one-or-two-question pass (for trivial/reversible changes), memory recall + a SINGLE targeted codebase exploration (not a research cluster), and a few-sentence design doc (not the enriched-section version). Skip the visual companion unless a UI change genuinely needs it. **Skip the PRD.**
- **`super.writing-plans`** — a single targeted exploration (scope is already bounded), a minimal task set (often one or two tasks, one wave).
- **Execution** — unchanged: mode election + full per-task gates (TDD → `super.verification-before-completion` → spec + code-quality review).

The only things dropped are the wide fan-outs, the enriched design doc, the PRD, and (usually) the visual companion. Correctness gates are untouched — a trivial change still gets tests and review.
