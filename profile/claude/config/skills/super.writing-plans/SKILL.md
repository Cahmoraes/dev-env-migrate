---
name: super.writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code. If a PRD exists alongside the spec, uses it to map tasks to user stories and functional requirements for better traceability.
---

# Writing Plans

## Overview

Write comprehensive implementation plans for an engineer with zero context for our codebase and questionable taste. Document everything: which files each task touches, code, testing, docs to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits. Assume a skilled developer who knows almost nothing about our toolset, problem domain, or good test design.

**Announce at start:** "I'm using the super.writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it was created via `super.using-git-worktrees` at execution time.

**Save tasks to** `docs/superpowers/<feature-name>/plans/` — the feature directory was created during brainstorming; save into its existing `plans/`. User preferences override this default.

## PRD Integration

Before planning, check if a PRD exists.

> **Deterministic file discovery:** run the script from this skill's `scripts/` folder:
> ```bash
> node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>
> ```
> It outputs `prd`, `spec`, `tasksIndex`, `mockups`, and `warnings`. Confirm files exist before referencing them. **If `warnings` contains `visual-spec-without-artifact`**, resolve it before decomposing tasks (create the curated artifact or drop the spec section); otherwise the visual-fidelity gate is silently skipped.
>
> **Precedence:** if `super.generating-prd` ran this session, the PRD path it passed forward wins over the script. **Fallback (script unavailable):** look for `docs/superpowers/<feature-name>/prd/prd-<feature-name>.md`, then any `prd-`-prefixed file in that `prd/` directory.

**If a PRD is found:**

1. Use its **user stories** and **functional requirements** (FR-001...) as the primary source for task decomposition.
2. Include the requirement ID in each task header (e.g. `### Task 3: User Login Flow [FR-003, FR-004]`).
3. Aim for a **bijection**: every FR covered by ≥1 task (add one if missing), every task linked to a valid FR (an orphan signals scope creep or a PRD gap). `validate-tasks.cjs` verifies this mapping at self-review — get it right while writing.
4. Use the PRD's "Fora de Escopo" section to avoid planning excluded work.

**If no PRD exists:** derive tasks from the design spec and conversation. Note in the plan header: "Spec-only planning; no FR traceability available." The PRD is an enrichment, not a hard dependency. Omit `[FR-XXX]` tags everywhere.

## Visual & Design-Source Integration

A mockup is a **norte** — a directional approximation, not pixel-final; final fidelity is built by the implementation task, ideally against the **original design source** when one exists. Superpowers stays **tool-agnostic**: never assume a specific design tool, design-to-code skill, or MCP. Discover visual inputs alongside the PRD/spec — `find-feature-files.cjs` returns a `mockups` entry (`found`, `path`, `files`) for `specs/mockups/`, and the spec may carry an **Especificação Visual** section.

**If mockups or a visual spec exist, read `./references/visual-design-integration.md`** — it defines which tasks count as UI tasks, how to map mockup files to tasks, and the per-UI-task recording procedure (curated-artifact fidelity baseline; one-pass discovery of the original design source and visual-fidelity tools, never hardcoding a tool name; the `### Fidelidade Visual` subsection verified by `validate-tasks.cjs --mockups`). If none exist, omit all of it — enrichment, never a hard dependency.

## Task Tracking Artifacts

After writing the plan, generate persistent tracking files so execution skills (super.subagent-driven-development, super.parallel-subagent-in-tree, super.parallel-subagent-development) can track progress across sessions. This is the management layer, separate from the detailed plan.

### Path Derivation

All paths derive from the feature name (kebab-case slug defined during brainstorming):

```
Feature root:     docs/superpowers/<feature-name>/
Spec:             docs/superpowers/<feature-name>/specs/<feature-name>-design.md
PRD:              docs/superpowers/<feature-name>/prd/prd-<feature-name>.md
Tasks index:      docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
Individual tasks: docs/superpowers/<feature-name>/plans/task-01.md, task-02.md, ...
```

Everything lives inside the feature directory. Tasks are flat in `plans/` (no subfolders, no date prefixes). No aggregated plan file — the tasks index + individual task files ARE the plan.

### Tasks Index (`tasks-<feature-name>.md`)

