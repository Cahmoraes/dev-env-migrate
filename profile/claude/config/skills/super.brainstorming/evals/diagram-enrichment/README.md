# Diagram Enrichment — comprehension eval

Tests whether adding a Mermaid diagram alongside the prose in a design spec (vs. the same prose alone) improves an LLM reader's ability to reconstruct the described system from a single read. Methodology follows the skill-creator blind A/B pattern used in `super.reviewing-specs/evals/`.

## Setup

- `files/spec-with-diagram.md` and `files/spec-without-diagram.md` — same fictional design spec (webhook delivery retry, a 6-state machine with 3 terminal states, exponential backoff, and 3-source cancellation), with identical "Arquitetura / Fluxo" prose describing the same facts in both. The diagram variant additionally embeds the raw `stateDiagram-v2` Mermaid source (validated via `super.design-doc-mermaid --no-image`, no PNG produced) as a **complement** placed after the prose, per the rule in `references/diagram-enrichment.md`: the diagram never replaces the written description. `spec-with-diagram.md` is therefore a strict superset of `spec-without-diagram.md` in this section, not an alternative encoding of the same information.
- `evals.json` — the single eval definition (`id: 1`) with the reconstruction prompt and a 6-item expectations checklist.
- Two subagents per trial, each reading only one variant of the spec, blind to the experiment (no knowledge the other variant exists), asked to reconstruct the state machine from memory after a single read.
- A blind comparator subagent (skill-creator `comparator` pattern) receives both outputs unlabeled as "Candidate A" / "Candidate B", grades each against the expectations checklist, and picks a winner or declares a tie — with no knowledge of which candidate came from which spec variant.

**Correction note:** the first version of `spec-with-diagram.md` had the diagram *replace* the prose transition-by-transition description (a fair-but-different-encoding comparison) and included a sentence narrating the diagram's own generation process ("gerado por subagente em background... validado com mmdc"). Both were fixture bugs that misrepresented the skill's actual intended output — caught in review, not by the eval itself. Fixing them also surfaced that `references/diagram-enrichment.md` never explicitly said "complement, don't replace" or forbade process-narration sentences in the spec body; both rules were added to the reference (and locked with 2 new tests in `diagram-enrichment-contract.test.cjs`) before the fixture was corrected and the affected trials re-run. The results below reflect the corrected fixture.

## Results

Two trials were run, varying the reader's model tier — motivated by a prior finding in this repo (`super.reviewing-specs` evals) that capable models tend to saturate comprehension of well-written prose, hiding any diagram benefit ("self-play ceiling"); a cheaper/weaker reader was the more likely place to find a real effect.

| Trial | Reader model | With-diagram result | Without-diagram result | Verdict |
|---|---|---|---|---|
| 1 | sonnet | 6/6 expectations passed | 6/6 expectations passed | **TIE** (blind comparator, see `sample-runs/comparator-sonnet.json`) |
| 2 | haiku | 6/6 expectations passed | 6/6 expectations passed | **TIE** (both outputs correct and complete, no hallucinations — verified by direct expectations check, no comparator dispatch needed since neither answer contains an error to weigh) |

Raw outputs: `sample-runs/sonnet-with-diagram.md`, `sample-runs/sonnet-without-diagram.md`, `sample-runs/haiku-with-diagram.md`, `sample-runs/haiku-without-diagram.md`.

## Honest interpretation

**This eval did not find a measurable comprehension advantage for adding a Mermaid diagram alongside the prose, at either model tier, for this spec.** Both the sonnet and haiku readers reconstructed all 6 states, all 3 terminal states, the 5-attempt retry cap, the 3-source cancellation, and the retry loop correctly and completely — with zero hallucinations — whether the spec they read had the diagram in addition to the prose or the prose alone. This held even for the fact predicted to be hardest to get right (cancellation reachable from all three non-terminal states, not just one).

This is consistent with, not contradictory to, the prior finding logged in this repo's `super.reviewing-specs` eval history: well-written prose already saturates comprehension for capable LLM readers on artifacts of this size and complexity (a 6-state machine is well within a single careful read). We did not manufacture a diagram win where the data didn't show one.

**What this eval does not test, and where diagram value more plausibly lies:**
- **Human readers**, not LLM readers — a state diagram is scanned visually in parallel; prose is read serially. This eval only measures LLM single-pass recall, which does not have that bottleneck.
- **Authoring-time error catching** — generating the diagram forces explicit enumeration of every state and transition and validates syntax via `mmdc`; a prose description can be internally inconsistent (e.g. an unreachable state) without any mechanical check catching it. The diagram-generation step itself is a correctness gate on the spec author, independent of the reader.
- **Larger or more tangled state machines** — this spec had 6 states and 9 transitions, comfortably inside a single read for any model tier tested. Prose combinatorics may degrade faster than diagram legibility as state count grows; this eval does not probe that boundary.
- **Skimming under time pressure** — a real reviewer often does not do a careful single full read; this eval's "read once, answer from memory" protocol does not simulate skimming.

**Recommendation:** keep Diagram Enrichment in the brainstorming pipeline, but justify it on authoring-time correctness and human-reader legibility grounds (both plausible and consistent with the design-doc-mermaid skill's own rationale), not on LLM single-read recall accuracy — this eval found no effect there and asserting one would misrepresent the data.
