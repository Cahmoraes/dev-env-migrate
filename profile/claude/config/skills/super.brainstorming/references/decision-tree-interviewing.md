# Decision-Tree Interviewing — resolving decisions in dependency order

Read this when clarifying-questions faces **many interdependent open decisions** — migrations, greenfield, rippling brownfield changes. "One question at a time" sets the *cadence*; this sets the *order*. Wrong order causes rework: decide a leaf, then a root decision invalidates it.

## When this applies (complexity gate)

Run the full traversal only when the decision space is genuinely branched. Match the topic first; don't grill by reflex.

| Project shape | Posture |
|---|---|
| Trivial / single reversible decision (config tweak, one utility) | **Skip.** A flat one-or-two-question pass suffices — a tree here is over-interrogation, the mirror of the "too simple to need a design" anti-pattern. |
| Feature inside an existing codebase | **Light.** Usually one set of characteristics; a short tree (2-4 roots) suffices. |
| Greenfield / from zero | **Full.** Nothing is fixed yet — almost every decision is a root that constrains the rest. |
| Migration (legacy → new) | **Full.** Strangler vs. big-bang, data-migration strategy, and compatibility boundary are roots reshaping everything downstream. |
| Brownfield change with cross-cutting ripple | **Full.** The blast radius *is* the tree — map it before touching leaves. |

