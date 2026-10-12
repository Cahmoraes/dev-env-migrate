# After the Design

> Expansion of `SKILL.md` Checklist steps 6-9. Read it when you reach step 6 (write the design doc).

**Documentation:**

- Write the validated design (spec) to `docs/superpowers/<feature-name>/specs/<feature-name>-design.md`.
  - Structure it with the skeleton in `./design-spec-structure.md` — each section present because its interview lens opened: Escopo, Características Arquiteturais, Componentes, Fronteiras e Contratos, Dados e Consistência, Falhas e Erros, Rollout e Compatibilidade, Decisões Arquiteturais (alternatives, consequences, conformance), Riscos, Testes. Add the **Especificação Visual** section when a mockup or external design informed the feature.
  - `<feature-name>` is a kebab-case slug defined during this session (e.g., `toggle-light-dark-theme`).
  - <a id="reconcile-the-feature-slug"></a>**Reconcile the feature slug:** if `docs/superpowers/<feature-name>/research/` already exists (created upfront by `super.deep-research`), reuse that same slug for `specs/`, `prd/`, and `plans/` instead of coining a new one. Only mint a fresh slug when no prior research directory is present.
  - Create the feature directory structure: `specs/`, `prd/`, and `plans/` under `docs/superpowers/<feature-name>/`.
- **If a mockup or external design informed the feature** (bespoke via the visual companion, or an external source like a Figma file or screenshot the user approved): distill it into a curated artifact at `docs/superpowers/<feature-name>/specs/mockups/<feature-name>-visual.md` (prose instructions + core HTML/JSX when available + design tokens + original design source link), and add the **Especificação Visual** section to the spec linking it. Fires on the **same condition** as that spec section — a section without a `specs/mockups/` artifact silently bypasses the visual-fidelity gate that `super.writing-plans` enforces. For a multi-screen flow, write **one file per approved screen** so each maps to a screen a UI task references by name. **Do not copy the ephemeral session wholesale** — curate, dropping waiting/placeholder/option screens; leave the companion session dir untouched (see `./visual-companion.md`, "Distilling the approved mockup" section). The artifact is a directional reference (*norte*), not the pixel-final screen — it exists so super.writing-plans and the implementer reuse the decided layout/spacing/tokens instead of re-deriving them.
- **Diagram Enrichment:** before writing the doc, run the checklist in `./diagram-enrichment.md` to decide whether the design warrants one or more Mermaid diagrams (integrations, new components, complex refactors, ETL pipelines, state machines — not trivial changes). When warranted, dispatch one background subagent per diagram to generate it via `super.design-doc-mermaid` (it auto-selects the diagram type) and validate with `--no-image`; embed the returned Mermaid code raw into the relevant section of the spec and save the companion `.mmd` under `docs/superpowers/<feature-name>/specs/diagrams/` — no PNG, no image reference. **Await the subagent — never poll for it**; the full dispatch template and rationale are in the reference file. This is separate from the Visual Companion below and never creates a `specs/mockups/` artifact.
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

  **The companion is an INPUT surface:** a click in a tab left open reaches your next
  state call as fresh user intent about a decision already written and committed, and
  nothing downstream can tell it from a real answer. `--project-dir` sessions keep their screens under `.superpowers/brainstorm/` after the
  stop, so nothing is lost — if the user asks to revisit a mockup, relaunch explicitly.

**Spec Self-Review:**
After writing the spec document, **read the committed file back from disk with the file-reading tool** and review what is on disk, not the draft still in context. **A pass "from memory" is not a review and is never reported as one:** no read of the spec file between the commit and the user gate below means the step did not run. This is a cheap coherence pass, not an audit — one read plus the inline fixes. The deep, code-aware review is `super.reviewing-specs`, on demand.

| Check | What to look for |
|---|---|
| Completeness | "TBD", "TODO", placeholders, incomplete sections, a decision the interview raised that the spec never resolves |
| Consistency | Sections that contradict each other; a symbol used in one section and declared absent in another; a mechanism a decision or mitigation names that the spec never defines; a field or control the text says the user provides that the mockup only displays |
| Clarity | A requirement ambiguous enough that someone would build the wrong thing |
| Boundaries | Every value that crosses a layer has one written meaning: a date is a calendar day or an instant (and in whose timezone it is shown), money has its precision, a state change names its target state or is declared a toggle (and what a stale screen does), a failure names what the user sees. The spec's Fronteiras e Contratos section holds these meanings. Write each such value with its meaning on the gate's `Boundaries:` line |
| Scope | Focused enough for a single implementation plan, not several independent subsystems |
| YAGNI | Features nobody asked for, over-engineering |
| IDs and migration | The `check-spec.cjs` result from step 7: every error fixed, every warning fixed or judged |
| Structure | The template checks under "Self-review additions" in `./design-spec-structure.md` (already read in step 6; apply them to the file you just read back, no second read of the template) |
| Constitution | A deviation from the consuming repo's `CLAUDE.md` / `AGENTS.md` rules that is baked in silently instead of flagged for the user |

