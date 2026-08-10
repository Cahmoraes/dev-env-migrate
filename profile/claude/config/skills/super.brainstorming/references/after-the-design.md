# After the Design

> Expansion of `SKILL.md` Checklist steps 6-10. Read it when you reach step 6 (write the design doc). It lives here, not in `SKILL.md`, because after a compaction the harness re-injects only the first 20.000 characters of a skill — a pointer that survives beats prose that silently does not.

**Documentation:**

- Write the validated design (spec) to `docs/superpowers/<feature-name>/specs/<feature-name>-design.md`.
  - Structure it with the enriched sections from `./references/design-spec-structure.md` — Características Arquiteturais, Decisões Arquiteturais (with trade-offs), and Riscos — alongside the usual architecture/components/testing sections. Add the **Especificação Visual** section when a mockup or external design informed the feature.
  - `<feature-name>` is a kebab-case slug defined during this session (e.g., `toggle-light-dark-theme`).
  - <a id="reconcile-the-feature-slug"></a>**Reconcile the feature slug:** if `docs/superpowers/<feature-name>/research/` already exists (created upfront by `super.deep-research`), reuse that same slug for `specs/`, `prd/`, and `plans/` instead of coining a new one. Only mint a fresh slug when no prior research directory is present.
  - Create the feature directory structure: `specs/`, `prd/`, and `plans/` under `docs/superpowers/<feature-name>/`.
  - Include a dated YAML frontmatter block (`created_at`/`updated_at`) at the very top of the file. **For the date rules and the deterministic `frontmatter-utils.cjs` mechanics, read `./references/deterministic-scaffolding.md`** (within this skill the scripts are at `<super.brainstorming-base-dir>/scripts/`).
  - (User preferences for spec location override this default.)
- **If a mockup or external design informed the feature** (bespoke via the visual companion, or an external source like a Figma file or screenshot the user approved): distill it into a curated artifact at `docs/superpowers/<feature-name>/specs/mockups/<feature-name>-visual.md` (prose instructions + core HTML/JSX when available + design tokens + original design source link), and add the **Especificação Visual** section to the spec linking it. Fires on the **same condition** as that spec section — a section without a `specs/mockups/` artifact silently bypasses the visual-fidelity gate that `super.writing-plans` enforces. For a multi-screen flow, write **one file per approved screen** so each maps to a screen a UI task references by name. **Do not copy the ephemeral session wholesale** — curate, dropping waiting/placeholder/option screens; leave the companion session dir untouched (see `./visual-companion.md`, "Distilling the approved mockup" section). The artifact is a directional reference (*norte*), not the pixel-final screen — it exists so super.writing-plans and the implementer reuse the decided layout/spacing/tokens instead of re-deriving them.
- **Diagram Enrichment:** before writing the doc, run the checklist in `./references/diagram-enrichment.md` to decide whether the design warrants one or more Mermaid diagrams (integrations, new components, complex refactors, ETL pipelines, state machines — not trivial changes). When warranted, dispatch one background subagent per diagram to generate it via `super.design-doc-mermaid` (it auto-selects the diagram type) and validate with `--no-image`; embed the returned Mermaid code raw into the relevant section of the spec and save the companion `.mmd` under `docs/superpowers/<feature-name>/specs/diagrams/` — no PNG, no image reference. **Await the subagent — never poll for it**; the full dispatch template and rationale are in the reference file. This is separate from the Visual Companion below and never creates a `specs/mockups/` artifact.
- Keep all prose documents under 400 words per section; commit messages under 72 chars (imperative mood).
- Commit the design document to git.
- **Close the visual companion — STOP, do this before the Spec Self-Review below.** The
  spec and (when one exists) the curated `specs/mockups/` artifact are now on disk, so
  every decision the browser could inform has been made and committed.

  ```bash
  node <super.brainstorming-base-dir>/scripts/stop-companion.cjs --project-dir "$(git rev-parse --show-toplevel)"
  ```

  Run it **unconditionally** — it is idempotent, and answers `{"stopped": false,
  "reason": "no-live-companion"}` when the companion was never launched, so you never
  have to remember whether this session used one.

  The reason is not tidiness, it is that **the companion is an INPUT surface**. A tab
  left open anywhere still delivers a click through the full path — WebSocket → journal
  → your next state call — and it arrives as fresh user intent about a decision that is
  already written and committed. Deleting the surface is the only thing that makes a
  late click impossible; nothing downstream can distinguish one from a real answer.
  `--project-dir` sessions keep their screens under `.superpowers/brainstorm/` after the
  stop, so nothing is lost — if the user asks to revisit a mockup, relaunch explicitly.

