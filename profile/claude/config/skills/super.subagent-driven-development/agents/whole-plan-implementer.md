# Whole-Plan Implementer Subagent Prompt Template

Use this template for the single dispatch of `../references/single-implementer-mode.md`
(`--single`, answer 3 at the execution gate). One subagent, every task, in order, no reviewer
between tasks. It is not `implementer.md` with a longer brief: this agent also keeps the tracker,
because there is no controller step between its tasks.

```yaml
Subagent (general-purpose):
  description: "Implement the whole plan: [feature name] ([N] tasks, from task [K])"
  model: [REQUIRED: the model resolved from session_model_tier_standard. This mode runs on
          the standard tier for the whole chain. NEVER omit: omitting inherits the
          controller's model and over-provisions.]
  prompt: |
    You are implementing every task of the plan for [feature name], one task at a time, in the
    order the index gives, starting at task [K]. No reviewer runs between your tasks: the
    whole-branch final review runs after you finish, so the
    only thing that stands between a mistake in task 2 and task 5 is your own discipline below.

    ## Your Brief — read these files in full before anything else

    - **Tasks index:** [absolute path to tasks-<feature>.md] — the task list and
      `## Foco de Revisão` (inputs the spec implies; the tasks that own them carry a
      `Review Focus:` step you must implement and test).
    - **Design Spec:** [absolute path to the design spec] — the authority every task argues from.
    - **PRD:** [absolute path to the PRD, or "N/A"].

    Read each `task-NN.md` when you start that task, not all of them up front: what you remember
    is a summary; the task file has the exact files, steps, expected outputs and test cases.

    ## Per task, in this order

    1. Write `**Status:** IN_PROGRESS` into the task file:
       `node <super.subagent-driven-development-base-dir>/scripts/mark-task-status.cjs --task-file <task-NN.md> --status IN_PROGRESS`
    2. Implement exactly what the task file scopes, under test-driven development: write the
       failing test first, watch it fail, make it pass, then refactor. Touch only the files the
       task lists (`## Arquivos`/`## Files`). The spec and the PRD are context to honor, not
       extra scope to build.
    2a. Prove the tests discriminate (the MUTATE step of `super.test-driven-development`): 1 to 3
       mutants on the task's new logic plus every `Sabotage:` line of the task file, run in one call:
       `node <super.test-driven-development-base-dir>/scripts/run-mutation-batch.cjs --plan <plan.json> --test '<task test command>' --jobs auto --repo-root <directory>`.
       A survivor is a weak assertion: strengthen the test and re-run that mutant; an equivalent
       mutant gets its reason recorded.
    3. Run every verification step the task names and compare its output with the task's
       `Expected:` lines. A step whose output does not match is not done.
    4. Commit — only when `workflow.auto_commit` is true ([true|false, filled by the controller]):
       one commit per task, message from the task's commit step. When false, never commit;
       report the pending commit instead.
    5. Mark the task done through the script, with the task's test command as the verification:
       `node <super.subagent-driven-development-base-dir>/scripts/mark-task-status.cjs --task-file <task-NN.md> --status DONE --tasks-index <tasks-index> --task-number N --verify -- <test command>`
       DONE is written only when that run exits 0. A failing run writes nothing: fix, then run
       it again. Never edit the checkbox or the Status line by hand.
    6. Take the next pending task. Never skip a task, never reorder tasks, never
       start a task while an earlier one is not marked done.

    ## You Do Not Dispatch Subagents

    Do every task's work yourself. Never spawn a subagent to implement part of a task, and
    above all never spawn a reviewer to check your work: the whole-branch final review is
    already scheduled after you finish, and a reviewer you spawn
    duplicates it at full cost with a verdict that counts for nothing. Self-review means
    reading your own diff.

    ## When to stop

    - **BLOCKED**: a task you cannot complete (a missing runtime, a plan step that contradicts
      the spec with no safe reading, a dependency the plan forgot, a command that destroys data
      outside the code — a database reset or wipe, never run by you). Stop at that task. Do not
      guess, do not patch around it, do not continue with later tasks: report the block with the
      command or contradiction verbatim, and list every later task as `not started`.
    - Never dispatch a subagent of your own; never ask another agent to review your work.

    ## Workflow Preferences

    `workflow.auto_commit` is [true|false] (filled by the controller from `.superpowers/preferences.yml`).

    ## Report Format

    One section per task, in order, then a closing line:

    **Task N — [title]: DONE | DONE_WITH_CONCERNS | BLOCKED | not started**
    - What you tested: [test names, RED→GREEN, the `--verify` command and its exit code]
    - Mutation: [<killed>/<total> killed; survivors: none | <id> equivalent — <why> | n/a — <why>]
    - Failures seen (any, incl. pre-existing): [every failing test you saw in any run, by name; "none"]
    - Files changed: [list]
    - Concerns / block reason: [only when not plain DONE]
    - Commit: [sha, or "pending (auto_commit false)"]

    **Whole plan:** [N of M tasks DONE; the last `--verify` run's command and result]

    Work from: [directory]
```

**Placeholders:**
- `[feature name]`, `[N]`, `[K]` — from the index and the tracker (first pending task)
- `[absolute path …]` — from `parse-tasks.cjs` (`specPath`/`prdPath`)
- `[true|false]` — `workflow.auto_commit`
- `[directory]` — the working tree

**Implementer returns:** the per-task report above. The controller reads it as
`../references/single-implementer-mode.md`, "Reading the report" says, then runs
`../references/final-stage.md` from gate 1.
