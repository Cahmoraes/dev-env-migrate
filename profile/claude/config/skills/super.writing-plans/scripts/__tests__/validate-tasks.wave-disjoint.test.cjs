'use strict';

/**
 * Tests for validate-tasks.cjs's wave write-set disjointness check
 * (validateWaveDisjointness). This moves the same overlap detection
 * check-wave-disjoint.cjs performs at execution-dispatch time into the
 * mandatory plan self-review, so an unsafe parallel wave fails validation
 * before any execution mode is ever chosen (see v15-large benchmark: Wave 3
 * dispatched 5 tasks in parallel that all wrote job-repository.ts, and the
 * dispatch-time gate was never invoked).
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-tasks.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-tasks-wave-disjoint-'));
}

function runJson(args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function taskFile({ title = '# Task 1: Do the thing', arquivos = '' } = {}) {
  return [
    title,
    '',
    '**Status:** PENDING',
    '**PRD:** N/A',
    '**Spec:** `../specs/x-design.md`',
    '**Depends on:** N/A',
    '',
    '## Arquivos',
    arquivos,
    '',
    '## Passos',
    'Do the thing.',
  ].join('\n');
}

function writeIndex(dir, waveLines, taskLines) {
  const content = [
    '# Tarefas: X', '', '## Tarefas', ...taskLines, '',
    '## Ondas de Execução', ...waveLines, '',
  ].join('\n');
  const p = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

test('a parallel wave with overlapping write-sets is invalid (ERROR, not warning)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: A', arquivos: '- Modify: `src/shared.ts`' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'task-02.md'), taskFile({ title: '# Task 2: B', arquivos: '- Modify: `src/shared.ts`' }), 'utf8');
    const index = writeIndex(
      dir,
      ['- **Wave 1** (parallel): 1, 2'],
      ['- [ ] 1. A → `task-01.md`', '- [ ] 2. B → `task-02.md`'],
    );
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /Wave 1 declares tasks 1 & 2/.test(e.message) && /src\/shared\.ts/.test(e.message)));
    assert.equal(r.waveDisjointness[0].safeForInTreeParallel, false);
    assert.deepEqual(r.waveDisjointness[0].writeOverlaps[0].files, ['src/shared.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a parallel wave with disjoint write-sets is valid (no false positive)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: A', arquivos: '- Modify: `src/a.ts`' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'task-02.md'), taskFile({ title: '# Task 2: B', arquivos: '- Modify: `src/b.ts`' }), 'utf8');
    const index = writeIndex(
      dir,
      ['- **Wave 1** (parallel): 1, 2'],
      ['- [ ] 1. A → `task-01.md`', '- [ ] 2. B → `task-02.md`'],
    );
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, true);
    assert.equal(r.waveDisjointness[0].safeForInTreeParallel, true);
    assert.deepEqual(r.waveDisjointness[0].writeOverlaps, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a read verb on a shared file does not count as a write overlap', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: A', arquivos: '- Modify: `src/a.ts`\n- Read: `src/shared-types.ts`' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'task-02.md'), taskFile({ title: '# Task 2: B', arquivos: '- Modify: `src/b.ts`\n- Read: `src/shared-types.ts`' }), 'utf8');
    const index = writeIndex(
      dir,
      ['- **Wave 1** (parallel): 1, 2'],
      ['- [ ] 1. A → `task-01.md`', '- [ ] 2. B → `task-02.md`'],
    );
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, true);
    assert.equal(r.waveDisjointness[0].safeForInTreeParallel, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a parallel-wave task with no ## Arquivos write paths is unverifiable and fails', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: A', arquivos: '- Modify: `src/a.ts`' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'task-02.md'), taskFile({ title: '# Task 2: B', arquivos: '' }), 'utf8');
    const index = writeIndex(
      dir,
      ['- **Wave 1** (parallel): 1, 2'],
      ['- [ ] 1. A → `task-01.md`', '- [ ] 2. B → `task-02.md`'],
    );
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /Wave 1 declares task 2/.test(e.message) && /cannot be verified/.test(e.message)));
    assert.deepEqual(r.waveDisjointness[0].unverifiable, [2]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a sequential (single-task) wave is never flagged, even sharing files with another wave', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: A', arquivos: '- Modify: `src/shared.ts`' }), 'utf8');
    const index = writeIndex(
      dir,
      ['- **Wave 1** (sequential): 1'],
      ['- [ ] 1. A → `task-01.md`'],
    );
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, true);
    assert.equal(r.waveDisjointness[0].safeForInTreeParallel, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a plan with no ## Execution Waves section skips the check (waveDisjointness: null)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(), 'utf8');
    const content = ['# Tarefas: X', '', '## Tarefas', '- [ ] 1. Do the thing → `task-01.md`', ''].join('\n');
    const index = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(index, content, 'utf8');
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.waveDisjointness, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--index-only skips the wave disjointness check (needs task bodies)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: A', arquivos: '- Modify: `src/shared.ts`' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'task-02.md'), taskFile({ title: '# Task 2: B', arquivos: '- Modify: `src/shared.ts`' }), 'utf8');
    const index = writeIndex(
      dir,
      ['- **Wave 1** (parallel): 1, 2'],
      ['- [ ] 1. A → `task-01.md`', '- [ ] 2. B → `task-02.md`'],
    );
    const r = runJson(['--tasks-index', index, '--index-only']);
    assert.equal(r.waveDisjointness, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the real v15-large Wave 3 (5-way fan-in on job-repository.ts) reproduces as invalid', () => {
  const dir = mkdir();
  try {
    const shared = '- Modify: `src/job-repository.ts`\n- Test: `src/job-repository.test.ts`';
    for (const n of [5, 6, 7, 8, 9]) {
      fs.writeFileSync(path.join(dir, `task-0${n}.md`), taskFile({ title: `# Task ${n}: X`, arquivos: shared }), 'utf8');
    }
    const taskLines = [5, 6, 7, 8, 9].map((n) => `- [ ] ${n}. X → \`task-0${n}.md\``);
    const index = writeIndex(dir, ['- **Wave 1** (parallel): 5, 6, 7, 8, 9'], taskLines);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    // 5 tasks pairwise = C(5,2) = 10 overlap errors, matching check-wave-disjoint.cjs's own count on the real artifact.
    const overlapErrors = r.errors.filter((e) => /both write/.test(e.message));
    assert.equal(overlapErrors.length, 10);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
