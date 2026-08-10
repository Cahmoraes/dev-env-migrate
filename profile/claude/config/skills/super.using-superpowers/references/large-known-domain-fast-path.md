# Large, Known-Domain Fast Path - settle the PRD decision at triage (option 2)

The Large tier defaults to the full pipeline: brainstorming, then `super.generating-prd` as a separate dispatch, then `super.writing-plans` with wave planning - because a multi-component feature with real architecture decisions usually needs that extra rigor. But not every Large-tier request is ambiguous. A feature can touch several components and still sit in a domain the team already understands well - an HTTP idempotency middleware, a feature-flag system - with no open architecture decision that actually needs exploration. For that case, stopping *after the spec* to ask "do you want a PRD?" is a round trip whose answer is already known at triage. This path settles that one decision up front - asked once, at triage, in terms of outcome - and then dispatches `super.generating-prd` automatically once the design spec is approved, **without dropping any per-task quality gate or breaking the FR/US traceability `super.writing-plans` depends on, and without folding PRD content into the spec - the PRD stays a real, standalone file, exactly like the normal flow**.

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

## Confirming question - ask it at triage, and only there

**Timing is the whole value of this question.** It buys exactly one round trip: the one that would otherwise happen right after the spec is approved. Ask it at triage, before invoking `super.brainstorming`, while that round trip is still in the future.

**If the design spec is already written or approved and this question was never asked, it is too late - do NOT ask it now.** The round trip it exists to save has already arrived. Ask `super.brainstorming`'s normal PRD question instead (`super.brainstorming/references/after-the-design.md`, "PRD Generation (optional — recommended)") and let that single answer decide. A meta-question about ceremony, raised at the exact moment the real question is due, spends the round trip it claims to save and turns one decision into two.

The user decides - offer it explicitly, in the preferred language, **the three option labels included**: `generate / no PRD / decide later` are meanings to translate, not literal tokens the user has to type back. **State outcomes, never ceremony:**

> This looks like a Large feature, in a domain we already understand well, with no open architecture decision that needs exploring - so we can settle the PRD now instead of asking again after the spec. The PRD formalizes user stories (`US-NN`) and functional requirements (`FR-NNN`), and it is what enables the final QA gate (`super.user-story-verification`); without it that gate is skipped and the plan loses FR/US traceability. How do you want to proceed? (generate / no PRD / decide later — translate these three labels into the session's language)
>
> - **generate** - once the design spec is approved I dispatch PRD generation automatically, as its own standalone file, and never ask about the PRD again.
> - **no PRD** - straight from the approved spec to `super.writing-plans`; the QA gate is skipped too.
> - **decide later** - full pipeline: I ask the PRD question once, after the spec is approved.

Every option keeps the design rigor, the approved-spec requirement, and every per-task quality gate; they differ only in whether a PRD file exists.

**Never phrase the choice as "skip the confirmation question?".** That names ceremony instead of outcome, and *both* of its answers produce a PRD - so a user who answers "skip" meaning "skip the PRD" gets a PRD anyway, which is the double-question failure this section exists to prevent. Invariant: **any option a user can read as "no PRD" must actually produce no PRD**, and no two options offered here may lead to the same artifacts.

If the user picks `decide later`, or does not answer, run the full pipeline.

## What changes (and what does NOT)

- `super.brainstorming` produces the design spec as usual (architecture, components, trade-offs, decisions).
- Once the spec is approved, and only if the user answered `generate` at triage, `super.generating-prd` is dispatched immediately and automatically - no second PRD question - producing a real, standalone `prd/prd-<feature-name>.md`, using the same ID prefixes (`US-NN`, `FR-NNN`) it always uses. Because it reuses the brainstorming context (per its own "leverage prior work" rule), this dispatch typically asks zero extra questions for a genuinely known-domain, no-open-decision feature.
- `super.writing-plans` - unchanged: wave planning and full task decomposition, run against the standalone PRD exactly as it always does.
- Execution - unchanged: full per-task gates (TDD -> `super.verification-before-completion` -> spec + code-quality review), plus the final QA gate (`super.user-story-verification`), which runs against the real PRD file exactly as it would for any other tier.

The only thing this path drops is the *post-spec* "do you want a PRD?" round trip - the decision itself is still the user's, just made once, at triage. Everything else - a real separate PRD file, design rigor, requirement traceability, every quality/QA gate - is identical to the full pipeline. A Large feature on the fast path gets exactly the same artifacts and verification a Large feature on the full pipeline gets; the fast path only saves one round-trip question.