**Before writing the tasks index, read `./templates/tasks-template.md` and copy its structure exactly.** The index MUST start with that template's exact header — including the required agentic-worker notice banner and the `---` separator. Fill in feature-specific content: goal, architecture, tech stack, and the flat task list with FR-XXX mappings (only when a PRD exists; omit them entirely when planning from spec alone). Task file paths are relative to the index's directory (flat in `plans/`).

### Individual Task Files (`task-NN.md`)

**The task-writer subagent (the "Task File Writing — One Sequential Writer Subagent" section) reads `./templates/task-file-template.md` and preserves all required headers exactly.** Each task file is self-contained — an engineer (or subagent) must be able to implement it without reading other task files. Content comes from the corresponding task in the plan.

**Parser-critical fields (must be present verbatim):**
- `**Status:** PENDING` — execution skills update this as work progresses.
- `**PRD:** <relative-path>` — use `**PRD:** N/A` if no PRD exists.
- `**Spec:** <relative-path>` — always required.
- `**Tier:** <cheap | standard | capable>` — the abstract execution-model tier (never a concrete model name; the executor maps tier→model at dispatch), so mechanical work isn't burned on a powerful model. Default it from `parse-waves.cjs`'s `suggestedTier` (run it after drafting the tasks — see Execution Waves below), then override when a task is harder or simpler than its signals suggest. Roughly: `cheap` = 1-2 files, complete spec, no deps; `standard` = multi-file integration (safe default); `capable` = architecture/design, no spec, or high fan-in. Omit it only to let the executor infer the tier; explicit is preferred. See `super.subagent-driven-development`, "Model Selection" section.
- `**Depends on:** <task ids | N/A>` — the tasks whose implementation this task reads or extends before it can start (e.g. `task-01, task-03`); use `N/A` when nothing earlier is required. This field feeds the Execution Waves derivation and lets `super.parallel-subagent-development` parallelize safely.

  > **Precision rule — do NOT declare a dependency for type contracts alone.** If task B only imports a type, interface, or DTO that task A defines — and that contract is already frozen/stable when B starts — the edge is NOT a real dependency. A real dependency means B needs A's *implementation* to be ready (B calls A's functions, extends A's classes, modifies files A created). Type-contract-only edges inflate `fanIn` on the depended task, forcing `two-stage` review shape unnecessarily (see "Review cost control" in `super.subagent-driven-development/SKILL.md`), and constrain waves that could parallelize safely. When in doubt: if the contract is stable before B starts (because it was spec'd in the design doc and A's types are simple data structures that won't change), omit the `**Depends on:**` and let the parallel execution modes schedule B alongside A. If A's types could still change while B runs (e.g. a DTO that A is still iterating on), declare the dependency — it is cheaper to merge independent worktrees than to fix divergent type assumptions.

**Status values:** `PENDING` → `IN_PROGRESS` → `DONE`. The task file's `Status:` is the detailed view; the `[x]` in the tasks index is the management view.

### Dependency Analysis & Execution Waves

Once the tasks are decomposed, decide the **dependency edges** between them and record the result twice: as the per-task `**Depends on:**` field and as the `## Execution Waves` section of the tasks index. This unlocks the third execution option (`super.parallel-subagent-development`) — without it every plan is forced down a sequential path even when half its tasks never touch the same code.

Task B depends on task A when B reads, imports, extends, or builds on a file or symbol A creates or changes. Tasks touching disjoint files, neither consuming the other's output, are independent and may run concurrently. When in doubt, declare the dependency — a missing-but-real edge makes parallel worktrees diverge and conflict on merge; a spurious edge only forfeits some parallelism.

**Type-contract dependencies are NOT real dependencies** — see the precision rule under `**Depends on:**` above. A type/interface/DTO that B only imports, stable before B starts, is consumption not sequencing; declaring it would inflate `fanIn` and force `two-stage` review. Only declare the edge when A may still change the contract while B runs.

