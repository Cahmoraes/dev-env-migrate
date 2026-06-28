---
name: super.finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

# Finishing a Development Branch

## Overview

Guide completion of dev work: present clear options, handle the chosen workflow.

**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the super.finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Task Completion

**If a tasks index path was provided** (from subagent-driven or parallel execution), verify deterministically — don't eyeball checkboxes. Run `parse-tasks.cjs --assert-all-done`; it exits non-zero unless every task is `[x]` **and** every task file reads `Status: DONE`, catching index/file mismatches a visual scan misses:

```bash
node <super.subagent-driven-development-base-dir>/scripts/parse-tasks.cjs \
  --tasks-index <path> --assert-all-done
```

- **Exit 0** → all tasks complete and consistent. Proceed to Step 2.
- **Exit 2** → not done or inconsistent; the script prints open tasks and mismatches on stderr (full JSON on stdout). Report them and stop — don't proceed to Step 2 unless the user explicitly overrides. Mark tasks complete with mark-task-status.cjs (flips the `[x]` and sets `Status: DONE`).
- **Exit 1 / script not found** → report the validator couldn't run, then fall back to reading `*-tasks.md` and confirming every line is `[x]`. Don't silently skip the check.

**If no tasks index was provided:** Skip this check — proceed to test verification.

### Step 2: Verify Tests

**Before presenting options, verify tests pass:**

```bash
npm test / cargo test / pytest / go test ./...   # project's test suite
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 3.

**If tests pass:** Verify the working tree is clean before continuing:

```bash
git status --porcelain   # empty output = clean
```

- **Empty output** → tree clean (every task was committed during execution). Continue to Step 3.
- **Non-empty output** → uncommitted or untracked work remains. This is the expected state when execution ran with `workflow.auto_commit: false` (the implementer left each task's changes uncommitted by design). A merge or PR from a dirty tree would silently omit the uncommitted work or fold it into an unrelated commit, so do **not** present integration options yet. Show the pending changes and stop:

```
Working tree is not clean — <N> uncommitted change(s):

[git status --short]

This branch ran with auto_commit disabled, so the implemented work is not yet
committed. Commit it before integrating (one commit per task or a single squash,
your call), or tell me how you'd like to handle it.
```

  Resolve this (commit the work, or get an explicit user override) before proceeding to Step 3.

### Step 3: Detect Environment

**Determine workspace state before presenting options:**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git rev-parse --abbrev-ref HEAD)   # current branch ("HEAD" if detached)
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
DEFAULT=${DEFAULT:-$(git branch --list main master | tr -d ' *+' | head -1)}
```

This determines which menu to show and how cleanup works. **`BRANCH` is the base/default branch** (it equals `DEFAULT`, or is `main`/`master`) when the work was committed straight onto the base with no separate feature branch — a real case when execution started on `main` (the upstream § Branch Guard normally prevents it, but a run can still land here). There is then nothing to merge or delete, so the standard merge menu does not apply.

| State | Menu | Cleanup |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo), on a feature branch (`BRANCH` != `DEFAULT`) | Standard 4 options | No worktree to clean up |
| `GIT_DIR == GIT_COMMON` (normal repo), on the base branch (`BRANCH` == `DEFAULT`) | On-base-branch 4 options (no merge — see Step 5) | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Standard 4 options | Provenance-based (see Step 7) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | Reduced 3 options (no merge) | No cleanup (externally managed) |

### Step 4: Determine Base Branch

```bash
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 5: Present Options

**Normal repo and named-branch worktree — present exactly these 4 options:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Detached HEAD — present exactly these 3 options:**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)
3. Discard this work

Which option?
```

**On the base branch (work committed straight to `main`/`master`) — present exactly these 4 options:**

```
Implementation complete. The work is committed directly on <base-branch> (no separate feature branch).

1. Push to origin/<base-branch>
2. Move the commits to a new branch and open a Pull Request
3. Keep as-is (commits stay on <base-branch> locally)
4. Discard this work

Which option?
```

**Don't add explanation** - keep options concise.

### Step 6: Execute Choice

#### Option 1: Merge Locally

```bash
# main repo root (CWD safety)
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

git checkout <base-branch>
# Refresh base from remote ONLY if it tracks one — a purely-local project
# must not fail finishing on a `git pull`.
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git pull --ff-only
fi

# Remember the pre-merge tip to roll base back cleanly on failure. NEVER clean up
# the worktree or branch on failure — the feature branch is the only copy of the work.
BASE_BEFORE=$(git rev-parse HEAD)

# Merge first — verify success before removing anything.
if ! git merge <feature-branch>; then
  git merge --abort          # restore base to BASE_BEFORE; nothing partial left behind
  # STOP and report the conflict. Feature branch is intact — resolve it
  # (or rebase onto base) and re-run finishing.
  exit 1
fi

# Verify tests on the merged result.
if ! <test command>; then
  git reset --hard "$BASE_BEFORE"   # undo the merge; base restored
  # STOP and report the failure. Feature branch is intact — fix it and re-run.
  exit 1
fi
```

Only after merge AND tests pass: cleanup worktree (Step 7), then delete branch:

```bash
git branch -d <feature-branch>
```

