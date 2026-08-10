# Entry and Integration — super.parallel-subagent-in-tree

Entry-only material: read once, while deciding whether this skill is the right execution
mechanism and which other skills it composes with. None of it is needed mid-execution, which
is why it lives here instead of in `SKILL.md` — see the pointer in the skill's header.

## When to Use

**Tier guard (election-time).** This skill — per-task subagent dispatch in-tree — is a **Large/Complex** execution mechanism. At election, **Small/Medium** features route to inline execution + combined gate (`super.using-superpowers/references/medium-inline-path.md`) instead of here.

This whole file is the election phase — *whether to enter* the skill, never a runtime escape hatch. Once the user has invoked `super.parallel-subagent-in-tree`, the plan is executed **with that skill**, including a sequential/single-task plan (Step 4's single-task branch, one dispatched subagent per task).

Decision flow:
- Tasks index with Execution Waves? → no / old plan: `super.subagent-driven-development`.
- Any wave with 2+ tasks? → no (fully sequential): `super.subagent-driven-development`.
- Worktree isolation cheap & available? → yes: `super.parallel-subagent-development`.
- Wave write-sets verified disjoint? → yes: `super.parallel-subagent-in-tree`. → no: run that wave sequentially via `super.subagent-driven-development`.

Why over worktrees: in a pnpm/npm/yarn **workspace monorepo** each worktree is a separate dir that doesn't inherit `node_modules` (workspace symlinks don't cross worktrees, so each needs its own install); when that cost — or a sandbox forbidding checkouts, or an N-way merge — outweighs the parallel work saved, stay in-tree. In-tree cannot parallelize a wave whose tasks must mutate shared files — use worktrees for those.

If `parse-waves.cjs` reports `parallelizable: false`, this skill offers no speedup over `super.subagent-driven-development` (per-task gates are identical). You may *note* that once, but still execute here, one implementer subagent per task (a fully-sequential plan is just single-task waves, Step 4).

## Integration

**Required workflow skills:** the shared finish-gate set (`super.writing-plans`,
`super.requesting-code-review`, `super.systematic-debugging`, `super.independent-verification`,
`super.user-story-verification`, `super.finishing-a-development-branch`) is documented once in
**`super.subagent-driven-development/references/finish-tail.md`** ("Required workflow skills"
section) — that file is the single source, do not re-list them here. Mode-specific additions
for this skill:
- **super.subagent-driven-development** — the per-task implementer/spec-reviewer/code-quality-reviewer templates, model-selection policy, and per-task quality contract this skill reuses (note: `super.writing-plans` also produces this skill's `## Arquivos` write-set data consumed by the disjointness gate)

**Shared engine:**
- **super.parallel-subagent-development/scripts/parse-waves.cjs** — single source of truth for wave derivation and `waveKinds` (read, not duplicated)

**Subagents should use:**
- **super.test-driven-development** — implementers follow TDD per task

**Alternatives:**
- **super.parallel-subagent-development** — parallel, one git worktree per task; use when wave tasks mutate shared files or full isolation is wanted
- **super.subagent-driven-development** — sequential, single-workspace; for fully sequential plans
