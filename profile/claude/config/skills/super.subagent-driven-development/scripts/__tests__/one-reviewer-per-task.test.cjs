'use strict';

/**
 * one-reviewer-per-task.test.cjs — every task gets exactly one task reviewer, always.
 *
 * The per-task review has one shape: a single fresh, blind reviewer returning two verdicts
 * (spec compliance, then code quality) in one dispatch. There is no second reviewer to earn,
 * no leaf that skips the reviewer, and no computed shape to override. Deciding the shape per
 * task — by the controller's judgment or by a keyword scan — cost more than the review it
 * saved and escalated on the wrong tasks. This file pins that the decision is gone: the two
 * split templates do not exist, the SKILL.md dispatches the one template, and no runtime prose
 * of this skill names a shape.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/one-reviewer-per-task.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SDD = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SDD, rel), 'utf8');

test('the split reviewer templates are gone', () => {
  for (const rel of ['agents/spec-reviewer.md', 'agents/code-quality-reviewer.md', 'agents/combined-reviewer.md']) {
    assert.ok(!fs.existsSync(path.join(SDD, rel)), `${rel} must not exist — one task reviewer per task`);
  }
  assert.ok(fs.existsSync(path.join(SDD, 'agents/task-reviewer.md')), 'agents/task-reviewer.md is the one reviewer');
});

test('the SKILL.md dispatches the task reviewer, once per task, two verdicts', () => {
  const skill = read('SKILL.md');
  const loop = skill.split('**Per task (sequential):**')[1].split('**Full-suite checkpoint')[0];
  assert.match(loop, /Dispatch the task reviewer \(`--role reviewer`/);
  assert.match(loop, /one fresh, blind reviewer per task, every task, two verdicts in one dispatch: spec compliance first, then code quality/);
  assert.match(loop, /The final review is a separate dispatch after all tasks, never folded into this one/);
});

test('the task reviewer template returns both verdicts and keeps the standard floor', () => {
  const body = read('agents/task-reviewer.md');
  assert.match(body, /description: "Review \{TASK_LABEL\} \(spec \+ quality\)"/);
  assert.match(body, /### Part A — Spec compliance/);
  assert.match(body, /### Part B — Code quality/);
  assert.match(body, /floored at [`]?standard/i);
});

// ── Batched dispatch: several same-shape tasks, still one implementer + one reviewer ─────────

test('the SKILL.md carries the same-shape batching rule as the controller\'s call, ahead of the per-task loop', () => {
  const skill = read('SKILL.md');
  const at = skill.indexOf('**Batch small same-shape tasks.**');
  const loop = skill.indexOf('**Per task (sequential):**');
  assert.ok(at > 0 && at < loop, 'the batching rule sits right before the per-task loop');
  const rule = skill.slice(at, loop);
  assert.match(rule, /`\*\*Tier:\*\* cheap`/);
  assert.match(rule, /one task reviewer over the whole range/);
  assert.match(rule, /--task-number n1,n2,… --verify/);
  assert.match(rule, /Reserve one dispatch per task for work that needs its own judgment, its own tests, or its own review surface/);
  assert.match(rule, /`\.\/references\/execution-loop\.md`, "Batched dispatch"/);
});

test('execution-loop.md spells the batch contract: every task IN_PROGRESS, one BASE, one range, one reviewer, one --verify', () => {
  const loop = read('references/execution-loop.md');
  const sec = loop.split('## Batched dispatch')[1].split(/\n## /)[0];
  assert.match(sec, /--role implementer --task-number n1,n2,… --start`: every task file of the\s+batch goes IN_PROGRESS/);
  assert.match(sec, /BASE from the\s+first task's `started` line/);
  assert.match(sec, /One task reviewer, `--role reviewer --task-number n1,n2,…`, over the whole batch/);
  assert.match(sec, /--task-number n1,n2,… --status DONE --verify/);
  assert.match(sec, /a failure marks none of them/);
});

test('both agent templates accept a list in the task-file slot, and the reviewer checks the diff file by file', () => {
  const implementer = read('agents/implementer.md');
  assert.match(implementer, /A batched\s+dispatch lists several task files here: implement every one of them, in index order/);
  const reviewer = read('agents/task-reviewer.md');
  assert.match(reviewer, /- \*\*Task file:\*\* \{TASK_FILES\} — a batched dispatch lists several/);
  assert.match(reviewer, /If the brief lists several task files \(a batched dispatch\), check the diff against each\s+task's `## Arquivos`\/`## Files` file by file: a listed file the diff never touches is a\s+Missing finding/);
});

// ─── Sequential only: no wave vocabulary in this skill ──────────────────────────────────
// The retired wave machinery is swept repo-wide by retired-vocabulary.test.cjs. The bare word
// is not there because super.user-story-verification legitimately runs stories "in waves";
// in this skill it can only mean the removed execution waves.
test('no runtime prose of this skill talks about waves', () => {
  const banned = [/\bwaves?\b/i];
  const files = ['SKILL.md'];
  for (const dir of ['references', 'agents']) {
    for (const f of fs.readdirSync(path.join(SDD, dir))) if (f.endsWith('.md')) files.push(`${dir}/${f}`);
  }
  assert.ok(files.length >= 12, `swept only ${files.length} files — discovery is broken`);
  const hits = [];
  for (const rel of files) {
    const body = read(rel);
    for (const re of banned) if (re.test(body)) hits.push(`${rel}: ${re}`);
  }
  assert.deepEqual(hits, []);
});
