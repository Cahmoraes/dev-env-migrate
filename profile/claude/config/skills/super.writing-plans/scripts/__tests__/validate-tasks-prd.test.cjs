'use strict';

/**
 * Tests for validate-tasks.cjs --prd FR-coverage cross-check.
 *
 * Closes the silent "PRD exists but FR tags forgotten" gap: with --prd, every FR-NNN in the
 * PRD must be covered by a task-file title (`# Task N: <title> [FR-XXX]`), and a PRD-with-FRs +
 * tagless plan is flagged. The index line carries no FR tags.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/validate-tasks-prd.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-tasks.cjs');

function runJson(args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function taskFileBody({ title = '# Task 1: Task', frBody = '' } = {}) {
  return [
    title,
    '',
    '**Status:** PENDING',
    '**PRD:** `../prd/prd-x.md`',
    '**Spec:** `../specs/x-design.md`',
    '',
    '## Passos',
    frBody,
    '',
  ].join('\n');
}

/**
 * Build a plan dir from task lines written as `- [ ] N. Title [FR-xxx] → \`task-NN.md\``: the
 * [FR-xxx] tags go to the task file's title (where they are declared), the index gets the line
 * without them.
 */
function buildPlan(taskLines, { taskBodies = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-prd-'));
  const tag = /\s*\[(?:FR|RF)-[^\]]*\]/giu;
  const index = ['# Tarefas: x', '', '## Tarefas', '', ...taskLines.map((l) => l.replace(tag, '')), ''].join('\n');
  const indexPath = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(indexPath, index);
  taskLines.forEach((line, i) => {
    const n = String(i + 1).padStart(2, '0');
    const title = line.match(/^-\s+\[[ xX]\]\s+\d+\.\s+(.+?)\s*→/u)[1];
    const body = taskBodies[`task-${n}.md`] || taskFileBody({ title: `# Task ${i + 1}: ${title}` });
    fs.writeFileSync(path.join(dir, `task-${n}.md`), body);
  });
  return { dir, indexPath };
}

function writePrd(dir, frTokens) {
  const prdPath = path.join(dir, 'prd-x.md');
  const frLines = frTokens.map((fr) => `- ${fr}: do the thing`).join('\n');
  fs.writeFileSync(prdPath, `# PRD\n\n## Funcionalidades Principais\n\n${frLines}\n`);
  return prdPath;
}

test('all PRD FRs covered by task-file title tags → valid, no uncovered', () => {
  const { dir, indexPath } = buildPlan([
    '- [ ] 1. Login [FR-001] → `task-01.md`',
    '- [ ] 2. Logout [FR-002] → `task-02.md`',
  ]);
  const prd = writePrd(dir, ['FR-001', 'FR-002']);
  const r = runJson(['--tasks-index', indexPath, '--prd', prd]);
  assert.equal(r.valid, true);
  assert.deepEqual(r.prdCoverage.uncoveredRequirements, []);
  assert.deepEqual([...r.prdCoverage.prdRequirements].sort(), ['FR-001', 'FR-002']);
});

test('a PRD FR not covered by any task → invalid with a specific error', () => {
  const { dir, indexPath } = buildPlan([
    '- [ ] 1. Login [FR-001] → `task-01.md`',
  ]);
  const prd = writePrd(dir, ['FR-001', 'FR-002']);
  const r = runJson(['--tasks-index', indexPath, '--prd', prd]);
  assert.equal(r.valid, false);
  assert.deepEqual(r.prdCoverage.uncoveredRequirements, ['FR-002']);
  assert.ok(r.errors.some((e) => /FR-002 is declared in the PRD but is not covered/.test(e.message)));
});

test('PRD has FRs but the plan carries ZERO FR tags → flagged (vacuous-pass closed)', () => {
  const { dir, indexPath } = buildPlan([
    '- [ ] 1. Login → `task-01.md`',
    '- [ ] 2. Logout → `task-02.md`',
  ]);
  const prd = writePrd(dir, ['FR-001', 'FR-002']);
  const r = runJson(['--tasks-index', indexPath, '--prd', prd]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /traceability is missing/.test(e.message)));
});

test('an FR cited only in the task body does NOT cover it — the title is what the QA gate reads', () => {
  const { dir, indexPath } = buildPlan(
    ['- [ ] 1. Login → `task-01.md`'],
    { taskBodies: { 'task-01.md': taskFileBody({ title: '# Task 1: Login', frBody: 'Implements FR-001 fully.' }) } },
  );
  const prd = writePrd(dir, ['FR-001']);
  const r = runJson(['--tasks-index', indexPath, '--prd', prd]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /no task file's title carries an \[FR-XXX\] tag/.test(e.message)));
  assert.ok(r.warnings.some((w) => /FR-001 appears in task-01\.md but is not declared in its title/.test(w.message)));
});

test('--index-only never runs coverage (the titles live in the task files)', () => {
  const { dir, indexPath } = buildPlan(['- [ ] 1. Login [FR-001] → `task-01.md`']);
  const prd = writePrd(dir, ['FR-001', 'FR-002']);
  const r = runJson(['--tasks-index', indexPath, '--prd', prd, '--index-only']);
  assert.equal(r.prdCoverage, null);
});

test('PRD with no FRs → no coverage errors', () => {
  const { dir, indexPath } = buildPlan(['- [ ] 1. Login → `task-01.md`']);
  const prd = path.join(dir, 'prd-empty.md');
  fs.writeFileSync(prd, '# PRD\n\nNo functional requirements yet.\n');
  const r = runJson(['--tasks-index', indexPath, '--prd', prd]);
  assert.equal(r.valid, true);
  assert.deepEqual(r.prdCoverage.prdRequirements, []);
});

test('--prd pointing at a missing file is reported as an error', () => {
  const { indexPath } = buildPlan(['- [ ] 1. Login [FR-001] → `task-01.md`']);
  const r = runJson(['--tasks-index', indexPath, '--prd', '/nonexistent/prd-x.md']);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /Could not read PRD/.test(e.message)));
});

test('without --prd, prdCoverage is null (spec-only plans stay permissive)', () => {
  const { indexPath } = buildPlan(['- [ ] 1. Login → `task-01.md`']);
  const r = runJson(['--tasks-index', indexPath]);
  assert.equal(r.valid, true);
  assert.equal(r.prdCoverage, null);
});

test('--prd requires a value', () => {
  const { indexPath } = buildPlan(['- [ ] 1. Login → `task-01.md`']);
  assert.throws(() => execFileSync('node', [SCRIPT, '--tasks-index', indexPath, '--prd'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});
