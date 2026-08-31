'use strict';

/**
 * repo-root.cjs — resolve the git working-tree root WITHOUT spawning `git`.
 *
 * Every script in this skill that needs the repo root used to shell out to
 * `git rev-parse --show-toplevel`. That is a subprocess spawn (~7ms of wall
 * clock plus process-startup cost) on a path the controller hits many times a
 * session, purely to answer "which ancestor holds `.git`?". A pure in-process
 * walk answers the same question in microseconds and never touches a subprocess.
 *
 * The walk is semantically equivalent to git's own discovery: git also climbs
 * ancestors looking for a `.git` entry. In a normal clone `.git` is a directory;
 * in a linked worktree it is a FILE pointing at the real gitdir — `fs.existsSync`
 * matches both, so `--show-toplevel`'s worktree semantics are preserved. Returns
 * null when no repo is found, exactly as the old `git rev-parse` fallback did
 * when git errored, so callers keep their existing "no repo" branch unchanged.
 *
 * The only cases git handles that this does not (GIT_DIR/GIT_WORK_TREE env
 * overrides, bare repos) never occur here: superpowers only runs inside a
 * working tree.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} [startDir] directory to start the upward search from (default cwd)
 * @returns {string|null} absolute working-tree root, or null when not in a repo
 */
function detectRepoRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached the filesystem root without a match
    dir = parent;
  }
}

/**
 * mainRepoRoot — the MAIN working tree's root, given any working tree's root.
 *
 * Needed because repo-level configuration does not follow a linked worktree.
 * `.superpowers/` is gitignored in consumer repos, so `git worktree add` produces a
 * tree without it: a script that resolves the root the way `--show-toplevel` does
 * lands in the worktree, finds no `preferences.yml`, and reports `found: false`.
 * Everything then silently falls back to defaults — caveman off, the QA gate at its
 * default, `model_tiers` gone — for every implementer in the parallel-worktree mode,
 * with nothing in the output distinguishing "no preferences configured" from
 * "preferences exist one directory up".
 *
 * In a linked worktree `.git` is a FILE (`gitdir: <main>/.git/worktrees/<name>`).
 * The canonical hop is that gitdir's `commondir` entry, which points at the shared
 * `<main>/.git`; its parent is the main working tree. Returns `root` unchanged for a
 * normal clone, and whenever anything about the layout is unrecognised — this must
 * never turn a working resolution into a failed one.
 *
 * @param {string} root a working-tree root (typically from detectRepoRoot)
 * @returns {string} the main working tree's root, or `root` when it is already it
 */
function mainRepoRoot(root) {
  if (!root) return root;
  const dotGit = path.join(root, '.git');
  let stat;
  try { stat = fs.statSync(dotGit); } catch { return root; }
  if (!stat.isFile()) return root; // normal clone: `.git` is the directory itself

  let gitdir;
  try {
    const m = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+?)\s*$/m);
    if (!m) return root;
    gitdir = path.resolve(root, m[1]);
  } catch { return root; }

  // `commondir` is relative to the gitdir and points at the shared `.git`.
  let common;
  try {
    common = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim());
  } catch {
    // Older layouts omit `commondir`; the gitdir is then `<main>/.git/worktrees/<name>`.
    common = path.dirname(path.dirname(gitdir));
  }
  const candidate = path.dirname(common);
  return fs.existsSync(path.join(candidate, '.git')) ? candidate : root;
}

module.exports = { detectRepoRoot, mainRepoRoot };
