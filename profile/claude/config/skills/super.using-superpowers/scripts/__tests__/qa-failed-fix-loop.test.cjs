'use strict';

/**
 * Prose-guard: a FAILED QA gate runs ONE fix round through the implementer + review
 * loop, and never lets the controller patch the code or the report by hand.
 *
 * Measured before this contract existed (Claude Code, sonnet, 4 runs): the gate found
 * the planted bug, then on the next user turn the controller edited `src/` itself,
 * rewrote the QA report to APROVADO without a fresh `result.json`, and in 2/4 runs
 * went on to finishing — the only point in the pipeline that approved its own work.
 * With the round written into Step 6 (2 runs): task reopened, implementer dispatched
 * with `failure_details`, combined review, the story's QA subagent re-dispatched, task
 * closed, report regenerated once — 0 inline edits.
 *
 * Four surfaces carry the contract and each is pinned here:
 *   1. super.user-story-verification Step 6 — the round itself (who does what, in order).
 *   2. final-stage.md QA gate (gate 2) — the orchestrator's FAILED row is a STOP, not a second loop.
 *   3. SDD re-entry — a task the gate left IN_PROGRESS resumes as a fix re-dispatch.
 *   4. mark-task-status.cjs — DONE → IN_PROGRESS is a real reopen: the index checkbox
 *      flips back, so `parse-tasks.cjs --assert-all-done` goes red by mechanism.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/qa-failed-fix-loop.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const QA = 'super.user-story-verification/SKILL.md';
const FINAL_STAGE = 'super.subagent-driven-development/references/final-stage.md';
const SDD = 'super.subagent-driven-development/SKILL.md';
const MARK = path.join(SKILLS, 'super.subagent-driven-development/scripts/mark-task-status.cjs');
const PARSE = path.join(SKILLS, 'super.subagent-driven-development/scripts/parse-tasks.cjs');

/** Step 6 of the QA skill, from the FAILED branch to the end of the section. */
function failedBranch() {
  const body = read(QA);
  const start = body.indexOf('**If status is `FAILED`');
  const end = body.indexOf('## Red Flags', start);
  assert.ok(start > 0 && end > start, `${QA}: could not isolate the FAILED branch of Step 6`);
  return body.slice(start, end);
}

// ---------------------------------------------------------------- 1. the round, in the QA skill

test('QA Step 6 FAILED: the gate runs one fix round itself, in the implementer → review → re-verify order', () => {
  const s = failedBranch();
  const order = [
    /mark-task-status\.cjs[^\n]*--status IN_PROGRESS/, // 1. reopen
    /agents\/implementer\.md/, // 2. implementer
    /## Review Findings to Address/, // ...with the findings where a fix re-dispatch expects them
    /agents\/task-reviewer\.md/, // 3. review
    /re-dispatch the story's QA subagent/i, // 4. re-verify
    /--status DONE/, // close the task only after re-verify
  ];
  let cursor = 0;
  for (const re of order) {
    const m = s.slice(cursor).match(re);
    assert.ok(m, `${QA}: FAILED branch lost (or reordered) ${re}`);
    cursor += m.index + m[0].length;
  }
});

test('QA Step 6 FAILED: the task is found by its [FR-XXX] title tag, mechanically', () => {
  const s = failedBranch();
  assert.match(s, /task-file title carries that `\[FR-XXX\]` tag/, 'the story → task mapping goes through the task FILE title (the index line carries no FR tags)');
  assert.match(s, /`parse-tasks\.cjs` → `requirements`/, 'the tag is read from parse-tasks.cjs output, not guessed');
});

