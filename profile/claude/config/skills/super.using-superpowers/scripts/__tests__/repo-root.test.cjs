'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { detectRepoRoot } = require('../lib/repo-root.cjs');

function mkTmp(prefix) {
  // realpath so results are comparable on platforms where tmpdir is a symlink
  // (macOS /tmp -> /private/tmp); the walk returns physical ancestors.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

test('finds the root when .git is a directory (normal clone)', () => {
  const root = mkTmp('repo-root-dir-');
  try {
    fs.mkdirSync(path.join(root, '.git'));
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    assert.equal(detectRepoRoot(path.join(root, 'a', 'b')), root);
    assert.equal(detectRepoRoot(root), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('finds the root when .git is a FILE (linked worktree)', () => {
  const root = mkTmp('repo-root-file-');
  try {
    // A linked worktree stores a `.git` FILE ("gitdir: ...") instead of a dir.
    fs.writeFileSync(path.join(root, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n');
    fs.mkdirSync(path.join(root, 'sub'));
    assert.equal(detectRepoRoot(path.join(root, 'sub')), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('returns null when no .git ancestor exists', () => {
  const dir = mkTmp('repo-root-none-');
  try {
    // A temp dir under the OS tmpdir has no .git up to the filesystem root.
    assert.equal(detectRepoRoot(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stops at the nearest .git (does not climb past a nested repo)', () => {
  const outer = mkTmp('repo-root-nested-');
  try {
    fs.mkdirSync(path.join(outer, '.git'));
    const inner = path.join(outer, 'inner');
    fs.mkdirSync(path.join(inner, '.git'), { recursive: true });
    // From inside the nested repo we get the nested root, not the outer one.
    assert.equal(detectRepoRoot(inner), inner);
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

test('defaults to process.cwd() when no startDir is given', () => {
  // This script runs from inside the superpowers repo, so cwd resolves to a
  // real working-tree root — the same answer `git rev-parse` would give.
  const root = detectRepoRoot();
  assert.ok(root === null || fs.existsSync(path.join(root, '.git')));
});
