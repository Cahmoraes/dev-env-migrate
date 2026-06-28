'use strict';

/**
 * Coverage-focused tests for validate-tasks.cjs.
 *
 * Companion to validate-tasks.test.cjs (which covers the happy paths). This file
 * targets the previously-uncovered lines: --help/usage output, argument errors,
 * malformed index lines, title-length warnings, FR-traceability warning branch,
 * and the defensive readFileSync catch blocks.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/*.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-tasks.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-tasks-cov-'));
}

// Runner that tolerates non-zero exits (help exits 0, usage/read errors exit 1)
// and captures both streams so we can assert on stdout JSON and stderr messages.
function run(args) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

// JSON runner for the cases that still exit 0 and emit a result on stdout.
function runJson(args) {
  const out = execFileSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

function taskFile({ status = 'PENDING', prd = '`../prd/prd-x.md`', spec = '`../specs/x-design.md`', depends = 'N/A', title = '# Task 1: Do the thing', rfBody = '' } = {}) {
  return [
    title,
    '',
    `**Status:** ${status}`,
    `**PRD:** ${prd}`,
    `**Spec:** ${spec}`,
    `**Depends on:** ${depends}`,
    '',
    '## Passos',
    rfBody,
  ].join('\n');
}

function writeIndex(dir, lines) {
  const content = ['# Tarefas: X', '', '## Tarefas', ...lines, ''].join('\n');
  const p = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ─── --help / -h (lines 33-35) ────────────────────────────────────────────────

test('--help prints usage to stdout and exits 0', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /validate-tasks\.cjs/);
  assert.match(r.stdout, /Usage:/);
});

test('-h is an alias for --help', () => {
  const r = run(['-h']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /validate-tasks\.cjs/);
});

// ─── usage() argument errors (lines 25-28, 41, 50-51, 52) ─────────────────────

test('--tasks-index with no value errors via usage (exit 1)', () => {
  const r = run(['--tasks-index']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--tasks-index <path> is required/);
  assert.match(r.stderr, /Run with --help for usage\./);
});

test('omitting --tasks-index entirely errors via usage (exit 1)', () => {
  const r = run([]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--tasks-index <path> is required/);
});

test('an unknown argument errors via usage (exit 1)', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, ['- [ ] 1. Do the thing → `task-01.md`']);
    const r = run(['--tasks-index', index, '--bogus']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unknown argument: --bogus/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── index format errors (lines 131, 141-142, 152-153, 157-158) ───────────────

test('flags a duplicated task number', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(), 'utf8');
    // Two lines both numbered "1": second one is a duplicate (and also breaks
    // the sequential check, but we only assert on the duplicate message here).
    const index = writeIndex(dir, [
      '- [ ] 1. First → `task-01.md`',
      '- [ ] 1. Dup number → `task-01.md`',
    ]);
    const r = runJson(['--tasks-index', index, '--index-only']);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /Task number 1 is duplicated\./.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flags a reference that is not a .md file', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, ['- [ ] 1. Wrong ext → `task-01.txt`']);
    const r = runJson(['--tasks-index', index, '--index-only']);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /must point to a \.md file.*task-01\.txt/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flags a checkbox line that does not match the task format', () => {
  const dir = mkdir();
  try {
    // Starts with "- [ ]" so it is recognized as an intended task line, but it
    // has no number/arrow/backtick reference, so the full pattern fails.
    const index = writeIndex(dir, [
      '- [ ] 1. Valid → `task-01.md`',
      '- [ ] this line is malformed',
    ]);
    const r = runJson(['--tasks-index', index, '--index-only']);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /Task line format is invalid\./.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flags an index with no task lines at all', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, []); // header only, zero task lines
    const r = runJson(['--tasks-index', index, '--index-only']);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /must contain at least one task line\./.test(e.message)));
    // line:0 errors exercise the falsy branch of the error reporter ternary.
    assert.ok(r.errors.some((e) => e.line === 0));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── title-length warnings (lines 144-145, 147-148) ───────────────────────────

test('warns when a task title is too short', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, ['- [ ] 1. Hi → `task-01.md`']);
    const r = runJson(['--tasks-index', index, '--index-only']);
    // Warnings do not invalidate the plan.
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => /title is too short/.test(w.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('warns when a task title is too long', () => {
  const dir = mkdir();
  try {
    const longTitle = 'L'.repeat(130);
    const index = writeIndex(dir, [`- [ ] 1. ${longTitle} → \`task-01.md\``]);
    const r = runJson(['--tasks-index', index, '--index-only']);
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => /title is too long/.test(w.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── FR appears in file but not declared in the index (warning, lines 209-210, 237-238) ──

test('warns when an FR appears in the task file but not in the index line', () => {
  const dir = mkdir();
  try {
    // Index declares no FR; the file body cites FR-005 — a softer signal (warning).
    fs.writeFileSync(
      path.join(dir, 'task-01.md'),
      taskFile({ title: '# Task 1: Endpoint', rfBody: 'Implements FR-005 in the body.' }),
      'utf8',
    );
    const index = writeIndex(dir, ['- [ ] 1. Endpoint → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    // The warning alone does not flag the plan invalid.
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => /FR-005 appears in task-01\.md but is not declared in the index/.test(w.message)));
    assert.deepEqual(r.taskFiles[0].rfInFile, ['FR-005']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── defensive readFileSync catch blocks (lines 191-193, 226-228) ─────────────

test('handles a task reference that exists but is not readable (directory => EISDIR)', () => {
  const dir = mkdir();
  try {
    // Create a *directory* named like the referenced file: existsSync() passes,
    // but readFileSync() throws EISDIR, exercising the per-file catch block.
    fs.mkdirSync(path.join(dir, 'task-01.md'));
    const index = writeIndex(dir, ['- [ ] 1. Dir not file → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /Could not read task file task-01\.md/.test(e.message)));
    assert.equal(r.taskFiles[0].exists, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('handles an index path that exists but is not readable (directory => EISDIR)', () => {
  const dir = mkdir();
  try {
    // Point --tasks-index at a directory: existsSync() passes in main(), then
    // readFileSync() throws EISDIR, exercising the top-level catch (exit 1).
    const indexDir = path.join(dir, 'index-as-dir.md');
    fs.mkdirSync(indexDir);
    const r = run(['--tasks-index', indexDir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Error reading tasks index:/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
