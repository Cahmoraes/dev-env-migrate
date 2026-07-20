# Review lenses — the catalog

Up to five lenses, dispatched in parallel as read-only reviewers at the `capable` tier. Three are unconditional (1, 2, 4); two conditional — **Lens 3** runs only when tasks exist, **Lens 5** only when the feature declares corporate artifacts. Each lens is a distinct *angle of attack* on the same spec. They deliberately overlap at the edges (a mitigation citing the wrong mechanism can surface under Lens 1 or Lens 2) — the controller dedups at aggregation. Give each reviewer its lens's probes and let it read the spec, the companions, and the real codebase.

**Domain-agnostic by construction.** The five angles apply to *any* spec — a message-driven backend, a REST CRUD, a data migration, an auth flow, a pure UI change. The worked examples below lean on one domain each only to be concrete; they are **illustrations, not the scope**. Every probe names the *property family* it hunts, and messaging/AMQP is just one family among several (data & persistence, security & privacy, API & contract, concurrency & state, frontend/UX). A reviewer's job is to identify **which families this spec's domain actually touches** and probe those — never to force a messaging frame onto a spec that has none, and never to skip privacy or accessibility because the example happened to be about a broker.

A finding under any lens carries: **what · which section · why it matters · suggested fix · severity**. A lens that finds nothing returns **"clean on this lens"** — a real result. See `honest-reporting.md` for the severity calibration and the no-manufacturing rule; see **"Reprodutibilidade da revisão"** at the end for why each reviewer must walk its families explicitly (so a second review of the same spec converges instead of surfacing discrepant new points).

---

## Lens 1 — Coerência interna & completude

*Does the spec agree with itself, and is every decision it opens actually closed?*

Probes:
- **Every named decision is closed.** Walk the Decisões / ADR-lite section: each decision states its choice, the alternative rejected, and a trade-off. A decision that names a hard property in its rationale and then never resolves it is a **named-but-dropped fork** — the single most common real defect. Which hard properties matter depends on the spec's domain; identify the families it touches and hunt them:
  - **Distributed / async (message-driven only):** at-least-once vs exactly-once delivery, duplicate handling / idempotency, ordering, backpressure / flow control, dead-lettering, retry / reconnection behavior.
  - **Data & persistence:** transaction boundaries, migration reversibility, schema/back-compat, soft-delete cascade, uniqueness / nullability, index build vs write-locking on deploy, consistency model.
  - **Security & privacy (LGPD):** authn/authz boundary *per operation* (who may call this), PII exposure & minimization, consent / retention / right-to-erasure, secret handling, audit trail, input validation / output encoding, rate-limit / lockout.
  - **API & contract:** versioning & backward compatibility, pagination / filter / sort contract, error taxonomy, write idempotency.
  - **Concurrency & state:** race conditions, optimistic vs pessimistic locking, cache invalidation, request cancellation.
  - **Frontend / UX (user-facing change):** loading / error / empty states, accessibility (focus order, ARIA, contrast, keyboard), i18n coverage (no hard-coded strings; keys exist), responsive breakpoints, design-system token fidelity, optimistic-update rollback.
  - **Always:** failure / rollback semantics.
- **FR mechanism fidelity (when a PRD exists).** Audit the spec/PRD pair against the "FR mechanism fidelity" rule in `super.brainstorming/references/fr-corporate-fidelity.md` — check that the spec still delivers, or explicitly documents the deviation from, the mechanism each `FR-NNN` names. Severity Important; Critical if the abandoned mechanism was a stated reliability or security guarantee.
- **A mitigation must cover its own risk scenario.** In the Riscos matrix, read each risk *against* its mitigation. A mitigation that cites a mechanism which does not actually address the stated scenario is an internal inconsistency — e.g. a risk "broadcast lost during the AMQP-reconnect window" mitigated by "client catch-up via `Last-Event-ID`", when that catch-up is triggered by an *SSE* reconnect, not an *AMQP* one: the two failure layers were fused, and the window the risk names is left uncovered. (The same shape appears domain-wide: a "concurrent double-submit" risk mitigated by a client-side disabled button, when the gap is server-side.)
- **Sections do not contradict each other.** The flow narration, the component table, the decisions, and the risk matrix must tell one story. A decision that says X and a component table that implies not-X is a finding.
- **Data contracts are fully specified.** A payload / DTO / message / API response / form model named in the flow ("publishes a thin payload", "returns the user summary") must have its shape defined in the spec text, not left implicit in the tasks. An undefined shape is a Minor finding (it exists in a task) that becomes Important if the tasks disagree on it.
- **Characteristics have criteria.** Prioritized architectural characteristics (scalability, reliability, accessibility, latency, ...) should be measurable or at least falsifiable, not adjectives.

