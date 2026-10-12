---
name: super.finishing-a-development-branch
description: When implementation is complete and verified — merge, open a PR, keep or discard the branch.
user-invocable: false
---

# Finishing a Development Branch

Verify tasks and tests → detect the environment → declared `session_finish_action` or the matching menu → execute the option from its reference → clean up.

> **Base dirs:** this skill's own is `${CLAUDE_SKILL_DIR}`; a sibling's is its parent + `/super.X` (never search for one); a gate script that will not run is a **STOP**, never a skipped gate.

## The Process

### Step 1: Verify Task Completion

**If a tasks index path was provided**, verify deterministically — exit 0 only when every task is `[x]` **and** every task file reads `Status: DONE`:

```bash
node <super.subagent-driven-development-base-dir>/scripts/parse-tasks.cjs \
  --tasks-index <path> --assert-all-done
```

Exit 2 → open tasks/mismatches on stderr: report them and stop unless the user overrides — the tracker is the execution loop's to mark, never yours. Exit 1 / script not found → report it, then read the index (`tasks-<feature>.md`) and confirm every line is `[x]`. No index → skip.

### Step 2: Verify Tests and Clean Tree

> Two preconditions — green suite, clean tree. Both before Step 3.

**Tests.** A green already proven this turn (the full-suite checkpoint) counts when `git status --porcelain` is empty and nothing the suite reads moved since it: `HEAD` is still that green's SHA, or every commit since touched only the feature tree (tracker status, QA evidence, reports — the suite never reads `docs/superpowers/`). Prove it, do not eyeball it:

```bash
git diff --stat <green-sha> HEAD -- . ':(exclude)docs/superpowers'
```

Empty → reuse the green and say in one line which one. Non-empty, no green named this turn, or a dirty tree → run the suite now (`npm test` / `flutter test` / `cargo test` / `pytest` / `go test ./...` — the repo's instructions file or its manifest says which). Failing → show the failures and stop.

**Clean tree.** `git status --porcelain` empty → continue. Non-empty → uncommitted or untracked work remains, the expected state after `workflow.auto_commit: false` (the implementer left each task's changes uncommitted by design). A merge or PR from a dirty tree would silently omit the uncommitted work or fold it into an unrelated commit, so do **not** present integration options yet: show `git status --short` and say the work needs a commit first (one per task or a squash, the user's call). Resolve this — commit, or an explicit user override — before proceeding to Step 3.

### Step 3: Detect Environment and Base Branch

```bash
# Capture in the ORIGINAL invocation directory, before any option cd's to MAIN_ROOT — Step 6 reuses these.
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)   # the tree finishing was invoked from
BRANCH=$(git rev-parse --abbrev-ref HEAD)   # current branch ("HEAD" if detached)
DEFAULT=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
DEFAULT=${DEFAULT:-$(git branch --list main master | tr -d ' *+' | head -1)}
```

`BRANCH == DEFAULT` (or `main`/`master`): the work sits straight on the base — nothing to merge or delete, so the standard menu does not apply.

`DEFAULT` is the base every option below names — merging into the wrong one is expensive to undo, so it is never assumed silently: the menu in Step 4 writes it out (`Merge back to <base-branch> locally`, `Push to origin/<base-branch>`) and the user reads it before choosing. When this branch forked from something other than `DEFAULT` — the plan, the conversation or the branch's upstream says so — use that as `<base-branch>` in the menu instead.

| State | Menu | Cleanup |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo), on a feature branch (`BRANCH` != `DEFAULT`) | Standard 4 options | No worktree to clean up |
| `GIT_DIR == GIT_COMMON` (normal repo), on the base branch (`BRANCH` == `DEFAULT`) | On-base-branch 4 options (no merge) | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Standard 4 options | Provenance-based (Step 6) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | Reduced 3 options (no merge) | No cleanup (externally managed) |

### Step 4: Present Options

**Declared destination first — `session_finish_action` (from `workflow.finish_action`, in the bootstrap's session state) decides whether a menu is shown at all.** Anything other than `ask` → **do not present the menu**: say in one line that you are applying the declared finish action, then execute the matching option of the menu Step 3 selected, with every guard, test re-run and halt of that option unchanged. Mapping: standard menu `merge`→1, `pr`→2, `keep`→3; on-base-branch menu `merge`→1 (push to base), `pr`→2, `keep`→3; detached HEAD `pr`→1, `keep`→2, and `merge` has no safe equivalent there → fall back to `ask`. `discard` is never a preference value and is never automatic — only a typed confirmation at the menu. `ask` (the default) → present the menu below and wait.

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

### Step 5: Execute Choice

One menu applies. Read only its reference and run the chosen option as written — its guards, `exit 1` halts and test re-runs are the option:

- Standard 4 options → `references/options-standard.md`
- On-base-branch 4 options → `references/options-on-base.md` (no feature branch to merge or delete; Step 6 does not run)
- Detached-HEAD 3 options → `references/options-detached.md` (name the work on a branch first; Step 6 does not run)

Discard, on every menu, lists what will be deleted and waits for the user to type `discard`.

### Step 6: Cleanup Workspace

**Only after Option 1 (merge) or Option 4 (discard).** Options 2 and 3 keep the worktree.

Reuse `GIT_DIR`, `GIT_COMMON` and `WORKTREE_PATH` from Step 3 — do NOT recompute them here: Options 1 and 4 already `cd`'d into `MAIN_ROOT`, where a recompute reads `GIT_DIR == GIT_COMMON` and orphans a real feature worktree.

- `GIT_DIR == GIT_COMMON` → normal repo, nothing to clean up.
- `WORKTREE_PATH` under `.worktrees/`, `worktrees/` or `~/.config/superpowers/worktrees/` → superpowers created it:

  ```bash
  MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
  cd "$MAIN_ROOT"
  git worktree remove "$WORKTREE_PATH"
  git worktree prune
  ```

  "contains modified or untracked files" → after Option 4 the user already confirmed destruction: re-run with `--force`. After Option 1 those changes were not in the merge and may be unsaved work: **STOP and surface them to the user**; `--force` only once they confirm they are disposable.
- Anything else → the harness owns the workspace: leave it (use the platform's workspace-exit tool if it has one).

### Step 7: Hand Over the Run Summary

After the chosen option ran — every option, Step 6 or not. When a tasks index was provided, its feature is the directory above `plans/`; print its run summary (written by the execution loop's done-state gate) and delete it in one call:

```bash
cat .superpowers/sdd/<feature>-summary.md && rm .superpowers/sdd/<feature>-summary.md
```

Your final message opens with that output, **translated line for line into the session's language**. Its headings already follow the plan's language, but the lines under them are the ledger's, usually English: when the session is in another language, translate every line that is not in it, decisions and pending items included. Keep the same headings, lines, order and numbering; each decision keeps every ` — ` clause, its cost included; code identifiers, paths, `file:line`, commit hashes, quoted strings and numbers stay as written. Beyond the translation, no line reworded, shortened, merged, dropped or added: each line is a quote from the run's ledger, and the decisions list is the only place the user sees what you decided for them. What the option did goes below it, as your own lines. No such file → no summary to hand over; say nothing about it.

## Reference Card

Option recap table + Problem/Fix breakdown of common mistakes: `references/common-mistakes.md`.

## Red Flags

- Discard without the typed confirmation — and never because of a preference: `session_finish_action` has no discard value.
- Force-push without an explicit request.
- The menu follows the environment — standard 4 options on a feature branch, the on-base-branch 4 options when committed straight to `main`/`master`, or 3 options on a detached HEAD — unless `session_finish_action` already chose.
