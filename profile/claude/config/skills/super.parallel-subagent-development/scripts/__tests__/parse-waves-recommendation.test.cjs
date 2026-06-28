'use strict';

/**
 * Tests for the executionRecommendation derivation in parse-waves.cjs.
 *
 * The handoff message must NOT hardcode `(recommended)` on option 1. The script
 * emits a deterministic recommendation derived from the wave/dependency
 * structure, so the planner tags the option that fits THIS plan:
 *   - a plan with no parallel wave is fully decidable → option 1
 *     (subagent-driven), high confidence, decisionRequired:false
 *   - a plan with a parallel wave → a parallel mode (option 3, worktrees: safe
 *     regardless of write-set disjointness); never option 1. decisionRequired:true
 *     flags only the in-tree-vs-worktrees refinement the waves can't decide
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parse-waves-rec-'));
}

function runJson(indexPath) {
  const out = execFileSync('node', [SCRIPT, '--tasks-index', indexPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function taskFile({ depends = 'N/A', title = '# Task: thing', files = ['`src/a.ts`'] } = {}) {
  return [
    title,
    '',
    '**Status:** PENDING',
    '**PRD:** `../prd/prd-x.md`',
    '**Spec:** `../specs/x-design.md`',
    `**Depends on:** ${depends}`,
    '',
    '## Arquivos',
    ...files.map((f) => `- Create: ${f}`),
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

test('fully sequential chain → option 1, high confidence, no decision required', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ depends: 'N/A' }) },
      { n: 2, body: taskFile({ depends: 'task-01', files: ['`src/b.ts`'] }) },
      { n: 3, body: taskFile({ depends: 'task-02', files: ['`src/c.ts`'] }) },
    ]);
    const rec = runJson(index).executionRecommendation;
    assert.equal(rec.mode, 'subagent-driven');
    assert.equal(rec.optionNumber, 1);
    assert.equal(rec.confidence, 'high');
    assert.equal(rec.decisionRequired, false);
    assert.deepEqual(rec.alternatives, []);
    assert.ok(rec.signals.some((s) => /no parallelizable wave/.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rich parallel wave → parallel mode (option 3), high confidence, ranked alternatives', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ files: ['`src/a.ts`'] }) },
      { n: 2, body: taskFile({ files: ['`src/b.ts`'] }) },
      { n: 3, body: taskFile({ files: ['`src/c.ts`'] }) },
    ]);
    const rec = runJson(index).executionRecommendation;
    // Substantial parallelism → recommend a parallel mode, never option 1.
    assert.equal(rec.mode, 'parallel-subagent');
    assert.equal(rec.optionNumber, 3);
    assert.equal(rec.confidence, 'high');
    assert.equal(rec.decisionRequired, true);
    // Alternatives are the refinements: in-tree (2) then the sequential fallback (1).
    assert.deepEqual(
      rec.alternatives.map((a) => a.optionNumber),
      [2, 1],
    );
    assert.ok(rec.alternatives.every((a) => a.mode !== 'inline' && a.optionNumber !== 4));
    rec.alternatives.forEach((a) => assert.ok(typeof a.when === 'string' && a.when.length > 0));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('thin parallelism (one wave of 2) → parallel mode (option 3), medium confidence', () => {
  const dir = mkdir();
  try {
    const index = build(dir, [
      { n: 1, body: taskFile({ files: ['`src/a.ts`'] }) },
      { n: 2, body: taskFile({ files: ['`src/b.ts`'] }) },
    ]);
    const rec = runJson(index).executionRecommendation;
    assert.equal(rec.mode, 'parallel-subagent');
    assert.equal(rec.optionNumber, 3);
    assert.equal(rec.confidence, 'medium');
    assert.equal(rec.decisionRequired, true);
    assert.ok(rec.signals.some((s) => /thin parallelism/.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('high-fan-in task is surfaced as a coupling signal', () => {
  const dir = mkdir();
  try {
    // task 1 is depended on by 2, 3, 4 → fan-in 3; wave 2 = {2,3,4} is parallel.
    const index = build(dir, [
      { n: 1, body: taskFile({ depends: 'N/A', files: ['`src/core.ts`'] }) },
      { n: 2, body: taskFile({ depends: 'task-01', files: ['`src/b.ts`'] }) },
      { n: 3, body: taskFile({ depends: 'task-01', files: ['`src/c.ts`'] }) },
      { n: 4, body: taskFile({ depends: 'task-01', files: ['`src/d.ts`'] }) },
    ]);
    const rec = runJson(index).executionRecommendation;
    assert.equal(rec.decisionRequired, true);
    assert.ok(rec.signals.some((s) => /high-fan-in/.test(s) && /#1/.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing index → safe default recommendation (option 1, no decision required)', () => {
  const dir = mkdir();
  try {
    const rec = runJson(path.join(dir, 'does-not-exist.md')).executionRecommendation;
    assert.equal(rec.optionNumber, 1);
    assert.equal(rec.decisionRequired, false);
    assert.equal(rec.confidence, 'high');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
