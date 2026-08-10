# complex-path.md

## Complex Path — evidence-first front end for novel / ambiguous / cross-cutting work (option 2)

The Complex tier (top of the five: novel domain, genuine ambiguity, or cross-cutting risk — an open architecture fork the interview cannot close from what is already known) routes **exactly like Large through execution**: full brainstorming + PRD, `super.writing-plans` with waves, and the full fan-out with every per-task and final gate, unchanged (see the rigor invariant in `super.using-superpowers/SKILL.md`). What Complex adds is a **front end**: two token-costly stages that fortify the design *before* the expensive fan-out spends tokens building on it. Each is **opt-in, offered one at a time**, because each fans out its own subagents and costs tokens — so neither runs without explicit user consent.

`assess-complexity.cjs` drives this deterministically: a `complex` tier emits an advisory `consentGates` field naming the stage to offer at the current checkpoint — `["deep-research"]` at checkpoints 0/1, `["reviewing-specs"]` at checkpoint 2. The field only says WHICH offer to present; the user's yes/no is the decision.

### Stage 1 — deep-research, before brainstorming (checkpoint 0/1)

When the triage read (checkpoint 0) or the first interview signal (checkpoint 1) returns `complex`, offer `super.deep-research` before designing, so the brainstorming that follows is grounded in evidence instead of guesses.

Confirming question — offer it explicitly, in the session's language:

> This looks like a **complex** problem (novel domain / genuine ambiguity / cross-cutting risk). Before designing, I can run a **deep research** stage (`super.deep-research`) to ground the design in evidence — it fans out research subagents and **costs tokens**. Research first, or go straight to brainstorming? (research / straight)

If the user does not explicitly accept, skip it and go straight to `super.brainstorming` — the design still runs, just without the upfront research artifact. (If `complex` only surfaces at checkpoint 1, brainstorming's own research fan-out already covers the research need; the offer is still valid but not mandatory.)

### Stage 2 — reviewing-specs, after the design (checkpoint 2)

Once the design draft exists and checkpoint 2 confirms `complex`, offer `super.reviewing-specs` before handing off to `super.writing-plans`, so a fresh set of read-only lenses can catch open points, internal contradictions, and spec↔code / spec↔corporate gaps while they are still cheap to fix — before the fan-out builds on them.

Confirming question — offer it explicitly, in the session's language:

> The design for this complex problem is ready. Before planning the tasks, I can run an **independent critical review of the spec** (`super.reviewing-specs`) — several read-only lenses in parallel at the `capable` tier, **costs tokens**. Review the spec now, or go straight to the plan? (review / straight)

If the user does not explicitly accept, proceed to `super.writing-plans` unchanged.

### What does NOT change

Execution and every quality gate are identical to the Large tier: full per-task gates (TDD → `super.verification-before-completion` → spec + code-quality review, or the `reviewShape` each task earns), the final code review, the always-on `super.independent-verification` gate, and the opt-in QA gate (`super.user-story-verification`). The two stages above are **additive** front-end fortification, never a substitute for any gate — and each is skipped silently when the user declines, so a Complex feature never pays for research or spec-review it did not ask for.