Derive waves topologically: Wave 1 = tasks with `**Depends on:** N/A`; each next wave = tasks whose dependencies are all placed. A 2+ task wave is `(parallel)`; a single-task wave is `(sequential)`. Read `./references/execution-waves.md` for the full algorithm, worked examples, and the exact format. After writing the waves, confirm they are consistent with the `**Depends on:**` fields with `parse-waves.cjs`. It lives in the sibling skill `super.parallel-subagent-development`; resolve its path by replacing the final `super.writing-plans` segment of this skill's base directory with `super.parallel-subagent-development` (all superpowers skills are siblings in the same `skills/` directory):

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
```

A fully sequential wave plan is correct for inherently sequential work.

### When to Generate

Generate the tracking artifacts **immediately after** decomposing tasks and **before** the execution handoff message. If tasks change, regenerate the task files.

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

Each research subagent is scoped to one domain or cluster: give it a focused scope and demand a report complete enough that you never reopen a file it covered. **Use the prompt template in `./references/research-subagent-prompt.md`.**

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

## File Structure

Before defining tasks, map out which files will be created or modified and what each is responsible for — this is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces; each file has one clear responsibility.
- Prefer smaller, focused files over large ones — your edits are more reliable when a file fits in context at once.
- Files that change together live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. Don't unilaterally restructure large files — but a split is reasonable when a file you're modifying has grown unwieldy.

Each task should produce self-contained changes that make sense independently.

## Task Decomposition Granularity

Two concerns: **test density** (behaviors → tests) and **task boundary** (behaviors → task). Density is fixed: every FR-XXX or explicit acceptance criterion earns its own test, always. Task boundary varies by execution tier.

**Density — never negotiable.** Decompose by acceptance criterion, not by component or file. Never bundle multiple behaviors into one untested blob. This is a coverage floor, not a task-count target.

**Task boundary — tracks the execution mechanism.**
- **Large** (`super.subagent-driven-development` fan-out, each task a separate dispatch): one task = one behavior = one test. Fine-grained boundaries pay for themselves because each task gets an isolated implementer + reviewer pass.

  **Consolidation judgment call (Large only).** "One task = one behavior" is the default,
  not an absolute — adjacent behaviors may coalesce into one task-with-N-tests (density stays
  non-negotiable), but **never** across an independent-file or parallel-wave boundary and
  **never** a critical-surface behavior (auth/security/middleware — see
  `CRITICAL_SURFACE_KEYWORDS`), which keeps its own task and two-stage review regardless of
  coupling. **When decomposing a Large plan, read
  `./references/task-decomposition-granularity.md`** for the three-signal merge test and rationale.

- **Small/Medium** (inline execution, `super.using-superpowers/references/medium-inline-path.md`): decompose by cohesive behavior **cluster**, not one task per AC. One task delivers a whole cluster's worth of behaviors and their tests — N behaviors, N tests, one task. There is no per-task dispatch to isolate, so splitting a cluster into one-task-per-AC only multiplies context-switch overhead in the main thread without buying independence.

**Bad, decomposition by component (any tier):** a single "Build the checkout form" task bundles field validation, submit-disabled state, and error-message rendering into one file-shaped task; three behaviors compressed into one test, or none.

**Good for Large:** "Task 4: Reject submit when required fields are empty [FR-012]", "Task 5: Show inline error under empty required field [FR-013]", "Task 6: Enable submit once all required fields are filled [FR-014]": three tasks, three tests, each traceable to one FR, each its own dispatch.

**Good for Small/Medium:** the same three behaviors become "Task 2: Checkout form required-field validation [FR-012, FR-013, FR-014]" — one task, executed inline, that produces three tests (one per FR) and one self-review checklist entry per behavior before the cluster is considered done.

File count is not the constraint. When several FRs are so tightly coupled that splitting produces a test-less intermediate state, keep them together and say why in the task's Visão Geral.

## Bite-Sized Task Granularity

**Each step is one action (2–5 minutes):** write the failing test → run it to confirm it fails → implement the minimal code to make it pass → run the tests to confirm they pass → commit.

**When writing `## Passos` sections in task files, read `./references/required-task-step-pattern.md` and follow the pattern exactly** — TDD steps with actual code blocks, exact run commands, and expected outputs. That file is the normative contract for step format.

## Standard Skill Compliance

Every task file has a `### Conformidade com as Skills Padrão` subsection that tells the executing subagent which **domain/code skills** to activate while writing the implementation. It MUST list **every available domain skill whose scope overlaps the task — not just the most obvious one.** A task that lists a single skill (or none) is almost always under-filled: most coding tasks match more than one domain (frontend, refactoring, typescript, state management, validation, security, API clients…).

