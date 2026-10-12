'use strict';

/**
 * Option 3 (single implementer) eligibility in parse-plan.cjs.
 *
 * One implementer subagent runs every task in order with no per-task reviewer; the
 * whole-branch final review stays. Measured 2026-09-20 on a real four-task
 * chain: the per-task reviewers found no Critical/Important finding the final review
 * missed, at 4-7x its cost. The option is offered only when the plan has at most 6 tasks and
 * no capable-tier task, and it is NEVER the recommended mode — the user opts in at the gate.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/parse-plan-single-implementer.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'parse-plan.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parse-plan-single-'));
}

function runJson(indexPath) {
  const out = execFileSync('node', [SCRIPT, '--tasks-index', indexPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function taskFile({ title = '# Task: thing', files = ['`src/a.ts`', '`src/a.test.ts`'] } = {}) {
  return [
    title,
    '',
    '**Status:** PENDING',
    '**PRD:** `../prd/prd-x.md`',
    '**Spec:** `../specs/x-design.md`',
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
  for (const t of tasks) fs.writeFileSync(path.join(dir, `task-0${t.n}.md`), t.body, 'utf8');
  return indexPath;
}

function chain(n, extra = {}) {
  const tasks = [];
  for (let i = 1; i <= n; i += 1) {
    tasks.push({ n: i, body: taskFile({ files: [`\`src/f${i}.ts\``, `\`src/f${i}.test.ts\``], ...extra }) });
  }
  return tasks;
}

function withDir(fn) {
  const dir = mkdir();
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('a chain of ≤ 6 standard tasks is eligible', () => {
  withDir((dir) => {
    const single = runJson(build(dir, chain(4))).singleImplementer;
    assert.equal(single.eligible, true);
    assert.deepEqual(single.reasons, []);
  });
});

test('independent tasks (no dependency between them) are still one chain: eligible', () => {
  withDir((dir) => {
    const single = runJson(build(dir, [
      { n: 1, body: taskFile({ files: ['`src/a.ts`'] }) },
      { n: 2, body: taskFile({ files: ['`src/b.ts`'] }) },
    ])).singleImplementer;
    assert.equal(single.eligible, true, 'the index order is the execution order; independence buys nothing here');
  });
});

test('seven tasks are too many for one context: ineligible', () => {
  withDir((dir) => {
    const single = runJson(build(dir, chain(7))).singleImplementer;
    assert.equal(single.eligible, false);
    assert.ok(single.reasons.some((r) => /7 tasks/.test(r)));
    // six is the ceiling, still eligible
    const six = runJson(build(mkdirInside(dir), chain(6))).singleImplementer;
    assert.equal(six.eligible, true);
  });
});

function mkdirInside(dir) {
  const d = path.join(dir, 'six');
  fs.mkdirSync(d);
  return d;
}

test('a capable-tier task makes the plan ineligible (this mode runs the whole chain on standard)', () => {
  withDir((dir) => {
    const tasks = chain(3);
    tasks[1] = { n: 2, indexTitle: 'Redesign the login flow', body: taskFile({ title: '# Task: Redesign the login flow', files: ['`src/auth.ts`', '`src/auth.test.ts`'] }) };
    const single = runJson(build(dir, tasks)).singleImplementer;
    assert.equal(single.eligible, false);
    assert.ok(single.reasons.some((r) => /#2/.test(r) && r.includes('need the capable tier')));
  });
});

test('an empty plan is ineligible rather than vacuously eligible', () => {
  withDir((dir) => {
    const indexPath = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(indexPath, '# Tarefas: X\n\n## Tarefas\n', 'utf8');
    const single = runJson(indexPath).singleImplementer;
    assert.equal(single.eligible, false);
    assert.ok(single.reasons.some((r) => /no tasks/.test(r)));
  });
});
