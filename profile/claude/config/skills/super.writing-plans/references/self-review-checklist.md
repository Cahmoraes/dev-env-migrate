# Self-Review Checklist

After writing the complete plan, look at the spec with fresh eyes and run through each step below. This is a checklist you run yourself — fix issues inline as you find them.

---

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. PRD traceability (if PRD exists):** Verify every functional requirement (FR-XXX) from the PRD maps to at least one task. List any orphaned requirements. Verify that no task implements something listed in "Fora de Escopo."

**3. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section: "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", "write tests for the above" (without actual test code), "similar to Task N", steps that describe what to do without showing how (code blocks required for code steps), references to types/functions/methods not defined in any task.

**4. Type & shared-resource consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug. **Extend the same scrutiny to shared infrastructure declared in more than one task** — a queue, table, topic, or cache that Task A declares with `{ durable: true }` and Task B re-declares with `{ durable: false }` is not a naming nit, it is a runtime break (RabbitMQ drops the channel with `PRECONDITION_FAILED`; an ORM diverges on `unique`/`nullable`). The sequential writer loses sight of the first declaration by the time it writes the second — the author-blind class the spec↔tasks review lens exists to catch. `validate-tasks.cjs` flags divergent boolean flags on the same resource as a **warning** (`sharedResourceConsistency.conflicts`); treat any such warning as a real bug — unify the declaration or split into genuinely distinct resources — even though it does not, by itself, fail the validation.

**4b. Standard skill compliance filled (not under-filled), and free of `super.*` skills:** Open each task's `### Conformidade com as Skills Padrão` subsection. Confirm it lists **every available domain skill whose scope overlaps that task**, discovered from the repo's configured skill locations — not from memory (frontend, backend, refactoring, typing, validation, state, security, API clients…). A task with a single skill (or none) is a red flag: re-check for the domains it touches. **Also confirm no `super.*`-prefixed skill is listed** — those are pipeline gates the flow already runs per task (`super.verification-before-completion`, `super.test-driven-development`, etc.); listing one duplicates the gate and wastes tokens. If you find one, remove it.

**4c. Task→spec decision traceability:** Coverage in step 1 runs spec→task (every spec requirement has a task). Now run it the *other* way: for every architecturally significant constant or flag a task introduces — a QoS like `prefetch(10)`, a timeout, a durability/retention flag, a batch size — can you point to the spec decision that authorized it? A task that invents `prefetch(10)` when the spec never decided on backpressure has quietly made an architectural decision the design doc should own. Either lift the decision into the spec (so it is reviewed and traceable) or drop it from the task. This mirrors PRD→task FR traceability, but for design decisions the plan must not originate on its own.

**4d. Spec decision honored — no silent reopening:** Steps 1/4c check that a task *exists* and its constants *trace to a decision*. This step checks *fidelity*: for every decision the spec already **closed** — a mechanism, a flag value, a data shape, a shared helper — does the task **enact** it, or quietly reopen it by doing the *how* in a way that contradicts the *what*? Nothing looks missing, yet the design breaks. Three shapes, all passing steps 1/4c:
- **Divergent mechanism:** spec formats timestamps via the shared `formatInTimeZone`; a task reimplements them inline with `getUTC*` — the two paths can disagree.
- **Dropped-to-default flag:** spec fixes an infra flag (`durable: true`, `unique: true`); a task re-declares the resource **bare** (`assertQueue(q)`, no options), so the driver default overrides the decided value. `validate-tasks.cjs` flags this as a `sharedResourceConsistency` warning (alongside literal `true`↔`false` divergence); treat it as a real bug.
- **Under-hydrated shape:** spec says an entity carries its relations (account, category); a task `innerJoin`s without selecting, or drops the join, so the promised field arrives `undefined` at runtime.

These are the implementation-level reopenings the spec↔tasks review lens catches reading task-against-spec — closing them here makes that review **confirm** the plan, not **correct** it. For each closed spec decision, name the task that enacts it and confirm the *how* matches the *what*.

**5. Task tracking artifacts:** Most of this is now checked deterministically by `validate-tasks.cjs` (see SKILL.md, "Self-Review" section) — it verifies task-file existence, the required `**Status:**`/`**PRD:**`/`**Spec:**`/`**Depends on:**` headers, and index↔file FR-XXX traceability. Run the validator and fix every reported `error`. Then confirm by eye only what the script cannot judge:
- `tasks-<feature-name>.md` lists every task with the same count and **meaningful titles** (the script checks shape, not semantics)
- All checkboxes are `[ ]` (none pre-checked)
- Relative paths in `**PRD:**`/`**Spec:**` actually resolve to the real artifacts (the script checks the header is present, not that the path is correct)

**6. Visual coverage (if mockups exist):** If `find-feature-files.cjs` reported `mockups.found` (a curated artifact lives under `specs/mockups/`), confirm at least one UI task carries a `### Fidelidade Visual` subsection referencing it. This is checked deterministically when you pass `--mockups` to `validate-tasks.cjs` (see SKILL.md, "Self-Review" section) — run it and fix any reported `error`. A curated mockup with no task referencing it means the decided layout will be re-derived from scratch, the exact waste the visual flow exists to prevent.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.
