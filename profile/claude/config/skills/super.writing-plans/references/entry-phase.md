# Entry Phase — scope, research, and writing the task files

Read this once, before the first dispatch. SKILL.md keeps the three rules a resumed session still
needs (await never poll; one sequential task writer, never parallel; where the exceptions live) and
points here for the procedure itself.

## Contents

- Overview of the entry phase
- Scope Check, and the YAGNI lens before planning anything that "builds X"
- Research Phase: scoping the subagents and the prompt pattern
- No follow-up codebase reads while writing tasks
- Task File Writing: the one sequential writer, its briefing file, and the one inline exception (at most four tasks)

---

## Overview

Write comprehensive implementation plans for an engineer with zero context for our codebase and questionable taste. Document everything: which files each task touches, code, testing, docs to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits. Assume a skilled developer who knows almost nothing about our toolset, problem domain, or good test design.

**Announce at start:** "I'm using the super.writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it was created via `super.using-git-worktrees` at execution time.

**Save tasks to** `docs/superpowers/<feature-name>/plans/` — the feature directory was created during brainstorming; save into its existing `plans/`. User preferences override this default.

## Scope Check

If the spec covers multiple independent subsystems, it should have been split into sub-project specs during brainstorming. If not, suggest splitting into separate plans — one per subsystem, each producing working, testable software on its own.

## YAGNI Lens — before planning any task that "builds X"

Decomposition is where over-build is born. For each candidate "build" task, descend this ladder before writing it into the plan, stopping at the first rung that covers the requirement:

1. Does it need to exist? No → don't write the task.
2. Stdlib does it? → use it.
3. Native platform feature does it? (e.g. `<input type="date">`) → use it.
4. Already-installed dependency does it? → use it.
5. One line? → one line.
6. Only then: plan to build the minimum that satisfies the requirement.

At each rung, a stdlib / native-platform / already-installed-dependency answer turns the task from "build X" into "use X". "Build a date picker" when `<input type="date">` covers the requirement is over-build at the source. Safety guards (validation, escaping, auth) are never cut by YAGNI — they exist by requirement, not excess.

## Research Phase

Before writing any task file, gather the codebase-specific information each task needs: exact file paths, function signatures, test patterns, naming conventions, import paths, and API contracts. Task files require zero placeholders — every step must contain real code, paths, and commands, which only thorough upfront research delivers.

**Run that research in read-only subagents, not the main thread.** Raw codebase bytes compete for the orchestrator's context; subagents return compact, pre-digested reports. Even a single-subsystem feature wins.

**Honor corporate artifacts if they were passed in the handoff.** Fold their implementation-level constraints into research-subagent prompts and task content. Corporate artifacts inform *how* a task is built; the approved spec/PRD remain authoritative. If a corporate constraint genuinely conflicts with a settled spec/PRD decision, surface it to the user and ask which to follow (same conflict protocol as `super.brainstorming` and `super.generating-prd`).

### Scope the Research Subagents

Split discovery into one subagent per **independent domain or file cluster**, then dispatch them all in the same turn so they run concurrently. They are safe to parallelize: each performs only reads (no writes) and their domains do not overlap.

- **A few independent clusters (the common case):** one subagent per cluster — e.g. one for UI components and their tests, one for the data/gateway layer, one for the shared test setup. Two or three is typical even for a small feature.
- **Many independent subsystems (5+ FRs, or auth + billing + notifications):** one subagent per subsystem.
- **Genuinely a single file already in your context:** inline reading is acceptable. But the moment you would have to open even one unread file to write a real code step, dispatch a subagent instead.

### Research Subagent Pattern

Each research subagent is scoped to one domain or cluster: give it a focused scope and demand a report complete enough that you never reopen a file it covered — **within the template's 5.000-character budget**, which is what keeps a parallel fan-out from dropping tens of thousands of characters into a single controller turn. Completeness comes from tighter scope per subagent, never from a longer report: if one cluster cannot fit, split it into two subagents. **Use the prompt template in `./research-subagent-prompt.md`.**

Await the subagents — **never poll for them.** The harness re-invokes you as each returns; simply wait. Do **not** `sleep` or schedule a wakeup/timer to "check on" a subagent you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow. Synthesize their reports in the main thread — one structured reference per cluster — then hand that digest to the task-writer subagent.

### No Follow-up Codebase Reads While Writing Tasks

