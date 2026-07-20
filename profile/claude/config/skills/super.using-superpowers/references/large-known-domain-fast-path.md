# Large, Known-Domain Fast Path - skip the PRD confirmation question (option 2)

The Large tier defaults to the full pipeline: brainstorming, then `super.generating-prd` as a separate dispatch, then `super.writing-plans` with wave planning - because a multi-component feature with real architecture decisions usually needs that extra rigor. But not every Large-tier request is ambiguous. A feature can touch several components and still sit in a domain the team already understands well - an HTTP idempotency middleware, a feature-flag system - with no open architecture decision that actually needs exploration. For that case, stopping to ask "do you want a PRD?" is a ceremony question whose answer is already known. This path skips that one confirmation question and dispatches `super.generating-prd` automatically once the design spec is approved, **without dropping any per-task quality gate or breaking the FR/US traceability `super.writing-plans` depends on, and without folding PRD content into the spec - the PRD stays a real, standalone file, exactly like the normal flow**.

## When it applies (ALL must hold)

Assess at triage, before invoking `super.brainstorming`, and only for a request already sized Large. Eligibility is not a one-time read: a later **binding** checkpoint (1 or 2, per `super.using-superpowers/references/complexity-checkpoints.md`) that escalates the tier to `complex` invalidates it retroactively — see "Escalate back" below.

- **Known domain** - the team already understands the problem domain and has built something like this before; it is an established pattern, not exploratory research.
- **No open architecture decision** - there is no genuine fork in approach that needs trade-off exploration; the shape of the solution is already clear going in.
- **Multi-component but not cross-cutting** - it is still a real Large feature (touches several components/files) but does not ripple across bounded contexts or introduce novel risk.
- **Requirements are stable** - the user stories and functional requirements can be stated directly, not discovered through iterative interview.

If ANY criterion is uncertain or fails - genuine ambiguity, an unresolved architecture fork, a novel domain, cross-cutting risk - do NOT take this path. Run the full pipeline with brainstorming and PRD as separate dispatches. When in doubt, go full.

## Escalate back to the full pipeline mid-brainstorming

Treat the fast path as a starting bet, not a lock-in. If, while drafting the design, real ambiguity or an open architecture decision surfaces - a design fork the user has not already resolved, a trade-off that genuinely needs proposing and deciding - stop and escalate: finish brainstorming as Complex, then dispatch `super.generating-prd` as usual. Never silently drop rigor once ambiguity appears; only ever escalate up to more rigor, never skip down to less.

**The canonical trigger is checkpoint 1 or checkpoint 2 (the binding tier checkpoints inside `super.brainstorming`) returning a tier of `complex`.** Either one firing voids the fast path immediately, even if the fast path's confirming question was already accepted earlier in the same session. Concrete failure mode this closes: the tier rises to `complex` at checkpoint 1, the design gets fully drafted and approved, and only at the PRD-dispatch step does the agent reach for "Large fast path" to skip the confirmation question — citing a decision (Large, known domain) that the checkpoint had already overturned. When checkpoint 1 or 2 reports `complex`, treat the fast path as void from that point forward: finish (or redo) brainstorming as Complex, and dispatch `super.generating-prd` separately per `references/complex-path.md` — this is the same dispatch the fast path always makes, just no longer skipped; there is no merged content to unwind, since the fast path never folds PRD content into the spec.

## Confirming question

The user decides - offer it explicitly, in the preferred language:

> This looks like a Large feature, but in a domain we already understand well, with no open architecture decision that needs exploring. I can skip the PRD confirmation question - once the design spec is approved I'll dispatch PRD generation automatically, as its own standalone file - while keeping full requirement traceability and every per-task quality gate, including the final QA gate. Or we run the full pipeline and I ask before generating the PRD. Skip the confirmation? (yes / full)

If the user picks full, or does not confirm, run the full pipeline.

## What changes (and what does NOT)

- `super.brainstorming` produces the design spec as usual (architecture, components, trade-offs, decisions).
- Once the spec is approved, `super.generating-prd` is dispatched immediately and automatically - no confirmation question - producing a real, standalone `prd/prd-<feature-name>.md`, using the same ID prefixes (`US-NN`, `FR-NNN`) it always uses. Because it reuses the brainstorming context (per its own "leverage prior work" rule), this dispatch typically asks zero extra questions for a genuinely known-domain, no-open-decision feature.
- `super.writing-plans` - unchanged: wave planning and full task decomposition, run against the standalone PRD exactly as it always does.
- Execution - unchanged: full per-task gates (TDD -> `super.verification-before-completion` -> spec + code-quality review), plus the final QA gate (`super.user-story-verification`), which runs against the real PRD file exactly as it would for any other tier.

The only thing this path drops is the explicit "do you want a PRD?" confirmation question and its trade-off framing. Everything else - a real separate PRD file, design rigor, requirement traceability, every quality/QA gate - is identical to the full pipeline. A Large feature on the fast path gets exactly the same artifacts and verification a Large feature on the full pipeline gets; the fast path only saves one round-trip question.