#### Option 2: Push and Create PR

```bash
# Push branch — if it fails (no remote, auth, non-fast-forward), STOP and report;
# don't attempt the PR on an unpushed branch. The branch + worktree stay intact.
if ! git push -u origin <feature-branch>; then
  # Likely: no `origin` remote, auth, or non-fast-forward needing a pull/rebase
  # first. Fall back to Option 3 (keep as-is) if unresolved.
  exit 1
fi

# Create PR — needs `gh` installed and authenticated.
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)" || echo "Branch pushed, but PR creation failed (gh missing/unauthenticated, or a PR already exists). Create it manually — the work is safely pushed."
```

**Do NOT clean up worktree** — user needs it alive to iterate on PR feedback.

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:
```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

Then: Cleanup worktree (Step 7), then force-delete branch:
```bash
git branch -D <feature-branch>
```

#### On-base-branch options (work committed straight to the base branch)

These mirror the standard options, but there is **no feature branch to merge or delete** — the commits already sit on the base. There is no worktree, so Step 7 does not run.

**Option 1 — Push to origin/<base-branch>:**

```bash
# Push only if a remote tracks this branch; a purely-local project just keeps the commits.
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git push origin <base-branch> || echo "Push rejected — pull/rebase first, then retry. Commits are safe locally."
else
  echo "No upstream for <base-branch>; commits stay local. Nothing to push."
fi
```

**Option 2 — Move the commits to a new branch and open a PR:** lift the feature commits onto a fresh branch, then rewind the base so it no longer carries them. Capture the branch **before** any rewind — it is the only copy of the work afterward.

```bash
FEATURE_TIP=$(git rev-parse HEAD)
# Base SHA before the feature's commits — the parent of its first commit, or the merge-base
# with origin/<base-branch>. Confirm it against `git log --oneline` before resetting.
BASE_BEFORE=<pre-feature sha>
git branch <feature-name> "$FEATURE_TIP"          # capture the work on a branch FIRST
git reset --hard "$BASE_BEFORE"                    # rewind local base; work is safe on <feature-name>
git checkout <feature-name>
git push -u origin <feature-name> && gh pr create --title "<title>" --body "<summary + test plan>"
```

**Option 3 — Keep as-is:** Report "Commits are on `<base-branch>` locally; integrate them when you're ready." Do nothing else.

**Option 4 — Discard:** Confirm with the typed-`discard` gate (as in the standard Option 4 above). Then remove the feature commits from the base — **never silently**:
- Base never pushed → `git reset --hard <pre-feature sha>` (confirm the SHA against `git log --oneline` first).
- Base already pushed → `git revert <pre-feature sha>..HEAD` (rewriting pushed history is off-limits without an explicit request).

### Step 7: Cleanup Workspace

**Only runs for Options 1 and 4.** Options 2 and 3 always preserve the worktree.

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**If `GIT_DIR == GIT_COMMON`:** Normal repo, no worktree to clean up. Done.

**If worktree path is under `.worktrees/`, `worktrees/`, or `~/.config/superpowers/worktrees/`:** Superpowers created this worktree — we own cleanup.

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune  # clean up any stale registrations
```

**If `git worktree remove` fails** with "contains modified or untracked files", the worktree holds changes outside the committed work — handle by the option that called Step 7:
- **Option 4 (Discard):** the user already confirmed destruction → re-run with `git worktree remove --force "$WORKTREE_PATH"`.
- **Option 1 (Merge):** those changes were NOT part of the merge and may be unsaved work. **STOP and surface them to the user**; only `--force` after they confirm the changes are disposable — never force silently, it would destroy work the merge did not capture.

**Otherwise:** The harness owns this workspace. Do NOT remove it. Use your platform's workspace-exit tool if it has one; otherwise leave the workspace in place.

## Memory & Re-Sync

This skill does **not** persist to memory itself. When `session_memory_enabled` is on, the feature's final artifacts — including the QA report — are picked up by the **next session's Memory Re-Sync Gate** in `super.using-superpowers`, which content-hashes the canonical `spec/prd/qa/adrs` set and has a dedicated QA-report synthesis rule (persisted under `source="artifact-sync"`). This is the designed, delta-based catch-up, **not a silent gap**: nothing is lost — the sync is simply deferred to the next session that opens this repo with memory enabled, which then sees the feature as `new`/`changed` and ingests it. Detail: `super.using-superpowers/references/memory-resync.md`.

## Reference Card

Option recap table + Problem/Fix breakdown of common mistakes: `references/common-mistakes.md`. The Red Flags below are the enforceable summary.

## Red Flags

**Never:**
- Proceed with failing tests, or merge without verifying tests on the result
- Discard work without typed confirmation
- Force-push without explicit request
- Remove a worktree before confirming merge success
- Clean up worktrees you didn't create (provenance check)
- Run `git worktree remove` from inside the worktree (`cd` to main repo root first)

**Always:**
- Detect environment before presenting the menu
- Present the menu matching the detected environment — standard 4 options on a feature branch, the on-base-branch 4 options when committed straight to `main`/`master`, or 3 options on a detached HEAD
- Clean up worktree for Options 1 & 4 only
- Run `git worktree prune` after removal
