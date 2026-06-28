'use strict';

/**
 * Coverage-focused tests for init-feature-dir.cjs.
 *
 * Run with: node --test super.deep-research/scripts/__tests__/init-feature-dir.coverage.test.cjs
 *
 * The sibling init-feature-dir.test.cjs already exercises the happy paths
 * (create / idempotent / JSON shape / slug validation). This file targets the
 * lines those tests miss:
 *   - 64-66  : --help prints usage and exits 0
 *   - 72     : --slug flag given without a value
 *   - 78     : --repo-root flag given without a value
 *   - 83-84  : unknown argument is rejected
 *   - 89-99  : detectGitRoot() success (git repo) and catch (non-git cwd)
 *   - 105    : --slug omitted entirely
 *   - 119-120: mkdirSync throws (a file sits where a directory must go)
 *
 * Uses a fresh tmp directory per test (os.tmpdir + mkdtempSync), cleaned up in
 * finally so the real repo is never touched.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'init-feature-dir.cjs');

function mkRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'init-feature-cov-'));
}

/**
 * Run the script with arbitrary argv and an optional cwd, returning
 * { stdout, stderr, status }. status === 0 on success; non-zero captured from
 * the thrown error so error paths can be asserted without try/catch noise.
 */
function run(args, cwd) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      status: error.status,
    };
  }
}

test('--help prints usage and exits 0 (lines 64-66)', () => {
  const { stdout, status } = run(['--help']);
  assert.equal(status, 0);
  assert.match(stdout, /init-feature-dir\.cjs/);
  assert.match(stdout, /--slug <slug>/);
});

test('-h short flag also prints usage and exits 0 (line 63 branch)', () => {
  const { stdout, status } = run(['-h']);
  assert.equal(status, 0);
  assert.match(stdout, /Usage:/);
});

test('--slug without a value exits non-zero (line 72)', () => {
  const { status, stdout } = run(['--slug']);
  assert.notEqual(status, 0);
  assert.match(stdout, /--slug <slug> is required/);
});

test('--repo-root without a value exits non-zero (line 78)', () => {
  const { status, stdout } = run(['--slug', 'feat', '--repo-root']);
  assert.notEqual(status, 0);
  assert.match(stdout, /--repo-root <path> requires a value/);
});

test('unknown argument is rejected (lines 83-84)', () => {
  const { status, stdout } = run(['--slug', 'feat', '--bogus']);
  assert.notEqual(status, 0);
  assert.match(stdout, /Unknown argument: --bogus/);
});

test('--slug omitted entirely exits non-zero (line 105)', () => {
  const root = mkRoot();
  try {
    const { status, stdout } = run(['--repo-root', root]);
    assert.notEqual(status, 0);
    assert.match(stdout, /--slug <slug> is required/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('no --repo-root: detectGitRoot() resolves the git toplevel (lines 89-95)', () => {
  const root = mkRoot();
  try {
    // Make the tmp dir a real git repo so `git rev-parse --show-toplevel`
    // returns its path; run with cwd inside it and no --repo-root flag.
    execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
    const { stdout, status } = run(['--slug', 'git-detected-slug'], root);
    assert.equal(status, 0);
    const json = JSON.parse(stdout);
    // git on macOS reports /private/var symlinks; compare via realpath.
    assert.equal(fs.realpathSync(json.repoRoot), fs.realpathSync(root));
    assert.ok(fs.existsSync(json.path));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('no --repo-root and no git repo: detectGitRoot() catch falls back to cwd (lines 96-97)', () => {
  const root = mkRoot();
  try {
    // tmp dir is NOT a git repo, so `git rev-parse` exits non-zero, the catch
    // returns null, and the script falls back to process.cwd() (== root here).
    const { stdout, status } = run(['--slug', 'cwd-fallback-slug'], root);
    assert.equal(status, 0);
    const json = JSON.parse(stdout);
    assert.equal(fs.realpathSync(json.repoRoot), fs.realpathSync(root));
    assert.ok(fs.existsSync(json.path));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('mkdirSync failure is reported and exits non-zero (lines 119-120)', () => {
  const root = mkRoot();
  try {
    // Plant a regular file where the "docs" directory needs to be created.
    // mkdirSync(recursive) then throws ENOTDIR building docs/superpowers/...,
    // exercising the defensive catch.
    fs.writeFileSync(path.join(root, 'docs'), 'i am a file, not a directory\n');
    const { status, stdout } = run(['--slug', 'mkdir-blocked', '--repo-root', root]);
    assert.notEqual(status, 0);
    assert.match(stdout, /could not create/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('requiring the module in-process exports SLUG_PATTERN (line 142, guard false branch)', () => {
  // require.main !== module here, so the `if (require.main === module)` guard
  // is false and main() never runs; this exercises module.exports (line 142),
  // which a subprocess can never reach because main() calls process.exit first.
  const mod = require('../init-feature-dir.cjs');
  assert.ok(mod.SLUG_PATTERN instanceof RegExp);
  assert.equal(mod.SLUG_PATTERN.test('valid-slug'), true);
  assert.equal(mod.SLUG_PATTERN.test('Invalid_Slug'), false);
});

/*
 * Deliberately NOT covered (left uncovered on purpose):
 *
 *  - Lines 124-125 (post-condition `if (!fs.existsSync(researchPath))` after a
 *    *successful* mkdirSync): unreachable without a filesystem race — mkdirSync
 *    resolving without throwing while the directory simultaneously vanishes
 *    before the existsSync check. Cannot be triggered deterministically and the
 *    house rules forbid editing the production script to make it reachable.
 *
 *  - Line 95 `|| null` alt (empty git output) is a branch only, not a line gap:
 *    `git rev-parse --show-toplevel` always prints a path on success, so the
 *    empty-string fallback cannot be produced deterministically.
 */
