# Entry Phase — scope, research, and writing the task files

Read this once, before the first dispatch. SKILL.md keeps the three rules a resumed session still
needs (await never poll; one sequential task writer, never parallel; where the exceptions live) and
points here for the procedure itself.

## Contents

- Overview of the entry phase
- Scope Check, and the YAGNI lens before planning anything that "builds X"
- Research Phase: scoping the subagents and the prompt pattern
- No follow-up codebase reads while writing tasks
- Task File Writing: the one sequential writer, its briefing file, and the two narrow inline exceptions

---

## Overview

Write comprehensive implementation plans for an engineer with zero context for our codebase and questionable taste. Document everything: which files each task touches, code, testing, docs to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits. Assume a skilled developer who knows almost nothing about our toolset, problem domain, or good test design.

**Announce at start:** "I'm using the super.writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it was created via `super.using-git-worktrees` at execution time.

**Save tasks to** `docs/superpowers/<feature-name>/plans/` — the feature directory was created during brainstorming; save into its existing `plans/`. User preferences override this default.

## Scope Check

If the spec covers multiple independent subsystems, it should have been split into sub-project specs during brainstorming. If not, suggest splitting into separate plans — one per subsystem, each producing working, testable software on its own.

## YAGNI Lens — before planning any task that "builds X"

Decomposition is where over-build is born. For each candidate "build" task, descend the YAGNI ladder (see `super.test-driven-development` SKILL.md, "The YAGNI ladder") before writing it into the plan: at each rung, a stdlib / native-platform / already-installed-dependency answer turns the task from "build X" into "use X". Only plan to "build" at the rung where nothing above solves it. "Build a date picker" when `<input type="date">` covers the requirement is over-build at the source. Safety guards (validation, escaping, auth) are never cut by YAGNI — they exist by requirement, not excess.

## Research Phase

**Load confirmed lessons first (main thread, not a subagent):**

```bash
python3 <super.independent-verification-base-dir>/scripts/lessons.py list --status confirmed
```

Only `confirmed` lessons load (never `candidate` or `quarantined`). Apply matching guidance while decomposing tasks — e.g., a lesson from a surviving mutant in a similar area cues you to write that assertion explicitly. Empty store or no `.superpowers/` yet — proceed normally.

Before writing any task file, gather the codebase-specific information each task needs: exact file paths, function signatures, test patterns, naming conventions, import paths, and API contracts. Task files require zero placeholders — every step must contain real code, paths, and commands, which only thorough upfront research delivers.

**Run that research in read-only subagents, not the main thread.** Raw codebase bytes compete for the orchestrator's context; subagents return compact, pre-digested reports. Even a single-subsystem feature wins.

**Honor corporate artifacts if they were passed in the handoff.** Fold their implementation-level constraints into research-subagent prompts and task content. Corporate artifacts inform *how* a task is built; the approved spec/PRD remain authoritative. If a corporate constraint genuinely conflicts with a settled spec/PRD decision, surface it to the user and ask which to follow (same conflict protocol as `super.brainstorming` and `super.generating-prd`).

### Scope the Research Subagents

Split discovery into one subagent per **independent domain or file cluster**, then dispatch them all in the same turn so they run concurrently. They are safe to parallelize: each performs only reads (no writes) and their domains do not overlap.

- **A few independent clusters (the common case):** one subagent per cluster — e.g. one for UI components and their tests, one for the data/gateway layer, one for the shared test setup. Two or three is typical even for a small feature.
- **Many independent subsystems (5+ FRs, or auth + billing + notifications):** one subagent per subsystem.
- **Genuinely a single file already in your context:** inline reading is acceptable. But the moment you would have to open even one unread file to write a real code step, dispatch a subagent instead.

### Research Subagent Pattern

Each research subagent is scoped to one domain or cluster: give it a focused scope and demand a report complete enough that you never reopen a file it covered — **within the template's 5.000-character budget**, which is what keeps a parallel fan-out from dropping tens of thousands of characters into a single controller turn. Completeness comes from tighter scope per subagent, never from a longer report: if one cluster cannot fit, split it into two subagents. **Use the prompt template in `./references/research-subagent-prompt.md`.**

