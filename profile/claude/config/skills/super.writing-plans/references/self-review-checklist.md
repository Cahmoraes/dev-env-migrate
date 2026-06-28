# Self-Review Checklist

After writing the complete plan, look at the spec with fresh eyes and run through each step below. This is a checklist you run yourself — fix issues inline as you find them.

---

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. PRD traceability (if PRD exists):** Verify every functional requirement (FR-XXX) from the PRD maps to at least one task. List any orphaned requirements. Verify that no task implements something listed in "Fora de Escopo."

**3. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section: "TBD", "TODO", "implement later", "fill in details", "add appropriate error handling", "write tests for the above" (without actual test code), "similar to Task N", steps that describe what to do without showing how (code blocks required for code steps), references to types/functions/methods not defined in any task.

**4. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4b. Standard skill compliance filled (not under-filled), and free of `super.*` skills:** Open each task's `### Conformidade com as Skills Padrão` subsection. Confirm it lists **every available domain skill whose scope overlaps that task**, discovered from the repo's configured skill locations — not from memory (frontend, backend, refactoring, typing, validation, state, security, API clients…). A task with a single skill (or none) is a red flag: re-check for the domains it touches. **Also confirm no `super.*`-prefixed skill is listed** — those are pipeline gates the flow already runs per task (`super.verification-before-completion`, `super.test-driven-development`, etc.); listing one duplicates the gate and wastes tokens. If you find one, remove it.

**5. Task tracking artifacts:** Most of this is now checked deterministically by `validate-tasks.cjs` (see SKILL.md § Self-Review) — it verifies task-file existence, the required `**Status:**`/`**PRD:**`/`**Spec:**`/`**Depends on:**` headers, and index↔file FR-XXX traceability. Run the validator and fix every reported `error`. Then confirm by eye only what the script cannot judge:
- `tasks-<feature-name>.md` lists every task with the same count and **meaningful titles** (the script checks shape, not semantics)
- All checkboxes are `[ ]` (none pre-checked)
- Relative paths in `**PRD:**`/`**Spec:**` actually resolve to the real artifacts (the script checks the header is present, not that the path is correct)

**6. Visual coverage (if mockups exist):** If `find-feature-files.cjs` reported `mockups.found` (a curated artifact lives under `specs/mockups/`), confirm at least one UI task carries a `### Fidelidade Visual` subsection referencing it. This is checked deterministically when you pass `--mockups` to `validate-tasks.cjs` (see SKILL.md § Self-Review) — run it and fix any reported `error`. A curated mockup with no task referencing it means the decided layout will be re-derived from scratch, the exact waste the visual flow exists to prevent.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.
