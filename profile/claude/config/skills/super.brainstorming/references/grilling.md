# Grilling — the architect's interview

Read at step 3, once the research is dispatched. The interview is a senior architect's grilling fitted to this pipeline: a tree of the decisions the spec needs, asked in rounds, every question with a recommendation, facts looked up instead of asked — until nothing the spec depends on is open or silently assumed. Sources: the "grilling" technique (design tree, frontier rounds); *Fundamentals of Software Architecture*, 2nd ed., ch. 5, 19, 25.

## The tree

- **Node** — a decision the spec cannot be written without ("onde vive o dado?", "síncrono ou assíncrono?", "o que o usuário vê se o fornecedor cair?").
- **Edge** — A is B's parent when answering A changes B's options ("big-bang" eliminates "janela de escrita dupla").
- **Frontier** — the open nodes whose parents are all settled: what can be asked now without guessing an answer not yet heard.
- **Leaf** — a node nothing depends on: reversible and local. It takes a safe default and a revisit trigger instead of a question, unless only the user's intent can decide it.
- **Root** — never defaulted silently: it is asked, or put in a round as a recommendation the user can flip. A structural choice seen first in the spec was made by the model, not the user.

Seed the tree from the request, the research reports and the lenses below. Roots usually come in the order of `tradeoff-analysis.md`, "The recurring roots": one set of characteristics or several → where the data lives and who owns it → sync or async. The prioritized characteristics break the ties of every fork beneath them.

## Facts are found, decisions are asked

- **A fact** — what the code does, what the repo's instructions require, what a library supports, who calls an endpoint inside this repo — comes from the research tracks. State it in the round with its source: "Fato (`src/billing/invoice.repository.ts`): a fatura e seus itens são gravados numa transação única." A fact you have not verified is an assumption: label it and ask. An unverified "a API já pagina por cursor", approved by the user, becomes the foundation of a wrong spec.
- **A decision** — intent, priority, business rule, acceptable trade-off — belongs to the user. So do the facts only they hold: volumes and growth, deadlines, SLAs, consumers outside this repo (other apps, old client versions), how a provider behaves in production, what went wrong last time. Ask those; nothing in the repo answers them.
- **Don't block on research.** The opening round asks only what no research can answer: the outcome, who it serves, how success is observed, what is out. A question that depends on a pending report waits for it; the rest go now.

## Rounds

Each round asks the whole frontier, **at most four questions**; with more, the ones that prune the most go first. Format, in the session language:

> **Q1 · <título curto>** — <a pergunta; opções fixas, cada uma com sua consequência em uma frase>
> → **Recomendo:** <resposta> — <por quê: o fato, a característica priorizada ou o risco que decide>

Close the round with one line: "Responda pelo número; o que ficar sem resposta segue a recomendação." When every question has fixed options and the harness has a selectable multiple-choice prompt, the round may go through it — the recommended option first and marked, a free-text escape kept.

A recommendation is earned: it names the fact, priority or risk behind it. Users accept most recommendations as given, so one without a reason is a guess the user cannot check, and a wrong one propagates into the spec.

After each answer, recompute: prune what the answer eliminated, add the children it opened, ask the next frontier. A question whose answer depends on another question of the same round belongs to the next round.

## Lenses — which questions a senior architect asks

A lens opens when the conversation **establishes** its trigger — the request, an answer, a research finding — never on vocabulary alone. An open lens adds its nodes to the tree; a lens that never opens costs nothing.

