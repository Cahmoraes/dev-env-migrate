'use strict';

/**
 * Tests for validate-tasks.cjs's wave PARTITION coherence check
 * (validateWaveStructure) — the sibling of the disjointness check next door.
 *
 * Disjointness asks "can these tasks run side by side?". It never asks whether
 * the partition itself is well-formed, and a plan can ship with a broken one:
 * a task in two waves, a task in none, a wave naming a task the index does not
 * have, or a task scheduled at or before something it depends on.
 * parse-waves.cjs reports exactly these — but only when an execution skill runs
 * it, which is after handoff.
 *
 * Measured (session 303caf93): the very first
 * parse-waves call of the execution run emitted 13 errors — SEVEN tasks in two
 * waves each and five dependency-order violations. The plan had already been
 * validated and handed off. The waves had to be rewritten and re-committed
 * mid-execution. These tests move that failure to plan time.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/validate-tasks.wave-structure.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-tasks.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-tasks-wave-structure-'));
}

function runJson(args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function taskFile(n, { dependsOn = 'N/A', arquivos = '- Criar: `src/f%N%.ts`' } = {}) {
  return [
    `# Task ${n}: Thing ${n}`,
    '',
    '**Status:** PENDING',
    '**PRD:** N/A',
    '**Spec:** `../specs/x-design.md`',
    `**Depends on:** ${dependsOn}`,
    '',
    '## Arquivos',
    arquivos.replace(/%N%/gu, String(n)),
    '',
    '## Passos',
    'Do the thing.',
  ].join('\n');
}

/**
 * Build a plan: `tasks` = {n: {dependsOn}}, `waves` = number[][].
 * Index numbering must be sequential from 1 (a separate, pre-existing rule), so
 * fixtures use 1..N; the wave lists are what these tests vary.
 */