**Calibration: only fix what would lead to a flawed plan.** A missing section, a contradiction, a requirement readable two ways: fix those. Wording, style, a section thinner than its neighbours: leave them. Fix inline and move on; do not re-review your own fixes. **Commit every fix before opening the gate below** — the user approves the corrected file, never one with edits still pending.

**Approval Gate (one question — spec approval and the PRD decision together):**
After the spec review loop passes, open the gate. The message **opens with the self-review outcome** — `Self-review: <N> fixes applied — <one short clause per fix>` or `Self-review: no fixes needed`, in the session language — so a skipped review shows up as a missing line instead of being assumed to have passed. Without that line the gate is not open. The next line is `Boundaries: <value> = <written meaning>; ...` — one entry per value the Boundaries check walked (a date, an amount, a status change, a failure the user sees), or `Boundaries: none cross a layer`; an entry you cannot fill from the spec is a fix, not a line. Then the spec path, then ONE question whose options **name the artifact each produces** — render it in the session's language, with a selectable multiple-choice prompt when the harness has one (the labels are meanings to translate, not literal tokens):

> "Self-review: <outcome>.
> Boundaries: <value> = <meaning>; ...
> Spec written and committed to `<path>`. Read it before answering — this pause is your review.
>
> How do you want to proceed? (approve + PRD / approve without PRD / adjust / deep review first)
> - **approve + PRD** (recommended) — I generate the PRD (user stories `US-NN`, functional requirements `FR-NNN`) and go on to the implementation plan. The PRD is what enables the QA gate (`super.user-story-verification`) at the end of the pipeline.
> - **approve without PRD** — straight to the implementation plan from the spec; the plan traces the spec's AC/INV instead of FR/US, and the QA gate is skipped.
> - **adjust** — tell me what to change in the spec; I edit, re-run the self-review and ask again.
> - **deep review by a subagent first** — `super.reviewing-specs` checks the spec against the real code before planning (costs credits, takes minutes); then PRD as you choose."

Invariants of this gate: **any option a user can read as "no PRD" must actually produce no PRD**, and **no two options offered here may lead to the same artifacts** — a choice whose branches converge is a question about ceremony, not about the work. Never offer the user a choice whose options both end in a PRD being generated. Always add, never recommended, a fourth option **deep review by a subagent first** — `super.reviewing-specs` reads the spec against the real code before planning (costs credits, takes minutes), then PRD as chosen — default remains skip. **Name the actor in every option**: "review" alone reads two ways — the user reading the file (which this pause already is) and the subagent review (which is a paid stage).

- **approve + PRD:** invoke `super.generating-prd`. It writes `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`, opens its own single approval gate (approve and plan / adjust) and invokes `super.writing-plans` itself — the PRD is the contract the plan and the QA gate trace back to, so the user reviews it once, there.
- **approve without PRD:** invoke `super.writing-plans` directly, in this same turn. The QA gate is skipped automatically since no PRD exists.
- **adjust:** make the changes, re-run the spec self-review, re-open this gate.

**This one answer is the only consent gate at the brainstorming→planning boundary — it is already the go-ahead for planning.** Once it is answered (either approve branch), invoke the next skill and let it run. Do NOT insert a "Chegamos ao final do brainstorming… continuar com o plano?" / "continue with the implementation plan?" / `{ continue_planning: boolean }` prompt after it, and do NOT ask a separate "please review the spec" question before it — each re-asks for consent the user already gave, and turns one decision into a click-through of near-identical gates.

**Resume hint — one line in the same turn that invokes `super.writing-plans`** (approve-without-PRD branch). Planning starts straight from here, so tell the user once that it survives the session (real path, session language):

> _Planning can also run in a new session: `super.writing-plans docs/superpowers/<feature-name>/specs/<feature-name>-design.md`_

Spec path only — this branch has no PRD. (The PRD branch gets the same hint from `super.generating-prd`, with both paths.) It asks nothing: invoke `super.writing-plans` in the same turn, or the hint becomes the second consent prompt the rule above forbids.

Every approve branch ends at `super.writing-plans` — directly here, or through `super.generating-prd`, which invokes it itself.
