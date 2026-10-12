# Architecture Characteristics — what the design must withstand

Read when the quality-attribute lens opens (`grilling.md`): the request or the research names a volume, a deadline, money, an external dependency, personal data or a contract others consume. Output: the `## Características Arquiteturais` section. Source: *Fundamentals of Software Architecture*, 2nd ed. (Richards & Ford), ch. 4-7 and 25.

## What counts

A requirement is an architecture characteristic only when it meets all three criteria (ch. 4):

1. **Nondomain** — how to build it and why, not what it does. Performance rarely appears in a user story, yet shapes the design.
2. **Structural** — it needs structural support beyond careful coding. Security can usually be designed into any structure; scalability, past a point, forces one.
3. **Critical** — every characteristic supported adds complexity, so support the fewest that success needs.

"Simplicidade", "consistência visual" or "segue o AGENTS.md" are not characteristics: the first is a constraint, the second a UI requirement, the third conformance the plan already enforces. Maintainability belongs in the list only when a concrete change is expected (a second carrier, a new region) and the criterion names it.

**Implicit** characteristics rarely appear in requirements yet underpin almost everything: availability, reliability, security. Domain knowledge adds others (money or health data → data integrity; trading → latency). **Explicit** ones hide in domain language: "milhões de usuários" is scalability though nobody said the word.

## Where they come from

Three sources (ch. 5): domain concerns, requirements, implicit domain knowledge. Translate the stakeholder's language:

| Domain concern | Characteristics |
|---|---|
| Fusões e aquisições / integração com outros sistemas | Interoperability, scalability, adaptability, extensibility |
| Time to market | Agility, testability, deployability |
| Satisfação do usuário | Performance, availability, fault tolerance, testability, deployability, agility, security |
| Vantagem competitiva | Agility, testability, deployability, scalability, availability, fault tolerance |
| Prazo e orçamento | Simplicity, feasibility |

Decode buzzwords the same way (ch. 25) — "pra ontem" is time to market, "rápido" performance, "sem downtime" availability — then ask for the number. Turn "nines" into downtime the user can judge: 99,9% ≈ 8,8 h/ano; 99,99% ≈ 53 min/ano.

**Composite characteristics** have no single measure and decompose: agility = deployability + modularity + testability. A common failure is fixing on one part. "O cálculo precisa terminar até as 18h por regulação" is performance, and also availability (fast is useless when down), scalability (more data next year), reliability, recoverability (a crash at 85% restarts from where?) and auditability (are the numbers right?).

## Questions that surface them

Ask the ones the topic makes relevant, inside a grilling round, each with your recommendation:

- "Quantos usuários/requisições, e o tráfego é constante ou tem picos (virada de prazo, promoção)?" — steady growth is scalability; bursts are elasticity.
- "Se isto ficar fora do ar por 1 hora, o que acontece? E por 1 minuto?" — the availability the feature really needs.
- "Se o sistema externo cair ou ficar lento, a feature falha ou degrada? Degradar para quê?" — reliability and fault tolerance, and the fallback.
- "Há dado pessoal, de pagamento ou exigência legal (LGPD)?" — security, privacy, legal, auditability.
- "O número/resultado precisa ser reproduzível ou auditado depois?" — data integrity, auditability.
- "Que mudança já é esperada (outro fornecedor, outra região, 10× volume)?" — extensibility or scalability, with the change named.

## Catalog — for scanning, never a menu

Offered the catalog, stakeholders answer "all of them" (ch. 5). Use it to spot candidates the request implies. The book's grouping (2nd ed., partial by design):

- **Operational:** availability, continuity (disaster recovery), performance, recoverability, reliability/safety, robustness, scalability, elasticity.
- **Structural:** configurability, extensibility, installability, reuse, localization, maintainability, portability, upgradeability.
- **Cloud:** on-demand scalability, on-demand elasticity, zone-based availability, region-based privacy (data residency).
- **Cross-cutting:** accessibility, archivability, authentication, authorization, legal (LGPD), privacy, security, supportability (logs, diagnostics), usability.

Pairs to keep apart: scalability (steady growth) vs elasticity (bursts); availability (is it up?) vs reliability (is it right while up?); interoperability (contracts with specific systems) vs compatibility (standards).

## Prioritize — top 3

1. Collect up to ~7 candidates from the three sources.
2. **Divide and conquer first** (ch. 25): "a feature inteira precisa disso, ou só a parte X?" A demanding characteristic usually belongs to one path (checkout, not the admin screen) — the cheapest guard against over-engineering.
3. Put your **recommended top 3, in any order**, to the user, each with the domain concern it traces to. Full ranking is wasted effort; a design that supports everything supports nothing well (the *Vasa* sank trying to be troop transport and gunship).
4. A list that resists trimming → "Se tivesse que eliminar uma, qual seria?"
5. The rest inform the design and stay out of the spec: they don't drive structure.

## Make each one verifiable

A prioritized characteristic with no measure is an opinion (ch. 6). Each gets a criterion the plan can turn into a test or a check:

- **Performance pairs with a load and a percentile:** "p95 < 300 ms com 200 req/s". An average alone hides the 1% that take ten times longer; a number without the scale it holds at is not a requirement.
- **Availability and fault tolerance as behavior under a named failure:** "timeout do gerador de PDF nunca falha a conclusão do curso; o certificado sai em até 10 min após o gerador voltar".
- **Structural ones as a check:** an architecture rule, a dependency constraint, a test (a *fitness function*: any mechanism that objectively assesses a characteristic).

Overspecifying is as damaging as underspecifying (ch. 5): state what success needs, not the most the system could promise.

## One set, or several? (scope, ch. 7-8)

Does the whole feature need one set of characteristics?

- **One set** — the usual answer inside an existing codebase: the feature fits the current deployable unit.
- **Different sets inside the feature** (a public path needing elasticity, a back-office part needing auditability) → split **logical components** in the same deployable; the spec names the split and the characteristic that drove it.
- **A set the current deployable cannot meet** (independent scaling, isolation from a failure domain) → a separate deployable with its own data. That is a root decision with its own block in Decisões Arquiteturais. Synchronous calls between parts with different operational characteristics fuse them: under a burst the slower part throttles the faster.

## In the spec

`## Características Arquiteturais` (template in `design-spec-structure.md`): the top 3, each with its domain concern and measurable criterion and the scope when it applies to one part only.
