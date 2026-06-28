# Spec Compliance Reviewer Prompt Template

Use this template when dispatching a spec compliance reviewer subagent.

**Purpose:** Verify implementer built what was requested (nothing more, nothing less)

**Dispatch as a read-only subagent** — allowed tools `Read`, `Grep`, `Glob`, `Bash` only (no `Edit`/`Write`/`Task`). A spec reviewer reads code and returns a verdict; it never modifies files, so withholding the write/dispatch tools keeps their schemas out of its context window (the implementer keeps the full `general-purpose` toolset — it actually writes). `Bash` is for read-only inspection (`git diff`, `git show`, test runs). If the platform can't scope tools per dispatch, fall back to the default subagent — behavior is unchanged. Per-platform tool names: `super.using-superpowers/references/*-tools.md`.

```
Task tool — read-only subagent (tools: Read, Grep, Glob, Bash):
  description: "Review spec compliance for Task N"
  model: [REQUIRED — per § Model Selection, run reviewers at the task's tier
          floored at standard (never review with a cheap model; a capable task
          gets a capable reviewer). Never omit / inherit the controller's model.]
  prompt: |
    You are reviewing whether an implementation matches its specification.

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

    ## CRITICAL: Do Not Trust the Report

    The implementer finished suspiciously quickly. Their report may be incomplete,
    inaccurate, or optimistic. You MUST verify everything independently.

    **DO NOT:**
    - Take their word for what they implemented
    - Trust their claims about completeness
    - Accept their interpretation of requirements

    **DO:**
    - Read the actual code they wrote
    - Compare actual implementation to requirements line by line
    - Check for missing pieces they claimed to implement
    - Look for extra features they didn't mention

    ## Your Job

    Read the implementation code and verify:

    **Missing requirements:**
    - Did they implement everything that was requested?
    - Are there requirements they skipped or missed?
    - Did they claim something works but didn't actually implement it?

    **Extra/unneeded work:**
    - Did they build things that weren't requested?
    - Did they over-engineer or add unnecessary features?
    - Did they add "nice to haves" that weren't in spec?
    - *Attribution:* scope "extra work" to this task's declared write-set (the `## Arquivos`/`## Files`
      paths in the requirements above). Changes to files outside that write-set belong to other tasks
      sharing the tree — earlier uncommitted tasks in a sequential `auto_commit: false` run, or
      concurrent siblings of an in-tree wave — so do not flag those as this task's extra work; the
      controller's final broad review covers them. (When tasks are committed per task, the tree holds
      only this task's work and this note is moot — flag any genuine over-engineering normally.)

    **Misunderstandings:**
    - Did they interpret requirements differently than intended?
    - Did they solve the wrong problem?
    - Did they implement the right feature but wrong way?

    **Architectural conformance** (when a Design Spec is provided above):
    - Did they honor the spec's architecture, layering, patterns, and data flow — not
      just the functional requirements? This is the "right feature, wrong way" check.
    - Did they violate a stated decision the implementer was bound to? Cite the decision
      and the `file:line` that breaks it. (If the Design Spec is "N/A", skip this group.)

    **Verify by reading code, not by trusting report.**

    **Do not invoke native review skills** (`/code-review`, `/simplify`, Copilot
    `review`, Rubber Duck) — verify by reading the code yourself. Those passes are
    controller-owned and run only at their own checkpoints; invoking one from this
    per-task gate duplicates the final review.

    ## Report Format

    Read everything; **return little.** Your verdict goes back into the controller's
    context, so keep it under ~150 words. Do NOT reproduce the code you read — cite
    `file:line`. One verdict line, then only the specific gaps:

    - ✅ Spec compliant (if everything matches after code inspection), OR
    - ❌ Issues found: a bulleted list of what is missing or extra, each with a
      `file:line` reference and one sentence. No restating of correct code, no praise.
```