**Exclude `super.*` skills — they are not domain skills.** `super.verification-before-completion`, `super.test-driven-development`, `super.systematic-debugging`, and the like are pipeline machinery already run automatically, once per task, by the execution flow's gates; listing one makes the implementer invoke it a second time — duplicate work, wasted tokens. **Drop every `super.*`-prefixed skill** and keep only domain/code skills.

**Discover before you list.** Inspect the skills available in the consuming repo, read their `description`, match by description (not name), filter out `super.*`, and fill this subsection for every task. A single-skill task is usually under-filled — re-check.

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes. **Read `./references/self-review-checklist.md` and run through all five steps.** Fix issues inline as you find them.

> **Deterministic validation (required — do not skip):** Run `validate-tasks.cjs` before handing off. It checks index format, task-file existence, required headers (`**Status:**`, `**PRD:**`, `**Spec:**`, `**Depends on:**`), FR-XXX traceability, and — when the plan has a `## Execution Waves`/`## Ondas de Execução` section — **write-set disjointness of every parallel (2+ task) wave**, ERRORing when two tasks in the same wave declare an overlapping `## Arquivos` write-set or when a parallel-wave task has no verifiable write-set. This is the same check `super.parallel-subagent-in-tree`'s `check-wave-disjoint.cjs` runs at dispatch time, moved here so an unsafe wave fails the plan itself instead of depending on the execution-time agent to remember to run the gate (see the Consolidation judgment call under "Task Decomposition Granularity" — this is where that call gets forced, not left to a later best-effort check).
> ```bash
> node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs \
>   --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
> ```
> **When a PRD exists, also pass `--prd`** (physical path or `prd.embeddedIn` from `find-feature-files.cjs` for embedded FRs). Omit `--prd` only for a genuine spec-only plan. **When `mockups.found`, also pass `--mockups`** so visual coverage is verified.
> ```bash
> node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs \
>   --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md \
>   --prd docs/superpowers/<feature-name>/prd/prd-<feature-name>.md \
>   --mockups docs/superpowers/<feature-name>/specs/mockups
> ```
> Fix any `errors`; `warnings` are advisory. If the script cannot be found, explicitly report that the validator could not run.

### Optional External Review

For complex or high-stakes plans, dispatch a plan document reviewer subagent using the template in `./plan-document-reviewer-prompt.md` for an independent second opinion on the plan's completeness and buildability. This is optional. Set an explicit `model:` on the dispatch — review is judgment work, floor it at `standard`; never inherit the controller's model by omission (see super.subagent-driven-development, "Model Selection" section).

## Memory Persistence

> **Conditional on `session_memory_enabled`.** If `session_memory_enabled = false`, skip this entire section and proceed directly to Execution Handoff.

> **When enabled — do not skip.** This is the exit action of the Planejando state (see the superpowers state diagram). Skipping it when memory is enabled means future sessions cannot recall prior decisions, constraints, or artifact paths for this feature.

After self-review passes and **before** the execution handoff, persist the planning artifacts to `super.persistent-memory`. **Read `./references/memory-persistence.md`** for the full procedure (graceful degradation, dedupe check, what to persist). Write three entries:

1. **Architectural decisions + constraints** (key choices from the spec)
2. **Feature scope + boundaries** (objective, in-scope stories, out-of-scope items)
3. **Artifact paths** (spec, PRD, tasks index paths + task count)

**Do not proceed to the Execution Handoff step until all three `pmem add` calls have succeeded** (or graceful degradation confirmed `pmem` is unavailable, or `session_memory_enabled = false`).

## Execution Handoff

After saving the tasks index and task files, **read `./references/execution-handoff-message.md` and follow it to offer the execution options to the user**, filling in the feature name, task count, and wave summary.

The `(recommended)` tag is **dynamic** — it must reflect this plan, not a fixed default. The `parse-waves.cjs` output you produced during self-review includes an `executionRecommendation` object; the handoff reference uses it (plus a short decision rubric) to elect and justify the recommended mode. Do not hardcode the recommendation on option 1.

The handoff message leads with an **optional spec-review option** (option 0) — the user can send the just-planned spec and tasks through `super.reviewing-specs` before choosing how to execute, without leaving this session. `./references/execution-handoff-message.md` covers the full branch, including how control returns here afterward.
