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
7. **Stop** when every open node is a leaf. Record deferred leaves as open questions in the spec rather than forcing them now.

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

## Failure modes

- **Flat list.** Decisions in occurrence order, not dependency order — the rework default.
- **Leaf-first.** Early questions on reversible details while a root fork is still open.
- **Tree for a twig.** Full traversal on a trivial, reversible change.
- **Asking what you could explore.** A user question on what the codebase or research already answers.
- **Stale tree.** Not re-reading after an answer, so you ask questions it already eliminated.

## How it feeds the rest of brainstorming

A *method inside* the clarifying-questions step (checklist item 3), not a replacement. Root decisions resolved here become **Decisões Arquiteturais (ADR-lite)** entries in the spec (`design-spec-structure.md`); deferred leaves become open questions; the dependency rationale ("chose strangler, so dual-write was never on the table") is the trade-off context that section wants.
