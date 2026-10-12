---
name: super.writing-plans
description: Decompose an approved spec (and PRD, if any) into ordered task files, each naming what it consumes from earlier ones. Use before executing a multi-step change.
argument-hint: "[path-to-<feature>-design.md] [path-to-prd-<feature>.md]"
---

# Writing Plans

> The entry procedure (scope/YAGNI, research fan-out, task-file writing) is `./references/entry-phase.md`; the three rules a resume still needs are under "# Entry Phase" at the end of this file.

**What to read when:** entering → `./references/entry-phase.md`; cutting the plan into tasks → `./references/task-decomposition-granularity.md` and the two templates; only when the spec has an **Especificação Visual** section or `specs/mockups/` exists → `./references/visual-design-integration.md`; closing → `./references/self-review-checklist.md`, then `./references/execution-handoff-message.md`.

## PRD Integration

Discover the feature's files deterministically:

```bash
node <super.writing-plans-base-dir>/scripts/find-feature-files.cjs --feature-name <feature-name>
```

It outputs `prd`, `spec`, `tasksIndex`, `mockups`, `warnings`. A PRD path handed forward by `super.generating-prd` this session wins over the script; without the script, look under `docs/superpowers/<feature-name>/prd/`. **If `warnings` contains `visual-spec-without-artifact`**, resolve it before decomposing tasks (create the curated artifact or drop the spec section) — otherwise the visual-fidelity gate is silently skipped.

