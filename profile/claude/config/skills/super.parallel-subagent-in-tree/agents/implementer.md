# In-Tree Parallel Implementer Scoping Block

Append this block to the standard `super.subagent-driven-development/agents/implementer.md` when dispatching an implementer for a task in an **in-tree parallel wave** (no worktrees). It constrains the subagent to its own write-set and forbids any shared-state mutation, so several implementers can run concurrently in the **same** working tree without colliding. Fill the placeholders before dispatching.

---

## Shared-Tree Scope (in-tree parallel execution — NO worktree)

You are one of several implementers running **concurrently in the same working tree**. There is no worktree isolating you, so your safety depends entirely on staying inside your own files and never mutating shared state. The orchestrator has already verified that your write-set does not overlap any sibling task's write-set.

- **Working directory (shared):** `<repo-root>`
- **Your task:** task-NN — `<short task title>`
- **Your write-set (the ONLY files you may create or edit):**
  - `<exact/path/one>`
  - `<exact/path/two>`
- **Your scoped test command:** `<e.g. pnpm --filter <pkg> test -t "<test name>">`

Hard rules — violating any of these can corrupt a sibling's work:

1. **Write only your write-set.** Create and edit only the files listed above. Do not edit, move, or delete any other file — sibling tasks are editing their own files in this same tree right now, and a stray write clobbers them.
2. **Do NOT commit or stage.** No `git add`, `git commit`, `git stash`, `git checkout`, or any command that mutates the git index or refs. The git index is shared; the orchestrator commits after the whole wave, at the integration barrier.
3. **Do NOT run repo-wide mutating commands.** No `lint:fix`/`format`/`prettier --write`/ESLint `--fix`, no repo-wide `build`, no codemod, no dependency install/upgrade, no codegen that writes outside your write-set. These touch files you don't own. The orchestrator runs `lint:fix` → `tsc:check` → `test` → `build` once, after the wave.
4. **Run only your scoped test.** Use the scoped test command above to confirm your own work (TDD: write the failing test first, then make it pass). Do not run the full suite, full typecheck, or build — those are the orchestrator's barrier step, and running them now races with your siblings.
5. **You own this task only.** Do not implement, fix, or refactor anything belonging to another task. If you discover you need a file or symbol another task is supposed to produce, **stop and report `BLOCKED`** (or `NEEDS_CONTEXT`) — do not create that dependency's code yourself. Needing another wave task's output means this task was mis-classified as independent; the coordinator must serialize it.

Your report must use one of the standard statuses (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED) and list exactly the files you wrote (which must be a subset of your write-set) plus the scoped test result. Do **not** report commit SHAs — you do not commit; the orchestrator does, at the barrier.
