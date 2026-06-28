# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**

**Dispatch as a read-only subagent** — allowed tools `Read`, `Grep`, `Glob`, `Bash` only (no `Edit`/`Write`/`Task`). A code quality reviewer re-reads the diff and returns a verdict; it never modifies files, so withholding the write/dispatch tools keeps their schemas out of its context window (the implementer keeps the full `general-purpose` toolset — it actually writes). `Bash` is required here for read-only git inspection of `BASE_SHA`/`HEAD_SHA` (`git diff`, `git show`). If the platform can't scope tools per dispatch, fall back to the default subagent — behavior is unchanged. Per-platform tool names: `super.using-superpowers/references/*-tools.md`.

```
Task tool — read-only subagent (tools: Read, Grep, Glob, Bash):
  model: [REQUIRED — per § Model Selection, run reviewers at the task's tier
          floored at standard (never review with a cheap model; a capable task
          gets a capable reviewer). Never omit / inherit the controller's model.]
  Use template at super.requesting-code-review/agents/code-reviewer.md

  DESCRIPTION: [task summary, from implementer's report]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]
  WRITE_SET: [provide whenever the per-task review diff is cumulative — a sequential `auto_commit: false` run (earlier tasks left uncommitted) OR an in-tree parallel wave committed as a group (sibling tasks share one commit). The task's declared write-set, i.e. the Create/Modify/Test paths from its `## Arquivos`/`## Files` section (you already have the task file open to dispatch the implementer). Lets the reviewer attribute findings to this task in a cumulative working tree. Omit only when the task is committed on its own (per-task commit — the diff is already isolated).]
  CAVEMAN: [paste the `block` field from `render-caveman-block.cjs --active <session_caveman_active> --level <session_caveman_level> --format field` — the bare directive when on, empty when off (then omit). Do NOT hand-write it. Resolve the script via <super.using-superpowers-base-dir>/scripts/.]
```

**Do not invoke native review skills** (`/code-review`, `/simplify`, Copilot `review`, Rubber Duck) from this gate — review the diff yourself by reading it. Those native passes are controller-owned and run only at their own checkpoints (`/simplify` during execution, the rest at the final review); invoking one here duplicates the final pass and defeats the no-overlap design.

**In addition to standard code quality concerns, the reviewer should check:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Is the implementation following the file structure from the plan?
- Did this implementation create new files that are already large, or significantly grow existing files? (Don't flag pre-existing file sizes — focus on what this change contributed.)

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment

**Keep the return concise (~200 words).** Re-read the diff in full, but report back only what the controller must act on: each issue as one bullet with a `file:line` reference and the fix, grouped by severity, plus a one-line assessment (Ready to merge? Yes | No | With fixes). Do not paste the code under review or list every file you inspected — the controller has the diff. Skip Minor issues when there are open Critical/Important ones.
