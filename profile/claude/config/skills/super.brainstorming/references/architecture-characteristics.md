# Architecture Characteristics — eliciting and prioritizing the "-ilities"

Read before formulating clarifying questions. Specs that skip this describe *what* the system does, not *what it must withstand* — scalability, availability, security then surface as rework. Source: *Fundamentals of Software Architecture* (Richards & Ford, 2nd ed.), ch. 4-7.

## What qualifies as an architecture characteristic

A requirement is an architecture characteristic only when it meets **all three** criteria:

1. **Non-domain design consideration** — describes *how/why* to build, not *what* the system does. ("Performance" never appears in user stories, yet shapes the whole design.)
2. **Influences structure** — demands structural support, not just careful code. Security can be designed in (hashing, encryption in a monolith); scalability cannot — eventually it forces a distributed structure.
3. **Critical to success** — each one added increases complexity. Support the fewest possible, not the most.

## Translating domain concerns into characteristics

Stakeholders speak business language; the design needs architecture language. Translate what you hear:

| Domain concern (what the user says) | Architecture characteristics (what the design needs) |
|---|---|
| Fusões e aquisições / integração com outros sistemas | Interoperability, scalability, adaptability, extensibility |
| Time to market / entregar rápido | Agility, testability, deployability |
| Satisfação do usuário | Performance, availability, fault tolerance, testability, deployability, agility, security |
| Vantagem competitiva | Agility, testability, deployability, scalability, availability, fault tolerance |
| Prazo e orçamento apertados | Simplicity, feasibility |

**Beware composite characteristics.** "Agility" has no direct measure — it decomposes into deployability + modularity + testability. Decompose any stated goal: "o cálculo precisa terminar até as 18h por regulação" → performance, plus availability (fast is useless if down), scalability (more data next year), recoverability (restart from 85%, not zero), auditability (results correct?). Fixating on the single obvious characteristic is the most common elicitation failure.

## Quick catalog

A checklist for scanning implicit characteristics — not a menu to offer the user (they answer "all of them").

- **Operational** (need the most structural support): availability, continuity/disaster recovery, performance, recoverability, reliability/safety, robustness, scalability, elasticity
- **Structural**: configurability, extensibility, installability, reuse, localization/i18n, maintainability, portability, upgradeability
- **Cross-cutting**: accessibility, archivability, authentication, authorization, legal/compliance (GDPR, LGPD), privacy, security, supportability, usability

Distinctions: *scalability* (grows steadily) ≠ *elasticity* (handles bursts — ticket sales, flash promotions). *Availability* (is it up?) ≠ *reliability* (behaves correctly while up?).

## Explicit vs. implicit characteristics

- **Explicit** come from requirements — often in disguised domain language. "Milhões de usuários" means scalability though nobody said the word.
- **Implicit** never appear in requirements but are necessary: availability, security, maintainability underpin almost every feature. Domain knowledge surfaces them — a payment feature implies data integrity; a registration deadline implies load spikes at the deadline, not spread evenly.

When trimming the list, cut explicit ones before implicit ones — the implicit ones usually sustain overall success.

## Prioritization — the top-3 rule

Never present the full catalog asking "which do you want?" — the answer is always "all", and a design supporting everything supports nothing well (the *Vasa* sank trying to be both troop transport and gunship).

1. Collect up to **7 candidate characteristics** from domain concerns + implicit analysis.
2. Ask the user for the **top 3, in any order** — full ranking is a fool's errand; top-3 builds consensus fast.
3. If the list resists trimming, invert: *"qual dessas é a MENOS importante? Se tivesse que eliminar uma, qual seria?"*
4. Record the remaining candidates as "consideradas, não priorizadas" — they inform the design but don't drive structure.

## Clarifying questions to weave in

Keep one-question-per-message. Pick questions relevant to the topic — never run through all mechanically:

- "Quantos usuários/requisições esperamos, e o tráfego é constante ou tem picos?" (constant growth → scalability; bursts → elasticity)
- "O que acontece se essa funcionalidade ficar fora do ar por 1 hora? E por 1 minuto?" (availability tier)
- "Há integrações com sistemas externos? Se um deles cair, a feature deve falhar ou degradar?" (reliability vs. unnecessary fragility)
- "Há dados sensíveis ou de pagamento envolvidos? Existe requisito legal/compliance (LGPD)?" (security, privacy, legal)
- "Existe expectativa de expansão — mais idiomas, mais regiões, mais clientes corporativos?" (i18n, scalability, interoperability)
- "Essa parte da feature precisa das mesmas garantias que o resto do sistema, ou exige mais (ou menos)?" (one quantum or several — see below)

## One set of characteristics or several?

The single most structural question: **does the whole feature need ONE set of characteristics, or do different parts need DIFFERENT sets?**

- One set → the feature fits the existing architecture style (usual answer for features inside an existing codebase).
- Different sets (e.g., a public-facing part needing scalability + availability vs. a back-office part needing auditability + security) → separate them into distinct components/services so each meets its own demands.

This decides component boundaries before any code structure is discussed.

## What goes in the spec

Record as a `## Características Arquiteturais` section (see `design-spec-structure.md`): the top 3 with one-line justification tracing to a domain concern, plus the "consideradas, não priorizadas" list. Each prioritized characteristic must be measurable — "performance" alone is not verifiable; "lista carrega em < 500ms com 10k registros" is.