Await the subagents — **never poll for them.** The harness re-invokes you as each returns; simply wait. Do **not** `sleep` or schedule a wakeup/timer to "check on" a subagent you just dispatched — busy-polling harness-tracked background work is wasted (you are re-invoked automatically) and a malformed wakeup call errors out mid-flow. Synthesize their reports in the main thread — one structured reference per cluster — then hand that digest to the task-writer subagent.

### No Follow-up Codebase Reads While Writing Tasks

Once research returns, do **not** open codebase files in the main thread to fill a gap. A gap means the research contract was under-filled; close it by dispatching a focused follow-up research subagent. (Reading the skill's own templates, references, and the plan files you are writing is fine.)

### Task File Writing — One Sequential Writer Subagent

Task files are self-contained by design but **not independent**: task N+1 may extend a data model, call a function, or import from a file that task N creates. A writer that sees task 3 in isolation cannot know the exact signatures, names, or paths tasks 1 and 2 produce — so writing MUST be sequential over one complete view of the plan. **Never dispatch _parallel_ task writers**: they produce cross-task inconsistencies (mismatched types, wrong import paths, duplicated code) that `validate-tasks.cjs` may not fully catch.

Delegate the writing to **one** task-writer subagent — single sequential writer, never parallel ones, never the main thread. Do decomposition, dependency analysis, and waves in the main thread first; write the small tasks **index** there too.

**Narrow exception:** the main thread may write task files inline, skipping the writer-subagent dispatch, in either of two cases:

1. **Small/Medium tier routed through inline execution** (`super.using-superpowers/references/medium-inline-path.md`). This tier already decomposes by cohesive behavior **cluster**, not one task per AC (see "Task Decomposition Granularity" below) — by construction it produces few tasks (the classification table's Medium ceiling is 3-8 steps, and clustering pulls the real count lower still). The sequential-writer subagent exists to prevent cross-task inconsistencies across a *large* task list a single window can't hold at once; a handful of clusters fits in the controller's context alongside the design doc and research digest it already holds from brainstorming, so the extra dispatch buys no consistency benefit — only its token cost. This also closes a routing gap: `super.using-superpowers`'s tier table already promises Medium "tasks listed inline, no separate task-writer subagent" — this exception is what makes that promise true.
2. At most 7 tasks routed through the **"Large, known domain, no real ambiguity" fast path.**

Outside these two conditions, always dispatch the one sequential writer subagent.

**Hand the writer its briefing through a file.** The writer needs: the synthesized research digest, the full task decomposition, and the per-task filtered domain-skill list. Do not inline these into the `task` prompt; a giant dispatch is a known failure surface for empty tool arguments.

1. **Persist the briefing to disk first.** `Write` the digest + full decomposition + per-task filtered skill list to `docs/superpowers/<feature-name>/plans/task-writer-briefing.md`. It is a transient handoff artifact: removed automatically by `validate-tasks.cjs` on a clean validation, kept during a failing fix-loop. Do not reference it from the tasks index or delete it by hand.
2. **Dispatch with a compact pointer prompt.** The `task` prompt names the writer's role, points to `task-writer-briefing.md`, the tasks index, `./templates/task-file-template.md`, and `./references/required-task-step-pattern.md`. It must NOT re-discover skills.

The dispatched writer then:

- reads the briefing, the tasks index, `./templates/task-file-template.md` and `./references/required-task-step-pattern.md` in its own window, and writes `task-01.md … task-NN.md` **in ascending order**, so each file is authored with full knowledge of the ones before it, preserving every parser-critical header (the "Individual Task Files" section) verbatim;
- returns only the paths written plus one line per task — never the file contents.

Set an explicit `model:` on the dispatch — floor it at `standard` (authoring task steps is judgment work); never inherit the controller's model by omission (see `super.subagent-driven-development`, "Model Selection" section). After it returns, run the deterministic validator (the "Self-Review" section) against the files on disk; if it reports errors, hand them back to the same writer to fix rather than editing inline.
