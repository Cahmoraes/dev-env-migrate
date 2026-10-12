'use strict';

/**
 * branch-guard-script.test.cjs — the verdict script behind the "Branch Guard" step.
 *
 * The check used to be three shell commands in prose that the controller ran and then judged.
 * The judgment is what produced "repo is on main, how should I proceed?" — the most frequent
 * question in real execution sessions. The script owns the judgment; the prose only maps the
 * three verdicts to an action. These tests pin the verdicts on real temp git repos.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/branch-guard-script.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'branch-guard.cjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function mkRepo(initialBranch = 'main') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-guard-'));
  git(dir, 'init', '-q', '-b', initialBranch);
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'README.md'), '# t\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

function run(dir, ...args) {
  const out = execFileSync('node', [SCRIPT, '--repo-root', dir, ...args], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('on main with no feature branch → create, with the exact command to run', () => {
  const dir = mkRepo('main');
  try {
    const r = run(dir, '--tasks-index', 'docs/superpowers/greeting/plans/tasks-greeting.md');
    assert.equal(r.current, 'main');
    assert.equal(r.onDefault, true);
    assert.equal(r.featureBranch, 'feat/greeting');
    assert.equal(r.featureBranchExists, false);
    assert.equal(r.action, 'create');
    assert.equal(r.command, 'git checkout -b feat/greeting');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('on master (no origin/HEAD) the local fallback still names it the default', () => {
  const dir = mkRepo('master');
  try {
    const r = run(dir, '--feature-name', 'x');
    assert.equal(r.default, 'master');
    assert.equal(r.onDefault, true);
    assert.equal(r.action, 'create');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('on main but feat/<slug> already exists → ask-existing, no command', () => {
  const dir = mkRepo('main');
  try {
    git(dir, 'branch', 'feat/greeting');
    const r = run(dir, '--tasks-index', 'tasks-greeting.md');
    assert.equal(r.featureBranchExists, true);
    assert.equal(r.action, 'ask-existing');
    assert.equal(r.command, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('already on a non-default branch → proceed, and a resume changes nothing', () => {
  const dir = mkRepo('main');
  try {
    git(dir, 'checkout', '-q', '-b', 'feat/greeting');
    const r = run(dir, '--tasks-index', 'tasks-greeting.md');
    assert.equal(r.onDefault, false);
    assert.equal(r.action, 'proceed');
    assert.equal(r.command, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("on ANOTHER feature's branch → ask-mismatch (two features are never stacked in silence)", () => {
  const dir = mkRepo('main');
  try {
    git(dir, 'checkout', '-q', '-b', 'feat/user-activity-pagination');
    const r = run(dir, '--tasks-index', 'tasks-admin-notice-broadcast.md');
    assert.equal(r.onDefault, false);
    assert.equal(r.mismatch, true);
    assert.equal(r.action, 'ask-mismatch');
    assert.equal(r.command, null);
    assert.equal(r.featureBranch, 'feat/admin-notice-broadcast');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a feature branch that carries the slug under another convention → proceed (no re-ask on resume)', () => {
  const dir = mkRepo('main');
  try {
    git(dir, 'checkout', '-q', '-b', 'feature/ABC-123-greeting-page');
    const r = run(dir, '--tasks-index', 'tasks-greeting.md');
    assert.equal(r.mismatch, false);
    assert.equal(r.action, 'proceed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a non-feature branch (develop, release/x) → proceed, whatever the slug', () => {
  const dir = mkRepo('main');
  try {
    for (const name of ['develop', 'release/2.1']) {
      git(dir, 'checkout', '-q', '-b', name);
      const r = run(dir, '--tasks-index', 'tasks-greeting.md');
      assert.equal(r.mismatch, false, name);
      assert.equal(r.action, 'proceed', name);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('detached HEAD → proceed (finishing owns integration there)', () => {
  const dir = mkRepo('main');
  try {
    git(dir, 'checkout', '-q', '--detach');
    const r = run(dir, '--feature-name', 'x');
    assert.equal(r.detached, true);
    assert.equal(r.action, 'proceed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a default branch that is not main/master is resolved through origin/HEAD', () => {
  const origin = mkRepo('trunk');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-guard-clone-'));
  try {
    git(dir, 'clone', '-q', origin, 'repo');
    const repo = path.join(dir, 'repo');
    const r = run(repo, '--feature-name', 'x');
    assert.equal(r.default, 'trunk');
    assert.equal(r.current, 'trunk');
    assert.equal(r.onDefault, true);
    assert.equal(r.action, 'create');
  } finally {
    fs.rmSync(origin, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('outside a git repository the script fails loudly (a gate that will not run is a STOP)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-guard-nogit-'));
  try {
    assert.throws(() => execFileSync('node', [SCRIPT, '--repo-root', dir, '--feature-name', 'x'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