YAGNI still governs: stop when every remaining open decision is a **leaf** (reversible, local, doesn't reshape structure). Exhaustiveness is a means, not the goal.

## What the decision tree is

- **Nodes** = open decisions the design can't be written without ("monolith or service?", "which auth model?").
- **Edges** = *dependency*: A is a parent of B when answering A constrains, unlocks, or eliminates B (e.g. "big-bang migration" eliminates "dual-write window").
- **Roots** = decisions no other open decision depends on. Start here — they prune the largest subtrees.
- **Leaves** = decisions nothing else depends on. Cheap, often reversible, deferrable to implementation.

The prioritized **architecture characteristics** (`architecture-characteristics.md`) are usually *root nodes* — the tiebreaker for the deepest forks. Elicit them first; they seed the tree.

## How to run it

1. **Enumerate** the open decisions — brain-dump nodes, don't order yet. Research findings (the parallel-subagent step) often pre-answer several; cross those off first.
2. **Draw edges** — for each pair, ask "does deciding X change the options for Y?". Mark the direction.
3. **Find the roots** — nodes with no incoming edge. Order them by how much of the tree they prune.
4. **Traverse root → leaf, one question per message.** Each answer reshapes the tree: prune eliminated branches, surface newly-relevant children. Re-read after every answer — one root answer can delete five downstream questions.
5. **Carry a recommended answer on every node** — state your pick and reason (tie it to a prioritized characteristic or research finding, not just a benefit).
6. **Resolve by exploration when you can.** If a node is answerable from the codebase, conventions, or research, resolve it there, not via a question — same discipline as `<RESEARCH-GATE>`. Spend questions only on decisions that need the user's intent.
7. **Stop** when every open node is a leaf. Resolve each remaining leaf with its safe reversible default plus a revisit trigger (see the close-out invariant below) rather than forcing a premature hard commitment — but do not leave it open.

## Worked example — legacy React migration (brownfield)

Open decisions, after edges are drawn:

```
[root] Migration strategy: strangler-fig vs. big-bang
   ├─ (strangler) Compatibility boundary: where do old/new coexist?
   │     └─ Shared state across the boundary: duplicate or bridge?
   │           └─ [leaf] State lib on the new side: Zustand vs. Context
   └─ (big-bang) Cutover plan: feature-freeze window length
[root] Routing ownership during coexistence: old router, new router, or shell
[root] Build integration: Module Federation vs. single bundle
```

Resolving the root (`strangler-fig`) **deletes the entire `big-bang` subtree** — one question prunes five. Open with the "Zustand vs. Context" leaf instead, and the strangler answer could make it moot. Root-first ordering buys that.

## Relentless, but bounded

Grill-me posture (interview until shared understanding; don't stop at the first plausible answer) applies **within a node**: push on vague or contradictory answers before descending. It does **not** mean adding nodes a simple project lacks — relentlessness is depth-per-node, gated by the complexity table, never an excuse to over-interrogate a leaf-only project.

## Interviewing as a research-grounded specialist

The parallel-subagent research step (checklist item 1) already gathered domain findings — codebase conventions, library/API behavior, current best practices. Conduct the interview as a **senior architect whose expertise is grounded in those findings**, not as roleplay and not from fabricated authority. The difference between a generalist's clarifying questions and a specialist's is *which* questions get asked: a specialist spends questions on the edge cases, failure modes, and unknown-unknowns the user hasn't surfaced — the reasonable-sounding first answer a domain expert would immediately probe.

- **Speak from what the research covered; where it is silent, ask rather than assert.** A specialist who invents domain facts is worse than a generalist who admits the gap and asks. If a fork depends on a fact the research didn't reach, that gap is itself a question for the user — surface it, don't paper over it.
- **Mine the findings for hidden forks.** Before asking, scan the research for decisions the user's phrasing assumes away ("just store it in the DB" hides isolation-level, migration, and concurrency forks). Raising a fork the user never considered is the specialist's highest-value move — it is exactly the `too-simple-to-need-design` trap turned inside out.
- **Push on failure modes and edge cases per node.** For each open decision, invent the concrete scenario that breaks the easy answer (the discipline domain-modeling calls "invent scenarios") and put it to the user before descending.
- **A hard property you name is a fork you now owe closure on — even if it surfaced as an aside.** The moment you, an option you are comparing, or a research finding you cite names a hard technical property — *at-least-once delivery, duplicate handling, ordering, retry, backpressure, dead-lettering, concurrency, cache invalidation, idempotency* — that property has become a live decision, whether or not you asked about it as its own question. Follow the implication one step and put the derived fork to the user: "the broker is **at-least-once**" ⟹ "the consumer must be **idempotent** — dedupe key, natural idempotency, or accept duplicates?". The subtle leak is a concern raised while justifying option A and then dropped when the user picks option B, or one mentioned in an option's rationale and never converted into a question — the decision it implied is still open, and the spec still owes its closure.
  - **Closing is not building — and silence is the only wrong answer.** A named property is closed by a *one-line decision*, and that decision is often **"not needed, because…"**: subsumed by another decision (duplicates are already idempotent at the client via the event ID), or ruled out by the design's own shape (no dead-letter queue for a best-effort broadcast whose recovery path is `Last-Event-ID` catch-up against the source of truth). Closure is *resolve, tolerate-explicitly, or rule-out-with-reason* (never over-building — see the Close-out invariant below). What the spec must not do is stay **silent**: a broker spec that never mentions duplicate-handling or dead-lettering forces the implementer to re-open both mid-task. So for a message-broker, cache, or concurrent-write feature, the reflex "what about duplicates / ordering / dead-lettering?" is a checklist the spec must *answer* — and the answer may well be a single line ruling it out.

### Close-out invariant — the spec closes every end

The interview is not done when you run out of questions; it is done when **every hard decision it surfaced is resolved in the spec**. A finished spec has no open questions — every end is closed, in one of three ways depending on the decision's nature:

- **Structural / build-blocking** → **resolve now**, recorded with its trade-off (Decisões Arquiteturais, Características — see `design-spec-structure.md`). Resolving **includes explicitly ruling it out with the reason**: "no DLQ — best-effort broadcast recovers via `Last-Event-ID` catch-up, not redelivery" is a resolution, not an omission. Leaving one of these open — *or silent* — is a spec defect; it is the decision the specialist exists to close. **Precedence:** if the *fact* needed to decide is itself blocked on external input (a POC, an outside team), this is mode 3 below — route it there. "Close now" is never a license to invent a structural answer you don't have the fact for, nor to bolt on a mechanism (a dedup store, a DLQ) that the design does not need — closing a concern by ruling it out is closure; over-building it is a YAGNI defect (see `super.reviewing-specs/references/honest-reporting.md`, "Over-building is a YAGNI defect").
- **Reversible leaf** → **resolve with the safe default plus a revisit trigger.** "Use Context now — reversible; revisit for Zustand if cross-tree state appears" *is* a decision, recorded in Decisões Arquiteturais with the trigger in the trade-off field. Do not force a premature commitment on a leaf, but do not leave it open either — pick the reversible default and name what would reopen it.
- **Blocked on external input** (a fact only a later POC or an outside team can supply) → record as a 🔴 risk naming the task or dependency that unblocks it. The decision lives downstream of that task, not free-floating in the spec.

"Ran out of questions" is not "closed." A hard decision left vague, or a leaf dumped into a bucket to dodge the trade-off, is the exact failure this guards against: the open discussion that leaks out of the spec. There is no "open questions" section to park work in — an open question is unfinished work, and the specialist's job is to finish it.

## Failure modes

- **Flat list.** Decisions in occurrence order, not dependency order — the rework default.
- **Leaf-first.** Early questions on reversible details while a root fork is still open.
- **Tree for a twig.** Full traversal on a trivial, reversible change.
- **Asking what you could explore.** A user question on what the codebase or research already answers.
- **Stale tree.** Not re-reading after an answer, so you ask questions it already eliminated.
- **Named-but-dropped.** A hard technical property (idempotency, ordering, dead-lettering, backpressure, concurrency) named while justifying an option, then left **silent** in the spec — neither resolved, tolerated-explicitly, nor ruled out. Silence forces the implementer to re-open it. The twin defect is **over-closing** — see the Close-out invariant above.

## How it feeds the rest of brainstorming

A *method inside* the clarifying-questions step (checklist item 3), not a replacement. Root decisions resolved here become **Decisões Arquiteturais (ADR-lite)** entries in the spec (`design-spec-structure.md`); reversible leaves are resolved with their safe default and a revisit trigger in the same section (not left open); the dependency rationale ("chose strangler, so dual-write was never on the table") is the trade-off context that section wants.
