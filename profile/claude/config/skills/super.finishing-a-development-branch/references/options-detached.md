# Detached-HEAD options (externally managed workspace — no branch, no merge)

Step 5 of `../SKILL.md` for the detached-HEAD menu. The commits sit on a detached `HEAD` with no branch pointing at them: name the work on a branch before anything else, because detached commits are garbage-collected once `HEAD` moves. There is no worktree this skill owns, so Step 6 does not run.

## Option 1: Push as new branch and open a PR

```bash
DETACHED_TIP=$(git rev-parse HEAD)
git branch <feature-name> "$DETACHED_TIP"          # name the work FIRST (detached commits are GC-able)
if ! git push -u origin <feature-name>; then
  # No origin / auth / non-fast-forward. The branch <feature-name> now holds the work — STOP and report; do not discard it. Fall back to Option 2.
  exit 1
fi
gh pr create --title "<title>" --body "<summary + test plan>" || echo "Branch pushed; open the request manually (CLI missing/unauthenticated or one already exists). Work is safe on origin/<feature-name>."
```

`gh pr create` above is the GitHub example. Use the repository's own forge CLI — `gh pr create` on GitHub, `glab mr create` on GitLab, or the creation URL `git push` prints — and report the resulting URL.

## Option 2: Keep as-is

`git branch <feature-name> HEAD`, then report "Work is on branch `<feature-name>` locally." A bare detached `HEAD` is lost the moment `HEAD` moves.

## Option 3: Discard

Typed-`discard` gate first. Then just move off the commit — `git checkout <base-branch>` (or any branch); the detached commits become unreachable and are GC'd. Do not `reset --hard` or `branch -D` any existing branch — the discard covers only the detached work.
