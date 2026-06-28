'use strict';

/**
 * Tests for the per-wave kind classification in parse-waves.cjs.
 *
 * The orchestrator must NOT infer "is this wave parallel?" from wave.length —
 * inference is the surface where the worktree invariant gets bypassed. The
 * script emits a deterministic `waveKinds` array (parallel to `waves`):
 *   - "sequential" for a single-task wave (run in-tree, no worktree)
 *   - "parallel"   for a wave with 2+ independent tasks (one worktree per task)
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parse-waves-kinds-'));
}

function runJson(indexPath) {
  const out = execFileSync('node', [SCRIPT, '--tasks-index', indexPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function taskFile({ depends = 'N/A' } = {}) {
  return [
    '# Task: thing',
    '',
    '**Status:** PENDING',
    '**PRD:** `../prd/prd-x.md`',
    '**Spec:** `../specs/x-design.md`',
    `**Depends on:** ${depends}`,
    '',
    '## Arquivos',
    '- Create: `src/a.ts`',
    '',
    '## Passos',
  ].join('\n');
}

function build(dir, tasks) {
  const lines = tasks.map((t) => `- [ ] ${t.n}. ${t.indexTitle || 'Task'} → \`task-0${t.n}.md\``);
  const index = ['# Tarefas: X', '', '## Tarefas', ...lines, ''].join('\n');
  const indexPath = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(indexPath, index, 'utf8');
  for (const t of tasks) {
    fs.writeFileSync(path.join(dir, `task-0${t.n}.md`), t.body, 'utf8');
  }
  return indexPath;
}

test('single-task wave → kind "sequential"', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [{ n: 1, body: taskFile() }]);
    const r = runJson(index);
    assert.deepEqual(r.waves, [[1]]);
    assert.deepEqual(r.waveKinds, ['sequential']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('multi-task wave → kind "parallel"', () => {
  const dir = mkdir();
  try {
    // Two tasks with no dependencies → one wave of size 2 → parallel.
    const index = build(dir, [
      { n: 1, body: taskFile() },
      { n: 2, body: taskFile() },
    ]);
    const r = runJson(index);
    assert.deepEqual(r.waves, [[1, 2]]);
    assert.deepEqual(r.waveKinds, ['parallel']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mixed plan → waveKinds aligns 1:1 with waves', () => {
  const dir = mkdir();
  try {
    // Wave 1: tasks 1,2 (parallel). Wave 2: task 3 depends on both (sequential).
    const index = build(dir, [
      { n: 1, body: taskFile() },
      { n: 2, body: taskFile() },
      { n: 3, body: taskFile({ depends: '1, 2' }) },
    ]);
    const r = runJson(index);
    assert.deepEqual(r.waves, [[1, 2], [3]]);
    assert.equal(r.waveKinds.length, r.waves.length);
    assert.deepEqual(r.waveKinds, ['parallel', 'sequential']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no tasks → empty waveKinds', () => {
  const dir = mkdir();
  try {
    const indexPath = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(indexPath, ['# Tarefas: X', '', '## Tarefas', ''].join('\n'), 'utf8');
    const r = runJson(indexPath);
    assert.deepEqual(r.waves, []);
    assert.deepEqual(r.waveKinds, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
