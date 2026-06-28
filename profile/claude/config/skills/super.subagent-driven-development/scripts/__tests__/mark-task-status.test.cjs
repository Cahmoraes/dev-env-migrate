'use strict';

/**
 * Tests for mark-task-status.cjs — deterministic, idempotent status edits.
 *
 * Run with: node --test super.subagent-driven-development/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'mark-task-status.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mark-task-'));
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

test('marks PENDING → IN_PROGRESS and reports the change', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    const out = runJson(['--task-file', file, '--status', 'IN_PROGRESS']);
    assert.equal(out.statusBefore, 'PENDING');
    assert.equal(out.status, 'IN_PROGRESS');
    assert.equal(out.statusChanged, true);
    assert.match(fs.readFileSync(file, 'utf8'), /^\*\*Status:\*\* IN_PROGRESS$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('is idempotent — re-marking the same status is a no-op, not an error', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    fs.writeFileSync(file, TASK_BODY.replace('PENDING', 'IN_PROGRESS'), 'utf8');
    const out = runJson(['--task-file', file, '--status', 'IN_PROGRESS']);
    assert.equal(out.statusChanged, false);
    assert.equal(out.statusBefore, 'IN_PROGRESS');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('does not touch any line other than the status field', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    run(['--task-file', file, '--status', 'DONE']);
    const after = fs.readFileSync(file, 'utf8');
    assert.match(after, /^\*\*Status:\*\* DONE$/m);
    // Surrounding fields are untouched.
    assert.match(after, /^\*\*PRD:\*\* \.\.\/prd\/prd-x\.md$/m);
    assert.match(after, /^\*\*Depends on:\*\* 1, 2$/m);
    assert.match(after, /^- \[ \] write the test$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flips the index checkbox to [x] when status is DONE', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    fs.writeFileSync(
      index,
      ['## Tarefas', '- [ ] 2. Other → `task-02.md`', '- [ ] 3. Token refresh → `task-03.md`', ''].join('\n'),
      'utf8',
    );
    const out = runJson([
      '--task-file', file, '--status', 'DONE',
      '--tasks-index', index, '--task-number', '3',
    ]);
    assert.equal(out.indexUpdated, true);
    assert.equal(out.indexCheckboxBefore, ' ');
    assert.equal(out.indexCheckboxAfter, 'x');
    const idx = fs.readFileSync(index, 'utf8');
    assert.match(idx, /^- \[x\] 3\. Token refresh → `task-03\.md`$/m);
    // Sibling task line is untouched.
    assert.match(idx, /^- \[ \] 2\. Other → `task-02\.md`$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 when the status field is absent (never invents one)', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    fs.writeFileSync(file, '# Task\n\nNo status field here.\n', 'utf8');
    assert.throws(
      () => run(['--task-file', file, '--status', 'DONE']),
      /No \*\*Status:\*\* field/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 on an invalid status value', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    assert.throws(
      () => run(['--task-file', file, '--status', 'WIP']),
      /--status must be one of/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('locates the task file from --tasks-index + --task-number when --task-file is omitted', () => {
  // Regression: super.parallel-subagent-in-tree documented this short form
  // (no --task-file). It must work, not abort with a usage error.
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    fs.writeFileSync(
      index,
      ['## Tarefas', '- [ ] 2. Other → `task-02.md`', '- [ ] 3. Token refresh → `task-03.md`', ''].join('\n'),
      'utf8',
    );
    const out = runJson(['--tasks-index', index, '--task-number', '3', '--status', 'DONE']);
    assert.equal(out.statusBefore, 'PENDING');
    assert.equal(out.statusChanged, true);
    assert.equal(path.resolve(out.taskFile), path.resolve(file));
    assert.equal(out.indexCheckboxAfter, 'x');
    assert.match(fs.readFileSync(file, 'utf8'), /^\*\*Status:\*\* DONE$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('derives the task file relative to the index directory, not the cwd', () => {
  const dir = mkdir();
  try {
    const plansDir = path.join(dir, 'plans');
    fs.mkdirSync(plansDir);
    const file = path.join(plansDir, 'task-01.md');
    const index = path.join(plansDir, 'tasks-x.md');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    fs.writeFileSync(index, '## Tarefas\n- [ ] 1. First → `task-01.md`\n', 'utf8');
    // Run from a different cwd to prove resolution is index-relative.
    const out = JSON.parse(
      run(['--tasks-index', index, '--task-number', '1', '--status', 'IN_PROGRESS'], { cwd: os.tmpdir() }),
    );
    assert.equal(path.resolve(out.taskFile), path.resolve(file));
    assert.equal(out.statusChanged, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--task-file wins when both it and an index entry are supplied', () => {
  const dir = mkdir();
  try {
    const explicit = path.join(dir, 'task-explicit.md');
    const indexed = path.join(dir, 'task-03.md');
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(explicit, TASK_BODY, 'utf8');
    fs.writeFileSync(indexed, TASK_BODY.replace('PENDING', 'DONE'), 'utf8');
    fs.writeFileSync(index, '## Tarefas\n- [ ] 3. Token refresh → `task-03.md`\n', 'utf8');
    const out = runJson([
      '--task-file', explicit, '--status', 'IN_PROGRESS',
      '--tasks-index', index, '--task-number', '3',
    ]);
    assert.equal(path.resolve(out.taskFile), path.resolve(explicit));
    assert.match(fs.readFileSync(explicit, 'utf8'), /^\*\*Status:\*\* IN_PROGRESS$/m);
    // The indexed file was never touched.
    assert.match(fs.readFileSync(indexed, 'utf8'), /^\*\*Status:\*\* DONE$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exits 1 with a clear message when neither --task-file nor index+number is given', () => {
  assert.throws(
    () => run(['--status', 'DONE']),
    /locate the task file with either --task-file/,
  );
});

test('exits 1 when the task number cannot be found in the index to derive the file', () => {
  const dir = mkdir();
  try {
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(index, '## Tarefas\n- [ ] 1. Only one → `task-01.md`\n', 'utf8');
    assert.throws(
      () => run(['--tasks-index', index, '--task-number', '9', '--status', 'DONE']),
      /task 9 not found in index/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reports a missing task number in the index without failing the status edit', () => {
  const dir = mkdir();
  try {
    const file = path.join(dir, 'task-03.md');
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(file, TASK_BODY, 'utf8');
    fs.writeFileSync(index, '## Tarefas\n- [ ] 1. Only one → `task-01.md`\n', 'utf8');
    const out = runJson([
      '--task-file', file, '--status', 'IN_PROGRESS',
      '--tasks-index', index, '--task-number', '3',
    ]);
    assert.equal(out.statusChanged, true); // status edit still happened
    assert.equal(out.indexUpdated, false);
    assert.ok(out.errors.some((e) => /Task number 3 not found/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