## Lens 2 — Spec ↔ realidade do código

*Do the things the spec names actually exist and behave as it says?*

This lens reads the **real codebase** the spec describes, not just the spec. It is what a self-contained document review cannot do.

Probes:
- **Named symbols exist.** Every method, class, file, endpoint, DB table, migration, env var — and, for a UI change, every component, hook, store selector, route, i18n key, or design-system token — the spec references must exist (or be explicitly marked "new"). The canonical defect: the spec's flow calls `SseManager.fanout()` but the real class only has `send(userId, data)` — a ghost method that will send the implementer to build something that should not exist. The same defect wears other clothes: a spec that wires `useUserQuery()` or a `t('profile.badge.title')` key that is not in the codebase. Resolve each named symbol with `grep`, anchored to the class/file name (not just the bare method) to avoid false positives — a same-named method in another module, a mention in a comment or a test decoy. If the platform's symbol-lookup tool (`LSP`, or Serena's `find_symbol`) is already loaded, one quick opportunistic attempt is fine, but don't spend extra calls chasing it — fall back to `grep` immediately if it doesn't resolve. Per-platform tool names: `super.using-superpowers/references/*-tools.md`.
- **Described current behavior is accurate.** When the spec says "today the adapter reconnects automatically", "the worker acks only after publish", or "the list is already paginated server-side", verify that against the source. A spec built on a wrong premise about current behavior mis-scopes the whole change.
- **Backward-compatibility claims hold.** "Generalize the adapter, existing `direct` exchanges unaffected" or "existing callers of `findUsers()` keep the old shape" — read the existing call sites and the defaults to confirm the claim is true, not aspirational.
- **The change surface is real.** If the spec says a file will be touched, it should be a file that exists and plausibly needs touching; if it says "no changes to X", confirm X is genuinely out of the change's path.

## Lens 3 — Spec ↔ tasks / plano *(run only when tasks exist)*

*Does the plan close the spec's forks, or contradict them — and do they cover each other?*

Reads `plans/tasks-<feature>.md` (index) **and every** `plans/task-NN.md`, against the spec and PRD.

Probes:
- **Task↔task consistency.** Two tasks that touch the same artifact must agree on it. The canonical message-driven Critical: task A declares exchange `X` with `durable: true` and task B declares the same `X` with `durable: false` — RabbitMQ closes the channel with `PRECONDITION_FAILED` at runtime. The shape is domain-general: task A migrates a column to `NOT NULL` while task B inserts rows without it; two tasks disagree on a route path, a DTO field name, or an i18n key. These only surface when you read the tasks *against each other*, which is why Lens 3 needs the individual task files.
- **Decision → task traceability.** Every decision the spec makes should be implemented by some task. A decision no task touches is either dead scope or a missing task.
- **Task → decision grounding.** A task that implements a behavior the spec never decided (a task adds `prefetch`/QoS, or a cache TTL, or a new authz check, the spec is silent on) reveals a **spec-level gap**: the plan quietly made an architectural decision the design doc should own. Flag it as a spec gap, not a task error.
- **FR coverage.** If a PRD exists, the union of tasks should cover every functional requirement; an orphan FR is a finding.
- **Spec/task drift.** A spec risk row that says "against a broker (or a fake broker)" while the task requires "a real integration test (no broker mock)" is a Minor drift — the task is stricter than the spec; align the spec so the implementer is not left guessing.
- **Embedded code blocks match real signatures.** A task's literal "code to write" example is not just an illustration — an implementer may copy it verbatim. Verify every constructor/function call shown against the real signature (arity, required parameters), the same grep-anchored technique Lens 2 uses for named symbols. A snippet that omits a mandatory parameter (a `Logger` the real constructor requires and the task's example does not pass) will not compile — Critical, because it breaks the task's own deliverable, not a peripheral concern.
- **Mocks actually intercept the dependency they target.** When a task's example test mocks a dependency resolved through a DI/IoC container binding (Inversify `@injectable`/`bind`, tsyringe, etc.) that is imported and wired at module load time, check whether the mock can actually run before the container resolves and instantiates the real binding. Eager container instantiation at import time is a known false-negative pattern: a `vi.mock()`/`jest.mock()` registered afterward does not retroactively swap an already-evaluated module instance — the test passes for the wrong reason, or fails outright depending on load order.
- **A task's own prose does not contradict its own code.** The intra-task version of Lens 1's "sections agree with each other": a task's explanatory note (e.g. "same directory as X") must match the path/code given a few lines below in the SAME file — check this within one task file, not only across task files.
- **Literal shell commands stay valid after the task's own earlier steps.** A command given verbatim in a task (`cd`, `mv`, `rm`) must be checked against the repository state produced by that task's OWN earlier steps, not just the state at task start — a step that deletes or moves a directory invalidates a later literal command still referencing the old path (`rm -rf src/foo/` followed by a later step's `cd src/foo/` fails with "no such file or directory"). Don't invent breakage that isn't there: some commands are robust to an earlier step by design — `git add -A <path-already-deleted-by-an-earlier-step>` still succeeds and correctly stages the deletion, so flagging that specific pattern is a manufactured finding, not a real defect.

## Lens 4 — Operabilidade, ciclo de vida & testabilidade

*Can this be shipped, run, and trusted in production — by an operator or by a user?*

Probes:
- **Rollout / rollback.** A change that removes an existing mechanism wholesale (drop Redis pub/sub entirely; swap the design-system version; run an irreversible migration) with no feature-flag, parallel-run, or documented reversal path is an operability gap — name it even if the team is fine with it, so the decision is explicit.
- **Lifecycle wiring.** New long-lived resources need their setup *and teardown* wired: a backend subscriber holding an AMQP connection needs `start`/`stop`/`disconnect` in bootstrap and graceful shutdown; a frontend component subscribing to a store, an interval, or an event listener needs cleanup on unmount. A resource whose teardown is never called leaks (connections, memory, duplicate handlers). (If it is pre-existing and out of scope, say so — do not gold-plate.)
- **Observability of new failure modes.** The change introduces new ways to fail (a reconnect window, a dropped broadcast, a silent 4xx, an unhandled promise rejection in the UI); is there logging / metric / error-boundary / telemetry coverage so an operator or the team can see them?
- **UX operability (user-facing change).** Does the design account for the slow-network and error paths a user hits — loading, empty, and error states; disabled/optimistic states; focus and keyboard reachability; i18n so no string ships hard-coded; responsive behavior at the declared breakpoints? These are the production reality of a UI change the way shutdown wiring is for a worker.
- **Test table maps to real methods and risky paths.** Cross the spec's test list against the real symbols (a test for `SseManager.fanout()` inherits the ghost-method defect) and against the risk matrix — the highest-score risk should have a test that actually exercises it (a real integration test for the `PRECONDITION_FAILED` risk, not a mock; an a11y/interaction test for the risky UI path, not just a render snapshot).
- **Edge cases named.** The risky paths the decisions imply (partial failure, a slow consumer, a restart mid-flight, a concurrent edit, a permission the user lacks) should each be either handled or explicitly ruled out.

## Lens 5 — Spec/PRD ↔ artefatos corporativos *(run only when corporate artifacts exist)*

*Does our converted spec/PRD stay faithful to the company's source-of-truth documents — and does it ever contradict them?*

Corporate artifacts (declared in `.superpowers/corporate-artifacts.yml`) are external documents — a ready PRD, a wiki export, an API schema, an ADR, loose notes, anything — that the company brought in and that `super.brainstorming` / `super.generating-prd` **converted** into our own spec/PRD templates. They have **no fixed format**, so this lens never parses their structure or their identifiers; it reads them as source material and judges the conversion **semantically**. And they carry **weight** — see the "Corporate artifact precedence" rule in `super.brainstorming/references/fr-corporate-fidelity.md`: on conflict they win, and a spec that silently diverges from one is a real defect, not a stylistic choice.

This lens reads each **local** corporate artifact directly (the dispatch passes their paths). A corporate artifact given as a **URL** cannot be fetched by a read-only reviewer — do not pretend to have read it: report it as *"not re-verified in this review"* and, instead, check that the spec/PRD's traceability restates it, so the gap is visible rather than hidden.

Probes:
- **Coverage — nothing silently dropped.** Every requirement, decision, constraint, success metric, or scope boundary the corporate artifact establishes *and that is in this feature's scope* must be reflected in the converted spec/PRD. A corporate requirement that made it into scope but appears nowhere in our artifacts is an **Important** finding (Critical if it is a hard constraint the design would violate by omission).
- **Fidelity — not distorted in conversion.** Apply the fidelity clause of "Corporate artifact precedence" in `super.brainstorming/references/fr-corporate-fidelity.md`: a restatement must not weaken, invert, or silently reinterpret the corporate decision.
- **Conflict — corporate wins, but never silently.** Apply the same rule's conflict clause: where the spec's decision *contradicts* a corporate artifact, flag it, align the spec to the corporate value, or — if the deviation is deliberate and justified — make the spec state it explicitly. Severity is Critical when building the spec as written would violate the corporate constraint, Important otherwise.
- **Traceability is present.** If the spec/PRD carries a "Rastreabilidade Corporativa" (or equivalent) section, confirm it actually maps our FR-/US- items back to the corporate source it came from. Its absence, when corporate artifacts exist, is a Minor-to-Important finding depending on how much rode on them.
- **Declared-but-missing source.** A `path:` entry in the yml that points to a file that does not exist means the review could not verify against it — say so plainly (Important): the conversion cannot be trusted against a source nobody can open.

Do **not** over-reach: this lens judges *fidelity of the conversion*, not the corporate document itself. If our spec faithfully carries the corporate intent, the lens is **clean** — say so.

**Unrelated artifact — a config problem, not a spec defect.** A declared corporate artifact can exist and still be the *wrong* document: it describes a **different, unrelated feature** (the `.superpowers/corporate-artifacts.yml` entry points at another feature's PRD). Do not fabricate a "fidelity conflict" between two documents about different features — there is no fidelity to check, and the spec is not at fault. This is an **out-of-scope observation**, not a finding: note that the config points at an unrelated artifact, that it has no relation to this spec, and that you disregard it (no severity). See `honest-reporting.md`, "Out-of-scope observations".

---

## Reprodutibilidade da revisão (idempotência)

A review is only trustworthy if running it twice on the *same unchanged spec* yields the *same findings*. When a second review surfaces new, severe points the first one missed, the first review's lenses failed to observe everything — and that means rework for the user. The cause is always the same: a reviewer that **free-associates** over a spec finds whatever it happens to notice this pass; a different pass notices different things.

The fix is structural: **each reviewer walks its lens's property families as a closed checklist, not as free association.** So every reviewer must, before writing findings, enumerate the families in scope for this spec and give each an explicit disposition:

- Which property families does this lens apply to *this* spec's domain? (List them — e.g. for a UI spec under Lens 1: data contracts, accessibility, i18n, loading/error/empty states; messaging families are N/A.)
- For each family in scope: a **finding** (with severity) **or** "checked, sound" **or** "N/A — not touched by this spec". No family in scope may be left with no disposition.
- Within a family that has findings, report **every** defect you find in it, not just the most severe. Pruning to a top few is precisely what makes a second review surface "new" points the first one silently dropped — the whole family's findings are the deliverable, ranked by severity, not a highlight reel.

Report this as a short **"Famílias verificadas"** line per lens (family → disposition) alongside the findings. Two consequences: a family marked N/A is an auditable claim (not a silent skip), and a re-review walks the identical family list and converges. A second review that reopens a family the first marked "checked, sound" must justify *why the spec changed the reading* — it cannot simply free-associate a new concern the first pass had no reason to raise. That convergence, not raw finding count, is the quality signal.

## How the reviewers combine

- A pure spec review (no tasks) runs Lenses 1, 2, 4; Lens 5 is skipped when no corporate artifacts are declared. Lenses 1 and 2 are the core; 4 covers operability/testing; 3 is the cross-artifact consistency layer catching the runtime-breaking `durable`-style contradictions; 5 is the fidelity layer keeping the converted spec honest to the company's source-of-truth documents.
- The controller merges and dedups: the same underlying defect seen from two lenses is one finding, reported once, at the higher of the two severities.
