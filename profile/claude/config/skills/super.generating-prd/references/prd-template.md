# PRD Template

Standard PRD structure. Reproduce these sections exactly (section names in Portuguese).

```markdown
---
created_at: "YYYY-MM-DDTHH:MM:SS±HH:MM"
updated_at: "YYYY-MM-DDTHH:MM:SS±HH:MM"
---

# PRD: [Feature Name]

## Visão Geral
[High-level summary: problem it solves, for whom, why it matters]

## Objetivos
[Specific, measurable goals — how success looks, key metrics]

## Histórias de Usuário
[Each user story starts with a `US-NN` ID prefix, then a
"Como [persona], eu quero [ação] para que [benefício]" sentence. Use this exact line
shape so generate-slugs.cjs can extract and trace each story:]
- **US-01** — Como [persona], eu quero [ação] para que [benefício] · **UI:** sim
- **US-02** — Como [persona], eu quero [ação] para que [benefício] · **UI:** não
[- Cover primary and secondary personas
- Include main flows and edge cases
- Keep IDs sequential and unique; the same US-NN is referenced by the QA gate
- Say whether the story is UI-facing. A story a user reaches through a screen carries a
  `**UI:** sim` marker; an API/CLI/background story carries `**UI:** não`. The QA gate boots
  the stack and captures screenshots only for the first kind, and when the PRD is silent it
  has to guess — the same feature then comes back PASSED in one run and PARTIAL in another]

## Funcionalidades Principais
[For each feature:
- What it does
- Why it matters
- How it works at a high level
- Numbered functional requirements with the `FR-` prefix (FR-001, FR-002, ...)

Write each requirement on its own line and name the stories it serves, in parentheses right
after the ID. That parenthesis IS the US↔FR mapping: the QA gate needs it per story, one
requirement may serve several stories and one story several requirements, and without it
`generate-slugs.cjs` returns an empty `requirements` array and the mapping gets reconstructed
by reading intent — differently on different runs:]
- **FR-001** (US-01) — [o sistema deve ...]
- **FR-002** (US-01, US-02) — [o sistema deve ...]

## Experiência do Usuário
[User journey, main interaction flows, UI/UX considerations, accessibility requirements.
If the spec has an Especificação Visual section, summarize its visual decisions here at
the WHAT/WHY level and link the curated mockup artifact — do not prescribe HOW to build it.]

## Restrições Técnicas de Alto Nível
[Only high-level constraints — no implementation design:
- Required integrations
- Compliance/security mandates
- Performance/scalability goals
- Data sensitivity considerations

If the design spec has a "Características Arquiteturais" section, carry its prioritized
characteristics (and their measurable criteria) into this section — they ARE the
high-level constraints, already validated with the user during brainstorming.]

## Fora de Escopo
[Explicitly excluded features, future considerations, boundaries]
```
