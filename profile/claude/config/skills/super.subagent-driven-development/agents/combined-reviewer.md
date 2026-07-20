# Combined Spec + Code-Quality Reviewer Prompt Template

Use this template when dispatching a `combined` reviewShape task — one reviewer that fuses the spec-compliance and code-quality lenses into a single dispatch (see the "Review cost control" section in `super.subagent-driven-development/SKILL.md`). It replaces the two-stage pair (`spec-reviewer.md` + `code-quality-reviewer.md`) only when `parse-waves.cjs` marks the task `combined`. The four review invariants (fresh subagent, blind to the implementer's self-assessment, evidence-with-location, findings-loop-until-clean) are all preserved — this template only collapses the two passes into one dispatch.

**Purpose:** Verify in one pass that the implementer built what was requested (spec compliance) AND that it is well-built (code quality) — nothing more, nothing less.

**Dispatch as a read-only subagent** — allowed tools `Read`, `Grep`, `Glob`, `Bash` only (no `Edit`/`Write`/`Task`). A reviewer reads code and returns a verdict; it never modifies files, so withholding the write/dispatch tools keeps their schemas out of its context window (the implementer keeps the full `general-purpose` toolset — it actually writes). `Bash` is for read-only inspection of the `BASE_SHA`/`HEAD_SHA` range (`git diff`, `git show`, test runs). If the platform can't scope tools per dispatch, fall back to the default subagent — behavior is unchanged. Per-platform tool names: `super.using-superpowers/references/*-tools.md`.

```
Task tool — read-only subagent (tools: Read, Grep, Glob, Bash):
  description: "Combined spec + quality review for Task N"
  model: [REQUIRED — per the "Model Selection" section, a validation gate runs at the task's
          tier floored at standard — a cheap task is reviewed one family up, by the
          standard tier, not the most-expensive capable. Never omit / inherit the
          controller's model.]
  prompt: |
    You are reviewing whether an implementation matches its specification AND is well-built.
    You carry both lenses in one pass: spec compliance first, then code quality.

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
