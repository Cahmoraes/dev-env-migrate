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

> **Deterministic file discovery (preferred):** The script lives in this skill's `scripts/` folder; your skill context header shows the base directory (e.g. `Base directory for this skill: /path/to/super.writing-plans`). Build the full path:
> ```bash
> node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>
> ```
> Outputs JSON with `prd.found`/`prd.path`, `spec.found`/`spec.path`/`spec.visualSection`, `tasksIndex.found`/`tasksIndex.path`, `mockups.found`/`mockups.path`/`mockups.files` (curated visual artifacts in `specs/mockups/`), and a `warnings` array — confirm files exist before referencing them.
> **If `warnings` contains `visual-spec-without-artifact`** (the spec has an Especificação Visual section but `specs/mockups/` is empty), surface it and resolve it before decomposing tasks — create the curated artifact, or drop the spec section if no mockup or external design informed the feature. Left unresolved, the visual-fidelity gate (`validate-tasks --mockups`) is silently skipped and the layout decision never reaches a task.
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

**Before writing each task file, read `./templates/task-file-template.md` and preserve all required headers exactly.** Each task file is self-contained — an engineer (or subagent) must be able to implement it without reading other task files. Content comes from the corresponding task in the plan.

**Parser-critical fields (must be present verbatim):**
- `**Status:** PENDING` — execution skills update this as work progresses.
- `**PRD:** <relative-path>` — use `**PRD:** N/A` if no PRD exists.
- `**Spec:** <relative-path>` — always required.
- `**Tier:** <cheap | standard | capable>` — the abstract execution-model tier (never a concrete model name; the executor maps tier→model at dispatch), so mechanical work isn't burned on a powerful model. Default it from `parse-waves.cjs`'s `suggestedTier` (run it after drafting the tasks — see Execution Waves below), then override when a task is harder or simpler than its signals suggest. Roughly: `cheap` = 1-2 files, complete spec, no deps; `standard` = multi-file integration (safe default); `capable` = architecture/design, no spec, or high fan-in. Omit it only to let the executor infer the tier; explicit is preferred. See `super.subagent-driven-development § Model Selection`.
- `**Depends on:** <task ids | N/A>` — the tasks whose output this task needs before it can start (e.g. `task-01, task-03`); use `N/A` when nothing earlier is required. This field feeds the Execution Waves derivation below and lets `super.parallel-subagent-development` parallelize safely.

**Status values:** `PENDING` → `IN_PROGRESS` → `DONE`. The task file's `Status:` is the detailed view; the `[x]` in the tasks index is the management view.

### Dependency Analysis & Execution Waves

Once the tasks are decomposed, decide the **dependency edges** between them and record the result twice: as the per-task `**Depends on:**` field and as the `## Execution Waves` section of the tasks index. This unlocks the third execution option (`super.parallel-subagent-development`) — without it every plan is forced down a sequential path even when half its tasks never touch the same code.

Task B depends on task A when B reads, imports, extends, or builds on a file or symbol A creates or changes. Tasks touching disjoint files, neither consuming the other's output, are independent and may run concurrently. When in doubt, declare the dependency — a missing-but-real edge makes parallel worktrees diverge and conflict on merge; a spurious edge only forfeits some parallelism.

