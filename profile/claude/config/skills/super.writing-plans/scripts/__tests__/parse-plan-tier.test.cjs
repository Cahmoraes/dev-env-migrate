'use strict';

/**
 * Tests for the suggestedTier derivation and the `**Consome:**` edge validation in parse-plan.cjs.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/parse-plan-tier.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'parse-plan.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parse-plan-tier-'));
}

function runJson(indexPath) {
  const out = execFileSync('node', [SCRIPT, '--tasks-index', indexPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function taskFile({ status = 'PENDING', spec = '`../specs/x-design.md`', consumes = 'N/A', title = '# Task: thing', files = ['`src/a.ts`', '`src/a.test.ts`'], tier = undefined } = {}) {
  return [
    title,
    '',
    `**Status:** ${status}`,
    '**PRD:** `../prd/prd-x.md`',
    `**Spec:** ${spec}`,
    ...(tier === undefined ? [] : [`**Tier:** ${tier}`]),
    '',
    '## Arquivos',
    ...files.map((f) => `- Create: ${f}`),
    '',
    '## Interfaces',
    '',
    `- **Consome:** ${consumes === 'N/A' ? 'N/A' : consumes.split(',').map((n) => `\`fn${n.trim()}()\` (task-0${n.trim()})`).join(', ')}`,
    '- **Produz:** N/A',
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

function tierOf(result, number) {
  return result.tasks.find((t) => t.number === number).suggestedTier;
}

test('mechanical task (spec, no deps, ≤2 files) → cheap', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [{ n: 1, indexTitle: 'Add helper', body: taskFile() }]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'cheap');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('design/architecture keyword in title → capable', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, indexTitle: 'Refactor the data model', body: taskFile({ title: '# Task: Refactor the data model' }) },
    ]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'capable');
    assert.ok(r.tasks[0].tierSignals.some((s) => /keyword/.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backfill in title → capable (a data migration, like "migrate")', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, indexTitle: 'Backfill existing certificates', body: taskFile({ title: '# Task: Backfill existing certificates' }) },
    ]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'capable');
    assert.ok(r.tasks[0].tierSignals.some((s) => /keyword/.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no spec reference → capable (needs judgment)', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [{ n: 1, indexTitle: 'Vague task', body: taskFile({ spec: 'N/A' }) }]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'capable');
    assert.ok(r.tasks[0].tierSignals.some((s) => /no spec/.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('many files / consumes a task → standard', () => {
  const dir = mkdir();
  try {
    const manyFiles = ['`src/a.ts`', '`src/b.ts`', '`src/c.ts`', '`src/d.ts`'];
    const index = build(dir, [
      { n: 1, indexTitle: 'Base', body: taskFile() },
      { n: 2, indexTitle: 'Integrate', body: taskFile({ consumes: '1', files: manyFiles }) },
    ]);
    const r = runJson(index);
    assert.equal(tierOf(r, 2), 'standard');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('high fan-in node → capable', () => {
  const dir = mkdir();
  try {
    // Tasks 2,3,4 all consume task 1 → fan-in 3 → task 1 is a structural node.
    const index = build(dir, [
      { n: 1, indexTitle: 'Core', body: taskFile() },
      { n: 2, indexTitle: 'A', body: taskFile({ consumes: '1' }) },
      { n: 3, indexTitle: 'B', body: taskFile({ consumes: '1' }) },
      { n: 4, indexTitle: 'C', body: taskFile({ consumes: '1' }) },
    ]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'capable');
    assert.ok(r.tasks.find((t) => t.number === 1).tierSignals.some((s) => /fan-in/.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown file count (no Arquivos section) is conservative → not cheap', () => {
  const dir = mkdir();
  try {
    const noFilesBody = [
      '# Task: thing', '', '**Status:** PENDING', '**PRD:** `../prd/prd-x.md`',
      '**Spec:** `../specs/x-design.md`', '', '## Passos',
    ].join('\n');
    const index = build(dir, [{ n: 1, indexTitle: 'Opaque', body: noFilesBody }]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'standard');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('explicit **Tier:** field overrides the computed tier (capable on a mechanical task)', () => {
  const dir = mkdir();
  try {
    // Mechanical signals (spec, no deps, ≤2 files) would compute `cheap`, but the
    // human declared `capable` — the explicit field must win.
    const index = build(dir, [{ n: 1, indexTitle: 'Add helper', body: taskFile({ tier: 'capable' }) }]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'capable');
    assert.equal(r.tasks[0].explicitTier, 'capable');
    assert.ok(r.tasks[0].tierSignals.some((s) => /explicit/.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('explicit **Tier:** field can downgrade a capable-by-signal task to cheap', () => {
  const dir = mkdir();
  try {
    // "Refactor" keyword would compute `capable`, but the human knows it is trivial.
    const index = build(dir, [
      { n: 1, indexTitle: 'Refactor', body: taskFile({ title: '# Task: Refactor the data model', tier: 'cheap' }) },
    ]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'cheap');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('explicit tier is case-insensitive and tolerates backticks/markup', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [{ n: 1, indexTitle: 'Add helper', body: taskFile({ tier: '`Standard`' }) }]);
    const r = runJson(index);
    assert.equal(tierOf(r, 1), 'standard');
    assert.equal(r.tasks[0].explicitTier, 'standard');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid/garbage **Tier:** value is ignored → falls back to computed tier', () => {
  const dir = mkdir();
  try {
    // "ultra" is not a valid tier → ignored, mechanical signals compute `cheap`.
    const index = build(dir, [{ n: 1, indexTitle: 'Add helper', body: taskFile({ tier: 'ultra' }) }]);
    const r = runJson(index);
    assert.equal(r.tasks[0].explicitTier, null);
    assert.equal(tierOf(r, 1), 'cheap');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// One task reviewer per task, always: the review shape is not computed here, so no
// per-task field may suggest a lighter or heavier review.
test('a task carries no review-shape field (one reviewer per task, always)', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, indexTitle: 'Add rate limit to login route', body: taskFile({ title: '# Task: Add rate limit to login route', files: ['`src/a.ts`'] }) },
      { n: 2, indexTitle: 'Count', body: taskFile({ consumes: '1' }) },
    ]);
    const r = runJson(index);
    for (const t of r.tasks) {
      assert.ok(!('reviewShape' in t), `task ${t.number} must not carry reviewShape`);
      assert.ok(!('reviewSignals' in t), `task ${t.number} must not carry reviewSignals`);
      assert.ok(!('criticalSurfaceBody' in t), `task ${t.number} must not carry criticalSurfaceBody`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The index order is the execution order: `**Consome:**` may only cite an earlier task.
test('Consome validation: a forward or dangling reference is an error, a backward one is not', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, indexTitle: 'Core', body: taskFile({ consumes: '3' }) },
      { n: 2, indexTitle: 'Dependent', body: taskFile({ consumes: '1' }) },
      { n: 3, indexTitle: 'Loose', body: taskFile({ consumes: '9' }) },
    ]);
    const r = runJson(index);
    assert.ok(!('waves' in r) && !('executionRecommendation' in r), 'no wave machinery in the output');
    assert.ok(r.errors.some((e) => /Task 1 \*\*Consome:\*\* cites task 3, which comes later/.test(e.message)));
    assert.ok(r.errors.some((e) => /Task 3 \*\*Consome:\*\* cites task 9, which does not exist/.test(e.message)));
    assert.ok(!r.errors.some((e) => /Task 2 /.test(e.message)), 'consuming an earlier task is fine');
    assert.equal(r.tasks.find((t) => t.number === 1).fanIn, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Plans written before the field was dropped still carry `**Depends on:**`; it is ignored text.
test('a legacy **Depends on:** line is ignored: no edge, no error, no warning', () => {
  const dir = mkdir();
  try {
    const legacy = (deps) => taskFile().replace('## Arquivos', `**Depends on:** ${deps}\n\n## Arquivos`);
    const index = build(dir, [
      { n: 1, indexTitle: 'Core', body: legacy('N/A') },
      { n: 2, indexTitle: 'Later', body: legacy('task-01, task-09') },
    ]);
    const r = runJson(index);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(r.tasks.map((t) => t.consumes), [[], []]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
