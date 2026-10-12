# Trade-off Analysis — proposing approaches and deciding

Read before step 4 (approaches), and whenever a root decision needs a recommendation. Sources: *Fundamentals of Software Architecture*, 2nd ed., ch. 1-2, 19, 21, 27; *A Philosophy of Software Design*, 2nd ed., ch. 11.

## The laws (FoSA 2nd ed.)

- **First:** everything in software architecture is a trade-off. *Corollary 1:* if you found something that isn't a trade-off, you haven't found the trade-off yet. *Corollary 2:* trade-off analysis is never done once.
- **Second:** why is more important than how — record the reason and what was given up.
- **Third:** most decisions aren't binary; they sit on a spectrum between extremes.

## How much analysis a decision deserves

A decision is **architectural** when it affects structure, a prioritized characteristic, dependencies, interfaces (contracts, versioning, deprecation) or construction techniques (ch. 21, after Nygard), and it leans that way when it is strategic (many people, long-lived), costly to change, and every option sacrifices something significant (ch. 2). Those get the full treatment below and a block in Decisões Arquiteturais. Anything else is a leaf: one line, a safe default, move on.

## The recurring roots, in order (ch. 19)

Each answer constrains the next; inside an existing codebase the first is usually settled by the code — state it as a fact.

1. **One set of characteristics, or several?** One deployable, a component split, or a separate deployable (`architecture-characteristics.md`, "One set, or several?").
2. **Where does the data live, and who owns it?** The source of truth, and how data reaches whoever else reads it.
3. **Synchronous or asynchronous?** Synchronous by default; asynchronous when a prioritized characteristic needs it (elasticity, isolating a slow or failing dependency, backpressure). Record what async costs: eventual consistency, ordering, duplicates, harder debugging.

## Approaches — design it twice

Step 4's 2-3 approaches are **radically different** in shape (Ousterhout ch. 11): where the boundary sits, who owns the rule or the data, what each part hides, sync or async. Three libraries for the same design, or three places for the same column, are one approach — that choice is a leaf inside it. When one design looks obvious, still sketch a second: its flaws sharpen the first, and the two may combine into a better third.

For each approach:

- its 2-4 key operations, judged first by how easy they are for the callers;
- what it gains and **what it costs** — security, operational complexity, coupling, consistency, team skill. Force out the favored option's negatives: the obvious winner usually looks obvious because only its benefits are visible;
- a downside that belongs to one library or version, labeled as such.

## Weigh in context (ch. 27)

Ask "depende de quê?": list the factors that decide (the top-3 characteristics, volatility, team skill, deadline), mark each option +/− per factor, then weigh them for this context. The typical failure is *out of context*: knowing every trade-off and weighting them generically. Your job is to surface the trade-offs the user missed; the weights are theirs. When options split on a characteristic, the recommendation states the weight it assumed — "Recomendo B: perde-se X, mas [característica priorizada] pesa mais aqui" — so the user can flip it.

## Deferring

A reversible leaf is decided at the *last responsible moment* — when the cost of deferring exceeds the risk. Choose the safe default now and name the trigger that reopens it. Deferring a root out of caution (*Covering Your Assets*) is not closure.

## Presenting

Lead with the recommendation and the cost it accepts. With three or more factors, tabulate `Vantagens | Desvantagens` per option.
