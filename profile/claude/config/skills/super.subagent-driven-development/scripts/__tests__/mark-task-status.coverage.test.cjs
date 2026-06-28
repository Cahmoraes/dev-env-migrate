'use strict';

/**
 * Coverage-completion tests for mark-task-status.cjs.
 *
 * Companion to mark-task-status.test.cjs — exercises the argument-parsing
 * branches, the help path, and the defensive FS error/exit paths the
 * behavioral suite does not reach. Together they bring line + function
 * coverage to 100%.
 *
 * Run with: node --test super.subagent-driven-development/scripts/__tests__/*.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'mark-task-status.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mark-task-cov-'));
}

function run(args, opts = {}) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', ...opts });
}

function runJson(args) {
  return JSON.parse(run(args));
}

const TASK_BODY = [
  '# Task 03: Token refresh endpoint',
  '',
  '**Status:** PENDING',
  '**PRD:** ../prd/prd-x.md',
  '**Spec:** ../specs/x-design.md',
  '**Depends on:** 1, 2',
  '',
  '## Steps',
  '- [ ] write the test',
].join('\n');

// ─── Help path (lines 90-92) ──────────────────────────────────────────────────

test('--help prints usage text and exits 0', () => {
  const out = run(['--help']);
  assert.match(out, /mark-task-status\.cjs/);
  assert.match(out, /Usage:/);
  assert.match(out, /PENDING \| IN_PROGRESS \| DONE/);
});

test('-h is an alias for --help', () => {
  const out = run(['-h']);
  assert.match(out, /mark-task-status\.cjs/);
});

// ─── Argument-parsing errors (lines 120-121, 127-128, 130-131) ────────────────

test('exits 1 on an unknown argument', () => {
  assert.throws(
    () => run(['--task-file', '/tmp/x.md', '--status', 'DONE', '--bogus']),
    /Unknown argument: --bogus/,
  );
});

test('exits 1 when --tasks-index is given without --task-number', () => {
  const dir = mkdir();
  try {
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(index, '## Tarefas\n- [ ] 1. First → `task-01.md`\n', 'utf8');
    assert.throws(
      () => run(['--task-file', '/tmp/x.md', '--status', 'DONE', '--tasks-index', index]),
      /--tasks-index requires --task-number/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 when --task-number is given without --tasks-index', () => {
  assert.throws(
    () => run(['--task-file', '/tmp/x.md', '--status', 'DONE', '--task-number', '3']),
    /--task-number requires --tasks-index/,
  );
});

// ─── Derive path FS failures (lines 216-218, 223-225) ─────────────────────────

test('exits 1 when deriving from a tasks-index that does not exist', () => {
  const dir = mkdir();
  try {
    const missing = path.join(dir, 'nope.md');
    assert.throws(
      () => run(['--tasks-index', missing, '--task-number', '3', '--status', 'DONE']),
      /tasks index not found/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 when the tasks-index path is unreadable (a directory) during derive', () => {
  const dir = mkdir();
  try {
    const indexDir = path.join(dir, 'index-as-dir');
    fs.mkdirSync(indexDir); // exists but readFileSync throws EISDIR
    assert.throws(
      () => run(['--tasks-index', indexDir, '--task-number', '3', '--status', 'DONE']),
      /Error reading tasks index/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Task-file FS failures (lines 236-238, 244-246) ───────────────────────────

test('exits 1 when the explicit --task-file does not exist', () => {
  const dir = mkdir();
  try {
    const missing = path.join(dir, 'task-99.md');
    assert.throws(
      () => run(['--task-file', missing, '--status', 'DONE']),
      /task file not found/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 when the task file is unreadable (a directory)', () => {
  const dir = mkdir();
  try {
    const fileDir = path.join(dir, 'task-as-dir');
    fs.mkdirSync(fileDir); // exists but readFileSync throws EISDIR
    assert.throws(
      () => run(['--task-file', fileDir, '--status', 'DONE']),
      /Error reading task file/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Index-update block soft failures (lines 267, 283-284) ────────────────────

test('reports (without failing) when the tasks-index is missing in the index-update block', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    const missingIndex = path.join(dir, 'nope.md');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    // --task-file is supplied (derive skipped), but the index does not exist.
    const out = runJson([
      '--task-file', file, '--status', 'IN_PROGRESS',
      '--tasks-index', missingIndex, '--task-number', '3',
    ]);
    assert.equal(out.statusChanged, true); // status edit still happened
    assert.equal(out.indexUpdated, false);
    assert.ok(out.errors.some((e) => /Tasks index not found/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reports (without failing) when the index cannot be read in the index-update block', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    const indexDir = path.join(dir, 'index-as-dir');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    fs.mkdirSync(indexDir); // exists but readFileSync throws EISDIR
    const out = runJson([
      '--task-file', file, '--status', 'IN_PROGRESS',
      '--tasks-index', indexDir, '--task-number', '3',
    ]);
    assert.equal(out.statusChanged, true);
    assert.equal(out.indexUpdated, false);
    assert.ok(out.errors.some((e) => /Could not update index/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Status-value coverage (PENDING target, completing the trio) ──────────────

test('marks DONE → PENDING and clears the index checkbox back to [ ]', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(file, TASK_BODY.replace('PENDING', 'DONE'), 'utf8');
    fs.writeFileSync(index, '## Tarefas\n- [x] 3. Token refresh → `task-03.md`\n', 'utf8');
    const out = runJson([
      '--task-file', file, '--status', 'PENDING',
      '--tasks-index', index, '--task-number', '3',
    ]);
    assert.equal(out.statusBefore, 'DONE');
    assert.equal(out.status, 'PENDING');
    assert.equal(out.statusChanged, true);
    assert.equal(out.indexCheckboxBefore, 'x');
    assert.equal(out.indexCheckboxAfter, ' ');
    assert.equal(out.indexUpdated, true);
    assert.match(fs.readFileSync(file, 'utf8'), /^\*\*Status:\*\* PENDING$/m);
    assert.match(fs.readFileSync(index, 'utf8'), /^- \[ \] 3\. Token refresh → `task-03\.md`$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
