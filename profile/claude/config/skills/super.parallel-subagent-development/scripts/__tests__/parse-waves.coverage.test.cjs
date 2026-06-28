'use strict';

/**
 * Coverage-completion tests for parse-waves.cjs.
 *
 * The companion suites (parse-waves-kinds / -recommendation / -tier) cover the
 * derived-wave path, tiers and recommendation. This file fills the remaining
 * LINE and FUNCTION gaps:
 *   - the `usage()` helper, `--help`, unknown / missing argument paths
 *   - the explicit `## Execution Waves` section parser (parseWavesSection)
 *   - `validateSection` in full: duplicate wave, dangling section ref, missing
 *     task, dependency-ordering violation, non-sequential wave numbers
 *   - `deriveWaves` cycle / dangling-dependency error reporting
 *   - the index-read failure catch, the missing **Depends on:** warning, the
 *     unreadable task-file catch and the missing task-file warning
 *
 * Run with: node --test super.parallel-subagent-development/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'parse-waves.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parse-waves-cov-'));
}

function runJson(indexPath) {
  const out = execFileSync('node', [SCRIPT, '--tasks-index', indexPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function runOk(args) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function runFail(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err.status == null) throw err;
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
  throw new Error('expected a non-zero exit but the script succeeded');
}

function taskLine(n, file, title = 'Task') {
  return `- [ ] ${n}. ${title} → \`${file}\``;
}

function writeIndex(dir, taskLines, wavesSection) {
  const parts = ['# Tarefas: X', '', '## Tarefas', ...taskLines, ''];
  if (wavesSection) parts.push('## Execution Waves', '', ...wavesSection, '');
  const indexPath = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(indexPath, parts.join('\n'), 'utf8');
  return indexPath;
}

function writeTask(dir, file, { depends = 'N/A', includeDepends = true, spec = '`../specs/x.md`', files = ['`src/a.ts`'] } = {}) {
  const lines = ['# Task: thing', '', '**Status:** PENDING', `**Spec:** ${spec}`];
  if (includeDepends) lines.push(`**Depends on:** ${depends}`);
  lines.push('', '## Arquivos', ...files.map((f) => `- Create: ${f}`), '', '## Passos');
  fs.writeFileSync(path.join(dir, file), lines.join('\n'), 'utf8');
}

// ─── CLI argument handling ──────────────────────────────────────────────────

test('--help prints usage to stdout and exits 0', () => {
  const out = runOk(['--help']);
  assert.match(out, /parse-waves\.cjs/);
  assert.match(out, /--tasks-index <path>/);
});

test('unknown argument → exit 1 with an "Unknown argument" error', () => {
  const r = runFail(['--bogus']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown argument: --bogus/);
});

test('--tasks-index with no value → usage error', () => {
  const r = runFail(['--tasks-index']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--tasks-index <path> is required/);
});

test('no --tasks-index argument at all → usage error', () => {
  const r = runFail([]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--tasks-index <path> is required/);
});

test('index path is a directory → "Error reading tasks index" and exit 1', () => {
  const dir = mkdir();
  try {
    // existsSync is true for a directory, but readFileSync throws EISDIR → catch path.
    const r = runFail(['--tasks-index', dir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Error reading tasks index/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Explicit ## Execution Waves section ────────────────────────────────────

test('valid Execution Waves section → source "section", waves as declared, no errors', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(
      dir,
      [taskLine(1, 'task-01.md'), taskLine(2, 'task-02.md'), taskLine(3, 'task-03.md')],
      ['- **Wave 1** (parallel): 1, 2', '- **Wave 2** (sequential): task-03'],
    );
    writeTask(dir, 'task-01.md');
    writeTask(dir, 'task-02.md');
    writeTask(dir, 'task-03.md', { depends: '1, 2' });
    const r = runJson(index);
    assert.equal(r.source, 'section');
    assert.deepEqual(r.waves, [[1, 2], [3]]);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a task listed in two waves → "appears in more than one wave" error', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(
      dir,
      [taskLine(1, 'task-01.md'), taskLine(2, 'task-02.md')],
      ['- **Wave 1** (parallel): 1, 2', '- **Wave 2** (sequential): 2'],
    );
    writeTask(dir, 'task-01.md');
    writeTask(dir, 'task-02.md');
    const r = runJson(index);
    assert.ok(r.errors.some((e) => /more than one wave/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('section references a task not in the index → error', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, [taskLine(1, 'task-01.md')], ['- **Wave 1** (parallel): 1, 9']);
    writeTask(dir, 'task-01.md');
    const r = runJson(index);
    assert.ok(r.errors.some((e) => /references task 9, which is not in the index/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a task missing from the section → "missing from the Execution Waves" error', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, [taskLine(1, 'task-01.md'), taskLine(2, 'task-02.md')], ['- **Wave 1** (sequential): 1']);
    writeTask(dir, 'task-01.md');
    writeTask(dir, 'task-02.md');
    const r = runJson(index);
    assert.ok(r.errors.some((e) => /Task 2 is missing from the Execution Waves/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dependency placed in a later wave than its dependent → ordering error', () => {
  const dir = mkdir();
  try {
    // task 1 depends on task 2, but the section puts task 2 in a later wave.
    const index = writeIndex(
      dir,
      [taskLine(1, 'task-01.md'), taskLine(2, 'task-02.md')],
      ['- **Wave 1** (sequential): 1', '- **Wave 2** (sequential): 2'],
    );
    writeTask(dir, 'task-01.md', { depends: '2' });
    writeTask(dir, 'task-02.md');
    const r = runJson(index);
    assert.ok(r.errors.some((e) => /depends on task 2 \(wave 2\); a dependency must be in an earlier wave/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('non-sequential wave numbers → warning', () => {
  const dir = mkdir();
  try {
    // Wave 1 then Wave 3 (no Wave 2) → second position should be Wave 2.
    const index = writeIndex(
      dir,
      [taskLine(1, 'task-01.md'), taskLine(2, 'task-02.md')],
      ['- **Wave 1** (sequential): 1', '- **Wave 3** (sequential): 2'],
    );
    writeTask(dir, 'task-01.md');
    writeTask(dir, 'task-02.md');
    const r = runJson(index);
    assert.ok(r.warnings.some((w) => /sequential from 1; found Wave 3 at position 2/.test(w.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Derived waves: cycles and dangling dependencies ────────────────────────

test('dependency cycle (derived) → unschedulable-tasks error', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, [taskLine(1, 'task-01.md'), taskLine(2, 'task-02.md')]);
    writeTask(dir, 'task-01.md', { depends: '2' });
    writeTask(dir, 'task-02.md', { depends: '1' });
    const r = runJson(index);
    assert.equal(r.source, 'derived');
    assert.ok(r.errors.some((e) => /Cannot order tasks/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dependency on a non-existent task (derived) → "does not exist" error', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, [taskLine(1, 'task-01.md'), taskLine(2, 'task-02.md')]);
    writeTask(dir, 'task-01.md', { depends: '5' });
    writeTask(dir, 'task-02.md');
    const r = runJson(index);
    assert.ok(r.errors.some((e) => /depends on task 5, which does not exist in the index/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Per-task file reading: warnings and catches ────────────────────────────

test('task file without a **Depends on:** field → "treating as N/A" warning', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, [taskLine(1, 'task-01.md')]);
    writeTask(dir, 'task-01.md', { includeDepends: false });
    const r = runJson(index);
    assert.ok(r.warnings.some((w) => /has no \*\*Depends on:\*\* field; treating as N\/A/.test(w.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('referenced task file that is actually a directory → "Could not read" warning', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, [taskLine(1, 'task-01.md')]);
    // Create a directory where a task file is expected: existsSync true, readFileSync throws.
    fs.mkdirSync(path.join(dir, 'task-01.md'));
    const r = runJson(index);
    assert.ok(r.warnings.some((w) => /Could not read task-01\.md/.test(w.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('referenced task file that does not exist → "Referenced task file not found" warning', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, [taskLine(1, 'task-99.md')]);
    // No task-99.md written.
    const r = runJson(index);
    assert.ok(r.warnings.some((w) => /Referenced task file not found: task-99\.md/.test(w.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
