---
name: super.verification-before-completion
description: Before claiming work is complete, fixed or passing — run the verification command and cite its output.
user-invocable: false
---

# Verification Before Completion

Claim only what a command's output showed you this turn. **Core principle: evidence before claims.** Before saying "passes", "fixed" or "done", before committing or opening a PR: identify the command that proves the claim, run it, read the full output and the exit code, then state the claim with that evidence — or the actual status when the output disagrees. "Should work", "probably passes", "seems fixed", or moving to the next task, is the moment to run it.

This is the author's own self-check, in-session. Proving that a test discriminates (mutation testing) is the MUTATE step of `super.test-driven-development`, run per task; this check proves the claim at hand, nothing more.

## Unavailable Verification Command

When the configured verification command cannot start because its executable, SDK or runtime is missing — including shell exit 126 or 127 — the gate result is `NOT_RUN` and the work status is `BLOCKED`. Preserve the first definitive failure as evidence and do not retry equivalent commands until the environment changes. Static review or static inspection may identify likely defects, but it never substitutes for executable verification and cannot unlock a completion claim, commit, tracker `DONE` state, or the next task. Report the missing capability and the exact command that remains to be run.

## Scope: per-task = affected tests, not the whole suite

"Fresh, complete" means the command runs in full and unfaked — it does **not** mean re-running the entire suite on every task. For a **per-task** check, the required evidence is the tests **affected by the task** (the file/module the task touched, plus what imports it) at exit 0. Re-running the whole suite once per task is redundant re-execution, not extra rigor: the complete suite runs once per batch as a safety net (owned by `super.subagent-driven-development`), and the authoritative terminal full run is the green-suite precondition of `super.finishing-a-development-branch`. The "evidence before claims" principle is unchanged — only the *scope* of what a per-task claim must run is narrowed to what the task can affect. When a change is genuinely cross-cutting (shared util, config, build) so "affected" is effectively the whole suite, run the whole suite.

**Confirm the scoping actually applied — read the file count, not just the exit code.** A scoped command that silently loses its filter reports *everything green* and costs a full suite, so it reads as rigor while being the redundancy this section exists to prevent. Monorepo runners are the usual culprit: an extra `--` (`pnpm --filter <ws> test -- <path>`) or a path written from the repo root instead of the workspace can leave the runner with no usable filter, and a name filter with no file argument (`vitest run -t "<name>"`) still collects every file. If you named two test files and the output says 132, the filter did not apply — fix the command before treating the run as per-task evidence.

## What each claim needs

| Claim | Evidence | Not sufficient |
|-------|----------|----------------|
| Tests pass | test command output: 0 failures | a previous run, "should pass" |
| Linter clean / build succeeds | that tool's own output, exit 0 | one standing in for the other |
| Bug fixed | the original symptom's test passes — and fails again with the fix reverted | code changed, assumed fixed |
| Agent completed | VCS diff shows the changes | the agent's report of success |
| Requirements met | line-by-line checklist against the plan | tests passing |