**Spec Self-Review:**
After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two ways? If so, pick one and make it explicit.
5. **Architecture sections check:** Run these eight additional checks (defined in the "Self-review additions" section of `./references/design-spec-structure.md` — you already read that reference when writing the doc in step 6, so re-run them from here, no second read needed): measurable characteristics, trade-offs recorded, 🔴 risks mitigated, no Entity Trap names, — when a visual companion or external design informed the feature — the Especificação Visual section with its curated `specs/mockups/` artifact (`super.writing-plans` enforces this one deterministically via `find-feature-files.cjs`' `visual-spec-without-artifact` warning, so never let the section ship without the artifact), close-every-end (every hard decision the interview surfaced is resolved — none left open, vague, or deferred without a named unblocking task), no phantom mechanisms (every mechanism a decision or risk mitigation names is actually defined in the spec), and no used-vs-declared-absent contradiction (a symbol used in one section is not declared absent in another).
6. **Constitution check:** Does the design honor the consuming repo's `CLAUDE.md` / `AGENTS.md` principles and conventions? If it deviates from any stated rule, is the deviation explicitly flagged for the user rather than silently baked in?

Fix any issues inline. No need to re-review — just fix and move on.

**User Review Gate:**
After the spec review loop passes, ask the user to review the written spec:

> "Spec written and committed to `<path>`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."

Wait for their response. If they request changes, make them and re-run the spec review loop; only proceed once they approve.

**PRD Generation (optional — recommended):**

After the user approves the spec, **suggest** generating the PRD as an optional step, making the trade-off explicit so the user can decide with full context — render it in the session's language:

> "Spec approved. I now recommend generating a **PRD** to formalize the user stories (US-NN) and the functional requirements (FR-NNN).
>
> _This step is **optional**, but it is what **enables the QA gate** (`super.user-story-verification`) at the end of the pipeline: that gate checks every PRD user story against the real implementation and produces a QA report with test evidence and screenshots. **Without a PRD the QA gate is skipped** and the plan loses FR/US traceability._
>
> Should I generate the PRD, or would you rather go straight to planning?"

- **If the user agrees (default):** invoke the `super.generating-prd` skill. The PRD is saved in the feature's `prd/` subdirectory (e.g., `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`). Wait for user approval of the PRD, then invoke super.writing-plans directly.
- **If the user explicitly skips** ("skip PRD", "go straight to planning"): proceed directly to super.writing-plans. The QA gate is skipped automatically since no PRD exists.

**This yes/no is the only consent gate at the brainstorming→planning boundary — it is already the go-ahead for planning.** Once it is answered (either branch), invoke super.writing-plans and let it run. Do NOT insert a second "Chegamos ao final do brainstorming… continuar com o plano?" / "continue with the implementation plan?" / `{ continue_planning: boolean }` prompt after it — that re-asks for consent the user just gave (skipping the PRD *means* going straight to planning), stalls a flow meant to proceed, and is the exact anti-pattern that turns one decision into a click-through of near-identical gates.

**Resume hint — one line in the same turn that invokes `super.writing-plans`.** Planning starts straight from here in this branch, so tell the user once that it survives the session (real path, session language):

> _Planning can also run in a new session: `super.writing-plans docs/superpowers/<feature-name>/specs/<feature-name>-design.md`_

Spec path only — this branch has no PRD. (The agree branch gets the same hint from `super.generating-prd`, with both paths.) It asks nothing: invoke `super.writing-plans` in the same turn, or the hint becomes the second consent prompt the rule above forbids.

**Large fast path (known domain, auto-PRD):** this rule holds only while the current tier — from the most recent binding checkpoint (1 or 2) — is literally `large`. If checkpoint 1 or checkpoint 2 escalated to `complex`, the fast path is void: fall back to the normal suggest-PRD flow above, and for Complex, to `super.generating-prd`'s separate dispatch per `complex-path.md`. Never cite "Large fast path" to justify skipping the PRD suggestion when the current tier is not `large`. The fast path is *active* only when its confirming question was actually asked at triage — before brainstorming ran — and the user answered `generate` there. Eligibility alone never activates it: known domain plus no open decision is what makes the question worth asking early, not a substitute for the user's answer. **If you reach this step and that question was never asked, it is too late to ask it — asking "can I skip the PRD confirmation question?" here IS the round trip it was meant to save, and it turns one decision into two.** Ask the normal PRD question above instead, exactly as written: its two branches produce different artifacts (a PRD, or no PRD and no QA gate), which is what makes the answer meaningful. Never offer the user a choice whose options both end in a PRD being generated. When the fast path *is* active, skip the PRD suggestion/trade-off question above — the user already answered it — and dispatch `super.generating-prd` immediately once the spec is approved, exactly like the normal "if user agrees" branch: it writes a standalone PRD to `prd/prd-<feature-name>.md`, reusing the brainstorming context so it typically asks zero extra questions. Wait for user approval of the PRD before proceeding to `super.writing-plans`. The only ceremony this path removes versus the full pipeline is the explicit y/n question — the PRD is always a real, separate file, exactly like every other tier. If real ambiguity or an open architecture decision surfaces at any point, stop and fall back to the normal suggest-PRD flow above.

The routing rule for this handoff is stated once above ("The terminal planning handoff is `super.writing-plans`").
