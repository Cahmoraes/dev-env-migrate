# Quick Reference — situation → action

Decision cheat-sheet for `super.using-git-worktrees`. Each row maps to a step in `SKILL.md`.

| Situation | Action |
|-----------|--------|
| Already in linked worktree | Skip creation (Step 0) |
| In a submodule | Treat as normal repo (Step 0 guard) |
| Native worktree tool available | Use it (Step 1a) |
| No native tool | Git worktree fallback (Step 1b) |
| `.worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| Both exist | Use `.worktrees/` |
| Neither exists | Check instruction file, then default `.worktrees/` |
| Global path exists | Use it (backward compat) |
| Directory not ignored | Add to .gitignore + commit |
| Permission error on create | Sandbox fallback, work in place |
| Project binds ports, no `ports.yml` | `allocate-ports.cjs --detect`, propose to user (Step 3.5) |
| `ports.yml` present | Allocate before the baseline; load `ports.env` (Step 3.5) |
| Allocation reports `conflicts` | No block granted — do not start services; widen `range` |
| Tearing a worktree down | `allocate-ports.cjs --release` first |
| Tests fail during baseline | Report failures + ask |
| No package.json/Cargo.toml | Skip dependency install |
