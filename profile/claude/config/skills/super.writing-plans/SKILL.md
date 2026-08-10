---
name: super.writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code. If a PRD exists alongside the spec, uses it to map tasks to user stories and functional requirements for better traceability.
argument-hint: "[path-to-<feature>-design.md] [path-to-prd-<feature>.md]"
---

# Writing Plans

> **The entry-phase procedure lives in `./references/entry-phase.md`** (overview, scope/YAGNI, research fan-out, task-file writing). The rules a resume still needs are inline under "# Entry Phase" — the fan-out and the sequential writer both run long enough to be compacted through.

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

After writing the plan, generate persistent tracking files so the execution skills can track progress across sessions. This is the management layer, separate from the detailed plan.

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

**Before writing the tasks index, read `./templates/tasks-template.md` and copy its structure exactly.** The index MUST start with that template's exact header — the title, the `**Spec:**`/`**PRD:**` pointers, and the `---` separator. Fill in feature-specific content: goal, architecture, tech stack, and the flat task list with FR-XXX mappings (only when a PRD exists; omit them entirely when planning from spec alone). Task file paths are relative to the index's directory (flat in `plans/`).

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

## File Structure

Before defining tasks, map out which files will be created or modified and what each is responsible for — this is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces; each file has one clear responsibility.
- Prefer smaller, focused files over large ones — your edits are more reliable when a file fits in context at once.
- Files that change together live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. Don't unilaterally restructure large files — but a split is reasonable when a file you're modifying has grown unwieldy.

Each task should produce self-contained changes that make sense independently.

## Task Granularity

Two concerns decide how tasks are cut: **test density** (every FR-XXX or explicit acceptance criterion earns its own test — fixed, always) and **task boundary** (varies by execution tier). The tier model, the bite-sized rules, and the Large-tier consolidation judgment call are all in **`./references/task-decomposition-granularity.md`** — read it before splitting the plan into task files.

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

After writing the complete plan, look at the spec with fresh eyes. **Read `./references/self-review-checklist.md` and run through every step in it.** Fix issues inline as you find them.

> **Deterministic validation (required — do not skip):** Run `validate-tasks.cjs` before handing off. It checks index format, task-file existence, required headers (`**Status:**`, `**PRD:**`, `**Spec:**`, `**Depends on:**`), FR-XXX traceability, and — when the plan has a `## Execution Waves`/`## Ondas de Execução` section — two wave checks that ERROR: **the partition is coherent** (no task in two waves or in none, no wave naming an unknown task, every `**Depends on:**` in a strictly earlier wave) and **every parallel (2+ task) wave writes disjoint files** (overlapping `## Arquivos`, or a parallel-wave task with no verifiable write-set). Both also run at dispatch (`parse-waves.cjs`, `check-wave-disjoint.cjs`); here they fail the plan itself instead of surfacing mid-run, after handoff.
> **This is ONE call — build the form that fits your plan, then run it once.** The two snippets
> below are alternatives, not a sequence: the fuller form already reports everything the barer one
> does, so running the bare call first and the flagged call after just pays for the same validation
> twice.
>
> Barest form — spec-only plan, no PRD and no mockups:
> ```bash
> node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs \
>   --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
> ```
> **When a PRD exists, add `--prd`** (physical path or `prd.embeddedIn` from `find-feature-files.cjs` for embedded FRs) — omit it only for a genuine spec-only plan, since pointing `--prd` at a path that does not resolve is itself an error (`Could not read PRD at ...`), not a silent skip. **When `mockups.found`, add `--mockups`** so visual coverage is verified:
> ```bash
> node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs \
>   --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md \
>   --prd docs/superpowers/<feature-name>/prd/prd-<feature-name>.md \
>   --mockups docs/superpowers/<feature-name>/specs/mockups \
>   --repo-root .
> ```
> **Always pass `--repo-root`** when planning against an existing codebase. Disjointness proves tasks do not *collide*; reach proves they *cover*. It cross-checks the plan against the real tree for the three ways a write-set is silently short: importers of a file you modify that no task owns; the enrollment/registry file listing the siblings of a file you create (a module nothing registers compiles, passes its unit tests, and does not exist at runtime); and the repo's full runner-config inventory, so "run the suite" names every command instead of one. Read `reach.testSuites` and state the complete command set in the plan — the execution barrier is only as wide as the commands it was given.
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

# Entry Phase

> **Why this block is last.** A compaction re-injects only the **first 20.000 characters** of a SKILL.md, dropping the rest silently. These sections run at the start of planning, so losing them on resume costs nothing — losing Self-Review, No Placeholders, Memory Persistence or the Execution Handoff above would strand a resumed session mid-plan.

## Overview — the procedure is in `./references/entry-phase.md`

Read it before the first dispatch, with `./references/research-subagent-prompt.md` and `./references/required-task-step-pattern.md`. Three rules stay here because a resume still needs them:

**Await the research subagents — never poll for them.** The harness re-invokes you as each returns; do **not** `sleep` or schedule a wakeup/timer to check on them — busy-polling harness-tracked work is wasted.

**Never dispatch _parallel_ task writers.** Task N+1 may import what task N creates, and a writer seeing one task alone cannot know the signatures the others produce. One sequential writer subagent — never parallel, never the main thread (two narrow inline exceptions in the reference).

**No follow-up codebase reads in the main thread** once research returns — a gap means the research contract was under-filled; dispatch a focused follow-up subagent instead.
