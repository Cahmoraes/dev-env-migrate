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

module.exports = { detectRepoRoot };
