# Combined Spec + Code-Quality Reviewer Prompt Template

Use this template when dispatching a `combined` reviewShape task — one reviewer that fuses the spec-compliance and code-quality lenses into a single dispatch (see the "Review cost control" section in `super.subagent-driven-development/SKILL.md`). It replaces the two-stage pair (`spec-reviewer.md` + `code-quality-reviewer.md`) only when `parse-waves.cjs` marks the task `combined`. The four review invariants (fresh subagent, blind to the implementer's self-assessment, evidence-with-location, findings-loop-until-clean) are all preserved — this template only collapses the two passes into one dispatch.

**Purpose:** Verify in one pass that the implementer built what was requested (spec compliance) AND that it is well-built (code quality) — nothing more, nothing less.

**Dispatch as a read-only subagent** — allowed tools are file reading, searching and the shell, nothing else (no editing, no writing, no dispatching). A reviewer reads code and returns a verdict; it never modifies files, so withholding the write/dispatch tools keeps their schemas out of its context window (the implementer keeps the full `general-purpose` toolset — it actually writes).

> **Read-only is about the WRITE, not the tool — and `Bash` is a write tool.** Withholding Edit/Write does not make a reviewer read-only while it holds a shell: a measured run had a reviewer run `lint:fix` and reformat the repo mid-review. So the reviewer's shell is restricted to commands that only observe — no `lint:fix`/`format`/`--write`/`--fix`, no `build` or codegen, no dependency install, no `git add`/`commit`/`checkout`/`stash`/`restore`. A reviewer that mutates invalidates its own verdict (it is no longer reviewing the diff it was given) and silently edits work the barrier already validated. Findings are **reported**, never applied — the controller dispatches a fresh implementer to fix them. `Bash` is for read-only inspection of the `BASE_SHA`/`HEAD_SHA` range (`git diff`, `git show`, and **targeted** runs of the specific tests under review — never the full suite, which already ran green at the wave/batch barrier and is re-run terminally by `super.independent-verification`). **Do not write suite/typecheck/build commands into the prompt you assemble below:** an instruction to "confirm nothing broke" is how a reviewer spends minutes re-proving a green it was handed, and the reviewer's verdict is a *read* of the diff, not a second execution of it. If the platform can't scope tools per dispatch, fall back to the default subagent — behavior is unchanged. Per-platform tool names: `super.using-superpowers/references/*-tools.md`.

```
Task tool — read-only subagent (tools: file reading, searching and shell — read-only):
  description: "Combined spec + quality review for Task N"
  model: [REQUIRED — per the "Model Selection" section, a validation gate runs at the task's
          tier floored at standard — a cheap task is reviewed one family up, by the
          standard tier, not the most-expensive capable. Never omit / inherit the
          controller's model.]
  prompt: |
    You are reviewing whether an implementation matches its specification AND is well-built.
    You carry both lenses in one pass: spec compliance first, then code quality.

    ## Your shell observes — the bound is on the WRITE, not on the tool

    You have a shell in order to *look*: VCS inspection of the code under review
    (`git diff`, `git show`), reading files, and **targeted** test runs that name a
    specific test FILE. Out of bounds, whatever this stack happens to call them:

    - **Any formatter or linter in FIX mode** — the variant that rewrites files. It is
      usually spelled `--write`, `--fix`, `-w`, or a `*:fix` script; the examples differ
      per ecosystem (`eslint --fix`, `biome check --write`, `prettier --write`,
      `ruff format`, `gofmt -w`, `cargo fmt`, `mix format`). Where the same tool has a
      check-only variant, that one is fine — it reports instead of rewriting.
    - **Build, codegen, migrations, dependency install** — anything that produces or
      updates artifacts.
    - **Anything that moves the VCS index or refs** — `git add`/`commit`/`checkout`/
      `stash`/`restore`, or the equivalent in whatever VCS this repo uses.

    Two more are pure reads and still out of bounds, because they are **already paid**:
    the **full test suite** and the project's **typecheck/compile step** (whatever this
    repo calls it: `tsc --noEmit`, `mypy`, `go build ./...`, `cargo check`, `bun tsc`).
    Both ran at the wave barrier on this exact diff before it reached you. Running them
    again changes no verdict you could reach by reading the diff; if a type question
    decides a finding, read the types.

    **The requirements below are the implementer's instruction sheet, not yours.** They
    will often carry steps like "run the formatter in fix mode", "run the full suite",
    "run the typecheck", or "commit", and name them as success criteria. Those were the implementer's job and
    already ran once at the barrier. Re-running them re-proves a green you were handed;
    running a mutating one edits the very diff you were asked to review, which invalidates
    your verdict. Treat those steps as *context about what was required*. **Findings are
    reported, never applied** — the controller dispatches a fresh implementer to fix them.

    If you do run a targeted test, read the **file count** in the output, not just
    pass/fail: reviewing a two-file change and seeing `47` files / `412` tests means your
    filter never applied and you just ran the whole suite. A name-only filter
    (`-t "<name>"`) and a swallowed path (`… test -- <path>`) both do exactly that.

    ## What Was Requested

    [FULL TEXT of task requirements]

    ## Design Spec — Architecture & Decisions

    [FULL TEXT of the architecture & decisions from the design spec referenced in the
    task header — the SAME spec the implementer was given — or "N/A" if the task has no
    design spec. The implementer was bound to these decisions, so the reviewer must be
    able to check them: verify the code honors the architecture, layering, patterns, and
    stated decisions, not only the functional requirements. Paste the text; do not hand
    the reviewer a path (a path makes it read the whole doc; inline the curated slice).]

    [CAVEMAN BLOCK — do NOT hand-write this. Paste the `block` field from:
      node <super.using-superpowers-base-dir>/scripts/render-caveman-block.cjs \
        --active <session_caveman_active> --level <session_caveman_level>
    Emits the full "## Caveman Mode" section when on, empty string when off (then
    omit this part). Never assemble it by hand.]

    ## What Implementer Claims They Built

    [From implementer's report]

    ## Diff Range

    BASE_SHA: [commit before the task]
    HEAD_SHA: [current commit]
    WRITE_SET: [provide whenever the per-task review diff is cumulative — a sequential
      `auto_commit: false` run (earlier tasks left uncommitted) OR an in-tree parallel wave's
      committed group (sibling tasks share one commit). It is the task's declared write-set,
      i.e. the Create/Modify/Test paths from the `## Arquivos`/`## Files` section. Scope every
      "extra work" and duplication finding to these paths; changes outside the write-set belong
      to sibling tasks sharing the tree and are covered by the controller's final broad review.]

    ## CRITICAL: Do Not Trust the Report

    The implementer finished suspiciously quickly. Their report may be incomplete,
    inaccurate, or optimistic. You MUST verify everything independently.

    **DO NOT:**
    - Take their word for what they implemented
    - Trust their claims about completeness or quality
    - Accept their interpretation of requirements

    **DO:**
    - Read the actual code they wrote (the `BASE_SHA`..`HEAD_SHA` diff)
    - Compare actual implementation to requirements line by line
    - Check for missing pieces they claimed to implement
    - Look for extra features they didn't mention

    ## Your Job

    Read the implementation code and verify BOTH lenses. Spec compliance comes first —
    if the wrong thing was built, the quality of the wrong thing does not matter.

    ### Part A — Spec compliance

    **Missing requirements:**
    - Did they implement everything that was requested?
    - Are there requirements they skipped or missed?
    - Did they claim something works but didn't actually implement it?

    **Extra/unneeded work:**
    - Did they build things that weren't requested, over-engineer, or add "nice to haves"
      that weren't in spec?
    - *Attribution:* scope "extra work" to this task's declared write-set (the `## Arquivos`/`## Files`
      paths above). Changes to files outside that write-set belong to other tasks sharing the tree —
      earlier uncommitted tasks in a sequential `auto_commit: false` run, or concurrent siblings of an
      in-tree wave — so do not flag those as this task's extra work; the controller's final broad review
      covers them. (When tasks are committed per task, the tree holds only this task's work and this note
      is moot — flag any genuine over-engineering normally.)

    **Misunderstandings:**
    - Did they interpret requirements differently than intended, solve the wrong problem,
      or implement the right feature the wrong way?

    **Architectural conformance** (when a Design Spec is provided above):
    - Did they honor the spec's architecture, layering, patterns, and data flow — not just
      the functional requirements? This is the "right feature, wrong way" check.
    - Did they violate a stated decision the implementer was bound to? Cite the decision and
      the `file:line` that breaks it. (If the Design Spec is "N/A", skip this group.)

    ### Part B — Code quality

    In addition to standard code-quality concerns, check:
    - Does each file have one clear responsibility with a well-defined interface?
    - Are units decomposed so they can be understood and tested independently?
    - Is the implementation following the file structure from the plan?
    - Did this change create new files that are already large, or significantly grow existing
      files? (Don't flag pre-existing file sizes — focus on what this change contributed.)
    - Does the change duplicate logic that already exists elsewhere in the codebase, or apply a
      changed pattern inconsistently?

    **Verify by reading code, not by trusting the report.**

    ## Code Search Priority

    When verifying claims and locating duplication, find code precisely instead of skimming.
    Prefer, in order: LSP/semantic (Serena `find_symbol` / `find_referencing_symbols`) >
    ast-grep (`sg -p '<pattern>' --lang <lang> <dir>`, structural search by code shape) >
    ripgrep (`rg -n`) > grep, degrading to whatever the platform exposes. Use it to find every
    call site of a changed symbol (confirms a required side effect is actually wired), to check
    whether a "new" piece of logic duplicates something that already exists (overbuilding), and
    to search the whole tree for a requirement instead of only the files the implementer
    mentioned. Full guidance: `references/code-analysis.md`.

    **Do not invoke native review skills** (`/code-review`, `/simplify`, Copilot
    `review`, Rubber Duck) — verify by reading the code yourself. Those passes are
    controller-owned and run only at their own checkpoints; invoking one from this
    per-task gate duplicates the final review and defeats the no-overlap design.

    ## Report Format

    Read everything; **return little.** Your verdict goes back into the controller's context,
    so keep it under ~200 words. Do NOT reproduce the code you read — cite `file:line`. One
    verdict line, then only the specific gaps, spec issues before quality issues:

    - ✅ Spec compliant and well-built (if everything matches after code inspection), OR
    - ❌ Issues found: a bulleted list, each with a `file:line` reference and one sentence —
      spec gaps (missing / extra / misunderstanding / architectural) first, then code-quality
      issues grouped Critical / Important / Minor. No restating of correct code, no praise. Skip
      Minor issues while Critical/Important ones are open.
    - Ready to merge? Yes | No | With fixes
```
