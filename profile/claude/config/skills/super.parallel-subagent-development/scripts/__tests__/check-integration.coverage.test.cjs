'use strict';

/**
 * Coverage-completion tests for check-integration.cjs.
 *
 * The companion suite (check-integration.test.cjs) exercises the happy paths and
 * git-state reporting. This file fills the remaining LINE and FUNCTION gaps:
 *   - the `usage()` helper (72-75) and every path that calls it
 *   - the `--help` early exit (79-82)
 *   - the unknown-argument rejection (90-91)
 *   - the "not a git repository" guard (160-162)
 *   - the unpadded branch fallback and the worktree-path mapping (branch coverage)
 *
 * Run with: node --test super.parallel-subagent-development/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-integration.cjs');

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function initRepo(defaultBranch = 'main') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-integration-cov-'));
  execFileSync('git', ['-c', `init.defaultBranch=${defaultBranch}`, 'init', '-q', dir]);
  git(dir, ['config', 'user.email', 't@t']);
  git(dir, ['config', 'user.name', 'tester']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'base\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}

function taskBranch(dir, base, branch, file, content) {
  git(dir, ['checkout', '-q', '-b', branch, base]);
  const full = path.join(dir, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', `${branch} work`]);
  git(dir, ['checkout', '-q', base]);
}

/** Run expecting success (exit 0); returns stdout. */
function runOk(args) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Run expecting a non-zero exit; returns { status, stdout, stderr }. */
function runFail(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err.status == null) throw err;
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
  throw new Error('expected a non-zero exit but the script succeeded');
}

test('--help prints usage to stdout and exits 0', () => {
  const out = runOk(['--help']);
  assert.match(out, /check-integration\.cjs/);
  assert.match(out, /--base <branch>/);
});

test('unknown argument → exit 1 with an "Unknown argument" error', () => {
  const r = runFail(['--bogus']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown argument: --bogus/);
});

test('missing --base → usage error', () => {
  const r = runFail(['--feature', 'auth', '--tasks', '1']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--base/);
});

test('missing --feature → usage error', () => {
  const r = runFail(['--base', 'main', '--tasks', '1']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--feature/);
});

test('missing --tasks → usage error', () => {
  const r = runFail(['--base', 'main', '--feature', 'auth']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--tasks/);
});

test('--tasks without any number → usage error', () => {
  const r = runFail(['--base', 'main', '--feature', 'auth', '--tasks', 'none']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /at least one task number/i);
});

test('repo-root that is not a git repository → "Not a git repository" error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-integration-nogit-'));
  try {
    const r = runFail(['--repo-root', dir, '--base', 'feature/x', '--feature', 'x', '--tasks', '1']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Not a git repository/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unpadded branch name resolves when the padded form is absent', () => {
  const dir = initRepo();
  try {
    git(dir, ['checkout', '-q', '-b', 'feature/auth']);
    git(dir, ['checkout', '-q', 'main']);
    // Only the unpadded `wt/auth-task-1` exists — the padded `wt/auth-task-01` does not.
    taskBranch(dir, 'feature/auth', 'wt/auth-task-1', 'src/a.ts', 'a\n');
    const out = runOk(['--repo-root', dir, '--base', 'feature/auth', '--feature', 'auth', '--tasks', '1']);
    const r = JSON.parse(out);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.equal(t1.branchExists, true);
    assert.equal(t1.branch, 'wt/auth-task-1');
    assert.equal(t1.commitsAhead, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a branch checked out in a linked worktree is reported with its worktreePath', () => {
  const dir = initRepo();
  try {
    git(dir, ['checkout', '-q', '-b', 'feature/auth']);
    git(dir, ['checkout', '-q', 'main']);
    taskBranch(dir, 'feature/auth', 'wt/auth-task-01', 'src/a.ts', 'a\n');
    const wtPath = path.join(os.tmpdir(), `ci-wt-${process.pid}-${Date.now()}`);
    git(dir, ['worktree', 'add', '-q', wtPath, 'wt/auth-task-01']);
    try {
      const out = runOk(['--repo-root', dir, '--base', 'feature/auth', '--feature', 'auth', '--tasks', '1']);
      const r = JSON.parse(out);
      const t1 = r.tasks.find((t) => t.number === 1);
      assert.equal(t1.branchExists, true);
      assert.ok(t1.worktreePath && t1.worktreePath.length > 0);
    } finally {
      git(dir, ['worktree', 'remove', '--force', wtPath]);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