| Lens | Opens when | Nodes it adds | Spec section |
|---|---|---|---|
| **Propósito e escopo** | always | the outcome and who it serves; how success is observed; what is explicitly out; the deadline or constraint that binds | Visão Geral, Escopo |
| **Atributos de qualidade** | a volume, deadline, money, external dependency, personal data or a contract others consume | volume today and in a year, and when it peaks (a deadline, a campaign); characteristics derived from the domain concerns → a recommended top 3, each with a measurable criterion; the whole feature or one part (`architecture-characteristics.md`) | Características Arquiteturais |
| **Domínio e propriedade** | a new concept or rule, or a change touching two or more modules | which module owns the rule and the data (source of truth); core (changes often) or supporting; the business's own terms | Componentes |
| **Integração e acoplamento** | an external system, another module's data or events, a shared table | what knowledge crosses (contract, model, rules, internals); sync or async, chosen for availability; who owns the contract; what changes when the provider changes (`logical-components.md`) | Fronteiras e Contratos |
| **Dados e consistência** | state persisted or changed, money, concurrent users | the transaction boundary; concurrent writes; idempotency of whatever is retried or redelivered; how much existing data to migrate or backfill, and whether the system may stop meanwhile; which rules hold for every record and who guarantees each (application, lock, database), and how the database's guarantees are tested (the repo's test database, a new one, or checked by hand); the load the new reads or jobs put on the database others use; retention | Dados e Consistência |
| **Falhas** | any I/O, external call or user input | what fails and how it is detected; what the user sees; timeout and retry budget; degrade or fail; which errors can be defined away | Falhas e Erros |
| **Evolução e rollout** | a live contract, schema or behavior that others consume | who consumes it today; the compatibility window; expand/contract order; how to know in production that it works | Rollout e Compatibilidade |
| **Segurança e privacidade** | personal or payment data, an admin or destructive action, authentication | who may do it; what personal data flows where (LGPD); what must be auditable, and by whom | Características, Dados e Consistência |

Screens and layout belong to the visual companion (SKILL.md, Visual Companion).

## Depth — the tree decides

There is no size table: the tree's own frontier sets the depth. A feature inside an existing codebase usually needs the purpose round, one round for the lenses that opened, the approaches question and one round for the children the chosen approach opened. Greenfield work, a migration or a new deployable asks its roots first — migration strategy, compatibility boundary, one deployable or several — then every lens that opened. Stop when only reversible leaves remain, whatever the round count.

**A node no research answered.** When an open node needs an external fact the research tracks did not bring back (a provider's production behavior, a regulation, a domain the repo has never touched), offer `super.deep-research` inside that round: its own line, what it would settle and that it costs credits; skipped unless the user accepts. A node the user can answer, or a leaf with a safe default, never earns the offer.

Relentless within a node, bounded across the tree: push on a vague or contradictory answer before descending ("rápido quanto, com quantos usuários?"), but never add nodes a small change does not have.

## Where the approaches question sits

The approaches (step 4) are a root, asked once the nodes above them — the characteristics, the owner of the data — are settled, and opened by the understanding note. The chosen approach opens children: the failure behavior of its external calls, the idempotency of what it retries, the consistency of what it writes, the migration its schema change needs. Grill those before presenting the design.

## A named property is a node you owe

The moment you, an option or a research finding names a hard property — at-least-once delivery, retry, duplicates, ordering, concurrency, cache invalidation, backpressure, dead-lettering, idempotency, timezone, rounding — it is a node, asked or not. Follow the implication one step and put the derived fork to the user: "o broker entrega pelo menos uma vez" ⟹ "o consumidor precisa ser idempotente: chave natural, registro do evento processado, ou aceitar duplicata?". The subtle leak is a concern raised while justifying option A and dropped when the user picks B.

**Closing is not building.** A node closes one of three ways, and "not needed, because…" is a valid closure:

- **Structural** → resolved now with its trade-off in Decisões Arquiteturais, ruling it out with the reason included ("sem DLQ: o broadcast é best-effort e se recupera reconsultando a fonte"). A mechanism the design does not need is over-building — a defect, not diligence.
- **Reversible leaf** → the safe default plus the trigger that reopens it.
- **Blocked on external input** (a POC, another team) → a 🔴 risk naming the task that unblocks it.

The spec has no "open questions" section; running out of questions is not closing them.
