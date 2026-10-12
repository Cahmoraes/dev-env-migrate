# Logical Components — the design's building blocks and the boundaries between them

Read at step 5, before naming any component. Sources: *Fundamentals of Software Architecture*, 2nd ed., ch. 8 (identifying components); *A Philosophy of Software Design*, 2nd ed., ch. 4-5, 9-10 (depth, information hiding); *Balancing Coupling in Software Design*, ch. 7-10 (integration strength, distance, volatility).

## What a logical component is

A named piece of business functionality holding one body of knowledge — "admissão do pedido", "notificação ao cliente" — that lives in a module, namespace or directory. Design the logical view (components, their interactions, the actors) before the physical one (modules, services, databases). Inside an existing codebase the physical structure is a fact: place each component in an existing module, or say why it needs a new one.

## Find candidates (FoSA ch. 8)

Candidates are a best guess — empty buckets that the checks below reshape.

- **Workflow** — walk the main happy path; each major step is a candidate. Fits one clear flow.
- **Actor/Action** — list the actors, always including **the system itself** (scheduled jobs, expiry, reprocessing), and their main actions; group the actions. The general-purpose default.

Then iterate: assign each requirement to a component, check each one, restructure, repeat. The loop reruns whenever a requirement moves.

## Check each candidate

1. **Responsibility statement.** One sentence. An "e", "também" or a pile of commas flags a candidate that may do too much — a prompt to look, not a verdict; check 2 decides.
2. **Knowledge, not execution order** (Ousterhout ch. 5, 9). Merge candidates that need the same rule, format or data shape, even when they run at different steps; split only parts that share no knowledge and whose interfaces get simpler apart. One component per step (receber → validar → persistir → notificar) where every step knows the same format is *temporal decomposition*: the format leaks into all of them.
3. **Depth** (Ousterhout ch. 4). The interface — everything a caller must know, call order and error cases included — should be much smaller than what the component hides. A description that restates implementation steps marks a shallow component; fewer, deeper components beat many thin ones.
4. **Entity trap** (FoSA ch. 8). An entity name plus *Manager, Supervisor, Controller, Handler, Engine* or *Processor* ("Order Manager") becomes the dumping ground for everything about that entity. Name the capability. Exceptions: a pure CRUD feature follows the repo's existing CRUD pattern instead of component design; framework-mandated class names (a `*Service` provider, a `*Controller` route) are code artifacts, not logical components.
5. **Characteristics** (FoSA ch. 8). Two responsibilities needing different characteristics split even when cohesive — one scales with thousands of bidders, the other needs reliability for one auctioneer.

## Record each component

- **Responsabilidade** — the sentence that passed.
- **Interface** — the operations callers use and, for each, what a caller must know: inputs and constraints, result, side effects, and the errors that escape (only those the caller handles better than the component).
- **Oculta** — the decisions it owns that nobody else sees: formats, rules, retry or caching policy, the external system behind it. Empty or trivial means shallow — re-cut.
- **Local** — existing module or directory, or new and why.
- **Depende de / usado por.**

## Boundaries and coupling (Khononov)

Coupling is balanced, not minimized. For each boundary the design creates or changes — a call into another module, an event, shared data, an external system — name three things:

- **What knowledge crosses**, strongest first: **intrusive** (another part's internals: its private tables, private events); **functional** (rules or invariants both sides must honor: a required order, a shared transaction, a rule implemented twice); **model** (the provider's own domain model or schema); **contract** (a model built for the integration and versioned separately — a DTO, API or public event that is *not* a mirror of the internal model).
- **Distance**: same module · other module · other service · other team or vendor. Another team or company adds to it.
- **Volatility of the upstream**: core (the business keeps changing it) · supporting or generic (rarely changes) · frozen legacy.

**Balanced** when strong knowledge stays close, what crosses a distance is weak (a real contract), or the upstream rarely changes. **Unbalanced**: strong knowledge crossing a distance to a volatile upstream (one change becomes a coordinated change), or unrelated pieces packed into one volatile module. Fix by moving the functionality closer, narrowing what crosses to a real contract (an adapter that translates an external provider's model into ours), or accepting it with a revisit trigger.

Traps:

- **Async does not weaken coupling.** A queue carries whatever it carries — a mirrored model, an ordering requirement; it changes runtime availability only. Choose sync or async for availability and load, not to "decouple".
- **A shared database says nothing** until you ask what crosses it.
- **A rule implemented in two places** is the strongest coupling there is, even with no call between them — give it one owner.
- **Required order or a shared transaction** is functional coupling: first hide it in one component or one operation; document only what remains.
- **Law of Demeter** (FoSA ch. 8): a component that knows too much about others (decrement stock *and* the reorder policy *and* the price) has that knowledge moved to its owner. This redistributes coupling rather than removing it.

## In the spec

`## Componentes` with the fields above. When the design crosses a module, service or team boundary, or depends on something that changes often, the `## Fronteiras e Contratos` table (template in `design-spec-structure.md`). Name every split and the characteristic or knowledge that drove it.
