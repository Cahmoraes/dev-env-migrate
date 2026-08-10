# Red flags — the reasoning, and what to DO when one fires

The SKILL.md keeps the prohibitions themselves: a short, complete list you can check against
without leaving the file. This file keeps two things that are not prohibitions — the
*reasoning* behind the non-obvious ones, and the *procedures* for the three situations that
need an action rather than an avoidance.

## Why the non-obvious prohibitions exist

**Ad-hoc parallel implementers in this shared workspace.** Parallelism is not forbidden in
the flow — it is forbidden *here, unguarded*. Two implementers writing the same tree with no
disjointness proof corrupt each other silently. To run a wave's independent tasks
concurrently, use a skill built for it: `super.parallel-subagent-development` (one isolated
worktree per task) or `super.parallel-subagent-in-tree` (shared tree, but only after a
deterministic write-set disjointness check + write-only/no-commit implementers + a serialized
integration barrier). This skill stays strictly sequential.

**Making the subagent read the plan file.** A subagent that reads the plan spends its context
on tasks that are not its own and picks up sibling tasks' details as if they were its scope.
Paste the full text of *its* task instead.

**Implementer self-review replacing review.** Both are needed and they are different lenses:
self-review catches what the author knows to look for, external review catches what the
author could not see. The author is the worst-placed agent to judge their own completeness.

**Quality review before spec compliance is ✅.** Wrong order, and expensively so: if the wrong
thing was built, every quality finding is about code that should not exist.

**Skipping the scene-setting context in a dispatch.** The subagent starts blind. Without where
this task sits in the plan, what already exists and what depends on it, it optimises for its own
file and re-derives conventions the codebase already settled — which reads as a quality finding
later, at review cost, instead of a sentence now.

**Accepting "close enough" on spec compliance.** The spec reviewer finding issues *is* the task
not being done. "Close enough" is the orchestrator overruling a verdict it dispatched precisely
because it should not be the one judging — and it is the judgment made under deadline pressure
by the party that benefits from moving on.

**Marking a task `[x]` before `super.verification-before-completion` confirms evidence.**
Reviews passing is necessary but not sufficient — reviewers read code, they do not run it.

**Skipping the tracker update.** The physical edits to `tasks-<feature-name>.md` (`[ ]` →
`[x]`) and `task-NN.md` (`Status:` → `DONE`) are the authoritative audit record, and
`super.finishing-a-development-branch` reads the index directly. A session task-list entry or
knowing mentally does not count and does not survive a compaction.

**The QA gate's asymmetry.** With `session_qa_gate_enabled: true` and a PRD present, always
present the consent question first: skipping after the user explicitly declines is valid,
skipping silently is not. When the preference is `false`, silent skip IS the correct
behaviour — `workflow.qa_gate` already decided, and QA is not mentioned at all.

## Procedures — what to do, not what to avoid

**If a subagent asks questions:** answer clearly and completely, provide additional context if
needed, and do not rush them into implementation. A question before writing is far cheaper
than a wrong implementation plus a review loop.

**If a reviewer finds issues:** re-dispatch the implementer with the reviewer's verdict pasted
into its `## Review Findings to Address` section — every finding with its `file:line` — so it
knows exactly what to fix rather than re-deriving it. Reuse the same implementer subagent
while it is still active (it holds the code in context); the *final* review loop, whose
per-task subagents have already returned, uses a fresh implementer instead. The reviewer then
reviews again; repeat until approved, capped at ~3 non-converging rounds, then escalate per
"Handling Implementer Status". Never skip the re-review — an unverified fix is a claim.

**If a subagent fails its task:** dispatch a fix subagent with specific instructions. Do not
fix it manually: that pollutes your context with implementation detail and silently skips the
per-task gates, which all assume a dispatched subagent produced the code.
