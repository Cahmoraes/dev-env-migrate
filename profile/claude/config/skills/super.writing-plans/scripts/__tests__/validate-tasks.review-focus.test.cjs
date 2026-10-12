'use strict';

/**
 * Review Focus guard — validate-tasks.cjs proves the SHAPE of the index's
 * `## Foco de Revisão` section, as warnings, never errors.
 *
 * Why it exists: the spec is a vision document and its silence on an input is not
 * permission for that input to break the program. Upstream measured every implementer
 * (21/21 reps) shipping the same crash on an input the spec implied but never named and
 * no task's tests exercised; a fixed count of five was the only wording that kept the
 * list short. The section is the planner's list of those inputs, each pinned by a test
 * step in the owning task, handed verbatim to the final reviewer.
 *
 * Four checks, each proven by a fixture that breaks exactly one of them:
 *   1. the section is present (empty is fine: "checked, none found")
 *   2. at most five items
 *   3. every item names an owning task-NN that exists in the index
 *   4. (full run only) the owning task's ## Passos carries a `Review Focus:` step
 * Plus: the section must be invisible to the task parsers (it sits after ## Restrições
 * Globais, with the reviewer lens) and to the shipped template's own validation.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/validate-tasks.review-focus.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const VALIDATE = path.join(SKILL_DIR, 'scripts', 'validate-tasks.cjs');
const PARSE_PLAN = path.join(SKILL_DIR, 'scripts', 'parse-plan.cjs');
const TEMPLATE = path.join(SKILL_DIR, 'templates', 'tasks-template.md');

function runJson(script, args) {
  const out = execFileSync('node', [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-tasks-review-focus-'));
}

function taskBody(n, { pinned = true, labelOnly = false } = {}) {
  // Pinned = the label is the test step's own title, above its code block. Label-only = the
  // label dropped between two steps, next to a test that exercises something else.
  const title = pinned && !labelOnly
    ? '- **Step 1: Review Focus: unreadable input → error message, non-zero exit — Write the failing test**'
    : '- **Step 1: Write the failing test**';
  const pin = labelOnly ? '\nReview Focus: unreadable input → error message, non-zero exit\n' : '\n';
  return [
    `# Task ${n}: Thing number ${n}`,
    '',
    '**Status:** PENDING',
    '**PRD:** N/A',
    '**Spec:** `../specs/x-design.md`',
    '**Tier:** standard',
    '',
    '## Arquivos',
    '',
    `- Create: \`src/thing${n}.ts\``,
    '',
    '## Passos',
    '',
    title,
    '',
    '```ts',
    'it("handles it", () => { expect(f()).toBe(1); });',
    '```',
    pin,
    '- **Step 2: Run test to verify it fails**',
    '',
    'Run: `vitest run tests/thing.test.ts`',
    'Expected: FAIL',
    '',
  ].join('\n');
}

/** Index with a Review Focus section; `focus` is the bullet list (null = no section). */
function index({ focus, tasks = 2 }) {
  const lines = ['# Tarefas: X', '', '**Spec:** `../specs/x-design.md`', '', '---', '', '## Tarefas', ''];
  for (let n = 1; n <= tasks; n += 1) lines.push(`- [ ] ${n}. Thing number ${n} → \`task-0${n}.md\``);
  lines.push('');
  lines.push('');
  if (focus !== null) {
    lines.push('## Foco de Revisão', '');
    lines.push('<!--', '  the template comment carries an example bullet; it must not count as an item:', '  - Example → expectation → `task-99`', '-->', '');
    for (const f of focus) lines.push(`- ${f}`);
    lines.push('');
  }
  return lines.join('\n');
}