test('parse-tasks reads each task\'s FR ids from its task-file title, with an index line that carries none', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-map-'));
  try {
    const plans = path.join(dir, 'plans');
    fs.mkdirSync(plans);
    const task = (n, title, body = '') => [
      `# Task ${n}: ${title}`, '', '**Status:** PENDING', '**PRD:** N/A', '**Spec:** N/A', '', body, '',
    ].join('\n');
    fs.writeFileSync(path.join(plans, 'task-01.md'), task(1, 'Service [FR-001]'), 'utf8');
    // an FR cited only in the body is not a declaration: the title is
    fs.writeFileSync(path.join(plans, 'task-02.md'), task(2, 'Routes [FR-002, FR-005]', 'Keeps FR-009 in mind.'), 'utf8');
    // a legacy index line with the tag still maps
    fs.writeFileSync(path.join(plans, 'task-03.md'), task(3, 'Legacy'), 'utf8');
    const index = path.join(plans, 'tasks-x.md');
    fs.writeFileSync(index, [
      '# Tarefas: x', '', '## Tarefas', '',
      '- [ ] 1. Service → `task-01.md`', '- [ ] 2. Routes → `task-02.md`', '- [ ] 3. Legacy [FR-007] → `task-03.md`', '',
    ].join('\n'), 'utf8');
    const json = JSON.parse(execFileSync('node', [PARSE, '--tasks-index', index, '--repo-root', dir], { encoding: 'utf8' }));
    assert.deepEqual(json.pending.map((t) => t.requirements), [['FR-001'], ['FR-002', 'FR-005'], ['FR-007']]);
    assert.deepEqual(json.pending.map((t) => t.title), ['Service', 'Routes', 'Legacy [FR-007]']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('QA Step 6 FAILED: exactly one round, then STOP — and the report is never hand-edited', () => {
  const s = failedBranch();
  assert.match(s, /one fix round/i);
  assert.match(s, /never patches source inline/i);
  assert.match(s, /never by hand/i, 'the report/result.json must be regenerated from the new result.json set');
  assert.match(s, /\*\*STOP\.\*\*/);
  assert.match(s, /super\.systematic-debugging/, 'a second FAILED hands the user the debugging route');
});

test('QA Step 6 FAILED: the old "fix it and re-run the orchestrator" hand-off is gone', () => {
  const body = read(QA);
  assert.doesNotMatch(body, /Fix the implementation, then re-run the orchestrator/);
  assert.doesNotMatch(body, /When fixing: the orchestrator skips tasks/);
});

test('QA Red Flags: editing source or the report by hand after a FAILED is a listed prohibition', () => {
  const body = read(QA);
  assert.match(body, /- Proceed to merge\/PR, edit project source, or rewrite the report or a `result\.json` by hand after a `FAILED`/);
});

// ---------------------------------------------------------------- 2. the orchestrator's row

test('final-stage QA gate: the FAILED row records that the round already ran and STOPs', () => {
  const row = read(FINAL_STAGE).split('\n').find((l) => l.startsWith('| `FAILED` |'));
  assert.ok(row, `${FINAL_STAGE}: no FAILED row in the QA result table`);
  assert.match(row, /already ran its one fix round/i);
  assert.match(row, /\*\*STOP\.\*\*/);
  assert.match(row, /never patch source inline/i);
  assert.doesNotMatch(row, /until the user resolves them and re-runs/i, 'the row must not hand the fix back to the user');
});

test('SDD gate index: the QA line names the round, not a bare STOP', () => {
  const line = read(SDD).split('\n').find((l) => /^\d+\. \*\*QA gate\*\*/.test(l));
  assert.ok(line, `${SDD}: gate index lost its QA line`);
  assert.match(line, /ran its one fix round; still failing → \*\*STOP\*\*/);
});

// ---------------------------------------------------------------- 3. re-entry carries the findings

test('SDD re-entry: a task the QA gate reopened resumes as a fix re-dispatch with its failure_details', () => {
  const line = read(SDD).split('\n').find((l) => l.startsWith('**Then, before any dispatch:**'));
  assert.ok(line, `${SDD}: resume line missing`);
  assert.match(line, /IN_PROGRESS/);
  assert.match(line, /failure_details/);
  assert.match(line, /## Review Findings to Address/);
});

// ---------------------------------------------------------------- 4. reopen is a real mechanism

test('mark-task-status DONE → IN_PROGRESS unchecks the index and turns --assert-all-done red', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-reopen-'));
  try {
    const plans = path.join(dir, 'plans');
    fs.mkdirSync(plans);
    fs.mkdirSync(path.join(dir, 'specs'));
    fs.writeFileSync(path.join(dir, 'specs', 'x-design.md'), '# x\n', 'utf8');
    // parse-tasks now checks that a DONE task's declared files exist (S8.0: a tracker all
    // [x] with no code stopped two runs); the fixture's deliverable must be on disk.
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), '', 'utf8');
    const task = (n, title) => [
      `# Task ${n}: ${title}`, '', '**Status:** DONE', '**PRD:** N/A', '**Spec:** ../specs/x-design.md',
      '**Tier:** cheap', '', '## Arquivos', '', '- Modify: `src/a.js`', '',
    ].join('\n');
    fs.writeFileSync(path.join(plans, 'task-01.md'), task(1, 'Service [FR-001]'), 'utf8');
    fs.writeFileSync(path.join(plans, 'task-02.md'), task(2, 'Routes [FR-002] [FR-005]'), 'utf8');
    const index = path.join(plans, 'tasks-x.md');
    fs.writeFileSync(index, [
      '# Tarefas: x', '', '**Spec:** `../specs/x-design.md`', '**PRD:** N/A', '', '## Tarefas', '',
      '- [x] 1. Service → `task-01.md`', '- [x] 2. Routes → `task-02.md`', '',
    ].join('\n'), 'utf8');

    // Green before: the gate passes on a finished plan.
    const before = spawnSync('node', [PARSE, '--tasks-index', index, '--repo-root', dir, '--assert-all-done'], { encoding: 'utf8' });
    assert.equal(before.status, 0, `precondition: assert-all-done should pass on a finished plan\n${before.stdout}${before.stderr}`);

    // Reopen task 2 the way the QA gate does (index + number, no --task-file).
    const out = JSON.parse(execFileSync('node', [MARK, '--tasks-index', index, '--task-number', '2', '--status', 'IN_PROGRESS'], { encoding: 'utf8' }));
    assert.equal(out.statusBefore, 'DONE');
    assert.equal(out.status, 'IN_PROGRESS');
    assert.equal(out.indexCheckboxBefore, 'x');
    assert.equal(out.indexCheckboxAfter, ' ');
    assert.match(fs.readFileSync(index, 'utf8'), /^- \[ \] 2\. Routes → `task-02\.md`$/m);
    assert.match(fs.readFileSync(index, 'utf8'), /^- \[x\] 1\. Service → `task-01\.md`$/m, 'sibling task untouched');

    // Red after: the done-state gate (final-stage gate 3) cannot pass while the task is open.
    const after = spawnSync('node', [PARSE, '--tasks-index', index, '--repo-root', dir, '--assert-all-done'], { encoding: 'utf8' });
    assert.equal(after.status, 2, `assert-all-done must exit 2 with a reopened task\n${after.stdout}${after.stderr}`);
    const json = JSON.parse(after.stdout);
    assert.equal(json.allDone, false);
    assert.deepEqual(json.inProgress.map((t) => t.number), [2]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
