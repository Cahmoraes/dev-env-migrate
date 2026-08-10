# Entry and Integration — super.parallel-subagent-development

Entry-only material: read once, while deciding whether this skill is the right execution
mechanism and which other skills it composes with. None of it is needed mid-execution, which
is why it lives here instead of in `SKILL.md` — see the pointer in the skill's header.

## When Use

**Tier guard (election-time).** This skill — parallel per-task fan-out across worktrees — is a **Large/Complex** execution mechanism. For **Small/Medium** features the router routes to inline execution + combined gate (`super.using-superpowers/references/medium-inline-path.md`) instead of here: don't parallelize per-task dispatch for a feature small enough to write inline. This gate applies at election, before entering the skill; once deliberately invoked, follow the mechanism in `SKILL.md` unchanged.

```
tasks index Execution Waves?
├─ no (no waves / old plan) → super.subagent-driven-development
└─ yes → Any wave 2+ tasks?
   ├─ no (fully sequential) → super.subagent-driven-development
   └─ yes (parallelizable) → Stay in session?
      └─ yes → super.parallel-subagent-development
```

If `parse-waves.cjs` reports `parallelizable: false`, tell the user the plan has no parallelism to exploit and recommend `super.subagent-driven-development` (fully sequential work here adds worktree overhead for no speedup). Proceed only if the user still wants to.

## Integration

**Required workflow skills:** the shared finish-gate set (`super.writing-plans`,
`super.requesting-code-review`, `super.systematic-debugging`, `super.independent-verification`,
`super.user-story-verification`, `super.finishing-a-development-branch`) is documented once in
**`super.subagent-driven-development/references/finish-tail.md`** ("Required workflow skills"
section) — that file is the single source, do not re-list them here. Mode-specific additions
for this skill:
- **super.using-git-worktrees** — creates the isolated workspace for each parallel task (once per parallel-wave task)
- **super.subagent-driven-development** — supplies the per-task implementer/spec-reviewer/code-quality-reviewer/combined-reviewer prompt templates and the per-task quality contract (including the `reviewShape` scaling) this skill reuses

**Subagents should use:**
- **super.test-driven-development** — implementers follow TDD for each task

**Alternatives:**
- **super.subagent-driven-development** — sequential, single-workspace; for fully sequential plans or when worktrees are unavailable
