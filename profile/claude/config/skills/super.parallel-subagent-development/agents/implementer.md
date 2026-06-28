# Parallel Implementer Scoping Block

Append this block to the standard `super.subagent-driven-development/agents/implementer.md` when dispatching an implementer for a task in a **parallel wave**. It pins the subagent to a single isolated worktree so concurrent implementers cannot collide. Fill the placeholders before dispatching.

---

## Worktree Scope (parallel execution)

You are one of several implementers running concurrently, each isolated in your own git worktree. Stay inside yours.

- **Your worktree path:** `<absolute-worktree-path>`
- **Your task branch:** `wt/<feature-name>-task-NN`
- **Base branch (do not touch):** `<base-branch>`

Rules:
1. Do all work inside your worktree path. Every file you read, create, edit, test, or commit lives under that path. Do not `cd` out of it, and do not touch any other worktree or the base branch checkout.
2. You own this task only. Do not implement, fix, or refactor anything belonging to another task — sibling tasks are being implemented in parallel by other subagents and your changes there would conflict.
3. Commit your work on your task branch before returning. Run the task's tests inside the worktree and confirm they pass; include the commit SHA(s) and the list of changed files in your report so the coordinator can review your worktree's diff and integrate it.
4. If you discover you need a file or symbol that another task is supposed to produce, **stop and report it** with status `BLOCKED` (or `NEEDS_CONTEXT`) — do not create that dependency's code yourself. Needing another wave task's output means this task was mis-classified as independent; the coordinator must serialize it, not let you duplicate work.

Your report must still use one of the standard statuses (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED) and list changed files plus commit SHAs — the coordinator integrates worktrees by reviewing and merging your task branch.