Once research returns, do **not** open codebase files in the main thread to fill a gap. A gap means the research contract was under-filled; close it by dispatching a focused follow-up research subagent. (Reading the skill's own templates, references, and the plan files you are writing is fine.)

### Task File Writing — One Sequential Writer Subagent

Task files are self-contained by design but **not independent**: task N+1 may extend a data model, call a function, or import from a file that task N creates. A writer that sees task 3 in isolation cannot know the exact signatures, names, or paths tasks 1 and 2 produce — so writing MUST be sequential over one complete view of the plan. **Never dispatch _parallel_ task writers**: they produce cross-task inconsistencies (mismatched types, wrong import paths, duplicated code) that `validate-tasks.cjs` may not fully catch.

Delegate the writing to **one** task-writer subagent — single sequential writer, never parallel ones, never the main thread. Do decomposition and dependency analysis in the main thread first; write the small tasks **index** there too — including its `## Foco de Revisão`: with the spec in front of you, the at-most-five inputs or failure modes the spec implies but no task's tests will exercise, one line each with the behavior a reasonable person expects and the owning `task-NN` (the template's comment carries the standard; the self-review checklist's Review Focus step re-checks it once the task files exist). The list lives in the index only, once; the pinning test steps live in the owning task files, which is why the briefing carries the assignment.

**The one exception — a decomposition of at most four tasks:** once the decomposition in the main thread yields four task files or fewer, the main thread writes them itself, skipping the writer dispatch. The count is the decomposition's real one, read before any file is written — never an estimate of the feature's size. The exception covers *writing* only: the finished plan opens the same execution gate as every other plan and is executed by dispatch. The sequential-writer subagent exists to prevent cross-task inconsistencies across a task list a single window can't hold at once; four task files fit in the controller's context alongside the design doc and research digest it already holds from brainstorming, so the extra dispatch buys no consistency benefit — only its token cost. **The writer's boundary travels with the exception:** writing a task file inline is still authoring a document — no runner, typecheck, lint or build while the plan is being written, `Expected:` derived from the assertion (`../agents/task-writer.md`, "Boundary"). The runner runs when the plan is executed, one turn later, not to confirm the plan.

Five or more task files always get the writer subagent: a controller writing that many files inline sits in the writer's seat without the writer's boundary, and runs the runner and the e2e lister mid-plan.

**Hand the writer its briefing through a file.** The writer needs: the synthesized research digest, the full task decomposition, and the per-task filtered domain-skill list. Do not inline these into the `task` prompt; a giant dispatch is a known failure surface for empty tool arguments.

1. **Persist the briefing to disk first.** `Write` a `## Runner de testes` section (below) + the digest + full decomposition, each task with its FR ids when a PRD exists (the writer puts them in the task file's title; the index line does not carry them) and the spec's AC/INV and migration labels it owns, copied verbatim + per-task filtered skill list + a "Review Focus → owning task" section (each line of the index's `## Foco de Revisão` and the task whose `## Passos` gets its `Review Focus:` test step) to `docs/superpowers/<feature-name>/plans/task-writer-briefing.md`. It is a transient handoff artifact: removed automatically by `validate-tasks.cjs` on a clean validation, kept during a failing fix-loop. Do not reference it from the tasks index or delete it by hand.

   **`## Runner de testes` is the writer's only source for every `Run:` line** — the index does not carry the runner, and the writer never reads it from the repo's instructions file (an instructions file can document a form that does not narrow to one file). The runner is the one SKILL.md's runner rule resolved; the form is the per-file one the research ran (`./research-subagent-prompt.md`, item 3). One bullet per workspace and test kind (unit, integration, e2e — each kind with its own command), the target as a placeholder, whether the research ran it; when the instructions file documents a form that does not narrow, add it marked as not to use. Only per-file commands: config and environment go in the digest, and a whole-suite, typecheck, lint or build command never goes here (the final gate resolves those from the project's scripts; one pasted here reaches a task's `Run:` line):

   ```markdown
   ## Runner de testes

   - <workspace> · <kind>: `<per-file command> <arquivo>` (verificado: 1 arquivo coletado)
   - <workspace> · <kind>: `<per-file command> <arquivo>` (não verificado)
   - não usar `<documented form> <arquivo>` — <what it collects instead>
   ```

2. **Check the index and the briefing before dispatching.** One call, once both are on disk:

   ```bash
   node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md --index-only
   ```

   `valid: false` → fix what `errors` names — the index shape, or the briefing's `## Runner de testes` (missing, no command, or a command with no per-file target) — and run it again; the writer is dispatched only on `valid: true`. It never removes the briefing.
3. **Dispatch with the contract in `../agents/task-writer.md`.** Its prompt is a compact pointer (briefing, index, template, step pattern) and carries the writer's boundary: it authors documents — it never edits, tests, builds or reverts anything in the working tree, and `Expected:` lines are derived from the assertion, not measured by running the suite. Where the platform scopes tools per dispatch, withhold the shell. The briefing's per-task skill list is the writer's skill source; it does not re-discover skills.

The writer returns only the paths written plus one line per task — or `BLOCKED: briefing sem runner para <workspace · kind>` with no file written: that kind is missing from `## Runner de testes`. Fill it from the research report, or from a focused research subagent that runs the per-file form (the report has none) — never from the instructions file alone — then step 2 again, then re-dispatch. After it returns, run the deterministic validator (the "Self-Review" section) against the files on disk; if it reports errors, hand them back to the same writer to fix rather than editing inline.
