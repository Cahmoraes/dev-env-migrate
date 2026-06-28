# Trade-off Analysis — proposing and comparing approaches

Read this before proposing the 2-3 approaches. An approach presented only with its benefits is an incomplete analysis — the First Law of Software Architecture is *"everything in software architecture is a trade-off"*; if you haven't found the downsides, you haven't finished looking. The frameworks here come from *Fundamentals of Software Architecture* (Richards & Ford, 2nd ed.), chapters 2 and 19.

## Triage: how much analysis does each decision deserve?

Not every decision needs a full trade-off table. Place each decision on the architecture↔design spectrum using three criteria:

| Criterion | Toward architecture (full analysis) | Toward design (brief note) |
|---|---|---|
| **Strategic vs. tactical** | Long-term, affects many people/parts | Short-term, local, easily revisited |
| **Effort to change later** | Expensive to reverse (communication style, service boundaries, data model) | Cheap to reverse (component layout, naming) |
| **Significance of trade-offs** | Each option sacrifices something important | Options differ only in taste |

Decisions landing on the architecture side get the full treatment below. Decisions on the design side get one line in the spec and move on — over-analyzing trivial choices wastes the user's time as much as under-analyzing structural ones.

## The trade-off process

1. **Identify the competing options.** There are always at least two. A design with a single option presented is a red flag — find the alternative before presenting.
2. **Resist the obvious winner.** The option that looks obviously better usually looks that way because only its benefits are visible so far.
3. **Force out the negatives of the favored option.** What does it cost in security? In operational complexity? In coupling? In team skill required? (Classic example: pub/sub topics beat point-to-point queues on extensibility — until you notice anyone can wiretap a topic, contracts must be homogeneous, and queue-depth monitoring for autoscaling is gone.)
4. **Mark technology-specific trade-offs.** A downside that only applies to one broker/library/version should be labeled as such, not generalized.
5. **Summarize as a table** — `Vantagens | Desvantagens` per option (the format the spec's decision section expects).
6. **End with a prioritization question, not a universal answer.** The honest conclusion of a trade-off analysis is "depende" — followed by *which architecture characteristic the user prioritizes*. "A opção A favorece extensibilidade; a B favorece segurança. Qual pesa mais aqui?" The prioritized characteristics from the clarifying phase (see `architecture-characteristics.md`) are the tiebreaker.

## Recurring structural decisions

Two decisions appear in almost every non-trivial feature; both have a default:

- **Synchronous or asynchronous communication?** Default to synchronous — it is easier to design, debug, and reason about. Go async only when a prioritized characteristic demands it (elasticity, fault isolation, backpressure), and record what async costs (eventual consistency, harder debugging, ordering issues).
- **Together or separate?** (one module vs. several, one service vs. several) Driven by the characteristics question: parts needing *different* characteristics separate; parts sharing characteristics stay together. Separation justified only by "feels cleaner" adds coupling and operational cost without buying anything.

## Presenting the recommendation

Lead with your recommended option and why — but the "why" must reference the trade-off, not just the benefits: *"Recomendo a opção B: perde-se X, mas o requisito priorizado de [característica] pesa mais que X neste contexto."* The goal is the **least worst** combination of trade-offs for this user's priorities — not the "best" architecture in the abstract.
