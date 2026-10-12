# On-base-branch options (work committed straight to the base branch)

Step 5 of `../SKILL.md` for the on-base-branch menu. These mirror the standard options, but there is **no feature branch to merge or delete** — the commits already sit on the base — and no worktree, so Step 6 does not run.

## Option 1: Push to origin/<base-branch>

```bash
# Push only if a remote tracks this branch; a purely-local project just keeps the commits.
if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git push origin <base-branch> || echo "Push rejected — pull/rebase first, then retry. Commits are safe locally."
else
  echo "No upstream for <base-branch>; commits stay local. Nothing to push."
fi
```

## Option 2: Move the commits to a new branch and open a PR

Lift the feature commits onto a fresh branch, then rewind the base. Capture the branch **before** any rewind — it is the only copy of the work afterward.

```bash
FEATURE_TIP=$(git rev-parse HEAD)
# Base SHA before the feature's commits: the parent of its first commit, or the merge-base with origin/<base-branch>. Confirm against `git log --oneline` before resetting.
BASE_BEFORE=<pre-feature sha>
git branch <feature-name> "$FEATURE_TIP"          # capture the work on a branch FIRST
git reset --hard "$BASE_BEFORE"                    # rewind local base; work is safe on <feature-name>
git checkout <feature-name>
git push -u origin <feature-name> && gh pr create --title "<title>" --body "<summary + test plan>"
```

`gh pr create` above is the GitHub example. Use the repository's own forge CLI — `gh pr create` on GitHub, `glab mr create` on GitLab, or the creation URL `git push` prints — and report the resulting URL.

## Option 3: Keep as-is

Report "Commits are on `<base-branch>` locally; integrate them when you're ready." Do nothing else.

## Option 4: Discard

Typed-`discard` gate first (list the commits that will go). Then remove the feature commits from the base — never silently:

- Base never pushed → `git reset --hard <pre-feature sha>` (confirm the SHA against `git log --oneline` first).
- Base already pushed → `git revert <pre-feature sha>..HEAD` (rewriting pushed history needs an explicit request).