**With a PRD:** its user stories and functional requirements (`FR-001`…) are the primary decomposition source; every task file's title carries its FR ids (`# Task 3: User Login Flow [FR-003, FR-004]`) — the index line never does — every FR is covered by ≥1 task and every task maps to a valid FR — `validate-tasks.cjs --prd` checks the bijection at self-review, so get it right while writing. Its "Fora de Escopo" section bounds the plan. **Without a PRD:** derive tasks from the spec and the conversation, and omit `[FR-XXX]` tags everywhere. **Either way:** each spec `AC-NN`/`INV-NN`, and a migration's **Mecanismo:**/**Critério de fim:**, is a line of its owning task's `## Critérios de Sucesso` with the spec's text verbatim — `- AC-03 [unit|int|db|unverified]: <texto>` — and a spec `**Contrato:**` row is copied into the task that implements its operation.

## Visual & Design-Source Integration

A mockup is a **norte** — directional, not pixel-final; final fidelity is the implementation task's, ideally against the original design source. Stay tool-agnostic (no design tool, design-to-code skill or MCP assumed). When `mockups.found` or the spec carries an **Especificação Visual** section, `./references/visual-design-integration.md` defines the UI tasks, the mockup→task mapping and the `### Fidelidade Visual` subsection that `validate-tasks.cjs --mockups` verifies. Otherwise omit all of it.

## Task Tracking Artifacts

Everything lives under `docs/superpowers/<feature-name>/`: `specs/<feature-name>-design.md`, `prd/prd-<feature-name>.md`, `plans/tasks-<feature-name>.md` (the index) and `plans/task-01.md`, `task-02.md`… (flat, no subfolders, no date prefixes). The index plus the task files **are** the plan — there is no aggregated plan file. Generate them immediately after decomposing tasks and before the execution handoff; if tasks change, regenerate.

### Tasks Index (`tasks-<feature-name>.md`)

Copy the structure of `./templates/tasks-template.md` exactly — its header (title, `**Spec:**` and `**PRD:**` pointers with a blank line between them — a Markdown preview joins adjacent lines —, `---` separator), the flat task list (checkbox, number, title, file — no FR tags), then the two sections the reviewers receive verbatim: `## Restrições Globais` (the spec's project-wide rules and exact values, verbatim — every reviewer's attention lens) and `## Foco de Revisão` (the inputs the spec implies but no task tests, each owned by a task that pins it with a test step — the template's comment is the standard; the final reviewer gets it). Nothing else goes in the index — no command inventory, no answer to a validator warning, no note to the executor; `validate-tasks.cjs` fails an unknown heading or prose outside a bullet. Task paths are relative to the index's directory. **The test runner is resolved, never guessed:** stack from `projectProfile`, framework and test runner from the repo's instructions file, else the manifest at `projectProfile.manifest` — where the toolchain owns the runner, the manifest's declared kind settles it even before the file exists (`pubspec.yaml` → `flutter test`, `go.mod` → `go test`, `Cargo.toml` → `cargo test`, `mix.exs` → `mix test`); any other kind needs the file's test config, and a universal launcher never settles the framework it launches (`dotnet test`, `npm test`) — else the spec's Testes section; all silent → ask the user now, before any task file exists. It goes in the task-writer briefing's `## Runner de testes` (a plan of at most four tasks, which has no writer, puts it straight into the task files' `Run:` lines), never in the index (`validate-tasks.cjs` fails a `**Tech Stack:**` line there): per workspace, stack · framework · the per-file command. The task writer copies the runner from the briefing into every `Run:` line; a runner guessed here is pasted verbatim into every implementer prompt.

### Individual Task Files (`task-NN.md`)

The task-writer subagent (`./agents/task-writer.md` — it authors documents and never builds, tests or reverts anything) copies `./templates/task-file-template.md` and keeps every required header verbatim; each file is self-contained — implementable without reading other task files. Parser-critical fields: `**Status:** PENDING` (`PENDING` → `IN_PROGRESS` → `DONE`; the index's `[x]` is the management view), `**PRD:**` (`N/A` without one), `**Spec:**`, `**Tier:**` (`cheap` | `standard` | `capable` — the abstract execution tier, never a model name; default from `parse-plan.cjs`'s `suggestedTier`, override when a task is harder or simpler than its signals; policy in `super.subagent-driven-development`, "Model Selection") — one per line, a blank line between them, or a Markdown preview joins them into one paragraph.

### Dependency Analysis

The index order is the execution order. The edges are the `(task-NN)` ids each task's `## Interfaces` `**Consome:**` line cites: a task may only consume an earlier one, and fan-in (how many tasks consume it) is a tier signal. **A type contract alone is not an edge** — B consumes A when B needs A's *implementation*; a stable type/DTO import inflates `fanIn` and pushes a tier up for nothing. Then confirm the graph — this skill owns the parser the execution skill reads:

> Base dirs: this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X`. A gate script that will not run is a STOP.

```bash
node <super.writing-plans-base-dir>/scripts/parse-plan.cjs --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
```

`errors` names a dangling or self reference, or a task that consumes a later one; fix the plan, never the executor.

## File Structure

Before defining tasks, map which files are created or modified and what each is responsible for — one responsibility per file, files that change together live together (split by responsibility, not by technical layer), established patterns followed in existing codebases. Each task produces self-contained changes.

## Task Granularity

Two concerns decide the cut: **test density** (every FR-XXX, spec AC-NN or INV-NN earns its own test — fixed) and **task boundary** (one behavior per task, then consolidated). One rule holds for every plan: a small mechanical edit of the same kind repeated across N files (the same constant, the same field, the same one-line fix) is **one task with N files and N checks, never N tasks**. The boundary rule, the bite-sized rules and the two consolidation cases are in `./references/task-decomposition-granularity.md` — read it before splitting the plan into task files.

## Standard Skill Compliance

Every task file has a `### Skills a invocar` subsection listing the **domain/code skills** the implementer invokes before writing code — every available skill whose scope overlaps the task, matched by `description`, not by name; a single-skill task is usually under-filled. **Exclude `super.*` skills**: `super.verification-before-completion`, `super.test-driven-development` and the like are pipeline gates the execution flow already runs once per task, and listing one makes the implementer run it twice.

## No Placeholders

Every step carries what an engineer needs: exact file paths, the code itself when a step changes code, exact commands with expected output. "TBD", "add appropriate error handling", "write tests for the above", "similar to Task N", or a symbol no task defines are plan failures.

## Self-Review

After writing the complete plan, look at the spec (and PRD) with fresh eyes and run these checks yourself, fixing inline — a plan that skips them ships its gaps to every implementer and reviewer:

1. **Coverage** — every spec requirement (every FR) points at a task; nothing under Fora de Escopo is built.
2. **Placeholders** — no "TBD", no "similar to Task N", no symbol that no task defines.
3. **Consistency** — names, signatures and shared resources agree across tasks; nothing is imported before the task that creates it.
4. **Review Focus** — every input the spec implies has a test in some task, including what each existing helper a task reuses returns or throws on a bad input; the five most likely to bite a person are in `## Foco de Revisão`, each pinned in its owner.
5. **Fidelity** — no task prescribes weaker behavior than the spec's: a failure the spec makes visible is never swallowed or relabeled, a decision the spec closed is never reopened.

The task writer runs the same checks on its files before returning (`./agents/task-writer.md`). Read `./references/self-review-checklist.md` for the detail of each check and the ones specific to PRDs, mockups and global constraints. Then validate mechanically — `validate-tasks.cjs` checks the index format, task-file existence, required headers, FR traceability, the spec's AC/INV and migration trace (`specTrace`) and task-step scope, failing the plan here instead of mid-run; it reports the `## Foco de Revisão` shape (present, ≤5, owners exist and pinned by a test) and `forwardReferences` (a task importing what a later task creates) as warnings — each goes back to the writer.

> **This is ONE call — build the form that fits your plan, then run it once.** The two snippets below are alternatives, not a sequence: the fuller form already reports everything the barer one does.
>
> Spec-only plan, no PRD and no mockups:
> ```bash
> node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs \
>   --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md
> ```
> With a PRD add `--prd` (physical path, or `prd.embeddedIn` from `find-feature-files.cjs`) — never unconditionally, since a `--prd` path that does not resolve is itself an error (`Could not read PRD at ...`), not a silent skip; with `mockups.found` add `--mockups`:
> ```bash
> node <super.writing-plans-base-dir>/scripts/validate-tasks.cjs \
>   --tasks-index docs/superpowers/<feature-name>/plans/tasks-<feature-name>.md \
>   --prd docs/superpowers/<feature-name>/prd/prd-<feature-name>.md \
>   --mockups docs/superpowers/<feature-name>/specs/mockups \
>   --repo-root .
> ```
> **Always pass `--repo-root`** against an existing codebase: `reach` finds importers no task owns and the repo's runner inventory — state `reach.testSuites` as the plan's command set, since the full-suite checkpoint is only as wide as the commands it was given. Fix any `errors`; `warnings` are advisory. If the script cannot be found, report that the validator could not run.

That validation is the plan's review. No further reviewer is dispatched here: the deep, code-aware review of spec and tasks is option 0 of the handoff below (`super.reviewing-specs`), chosen by the user because it costs credits.

## Execution Handoff

After saving the index and task files, follow `./references/execution-handoff-message.md` — for every plan this skill writes, however small; no plan continues into implementation from here. It tags option 1 `(recommended)`, lists option 3 when `parse-plan.cjs` (run at self-review) says `singleImplementer.eligible`, and opens the one gate between planning and execution: the user reads the plan and picks deep review (`super.reviewing-specs`), subagent-driven execution or the single implementer, with the `/<skill> <tasks-index>` resume line rendered under the options. The question is the last call of the turn; execution starts only from the answer, and once answered the feature runs to the end of its final stage.

# Entry Phase

`./references/entry-phase.md` is the procedure (research fan-out, then the task-writer dispatch); `./references/research-subagent-prompt.md` is the prompt each research track gets; `./agents/task-writer.md` is the writer's contract and `./references/required-task-step-pattern.md` the step shape it follows. Three rules stay here because a resume still needs them:

**Await the research subagents — never poll for them.** The harness re-invokes you as each returns; do **not** `sleep` or schedule a wakeup/timer to check on them — busy-polling harness-tracked work is wasted.

**Never dispatch _parallel_ task writers.** Task N+1 may import what task N creates, and a writer seeing one task alone cannot know the signatures the others produce. One sequential writer subagent — never parallel, never the main thread (one narrow inline exception in the reference: a decomposition of at most four tasks, whose files the controller writes itself — still without running the runner, typecheck or build).

**No follow-up codebase reads in the main thread** once research returns — a gap means the research contract was under-filled; dispatch a focused follow-up subagent instead.
