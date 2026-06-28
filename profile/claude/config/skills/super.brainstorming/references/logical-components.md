# Logical Components — deriving validating component boundaries

Read when moving from clarifying questions to design proposal — before naming any component. Intuition-listed components hit the Entity Trap (below); boundaries collapse during implementation. Frameworks from *Fundamentals of Software Architecture* (Richards & Ford, 2nd ed.), ch. 3 and 8.

## What logical component

A slice of business functionality — "validar pedido", "processar pagamento", "notificar cliente" — materialized as a namespace/directory. Logical architecture answers *where functionality lives, how parts interact*; ignores physical artifacts (databases, frameworks, deployment). Design logical components first; map onto physical structure (bounded contexts, modules, services) second.

## derivation cycle

Iterative, not one-shot listing:

1. **Identify initial core components** — best guess; empty buckets named by responsibility.
2. **Assign requirements/user stories** to each bucket — gives concrete roles.
3. **Analyze roles responsibilities** — apply the responsibility-statement test (below), check cohesion.
4. **Analyze architecture characteristics** — differing needs (one part faces traffic spikes, another doesn't) split components cohesion alone would keep together.
5. **Restructure** — split or merge, return to step 2. Expect to loop as design evolves.

## Two decomposition approaches

**Workflow approach** — walk main happy-path flows; each step a *candidate* component (not all become one). Use when feature has a clear flow. Example: navegar catálogo → Item Browser; fazer pedido → Order Placement; pagar → Order Payment; e-mail → Customer Notification (reused across steps).

**Actor/Action approach** — list actors (always including **the system itself** as an actor: billing jobs, stock replenishment) and each actor's main actions; group actions into components. Use when multiple actors interact with the feature. The general-purpose default; typically yields finer-grained components.

## Validation tests proposed component

**Responsibility statement test.** One sentence for the responsibility. If it needs *"e", "também", "além disso"* or piles up commas, it does too much — split. ("Order Placement valida o pedido, exibe o carrinho, **e também** aplica o pagamento, **e** ajusta o estoque, **e** envia e-mail" → four components.)

**Entity Trap check.** Components named after entities with generic suffixes — *Manager, Handler, Controller, Processor, Engine, Supervisor, Service* — are dumping grounds in the making. "Order Manager" attracts all order behavior; "Validate Order" stays focused. Name by action/responsibility, not entity. Two exceptions: a CRUD-only feature needs existing CRUD patterns in the codebase, not component design; framework-mandated class names like NestJS providers (`UserService`) are code artifacts, not logical components — the rule applies to design names, not framework-dictated classes.

**Characteristics check.** Two responsibilities in one component needing different architecture characteristics (one needs scale, other doesn't; one needs audit, other doesn't) → split even when functionally cohesive.

## Coupling analysis

Per component, before finalizing design:

- **Efferent coupling (fan-out)** — how many components does it depend on? High = fragile to external change.
- **Afferent coupling (fan-in)** — how many depend on it? High = changing it breaks things; should be the most stable/abstract part.
- **Temporal coupling** — invoked before/after another component? Document the required order explicitly; invisible in code, causes worst integration bugs.
- **Law of Demeter** — does the component *know* things it shouldn't? A component that knows it must decrement inventory, reorder stock, AND email the customer holds too much knowledge; move each concern to the component that owns it. This redistributes coupling rather than eliminating it — put knowledge where it belongs, don't minimize a number.

Keep strong coupling local: tightly coupled pieces belong in the same module/bounded context; coupling crossing boundaries must be the weakest kind (names, published contracts, not shared algorithms or mutable state).

## What goes in spec

Per component: name (action-oriented), one-sentence responsibility (the statement that passed test), depends on, depended on by. When parts have different characteristic needs, state the split and which characteristic drove it. Existing spec sections for directory structure, data flow follow — they don't replace it.