Deriving the waves is a topological grouping (Kahn's algorithm by level): Wave 1 = every task with `**Depends on:** N/A`; Wave *k+1* = every not-yet-placed task whose dependencies are all in waves 1..k; repeat until all are placed. A wave with 2+ tasks is `(parallel)`; a wave with one task is `(sequential)`.

Read `./references/execution-waves.md` for the full algorithm, worked examples, and the exact `## Execution Waves` format. After writing the waves, confirm they are consistent with the `**Depends on:**` fields with `parse-waves.cjs`. It lives in the sibling skill `super.parallel-subagent-development`; resolve its path by replacing the final `super.writing-plans` segment of this skill's base directory with `super.parallel-subagent-development` (all superpowers skills are siblings in the same `skills/` directory):

```bash
node <super.parallel-subagent-development-base-dir>/scripts/parse-waves.cjs --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
```

If every task lands in its own sequential wave, that is a correct result for inherently sequential work — note it so the user knows the parallel option offers no speedup for this plan.

### When to Generate

Generate the tracking artifacts **immediately after** decomposing tasks and **before** the execution handoff message. If tasks change, regenerate the task files.

## Scope Check

If the spec covers multiple independent subsystems, it should have been split into sub-project specs during brainstorming. If not, suggest splitting into separate plans — one per subsystem, each producing working, testable software on its own.

## YAGNI Lens — before planning any task that "builds X"

Decomposition is where over-build is born. For each candidate "build" task, descend the ladder before writing it into the plan:

1. Does it need to exist? No → cut the task (YAGNI).
2. Does the stdlib do it? → the task becomes "use X", not "build X".
3. Does a native platform feature do it? (e.g. `<input type="date">` instead of a custom datepicker) → same.
4. Does an already-installed dependency do it? → same.

Only plan to "build" at the rung where nothing above solves it. "Build a date picker" when `<input type="date">` covers the requirement is over-build at the source. Safety guards (validation, escaping, auth) are never cut by YAGNI — they exist by requirement, not excess.

## Research Phase

Before writing any task file, gather the codebase-specific information each task needs: exact file paths, function signatures, test patterns, naming conventions, import paths, and API contracts. Task files require zero placeholders — every step must contain real code, paths, and commands, which only thorough upfront research delivers.

**Run that research in read-only subagents, not the main thread — this is the default, not an optimization reserved for large features.** The main thread holds the templates, references, synthesized research, and task files as you write them, keeping them consistent; raw codebase bytes (file dumps, directory listings, grep output) compete for that context and crowd out the reasoning that writes the tasks. A research subagent reads the raw bytes in its own window and returns a compact, pre-digested report — conclusions, not dumps. Even a single-subsystem feature wins.

**Honor corporate artifacts if they were passed in the handoff.** When corporate artifacts are in context, fold their implementation-level constraints (mandated libraries, coding standards, infrastructure rules) into the relevant research-subagent prompts and into the task content you write, so they survive into task decomposition instead of reaching you only transitively through the spec/PRD. The approved spec/PRD remain authoritative — corporate artifacts inform *how* a task is built and do not reopen decisions already settled upstream. **One exception:** if an implementation-level corporate constraint genuinely conflicts with a settled spec/PRD decision (a conflict that surfaces only now, at planning), do **not** resolve it silently in favor of the spec — surface it to the user, recommend the corporate value as the source of truth, and ask which to follow (the same conflict protocol as `super.brainstorming` and `super.generating-prd`).

### Scope the Research Subagents

Split discovery into one subagent per **independent domain or file cluster**, then dispatch them all in the same turn so they run concurrently. They are safe to parallelize: each performs only reads (no writes) and their domains do not overlap.

- **A few independent clusters (the common case):** one subagent per cluster — e.g. one for UI components and their tests, one for the data/gateway layer, one for the shared test setup. Two or three is typical even for a small feature.
- **Many independent subsystems (5+ FRs, or auth + billing + notifications):** one subagent per subsystem.
- **Genuinely a single file already in your context:** inline reading is acceptable. But the moment you would have to open even one unread file to write a real code step, dispatch a subagent instead.

### Research Subagent Pattern

Each research subagent is scoped to one domain or cluster: give it a focused scope and demand a report complete enough that you never reopen a file it covered. **Use the prompt template in `./references/research-subagent-prompt.md`.**

When all subagents return, synthesize their reports in the main thread — one structured reference per cluster. That synthesized digest, not the raw codebase, is what you write tasks from. Then write all task files sequentially against it.

### No Follow-up Codebase Reads While Writing Tasks

Once research returns, do **not** `Read`, `cat`, `grep`, `ls`, or otherwise open codebase files in the main thread to fill a gap. A gap surfacing mid-writing — an unconfirmed component API, a missing test-setup detail — means the research contract was under-filled; close it the same way: **dispatch a focused follow-up research subagent** for exactly that question and write from its digest. Reading inline is the precise failure this phase prevents — it pours raw bytes into the orchestrator's window when it most needs room. (Reading the skill's own templates, references, and the plan files you are writing is fine — the rule is about *codebase* discovery, not plan artifacts.)

### Why Task Files Must Be Written Sequentially

Do NOT dispatch parallel subagents to write individual task files. Tasks are self-contained by design but not independent: task N+1 may extend a data model, call a function, or import from a file that task N creates. A subagent writing task 3 in isolation cannot know the exact signatures, names, or paths that tasks 1 and 2 produce. Parallel task writers produce cross-task inconsistencies (mismatched types, wrong import paths, duplicated code) that `validate-tasks.cjs` may not fully catch. Write tasks sequentially in the main thread, using the full synthesized research.