function withPlan({ focus, tasks = 2, pinned = {} }, fn) {
  const dir = mkdir();
  try {
    for (let n = 1; n <= tasks; n += 1) {
      fs.writeFileSync(path.join(dir, `task-0${n}.md`), taskBody(n, { pinned: pinned[n] !== false }), 'utf8');
    }
    const p = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(p, index({ focus, tasks }), 'utf8');
    return fn(p);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const focusWarnings = (r) => r.warnings.filter((w) => /Foco de Revisão/u.test(w.message));

test('a well-formed section with pinned owners: no warning, verdict in JSON', () => {
  withPlan({ focus: ['Unreadable input → error, non-zero exit → `task-01`', 'Empty input → empty result → `task-02`'] }, (p) => {
    const r = runJson(VALIDATE, ['--tasks-index', p]);
    assert.equal(r.valid, true);
    assert.deepEqual(focusWarnings(r), []);
    assert.equal(r.reviewFocus.present, true);
    assert.equal(r.reviewFocus.lines.length, 2);
    assert.deepEqual(r.reviewFocus.lines.map((l) => l.owners), [[1], [2]]);
    assert.equal(r.reviewFocus.pinsChecked, true);
    assert.deepEqual(r.reviewFocus.unpinned, []);
  });
});

test('an EMPTY section is "checked, none found": present, no warning', () => {
  withPlan({ focus: [] }, (p) => {
    const r = runJson(VALIDATE, ['--tasks-index', p]);
    assert.equal(r.reviewFocus.present, true);
    assert.deepEqual(r.reviewFocus.lines, []);
    assert.deepEqual(focusWarnings(r), []);
  });
});

test('check 1 — no section at all is a warning, never an error', () => {
  withPlan({ focus: null }, (p) => {
    const r = runJson(VALIDATE, ['--tasks-index', p]);
    assert.equal(r.valid, true, 'review focus never fails the plan');
    assert.equal(r.reviewFocus.present, false);
    assert.equal(focusWarnings(r).length, 1);
    assert.match(focusWarnings(r)[0].message, /no ## Foco de Revisão section/u);
  });
});

test('check 2 — a sixth item trips the ceiling of five', () => {
  const six = Array.from({ length: 6 }, (_, i) => `Case ${i} → expectation → \`task-01\``);
  withPlan({ focus: six }, (p) => {
    const r = runJson(VALIDATE, ['--tasks-index', p]);
    assert.equal(r.reviewFocus.overCap, true);
    assert.ok(focusWarnings(r).some((w) => /lists 6 items; the ceiling is 5/u.test(w.message)));
  });
  const five = six.slice(0, 5);
  withPlan({ focus: five }, (p) => {
    const r = runJson(VALIDATE, ['--tasks-index', p]);
    assert.equal(r.reviewFocus.overCap, false, 'five is the ceiling, not over it');
  });
});

test('check 3 — an item with no task-NN, and one naming a task not in the index', () => {
  withPlan({ focus: ['Orphan case → expectation', 'Ghost owner → expectation → `task-07`'] }, (p) => {
    const r = runJson(VALIDATE, ['--tasks-index', p]);
    assert.deepEqual(r.reviewFocus.unowned.length, 1);
    assert.deepEqual(r.reviewFocus.unknownTasks, [{ line: r.reviewFocus.lines[1].line, task: 7 }]);
    assert.ok(focusWarnings(r).some((w) => /names no owning task/u.test(w.message)));
    assert.ok(focusWarnings(r).some((w) => /task-07, which is not in the index/u.test(w.message)));
  });
});

test('check 4 — an owner whose ## Passos has no "Review Focus:" step is unpinned (full run only)', () => {
  withPlan({ focus: ['Unreadable input → error → `task-02`'], pinned: { 2: false } }, (p) => {
    const full = runJson(VALIDATE, ['--tasks-index', p]);
    assert.deepEqual(full.reviewFocus.unpinned, [{ line: full.reviewFocus.lines[0].line, task: 2 }]);
    assert.ok(focusWarnings(full).some((w) => /task-02\.md has no "Review Focus:" step/u.test(w.message)));
    assert.equal(full.valid, true);

    const indexOnly = runJson(VALIDATE, ['--tasks-index', p, '--index-only']);
    assert.equal(indexOnly.reviewFocus.pinsChecked, false, 'degrades explicitly, not silently');
    assert.deepEqual(indexOnly.reviewFocus.unpinned, []);
  });
});

test('a "Review Focus:" line OUTSIDE ## Passos does not count as a pin', () => {
  const dir = mkdir();
  try {
    const body = taskBody(1, { pinned: false }).replace('## Arquivos', 'Review Focus: named in prose, not a step\n\n## Arquivos');
    fs.writeFileSync(path.join(dir, 'task-01.md'), body, 'utf8');
    fs.writeFileSync(path.join(dir, 'task-02.md'), taskBody(2), 'utf8');
    const p = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(p, index({ focus: ['Case → expectation → `task-01`'] }), 'utf8');
    const r = runJson(VALIDATE, ['--tasks-index', p]);
    assert.equal(r.reviewFocus.unpinned.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the section is invisible to the task parsers', () => {
  withPlan({ focus: ['Case → expectation → `task-01`'] }, (p) => {
    const v = runJson(VALIDATE, ['--tasks-index', p]);
    assert.equal(v.taskCount, 2, 'a focus bullet is not a task line');
    const w = runJson(PARSE_PLAN, ['--tasks-index', p]);
    assert.deepEqual(w.errors, []);
    assert.deepEqual(w.tasks.map((t) => t.number), [1, 2]);
  });
});

test('the shipped tasks template carries the section, under the cap, after the constraints heading', () => {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const focusAt = tpl.search(/^## Foco de Revisão\s*$/mu);
  const tarefasAt = tpl.search(/^## Tarefas\s*$/mu);
  const constraintsAt = tpl.search(/^## Restrições Globais\s*$/mu);
  assert.ok(tarefasAt < constraintsAt && constraintsAt < focusAt, 'section order: Tarefas → Restrições Globais → Foco de Revisão (tracker first, reviewer lens after)');
  assert.match(tpl, /vision document/u, 'the template teaches the standard where the list is written');
  assert.match(tpl, /empty section means you checked and found none/u);
  // The template's own example items parse under the validator with every owner known.
  const dir = mkdir();
  try {
    for (const n of [1, 2, 3]) fs.writeFileSync(path.join(dir, `task-0${n}.md`), taskBody(n), 'utf8');
    const p = path.join(dir, 'tasks-x.md');
    fs.writeFileSync(p, tpl, 'utf8');
    const r = runJson(VALIDATE, ['--tasks-index', p, '--index-only']);
    assert.equal(r.reviewFocus.present, true);
    assert.ok(r.reviewFocus.lines.length >= 1 && r.reviewFocus.lines.length <= 5);
    assert.deepEqual(r.reviewFocus.unknownTasks, []);
    assert.deepEqual(r.reviewFocus.unowned, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the prose chain: template → writer pin → self-review item → reviewer handoff', () => {
  const read = (rel) => fs.readFileSync(path.join(SKILL_DIR, rel), 'utf8');
  const writer = read('agents/task-writer.md');
  assert.match(writer, /Review Focus/u, 'the writer is told each assigned line becomes a test step');
  assert.match(writer, /never run|do not build/iu);
  const checklist = read('references/self-review-checklist.md');
  assert.match(checklist, /^\*\*7\. Review Focus:\*\*/mu, 'self-review has the Review Focus step');
  assert.match(checklist, /empty section means you checked and found none/u);
  const entry = read('references/entry-phase.md');
  assert.match(entry, /## Foco de Revisão/u, 'the entry phase says where the list is written and by whom');
  const skill = read('SKILL.md');
  assert.match(skill, /Foco de Revisão/u, 'SKILL.md routes to the section without restating a count');
  assert.doesNotMatch(skill, /run through (?:all )?(?:seven|7)\s+steps/iu);
});

test('a `Review Focus:` label with no test code in its own step is not a pin (label-only)', () => {
  const dir = mkdir();
  fs.writeFileSync(path.join(dir, 'tasks-x.md'), index({ focus: ['- unreadable input → error message → `task-01`'] }));
  fs.writeFileSync(path.join(dir, 'task-01.md'), taskBody(1, { labelOnly: true }));
  fs.writeFileSync(path.join(dir, 'task-02.md'), taskBody(2));
  const r = runJson(VALIDATE, ['--tasks-index', path.join(dir, 'tasks-x.md')]);
  assert.deepEqual(r.reviewFocus.unpinned.map((u) => u.task), [1]);
  assert.ok(r.warnings.some((w) => /carries no test code in its own step/.test(w.message)));
});
