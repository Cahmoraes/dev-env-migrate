# Diagram Enrichment for Design Specs

Enrich the **written spec** (step 6, "Write design doc") with professional Mermaid diagrams when they clarify structure or flow better than prose alone — selected and generated via `super.design-doc-mermaid`, produced by a background subagent, embedded raw (no PNG) into the committed spec file.

This is **separate from the Visual Companion** (`SKILL.md`, "Visual Companion" section). The Visual Companion is an ephemeral, consent-based browser preview used *during* the conversation to settle a specific decision (e.g., comparing two layouts). Diagram Enrichment happens once, while writing the committed spec, and its output lives in the spec file itself as a permanent artifact. Diagram Enrichment diagrams do **not** create a `specs/mockups/` artifact and do **not** trigger `super.writing-plans`' visual-fidelity gate — that gate is scoped to UI mockups only. If a diagram shown in the Visual Companion during the interview also belongs in the spec, reuse its Mermaid source through this same flow so it gets validated and saved under `specs/diagrams/`.

## When it's warranted

Run this checklist while drafting the design (before writing the doc to disk). Enrich when **any** applies:

- A **new integration** between systems, services, or external APIs.
- **New components** whose relationships aren't obvious from a component list alone.
- A **complex refactor** that changes an existing flow (current-vs-proposed is worth showing).
- An **ETL / data pipeline** with multiple stages or transformations.
- A **state machine** or multi-state lifecycle (e.g., order status, approval workflow).
- A **non-trivial data flow** across layers or bounded contexts.

**Skip it** for trivial demands — a single config toggle, a one-line utility, a straightforward CRUD field, a copy change. A diagram that just restates one sentence of prose is noise, not enrichment; so is one that redraws a sequence the neighboring prose already lists step by step (a rollout order, a linear flow).

## Selecting the diagram type

Don't guess the diagram type yourself in the main thread — the dispatched subagent consults `super.design-doc-mermaid`'s own Decision Tree (that skill's `SKILL.md`, "Decision Tree" section) to pick the best fit (flowchart, sequence, state, ER, C4, etc.) for what's being shown. This keeps type-selection expertise in the one skill that owns it.

## Dispatch (background subagent, single turn)

Set an explicit `model:` per `super.subagent-driven-development`'s Model Selection reference — floor at `standard` (picking a diagram type and labeling it well is judgment, not pure lookup). Dispatch one subagent per diagram identified by the checklist above; if several are warranted, dispatch them together in the same turn.

```
Use the super.design-doc-mermaid skill to create a Mermaid diagram for: [what the diagram should show — e.g. "the request flow between the API and the notification service", "the state machine for order status"].

Context: [1-2 sentences — the feature being designed, the relevant components/actors].

Steps:
1. Read super.design-doc-mermaid's SKILL.md "Decision Tree" section to pick the diagram type.
2. Write the Mermaid code for it.
3. Validate (do not render a PNG):
   python <super.design-doc-mermaid-base-dir>/scripts/resilient_diagram.py \
       --code "<mermaid code>" \
       --markdown-file <feature-name>-design \
       --diagram-num <n> \
       --title "<short_title>" \
       --output-dir docs/superpowers/<feature-name>/specs/diagrams \
       --no-image --json
4. If validation fails, apply the fix suggested in the script's troubleshooting_matches/suggested_fix output and retry.

Return (max ~150 words, nothing else — no narration):
- Diagram type chosen and one line on why
- The final validated Mermaid code as a fenced ```mermaid block
- The saved .mmd path
```

**Await the subagent — never poll for it.** It runs in the background and the harness re-invokes you when it returns; simply wait. Do not `sleep` or schedule a wakeup/timer to "check on" a diagram subagent you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow.

## Embedding into the spec

When the subagent returns, embed its Mermaid fenced block directly into the relevant section of the design doc (Architecture, Data Flow, or a subsection matching the diagram's subject) while writing the spec in step 6 — do **not** add an `![]()` image reference; there is no PNG in this mode. The persisted `.mmd` under `docs/superpowers/<feature-name>/specs/diagrams/` remains the traceable source if the diagram is later edited or needs to be rendered as an image (e.g. for an external doc).

**The diagram complements the prose — it never replaces it.** Write (or keep) the full prose description of the flow — states, transitions, stages, whatever the section already covers — exactly as you would without a diagram, then place the diagram alongside it. A reader who only reads the prose must still get the complete picture; a reader who only looks at the diagram must too. If writing the diagram tempts you to shorten or drop the prose because "the picture already shows it," that is the mistake this rule exists to block — don't do it.

**Never narrate the diagram's own production inside the spec.** No sentence naming the subagent, the background dispatch, `--no-image`, `mmdc`, or "validated" — that is process/tooling log content, not spec content, and reads as noise to any future reader (human or model). If the `.mmd` path is worth keeping for traceability, a bare relative path is enough (e.g. `Diagrama fonte: specs/diagrams/<file>.mmd`) — nothing about how it was generated belongs in the artifact.

**The diagram must not assert anything the prose doesn't — every node, edge, label, and condition needs a tracing sentence.** A generic claim in a characteristics table or summary (e.g. "every phase before cutover has a documented rollback path") asserts that a *property* holds; it does not license the diagram to invent the *specific mechanism* — which state rolls back to which, on what trigger — on its own. If a diagram edge encodes a specific transition, trigger, threshold, or actor, the flow prose must state that specific fact somewhere, not just imply it exists in general. When drafting the diagram surfaces a mechanism the prose only gestured at, that is real signal that the prose is underspecified: add the missing sentence to the prose before embedding the diagram, don't leave the diagram as the only place the fact is stated.

## Failure mode this avoids

Without this checklist, diagram enrichment either never happens (specs stay text-only even when a flow genuinely needs a picture) or happens indiscriminately (every spec gets a diagram whether or not it earns its place). Running the checklist explicitly, and gating on it before writing the doc, keeps enrichment proportional to what the design actually needs.
