# Standard options — feature branch (normal repo or named-branch worktree)

Step 5 of `../SKILL.md` for the standard 4-option menu. Run the chosen option as written: every `exit 1` is a halt to report, and the feature branch is the only copy of the work, so it stays intact on every failure path. Step 6 (worktree cleanup) runs only after Option 1 or 4.

## Option 1: Merge Locally

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Guarded checkout: Step 2 verified the feature tree, not MAIN_ROOT. If it fails (dirty MAIN_ROOT, or <base-branch> checked out in another worktree), an unguarded merge would land on whatever branch MAIN_ROOT is still on and pollute it. STOP.
if ! git checkout <base-branch>; then
  # STOP and report. Do NOT proceed to the merge — resolve MAIN_ROOT (commit/stash, or free <base-branch> from the other worktree), then re-run finishing.
  exit 1
fi
# Refresh base only if it tracks a remote — a purely-local project must not fail on `git pull`.
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git pull --ff-only
fi

BASE_BEFORE=$(git rev-parse HEAD)   # pre-merge tip, to roll base back cleanly on failure

if ! git merge <feature-branch>; then
  git merge --abort
  # STOP and report the conflict. Feature branch is intact — resolve it (or rebase onto base) and re-run finishing.
  exit 1
fi

# Test the merge only when it produced a tree nobody has tested. A fast-forward (or a merge commit whose tree equals the feature tip) is byte-for-byte the tree Step 2 just proved green — re-running the suite on it changes no outcome.
if [ "$(git rev-parse "HEAD^{tree}")" != "$(git rev-parse "<feature-branch>^{tree}")" ]; then
  if ! <test command>; then
    git reset --hard "$BASE_BEFORE"
    # STOP and report the failure. Feature branch is intact — fix it and re-run.
    exit 1
  fi
fi
```

Only after the merge lands (and, when the merged tree differs from the feature tip, tests pass): Step 6 (cleanup), then `git branch -d <feature-branch>`.

## Option 2: Push and Create PR

```bash
# If the push fails (no `origin`, auth, non-fast-forward), STOP and report; the branch + worktree stay intact — fall back to Option 3.
if ! git push -u origin <feature-branch>; then
  exit 1
fi

gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>

EOF
)" || echo "Branch pushed, but PR creation failed (CLI missing/unauthenticated, or a request already exists). Open it manually — the work is safely pushed."
```

`gh pr create` above is the GitHub example. Use the repository's own forge CLI — `gh pr create` on GitHub, `glab mr create` on GitLab, or the creation URL `git push` prints when neither is installed — following the repo's PR template and conventions when it has one, and report the resulting URL.

Keep the worktree — the user iterates on PR feedback there.

## Option 3: Keep As-Is

Report "Keeping branch <name>." Append "Worktree preserved at <path>." only when Step 3 found `GIT_DIR != GIT_COMMON`. No cleanup.

## Option 4: Discard

Confirm first — list the branch, its commits and the worktree path, and wait for the user to type `discard`. Then:

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

Step 6 (cleanup), then `git branch -D <feature-branch>`.
