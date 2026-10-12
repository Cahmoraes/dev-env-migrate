---
name: super.reviewing-specs
description: Critical review of an existing design spec (and its tasks) for open forks, inconsistencies and spec↔code/task drift. Use on 'review this spec' or a spec path.
---

# Reviewing Specs

A surgical review of an **existing** design spec — and its tasks, if any — for what an implementer would trip over: decisions named but never closed, forks raised and dropped, contradictions between sections, drift from the real code or the plan. Runs on demand once a spec exists, before or during planning. Honesty is the product: a clean spec gets "no changes needed", a silent fork gets named, and no finding is manufactured — the contract is `./references/honest-reporting.md`.

**Entry.** The spec path is the argument (`/super.reviewing-specs path/to/spec.md`), or it arrives from `super.writing-plans`' Execution Handoff (option 0), which already knows the path and takes control back when you finish (`super.writing-plans/references/execution-handoff-message.md`, "Step 4"). **No path (triage "6", "review my spec") → ask which spec, and wait.** Never derive a slug from the working directory and never auto-pick a spec discovery turns up; you may list candidates (`*-design.md` under `docs/superpowers/*/specs/`) to make the question easy, but one candidate is still a question, not a default.

## 1. Locate the spec and its companions

```bash
node <super.reviewing-specs-base-dir>/scripts/resolve-review-targets.cjs --spec <path/to/spec.md>
```

Returns `{ featureName, featureDir, repoRoot, spec, prd, tasksIndex, taskFiles[], mockups, corporateArtifacts }`. `spec.found: false` → wrong path, ask again. `--feature-name <slug> --base-dir` is for a user who gave a slug, never for inventing one. `corporateArtifacts.found` is the Lens 5 switch (spec ↔ corporate artifacts): it requires the owner's consent (`context.has_corporate_artifacts: true`) **and** a declared entry — a file on disk is not consent. `declaredButDisabled: true` → Lens 5 stays off and the mismatch is reported as an out-of-scope observation, never as a finding.

## 2. Dispatch the review lead — always at the `capable` tier

Spec review is architectural judgment, so the lenses run at `capable` regardless of how the tasks are tiered; the tier is fixed here and enforced by the script (`./references/capable-tier-dispatch.md` covers the resolution and the gating). Recover the capable model with one deterministic call — this route may never have passed through the triage, so nothing is latched:

> **Base dirs:** this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X` (never search for one); a gate script that will not run is a **STOP**, never a skipped gate.

```bash
node <super.reviewing-specs-base-dir>/scripts/lite-reentry.cjs --repo-root <repoRoot> --platform <resolved-platform>
# → { found, capableModel }
```

Then build the lead's dispatch (`<targets.json>` is Step 1's output saved to a file; `--domain-expertise` is a short phrase naming the spec's domain and stack, e.g. `"mensageria RabbitMQ / sistemas distribuídos"`, or `"generic"` only when you truly cannot tell):

```bash
node <super.reviewing-specs-base-dir>/scripts/build-review-lead-dispatch.cjs \
  --targets <targets.json> --capable-model <capableModel-from-lite-reentry> \
  --language <session language, e.g. pt-BR> --domain-expertise "<the spec's domain and stack>"
```

`dispatches[0]` is the lead: `description`, `model` and a one-line `prompt` pointing at its rendered `./agents/review-lead.md`. **Send it as emitted, as your only dispatch**: `description`, `model` and `prompt` never retyped, never with `model:` dropped. The lead gates the lens manifest, fans the lenses out in parallel, merges and ranks their findings, writes the report to the output's `reportPath` and returns a short verdict. The lead's prompt file, the lenses, their catalog and their prompt files are the lead's, never yours. A review you run instead of dispatching the lead is a skipped gate, whatever the session calls it ("headless", "quick", "no edits" describe *editing*, never dispatch). Await the lead's return.

## 3. Aggregate and report, then one consent question

Read the report at `reportPath` (findings merged, deduplicated, ranked Critical / Important / Minor; format and honesty rules in `./references/honest-reporting.md`). A verdict opening with `Lenses: sequential (no dispatch available)` → tell the user the lenses ran in one context. The report lists only what needs attention — a one-line **coverage** statement replaces any praise — and a clean spec is reported as **"no changes needed"**. Keep each finding's kind visible: `prose` or `decision`. A prose finding is a fact stated wrong, fixed by one edit; a decision finding is an open fork whose closure only the owner can make, so the report spells out the closure it proposes (resolve / tolerate / rule-out, with the concrete value). The consent question states how many decision findings "apply all" would close *as proposed*; at apply time you write exactly that closure, never a different one you now prefer.

**One decision settles the spec and the tasks.** Post the report as a normal chat message (plain Markdown, never inside a question tool's `message` field), then ask with the platform's structured-question tool (`super.using-superpowers/references/*-tools.md`; without one, a numbered prose list). Options, each naming its outcome:
- **Apply all — spec and tasks** — every finding applied to the spec and propagated to the affected `plans/task-NN.md` via `super.writing-plans` (Step 5).
- **Apply all — spec only** — tasks untouched.
- **Apply a subset** — the user names which (and, for a decision finding, which closure) and whether tasks follow; in the same answer, offer to persist the findings left unapplied as "save to adjust later" does.
- **Save to adjust later** — apply nothing; persist the report next to the reviewed artifact (`specs/<feature>-review.md` or `prd/<feature>-review.md`, never clobbering an existing one) and say the path. "Discard" is the same answer with no saved report.

Nothing is edited before this answer; saving the report is not applying it.

## 4. Apply the agreed corrections — surgically

Edit only what was agreed, only as much as each fix needs: fix misleading prose around a correct fact, change a wrong decision, leave right sections alone. **Propagate each fix to every restatement** — a fact lives in the flow narration, the component table, a decision, a risk row, the test table, the tasks — so before closing an edit, search the spec (and the agreed tasks) for the old name or value and update every occurrence that restates the same fact.

## 5. Update the tasks when the answer included them

Answer "spec and tasks" (or a subset with tasks following) and tasks exist — or the review found the spec now needs tasks that are missing — → hand off to `super.writing-plans`, which re-discovers the feature by name and edits or creates the affected `plans/task-NN.md`. "Spec only" → done.

## 6. Close with deterministic verification

If tasks changed, re-run `super.writing-plans`' `validate-tasks.cjs` and confirm `valid: true` with full FR coverage; search the spec and tasks for residuals of every correction (a renamed symbol, a divergent value). Report that output, not a claim.
