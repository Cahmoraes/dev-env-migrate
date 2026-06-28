---
name: super.using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback
---

# Using Git Worktrees

## Overview

Ensure work happens in an isolated workspace. Prefer your platform's native worktree tools; fall back to manual git worktrees only when none exists.

**Core principle:** Detect existing isolation first → native tools → git fallback. Never fight the harness.

**Announce at start:** "I'm using the super.using-git-worktrees skill to set up an isolated workspace."

## Step 0: Detect Existing Isolation

**Before creating anything, check if you are already isolated.**

> **Deterministic detection (preferred):**
> ```bash
> bash scripts/detect-git-env.sh
> ```
> Outputs JSON with `isWorktree`, `isBareRepo`, `currentBranch`, `gitRoot`, `worktrees[]`. If `isWorktree: true`, skip to Step 3 — already isolated. **Fallback:** the manual git commands below.

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**Submodule guard:** `GIT_DIR != GIT_COMMON` is also true inside git submodules. Before concluding "already in a worktree," verify you are not in a submodule:

```bash
# If this returns a path, you're in a submodule, not a worktree — treat as normal repo
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**If `GIT_DIR != GIT_COMMON` (and not a submodule):** you are already in a linked worktree. Skip to Step 3 (Project Setup). Do NOT create another. Report with branch state:
- On a branch: "Already in isolated workspace at `<path>` on branch `<name>`."
- Detached HEAD: "Already in isolated workspace at `<path>` (detached HEAD, externally managed). Branch creation needed at finish time."

**If `GIT_DIR == GIT_COMMON` (or in a submodule):** you are in a normal repo checkout. Honor any declared worktree preference without asking. Otherwise ask consent before creating one:

> "Would you like me to set up an isolated worktree? It protects your current branch from changes."

If the user declines consent, work in place and skip to Step 3.

## Step 1: Create Isolated Workspace

**Two mechanisms — try them in this order.**

### 1a. Native Worktree Tools (preferred)

Do you already have a way to create a worktree? It might be a tool named like `EnterWorktree`, `WorktreeCreate`, a `/worktree` command, or a `--worktree` flag. If so, use it and skip to Step 3.

Native tools handle directory placement, branch creation, and cleanup automatically. Running `git worktree add` when a native tool exists creates phantom state your harness can't see or manage. Only proceed to Step 1b if you have no native tool.

### 1b. Git Worktree Fallback

**Only if Step 1a does not apply** — no native worktree tool. Create a worktree manually with git.

#### Directory Selection

Priority order — explicit user preference always beats observed filesystem state:

1. **Declared preference in your instructions** — if specified, use it without asking.

2. **Existing project-local worktree directory:**
   ```bash
   ls -d .worktrees 2>/dev/null     # Preferred (hidden)
   ls -d worktrees 2>/dev/null      # Alternative
   ```
   If found, use it. If both exist, `.worktrees` wins.

3. **Existing global directory** (backward compat with legacy global path):
   ```bash
   project=$(basename "$(git rev-parse --show-toplevel)")
   ls -d ~/.config/superpowers/worktrees/$project 2>/dev/null
   ```

4. **No other guidance available** — default to `.worktrees/` at the project root.

#### Safety Verification (project-local directories only)

**MUST verify the directory is git-ignored before creating the worktree** — prevents accidentally committing worktree contents to the repository:

```bash
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**If NOT ignored:** add to .gitignore, commit the change, then proceed. Global directories (`~/.config/superpowers/worktrees/`) need no verification.

#### Create the Worktree

```bash
project=$(basename "$(git rev-parse --show-toplevel)")

# Determine path based on chosen location
# For project-local: path="$LOCATION/$BRANCH_NAME"
# For global: path="~/.config/superpowers/worktrees/$project/$BRANCH_NAME"

git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

**Sandbox fallback:** if `git worktree add` fails with a permission error (sandbox denial), tell the user the sandbox blocked worktree creation and you're working in the current directory instead, then run setup and baseline tests in place.

## Step 3: Project Setup

Auto-detect and run appropriate setup:

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

## Step 4: Verify Clean Baseline

Run tests to ensure the workspace starts clean:

```bash
# Use project-appropriate command
npm test / cargo test / pytest / go test ./...
```

**If tests fail:** report failures, ask whether to proceed or investigate.
**If tests pass:** report ready.

### Report

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Quick Reference

Situation → action cheat-sheet (one row per decision, each mapping to a step above): see `references/quick-reference.md`.

## Common Mistakes & Red Flags

**Never:**
- Create a worktree when Step 0 detects existing isolation (avoids nesting one inside another).
- Use `git worktree add` when you have a native worktree tool (e.g. `EnterWorktree`) — **the #1 mistake**; if you have it, use it. Don't skip Step 1a by jumping straight to 1b's git commands.
- Create a project-local worktree without verifying it's ignored via `git check-ignore` (untracked-ignore prevents polluting git status).
- Skip baseline test verification, or proceed with failing tests without asking (otherwise new bugs are indistinguishable from pre-existing ones).

**Always:**
- Run Step 0 detection first; prefer native tools over the git fallback.
- Follow directory priority: existing > global legacy > instruction file > default (`.worktrees/`).
- Verify the directory is ignored for project-local worktrees.
- Auto-detect and run project setup, then verify a clean test baseline.
