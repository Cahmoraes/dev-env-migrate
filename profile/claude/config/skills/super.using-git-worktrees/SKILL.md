---
name: super.using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback
user-invocable: false
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

#### Base branch cleanliness for isolated worktrees

A worktree created from a branch inherits **all untracked files** from the source working tree at the moment of creation — git worktree copies the current checkout, including untracked artifacts. If the base branch has leftover build outputs, previous feature directories, or benchmark artifacts, the new worktree is contaminated from the start, which pollutes subagent context and can cause false test/typecheck failures.

Before creating the worktree, verify the base is clean:

```bash
# 1. Staged or unstaged changes are not acceptable for a clean baseline
git diff --quiet HEAD && git diff --cached --quiet HEAD
# 2. Untracked files that are not git-ignored must be resolved before proceeding
[ -z "$(git status --porcelain --untracked-files=all | grep -v '^?? ' || true)" ]
# 3. Untracked directories that are ignored are fine; untracked non-ignored directories are not
UNTRACKED_NON_IGNORED=$(git ls-files --others --exclude-standard --directory | sed 's|/$||' | sort -u)
```

- If step 1 fails: the base branch has uncommitted changes. Commit, stash, or reset them before creating the worktree.
- If step 3 lists untracked non-ignored directories (e.g. leftover `stale-feature/`, `dist/`, `coverage/`): remove them or add them to `.gitignore` and commit the ignore change. Do not create a worktree on top of stray artifacts.
- For **benchmark / regression worktrees** where absolute cleanliness matters, prefer creating from a detached commit rather than a dirty branch:
  ```bash
  git worktree add "$path" "$(git rev-parse HEAD)"
  ```
  This still inherits tracked files, but untracked contamination is avoided if the base working tree was clean.

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

## Step 3.5: Runtime Isolation (Ports)

A worktree isolates files, not the runtime — two worktrees share one loopback interface, so a
dev server, database container, broker or Playwright `webServer` started in both collides on
the same hard-coded port and fails with `EADDRINUSE`, which reads as a broken implementation
rather than a missing environment. Run the allocator **before the baseline** (integration
tests bind ports too):

```bash
node <super.using-git-worktrees-base-dir>/scripts/allocate-ports.cjs --worktree "$(pwd)"
```

By this step your cwd is the **worktree**, not this skill's directory — so use the base
directory from your header here, not a path relative to `scripts/`.

Read the JSON, not the exit code:

- `enabled: false` — no `.superpowers/ports.yml` in the repo. If nothing here binds a port,
  that is correct; move on. If the project *does* run services, run the same script with
  `--detect`, show the user the proposed config and let them confirm before it is written.
  **Never write `ports.yml` yourself from a guess** — detection proposes, a human decides.
- `conflicts` non-empty — **no block was granted and no env file was written.** Do not start
  services. Report it; the message names the fix (widen `range`, or reclaim stale leases).
- Otherwise — `.superpowers/ports.env` now holds this worktree's `<SERVICE>_PORT` variables
  plus `COMPOSE_PROJECT_NAME`. Every command in this worktree that starts a service must load
  it (`set -a; . .superpowers/ports.env; set +a`), and any subagent pinned to this worktree
  must be told to do the same. Hard-coding a port here defeats the whole mechanism.

Release the block when the worktree is torn down: `allocate-ports.cjs --release --worktree <path>`.

**If the script itself fails to run** (not a JSON verdict — an IO or interpreter error),
apply the same rule the rest of the pipeline uses: a gate that will not run is a STOP, not a
skipped gate. Say so and stop rather than dispatching work that will collide. The exception
is a repo with no `.superpowers/ports.yml`, where there is nothing to protect.

**Full model — configuration, the lease ledger, Compose/database collisions, and how a
consumer adapts its app — is in `references/port-isolation.md`.** Read it when a repo is
adopting port isolation for the first time or when an allocation reports conflicts.

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
- Start a service in a worktree on a hard-coded port when `ports.env` exists (Step 3.5) — the collision it causes surfaces as a fake implementation bug.
- Write `.superpowers/ports.yml` from your own inference of the project's services; `--detect` proposes, the user confirms.

**Always:**
- Run Step 0 detection first; prefer native tools over the git fallback.
- Follow directory priority: existing > global legacy > instruction file > default (`.worktrees/`).
- Verify the directory is ignored for project-local worktrees.
- Auto-detect and run project setup, allocate the worktree's ports (Step 3.5), then verify a clean test baseline.
