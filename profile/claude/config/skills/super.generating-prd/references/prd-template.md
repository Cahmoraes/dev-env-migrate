# PRD Template

Standard PRD structure. Reproduce these sections exactly (section names in Portuguese); the two marked
conditional are omitted when their condition does not hold.

**The spec is the source.** The PRD adds what the spec does not have: personas and user stories, the
functional requirements that trace them, product objectives. Everything the spec already states (scope,
exclusions, rules, numbers, characteristics, flows) is cited by section, never restated. A PRD that
re-explains the spec is a second copy the plan, the QA gate and the next reader must reconcile.

```markdown
# PRD: [Feature Name]

**Spec:** `../specs/<feature-name>-design.md`

## Visão Geral
[2-3 sentences in product terms: the problem, for whom, the outcome. Not the architecture.]

## Objetivos
[Up to 3 measurable product outcomes the spec does not already state. When the spec's
Visão Geral or Características Arquiteturais already say how success is observed, one line
citing them (`Os critérios de sucesso da spec valem (## Visão Geral).`).]

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
  has to guess — the same feature then comes back PASSED in one run and PARTIAL in another
- The marker is optional: omit it when every story in the feature is of the same kind, and
  the gate decides once, for the whole feature, from the files its tasks wrote. Write it on
  a feature that mixes the two kinds — there, no single decision is right for every story]

## Funcionalidades Principais
[Numbered functional requirements with the `FR-` prefix (FR-001, FR-002, ...), optionally grouped
under a `###` title per feature. No per-feature prose: what each requirement does is its own
sentence, and why and how are in the spec. When a spec AC/INV closes the requirement, the
sentence names the behavior in one clause and the ID carries the rule: numbers, edge cases
and the mechanism stay in the AC (`o sistema deve respeitar o limite de usos do cupom sob
concorrência (INV-01, AC-03)`, not the limit, the race and the lock again). The QA gate
receives the spec with the PRD.

Write each requirement on its own line and name the stories it serves, in parentheses right
after the ID, and end it with the spec's `AC-NN`/`INV-NN` that close it (when the spec has them).
That first parenthesis IS the US↔FR mapping: the QA gate needs it per story, one
requirement may serve several stories and one story several requirements, and without it
`generate-slugs.cjs` returns an empty `requirements` array and the mapping gets reconstructed
by reading intent — differently on different runs:]
- **FR-001** (US-01) — [o sistema deve ...] (AC-01)
- **FR-002** (US-01, US-02) — [o sistema deve ...] (AC-02, INV-01)

## Experiência do Usuário
[Conditional: only when a story is `**UI:** sim` (or the feature has a screen). User journey,
main interaction flows, accessibility requirements. With an Especificação Visual section in
the spec, link the curated mockup and add only what the journey needs beyond it. A feature
with no screen omits the section, never writes "não há tela".]

## Restrições Técnicas de Alto Nível
[Conditional: only constraints the spec does not hold — a compliance or contractual mandate,
a business deadline, data sensitivity rules from outside the design. The spec's
Características Arquiteturais are cited, never copied. Nothing to add: omit the section.]

## Fora de Escopo
[Only product exclusions the spec's Escopo does not already list, each with its reason.
When the spec covers them all, one line of prose: `As exclusões da spec valem (## Escopo).`
— no list, so the feature index reads the spec's list instead.]
```