## File Structure

Before defining tasks, map out which files will be created or modified and what each is responsible for — this is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces; each file has one clear responsibility.
- Prefer smaller, focused files over large ones — your edits are more reliable when a file fits in context at once.
- Files that change together live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. Don't unilaterally restructure large files — but a split is reasonable when a file you're modifying has grown unwieldy.

Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2–5 minutes):** write the failing test → run it to confirm it fails → implement the minimal code to make it pass → run the tests to confirm they pass → commit.

**When writing `## Passos` sections in task files, read `./references/required-task-step-pattern.md` and follow the pattern exactly** — TDD steps with actual code blocks, exact run commands, and expected outputs. That file is the normative contract for step format.

## Standard Skill Compliance

Every task file has a `### Conformidade com as Skills Padrão` subsection that tells the executing subagent which **domain/code skills** to activate while writing the implementation. It MUST list **every available domain skill whose scope overlaps the task — not just the most obvious one.** A task that lists a single skill (or none) is almost always under-filled: most coding tasks match more than one domain (frontend, refactoring, typescript, state management, validation, security, API clients…).

**Exclude `super.*` skills — they are not domain skills.** Any skill whose name starts with `super.` is **pipeline machinery already run by the execution flow's own gates**, not something the implementer activates. `super.verification-before-completion`, `super.test-driven-development`, `super.systematic-debugging`, `super.requesting-code-review` and the like run **once, automatically, per task** as the controller's quality gates (see the per-task loop in `super.subagent-driven-development`). Listing one here makes the implementer invoke it a **second** time — duplicate work, wasted tokens, and contradictory ownership (the gate, not the implementer, owns it). So **drop every `super.*`-prefixed skill** and keep only the domain/code skills.

**Discover before you list.** Do not enumerate skills from memory — the available set drifts over time. Inspect the skills actually available in the consuming repo (the `chat.agentSkillsLocations` locations surfaced in your platform context), read each skill's `description`, match by description — not by name — then **filter out anything prefixed `super.`**. Fill this subsection for every task, sized to that task's real scope. If a task ends up with a single domain skill, re-check — you are likely missing some.

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

> **Deterministic validation (required — do not skip):** Run the validator before handing off to execution skills. Beyond index format (sequential numbering, line shape, duplicates), it verifies per task file on disk: that each referenced `task-NN.md` **exists**, declares the required headers (`**Status:**` `**PRD:**` `**Spec:**` `**Depends on:**`), and that every `FR-XXX` declared in an index line is **traceable** in its task file. The script lives in this skill's `scripts/` folder; the base directory is in your skill context header (e.g. `Base directory for this skill: /path/to/super.writing-plans`).
> ```bash
> node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs \
>   --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
> ```
> **When a PRD exists, also pass `--prd`** so coverage is verified deterministically (every PRD `FR-NNN` must be covered by a task, and a PRD-with-FRs but tag-less plan is flagged — closing the silent "PRD exists but FR tags forgotten" gap). **When `find-feature-files.cjs` reported `mockups.found`, also pass `--mockups`** so visual coverage is verified deterministically (a curated mockup must be referenced by at least one task via `### Fidelidade Visual`, otherwise the durable visual decision is silently dropped and the layout gets re-derived — the visual analogue of the FR gate):
> ```bash
> node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs \
>   --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md \
>   --prd docs/superpowers/<feature-name>/prd/prd-<feature-name>.md \
>   --mockups docs/superpowers/<feature-name>/specs/mockups
> ```
> The `--prd` and `--mockups` lines are conditional (per the rule above): omit `--prd` for spec-only plans and `--mockups` when there are no curated mockups — passing `--prd` with no PRD file is an ENOENT failure, not a coverage finding.
> Fix any `errors` in the output before proceeding; `warnings` are advisory. **If the script cannot be found at all, explicitly report that the validator could not run — do not silently skip to manual inspection.**

### Optional External Review

For complex or high-stakes plans, dispatch a plan document reviewer subagent using the template in `./plan-document-reviewer-prompt.md` for an independent second opinion on the plan's completeness and buildability. This is optional. Set an explicit `model:` on the dispatch — review is judgment work, floor it at `standard`; never inherit the controller's model by omission (see super.subagent-driven-development § Model Selection).

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