function writePlan(dir, tasks, waves) {
  const numbers = Object.keys(tasks).map(Number).sort((a, b) => a - b);
  const taskLines = numbers.map((n) => `- [ ] ${n}. Thing ${n} → \`task-${String(n).padStart(2, '0')}.md\``);
  const waveLines = waves.map((w, i) => `- **Wave ${i + 1}** (parallel): ${w.map((n) => `task-${String(n).padStart(2, '0')}`).join(', ')}`);
  for (const n of numbers) {
    fs.writeFileSync(path.join(dir, `task-${String(n).padStart(2, '0')}.md`), taskFile(n, tasks[n]), 'utf8');
  }
  const content = ['# Tarefas: X', '', '## Tarefas', ...taskLines, '', '## Ondas de Execução', ...waveLines, ''].join('\n');
  const p = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

const has = (result, needle) => result.errors.some((e) => e.message.includes(needle));

test('a coherent partition validates clean', () => {
  const dir = mkdir();
  const idx = writePlan(dir, { 1: {}, 2: {}, 3: { dependsOn: 'task-01' } }, [[1, 2], [3]]);
  const r = runJson(['--tasks-index', idx]);
  assert.equal(r.waveStructure.coherent, true, JSON.stringify(r.errors));
  assert.equal(r.waveStructure.dependencyOrderChecked, true);
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test('a task listed in two waves is an ERROR', () => {
  const dir = mkdir();
  // The observed shape: a task in an early wave, re-listed by a later "integration" wave.
  const idx = writePlan(dir, { 1: {}, 2: {} }, [[1, 2], [2]]);
  const r = runJson(['--tasks-index', idx]);
  assert.equal(r.valid, false);
  assert.equal(r.waveStructure.coherent, false);
  assert.deepEqual(r.waveStructure.duplicated, [{ task: 2, waves: [1, 2] }]);
  assert.ok(has(r, 'Task 2 appears in more than one wave'), JSON.stringify(r.errors));
  assert.ok(has(r, 'EARLIEST wave'), 'the error must say which mention to keep, not just that it is wrong');
});

test('a task in the index but in no wave is an ERROR', () => {
  const dir = mkdir();
  const idx = writePlan(dir, { 1: {}, 2: {}, 3: {} }, [[1, 2]]);
  const r = runJson(['--tasks-index', idx]);
  assert.equal(r.valid, false);
  assert.deepEqual(r.waveStructure.missing, [3]);
  assert.ok(has(r, 'Task 3 is in the index but in no wave'), JSON.stringify(r.errors));
  assert.ok(has(r, 'silently skips it'), 'the consequence is a skipped task, and the message must say so');
});

test('a wave naming a task the index does not have is an ERROR', () => {
  const dir = mkdir();
  const idx = writePlan(dir, { 1: {} }, [[1, 9]]);
  const r = runJson(['--tasks-index', idx]);
  assert.equal(r.valid, false);
  assert.deepEqual(r.waveStructure.unknown, [9]);
  assert.ok(has(r, 'references task 9, which is not in the index task list'), JSON.stringify(r.errors));
});

test('a dependency in the SAME wave is an ERROR', () => {
  const dir = mkdir();
  // Observed verbatim: "Task 5 (wave 6) depends on task 4 (wave 6)".
  const idx = writePlan(dir, { 1: {}, 2: { dependsOn: 'task-01' } }, [[1, 2]]);
  const r = runJson(['--tasks-index', idx]);
  assert.equal(r.valid, false);
  assert.deepEqual(r.waveStructure.dependencyViolations, [{ task: 2, wave: 1, dependsOn: 1, dependencyWave: 1 }]);
  assert.ok(has(r, 'depends on task 1 (wave 1)'), JSON.stringify(r.errors));
  assert.ok(has(r, 'STRICTLY earlier wave'), 'same-wave is the subtle case; the word "strictly" is what rules it out');
});

test('a dependency in a LATER wave is an ERROR', () => {
  const dir = mkdir();
  const idx = writePlan(dir, { 1: { dependsOn: 'task-02' }, 2: {} }, [[1], [2]]);
  const r = runJson(['--tasks-index', idx]);
  assert.equal(r.valid, false);
  assert.equal(r.waveStructure.dependencyViolations.length, 1);
});

test('N/A, none and pt-BR "nenhuma" all read as no dependencies', () => {
  for (const dependsOn of ['N/A', 'none', 'Nenhuma', '`N/A`']) {
    const dir = mkdir();
    const idx = writePlan(dir, { 1: {}, 2: { dependsOn } }, [[1], [2]]);
    const r = runJson(['--tasks-index', idx]);
    assert.equal(r.waveStructure.dependencyViolations.length, 0, `dependsOn=${dependsOn}`);
  }
});

test('--index-only still checks membership, and says ordering was NOT checked', () => {
  const dir = mkdir();
  const idx = writePlan(dir, { 1: {}, 2: { dependsOn: 'task-01' } }, [[1, 2]]);
  const r = runJson(['--tasks-index', idx, '--index-only']);
  // Ordering needs the task bodies, which --index-only does not read.
  assert.equal(r.waveStructure.dependencyOrderChecked, false);
  assert.deepEqual(r.waveStructure.dependencyViolations, []);
  // Membership does not, so a duplicate is still caught.
  const dup = writePlan(mkdir(), { 1: {}, 2: {} }, [[1, 2], [2]]);
  const r2 = runJson(['--tasks-index', dup, '--index-only']);
  assert.equal(r2.valid, false);
  assert.ok(has(r2, 'appears in more than one wave'));
});

test('a plan with no waves section gets waveStructure null, not a vacuous pass', () => {
  const dir = mkdir();
  fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(1), 'utf8');
  const p = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(p, ['# Tarefas: X', '', '## Tarefas', '- [ ] 1. Thing 1 → `task-01.md`', ''].join('\n'), 'utf8');
  const r = runJson(['--tasks-index', p]);
  assert.equal(r.waveStructure, null, 'no partition declared means nothing to check — null, never coherent:true');
  assert.equal(r.valid, true);
});

test('the observed regression: 7 duplicated tasks + 5 ordering violations all surface at plan time', () => {
  const dir = mkdir();
  // Reduced from the real plan: an "integration" wave re-listing earlier tasks,
  // which is simultaneously a duplicate and a dependency-order violation.
  const idx = writePlan(
    dir,
    { 1: {}, 2: { dependsOn: 'task-01' }, 3: {}, 4: { dependsOn: 'task-03' } },
    [[1], [2, 3, 4], [1, 2]],
  );
  const r = runJson(['--tasks-index', idx]);
  assert.equal(r.valid, false);
  assert.deepEqual(
    r.waveStructure.duplicated,
    [{ task: 1, waves: [1, 3] }, { task: 2, waves: [2, 3] }],
    'a task re-listed by a later "integration" wave is reported against its EARLIEST placement',
  );
  assert.equal(r.waveStructure.dependencyViolations.length, 1, 'task 4 sits in the same wave as task 3');
  assert.equal(r.waveStructure.coherent, false);
});

test('a duplicated task is scored against its earliest wave, so the two errors do not mask each other', () => {
  const dir = mkdir();
  // Task 2 is listed in waves 1 and 3 and depends on task 1 (wave 1). Reading the
  // LAST placement would call the ordering fine; reading the FIRST exposes that
  // wave 1 runs task 2 alongside its own dependency. First-wins is deliberate —
  // it matches the fix the duplicate error asks for ("keep the earliest mention").
  const idx = writePlan(dir, { 1: {}, 2: { dependsOn: 'task-01' }, 3: {} }, [[1, 2], [3], [2]]);
  const r = runJson(['--tasks-index', idx]);
  assert.deepEqual(r.waveStructure.duplicated, [{ task: 2, waves: [1, 3] }]);
  assert.deepEqual(r.waveStructure.dependencyViolations, [{ task: 2, wave: 1, dependsOn: 1, dependencyWave: 1 }]);
});
