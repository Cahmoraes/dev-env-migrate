'use strict';

/**
 * Tests for validate-tasks.cjs — index format + deep per-file validation.
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-tasks-'));
}

function runJson(args) {
  // validate-tasks always exits 0; invalid plans are reported via valid:false.
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
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

test('a well-formed plan with valid task files is valid', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Do the thing → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, true);
    assert.equal(r.taskFiles[0].exists, true);
    assert.deepEqual(r.taskFiles[0].missingHeaders, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flags a referenced task file that does not exist on disk', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir, ['- [ ] 1. Missing file → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    assert.equal(r.taskFiles[0].exists, false);
    assert.ok(r.errors.some((e) => /does not exist on disk/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flags missing required headers in a task file', () => {
  const dir = mkdir();
  try {
    // Task file missing **Spec:** and **Depends on:**
    const body = ['# Task 1: Partial', '', '**Status:** PENDING', '**PRD:** `../prd/prd-x.md`', '', '## Passos'].join('\n');
    fs.writeFileSync(path.join(dir, 'task-01.md'), body, 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Partial headers → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    assert.deepEqual(r.taskFiles[0].missingHeaders.sort(), ['**Depends on:**', '**Spec:**']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flags RF declared in index but not traceable in the task file', () => {
  const dir = mkdir();
  try {
    // Index declares RF-003 but the task file never mentions it.
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: Endpoint' }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Endpoint [RF-003] → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /RF-003 is declared in the index.*not traceable/.test(e.message)));
    assert.deepEqual(r.taskFiles[0].rfMissingInFile, ['RF-003']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RF traceable when present in the task file title is valid', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: Endpoint [RF-003]' }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Endpoint [RF-003] → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, true);
    assert.deepEqual(r.taskFiles[0].rfMissingInFile, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('canonical FR- token is traceable (English prefix, going-forward default)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: Endpoint [FR-003]' }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Endpoint [FR-003] → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, true);
    assert.deepEqual(r.taskFiles[0].rfInIndex, ['FR-003']);
    assert.deepEqual(r.taskFiles[0].rfMissingInFile, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('flags FR declared in index but not traceable in the task file', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: Endpoint' }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Endpoint [FR-003] → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /FR-003 is declared in the index.*not traceable/.test(e.message)));
    assert.deepEqual(r.taskFiles[0].rfMissingInFile, ['FR-003']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dual-accept: legacy RF and canonical FR tokens coexist in one plan', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ title: '# Task 1: Endpoint [RF-001] [FR-002]' }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Endpoint [RF-001] [FR-002] → `task-01.md`']);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, true);
    assert.deepEqual(r.taskFiles[0].rfInIndex, ['RF-001', 'FR-002']);
    assert.deepEqual(r.taskFiles[0].rfMissingInFile, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--index-only skips per-file checks (legacy format-only behavior)', () => {
  const dir = mkdir();
  try {
    // No task files on disk at all, but the index format itself is valid.
    const index = writeIndex(dir, ['- [ ] 1. Endpoint → `task-01.md`']);
    const r = runJson(['--tasks-index', index, '--index-only']);
    assert.equal(r.valid, true);
    assert.deepEqual(r.taskFiles, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('still catches non-sequential numbering (regression: index format)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(), 'utf8');
    fs.writeFileSync(path.join(dir, 'task-03.md'), taskFile({ title: '# Task 3: Other' }), 'utf8');
    const index = writeIndex(dir, [
      '- [ ] 1. First → `task-01.md`',
      '- [ ] 3. Skipped two → `task-03.md`',
    ]);
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /sequential/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── --mockups visual-coverage gate ────────────────────────────────────────────

const VISUAL_SUBSECTION = '### Fidelidade Visual\n- **Mockup de referência:** `../specs/mockups/x-visual.md`\n';

function writeMockup(dir, name = 'x-visual.md') {
  const mockDir = path.join(dir, 'mockups');
  fs.mkdirSync(mockDir, { recursive: true });
  fs.writeFileSync(path.join(mockDir, name), '# visual\n', 'utf8');
  return mockDir;
}

test('--mockups: curated mockup + a task with Fidelidade Visual is valid', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ rfBody: VISUAL_SUBSECTION }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. UI task → `task-01.md`']);
    const mockDir = writeMockup(dir);
    const r = runJson(['--tasks-index', index, '--mockups', mockDir]);
    assert.equal(r.valid, true, JSON.stringify(r.errors));
    assert.equal(r.mockupCoverage.ok, true);
    assert.equal(r.mockupCoverage.mockupFileCount, 1);
    assert.equal(r.mockupCoverage.visualLinkedTaskCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups: the heading alone does NOT satisfy the gate without a real file reference', () => {
  const dir = mkdir();
  try {
    // Heading present but the `<file>` placeholder was never filled in (or it points
    // at a name absent from the mockups dir) — must NOT count as visually linked.
    const placeholderSubsection = '### Fidelidade Visual\n- **Mockup de referência:** `../specs/mockups/<file>`\n';
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ rfBody: placeholderSubsection }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. UI task → `task-01.md`']);
    const mockDir = writeMockup(dir);
    const r = runJson(['--tasks-index', index, '--mockups', mockDir]);
    assert.equal(r.valid, false, JSON.stringify(r.errors));
    assert.equal(r.mockupCoverage.ok, false);
    assert.equal(r.mockupCoverage.visualLinkedTaskCount, 0);
    assert.ok(r.errors.some((e) => /Curated mockups exist/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups: a reference with trailing punctuation still counts as linked', () => {
  const dir = mkdir();
  try {
    // "x-visual.md." and "**x-visual.md**" are genuine references; the trailing
    // punctuation must not defeat the name match.
    const subsection = '### Fidelidade Visual\n- baseline: see ../specs/mockups/x-visual.md. and **../specs/mockups/x-visual.md**\n';
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ rfBody: subsection }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. UI task → `task-01.md`']);
    const mockDir = writeMockup(dir);
    const r = runJson(['--tasks-index', index, '--mockups', mockDir]);
    assert.equal(r.valid, true, JSON.stringify(r.errors));
    assert.equal(r.mockupCoverage.ok, true);
    assert.equal(r.mockupCoverage.visualLinkedTaskCount, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups: a mockups dir with only dotfiles skips the gate (no false positive)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ rfBody: '### Fidelidade Visual\n- build it' }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. UI task → `task-01.md`']);
    const mockDir = path.join(dir, 'mockups');
    fs.mkdirSync(mockDir, { recursive: true });
    fs.writeFileSync(path.join(mockDir, '.DS_Store'), 'junk', 'utf8');
    fs.writeFileSync(path.join(mockDir, '.gitkeep'), '', 'utf8');
    const r = runJson(['--tasks-index', index, '--mockups', mockDir]);
    assert.equal(r.valid, true, JSON.stringify(r.errors));
    assert.equal(r.mockupCoverage.ok, true);
    assert.equal(r.mockupCoverage.mockupFileCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups: curated mockup but NO task references it is invalid (the gate fires)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Plain task → `task-01.md`']);
    const mockDir = writeMockup(dir);
    const r = runJson(['--tasks-index', index, '--mockups', mockDir]);
    assert.equal(r.valid, false);
    assert.equal(r.mockupCoverage.ok, false);
    assert.ok(r.errors.some((e) => /Curated mockups exist/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups: multi-mockup with a partially orphaned screen fails (per-mockup gate)', () => {
  const dir = mkdir();
  try {
    // Brainstorming emits one curated file per approved screen. A task that references
    // only ONE of three screens must NOT vacuously satisfy coverage for the other two.
    const sub = '### Fidelidade Visual\n- baseline: ../specs/mockups/checkout-visual.md\n';
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ rfBody: sub }), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. UI task → `task-01.md`']);
    const mockDir = path.join(dir, 'mockups');
    fs.mkdirSync(mockDir, { recursive: true });
    for (const n of ['checkout-visual.md', 'checkout-confirmation-visual.md', 'checkout-error-visual.md']) {
      fs.writeFileSync(path.join(mockDir, n), '# visual\n', 'utf8');
    }
    const r = runJson(['--tasks-index', index, '--mockups', mockDir]);
    assert.equal(r.valid, false, JSON.stringify(r.errors));
    assert.equal(r.mockupCoverage.ok, false);
    assert.equal(r.mockupCoverage.mockupFileCount, 3);
    assert.deepEqual(
      [...r.mockupCoverage.orphanMockups].sort(),
      ['checkout-confirmation-visual.md', 'checkout-error-visual.md'],
    );
    // The error names the orphaned screens (regression guard for the multi-mockup false negative).
    assert.ok(r.errors.some((e) => /checkout-error-visual\.md/.test(e.message)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups: multi-mockup with every screen referenced passes', () => {
  const dir = mkdir();
  try {
    const sub = (n) => `### Fidelidade Visual\n- baseline: ../specs/mockups/${n}\n`;
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile({ rfBody: sub('checkout-visual.md') }), 'utf8');
    fs.writeFileSync(path.join(dir, 'task-02.md'), taskFile({ rfBody: sub('checkout-confirmation-visual.md') }), 'utf8');
    const index = writeIndex(dir, [
      '- [ ] 1. UI task → `task-01.md`',
      '- [ ] 2. UI task → `task-02.md`',
    ]);
    const mockDir = path.join(dir, 'mockups');
    fs.mkdirSync(mockDir, { recursive: true });
    for (const n of ['checkout-visual.md', 'checkout-confirmation-visual.md']) {
      fs.writeFileSync(path.join(mockDir, n), '# visual\n', 'utf8');
    }
    const r = runJson(['--tasks-index', index, '--mockups', mockDir]);
    assert.equal(r.valid, true, JSON.stringify(r.errors));
    assert.equal(r.mockupCoverage.ok, true);
    assert.equal(r.mockupCoverage.mockupFileCount, 2);
    assert.equal(r.mockupCoverage.visualLinkedTaskCount, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups: empty mockups dir skips the gate (no false positive)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Plain task → `task-01.md`']);
    const mockDir = path.join(dir, 'mockups');
    fs.mkdirSync(mockDir, { recursive: true });
    const r = runJson(['--tasks-index', index, '--mockups', mockDir]);
    assert.equal(r.valid, true, JSON.stringify(r.errors));
    assert.equal(r.mockupCoverage.ok, true);
    assert.equal(r.mockupCoverage.mockupFileCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups absent: mockupCoverage is null (backward-compat, gate not run)', () => {
  const dir = mkdir();
  try {
    fs.writeFileSync(path.join(dir, 'task-01.md'), taskFile(), 'utf8');
    const index = writeIndex(dir, ['- [ ] 1. Plain task → `task-01.md`']);
    writeMockup(dir); // dir exists but not passed
    const r = runJson(['--tasks-index', index]);
    assert.equal(r.valid, true, JSON.stringify(r.errors));
    assert.equal(r.mockupCoverage, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--mockups requires a value', () => {
  assert.throws(() => {
    execFileSync('node', [SCRIPT, '--tasks-index', 'x', '--mockups'], { stdio: ['ignore', 'ignore', 'ignore'] });
  });
});

test('returns found:false for a missing index', () => {
  const dir = mkdir();
  try {
    const r = runJson(['--tasks-index', path.join(dir, 'nope.md')]);
    assert.equal(r.found, false);
    assert.equal(r.valid, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
