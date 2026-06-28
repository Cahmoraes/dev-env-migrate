'use strict';

/**
 * Tests for check-integration.cjs — the deterministic pre-merge gate for a
 * parallel wave. Everything it reports is derived from git state, so the
 * orchestrator never has to INFER "is this wave ready to integrate?" or
 * "will these supposedly-independent tasks collide?".
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-integration-'));
  execFileSync('git', ['-c', `init.defaultBranch=${defaultBranch}`, 'init', '-q', dir]);
  git(dir, ['config', 'user.email', 't@t']);
  git(dir, ['config', 'user.name', 'tester']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'base\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}

/** Create a task branch off `base` with one commit touching `file`. */
function taskBranch(dir, base, branch, file, content) {
  git(dir, ['checkout', '-q', '-b', branch, base]);
  const full = path.join(dir, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', `${branch} work`]);
  git(dir, ['checkout', '-q', base]);
}

function run(dir, args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

test('all branches present with disjoint files → ready, no signals, ascending order', () => {
  const dir = initRepo();
  try {
    git(dir, ['checkout', '-q', '-b', 'feature/auth']);
    git(dir, ['checkout', '-q', 'main']);
    taskBranch(dir, 'feature/auth', 'wt/auth-task-01', 'src/a.ts', 'a\n');
    taskBranch(dir, 'feature/auth', 'wt/auth-task-02', 'src/b.ts', 'b\n');
    const r = run(dir, ['--repo-root', dir, '--base', 'feature/auth', '--feature', 'auth', '--tasks', '1,2']);
    assert.equal(r.readyToIntegrate, true);
    assert.deepEqual(r.blockers, []);
    assert.deepEqual(r.missedDependencySignals, []);
    assert.deepEqual(r.mergeOrder, [1, 2]);
    assert.equal(r.baseSafe, true);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.equal(t1.branch, 'wt/auth-task-01');
    assert.equal(t1.branchExists, true);
    assert.equal(t1.commitsAhead, 1);
    assert.deepEqual(t1.changedFiles, ['src/a.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing branch for a task → not ready, blocker names it', () => {
  const dir = initRepo();
  try {
    git(dir, ['checkout', '-q', '-b', 'feature/auth']);
    git(dir, ['checkout', '-q', 'main']);
    taskBranch(dir, 'feature/auth', 'wt/auth-task-01', 'src/a.ts', 'a\n');
    const r = run(dir, ['--repo-root', dir, '--base', 'feature/auth', '--feature', 'auth', '--tasks', '1,2']);
    assert.equal(r.readyToIntegrate, false);
    const t2 = r.tasks.find((t) => t.number === 2);
    assert.equal(t2.branchExists, false);
    assert.ok(r.blockers.some((b) => /task 2|wt\/auth-task-02/.test(b)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('branch with zero commits ahead → not ready, blocker for no work', () => {
  const dir = initRepo();
  try {
    git(dir, ['checkout', '-q', '-b', 'feature/auth']);
    git(dir, ['checkout', '-q', 'main']);
    // Branch exists but carries no commits beyond base.
    git(dir, ['branch', 'wt/auth-task-01', 'feature/auth']);
    const r = run(dir, ['--repo-root', dir, '--base', 'feature/auth', '--feature', 'auth', '--tasks', '1']);
    const t1 = r.tasks.find((t) => t.number === 1);
    assert.equal(t1.branchExists, true);
    assert.equal(t1.commitsAhead, 0);
    assert.equal(r.readyToIntegrate, false);
    assert.ok(r.blockers.some((b) => /task 1/i.test(b) && /no commits|no work/i.test(b)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('already-merged branch (resume) → alreadyMerged, no blocker; empty branch still blocks', () => {
  const dir = initRepo();
  try {
    git(dir, ['checkout', '-q', '-b', 'feature/auth']);
    git(dir, ['checkout', '-q', 'main']);
    // task 1: real work, already merged --no-ff into base (a partial integration
    // that ran before the session was interrupted).
    taskBranch(dir, 'feature/auth', 'wt/auth-task-01', 'src/a.ts', 'a\n');
    git(dir, ['checkout', '-q', 'feature/auth']);
    git(dir, ['merge', '-q', '--no-ff', 'wt/auth-task-01', '-m', 'merge task 1']);
    git(dir, ['checkout', '-q', 'main']);
    // task 2: real work, not yet merged.
    taskBranch(dir, 'feature/auth', 'wt/auth-task-02', 'src/b.ts', 'b\n');
    // task 3: empty branch — no work committed.
    git(dir, ['branch', 'wt/auth-task-03', 'feature/auth']);
    const r = run(dir, ['--repo-root', dir, '--base', 'feature/auth', '--feature', 'auth', '--tasks', '1,2,3']);
    const t1 = r.tasks.find((t) => t.number === 1);
    const t3 = r.tasks.find((t) => t.number === 3);
    // The merged task is recognized, not falsely flagged "no work committed".
    assert.equal(t1.commitsAhead, 0);
    assert.ok(t1.commitsBehind > 0);
    assert.equal(t1.alreadyMerged, true);
    assert.ok(!r.blockers.some((b) => /task 1/i.test(b)));
    // The genuinely empty branch is still a blocker.
    assert.equal(t3.alreadyMerged, false);
    assert.ok(r.blockers.some((b) => /task 3/i.test(b) && /no commits|no work/i.test(b)));
    assert.equal(r.readyToIntegrate, false); // because of task 3 only
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('empty branch whose base advanced via a sibling merge is NOT alreadyMerged (no silent drop on resume)', () => {
  const dir = initRepo();
  try {
    git(dir, ['checkout', '-q', '-b', 'feature/auth']);
    git(dir, ['checkout', '-q', 'main']);
    // task 2's implementer crashed → its branch is empty, created off the base BEFORE
    // any integration ran (so the base later advances past it).
    git(dir, ['branch', 'wt/auth-task-02', 'feature/auth']);
    // task 1 did real work and got merged --no-ff, advancing the base. Now task 2 has
    // ahead===0 && behind>0 — identical counts to an already-merged branch.
    taskBranch(dir, 'feature/auth', 'wt/auth-task-01', 'src/a.ts', 'a\n');
    git(dir, ['checkout', '-q', 'feature/auth']);
    git(dir, ['merge', '-q', '--no-ff', 'wt/auth-task-01', '-m', 'merge task 1']);
    git(dir, ['checkout', '-q', 'main']);
    const r = run(dir, ['--repo-root', dir, '--base', 'feature/auth', '--feature', 'auth', '--tasks', '1,2']);
    const t2 = r.tasks.find((t) => t.number === 2);
    assert.equal(t2.commitsAhead, 0);
    assert.ok(t2.commitsBehind > 0); // base advanced past the empty branch
    // OLD logic: ahead===0 && behind>0 → alreadyMerged=true → silently skipped, dropping
    // the never-committed task. The first-parent check keeps it off the merged set.
    assert.equal(t2.alreadyMerged, false);
    assert.ok(r.blockers.some((b) => /task 2/i.test(b) && /no commits|no work/i.test(b)));
    assert.equal(r.readyToIntegrate, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('two independent tasks touching the same file → missed-dependency signal', () => {
  const dir = initRepo();
  try {
    git(dir, ['checkout', '-q', '-b', 'feature/auth']);
    git(dir, ['checkout', '-q', 'main']);
    taskBranch(dir, 'feature/auth', 'wt/auth-task-01', 'src/shared.ts', 'from task 1\n');
    taskBranch(dir, 'feature/auth', 'wt/auth-task-02', 'src/shared.ts', 'from task 2\n');
    const r = run(dir, ['--repo-root', dir, '--base', 'feature/auth', '--feature', 'auth', '--tasks', '1,2']);
    assert.equal(r.missedDependencySignals.length, 1);
    const sig = r.missedDependencySignals[0];
    assert.deepEqual(sig.tasks, [1, 2]);
    assert.deepEqual(sig.overlappingFiles, ['src/shared.ts']);
    // Overlaps are a warning to inspect, not a hard blocker: branches still carry work.
    assert.equal(r.readyToIntegrate, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('base branch is master → baseSafe false with a warning', () => {
  const dir = initRepo('master');
  try {
    taskBranch(dir, 'master', 'wt/auth-task-01', 'src/a.ts', 'a\n');
    const r = run(dir, ['--repo-root', dir, '--base', 'master', '--feature', 'auth', '--tasks', '1']);
    assert.equal(r.baseSafe, false);
    assert.ok(r.baseWarning && /master/.test(r.baseWarning));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
