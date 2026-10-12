'use strict';

/**
 * same-shape-batching-rule.test.cjs — the planner folds same-shape mechanical edits into
 * one task in every plan.
 *
 * N tasks that are each the same one-line edit in a different file buy N fresh contexts and
 * N reviews of the same diff shape. The planner writes them as ONE task with N files and N
 * checks; the executor reviews that task's diff file by file. This file pins that the rule
 * is stated where the planner reads it (SKILL.md, always in context) and that the reference
 * carries it as a case that holds for every plan, ahead of the behavior consolidation.
 *
 * Run: node --test super.writing-plans/scripts/__tests__/same-shape-batching-rule.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILL, rel), 'utf8');

test('SKILL.md states the same-shape rule inline, for every plan', () => {
  const skill = read('SKILL.md');
  const section = skill.split('## Task Granularity')[1].split(/\n## /)[0];
  assert.match(section, /One rule holds for every plan/);
  assert.match(section, /\*\*one task with N files and N checks, never N tasks\*\*/);
});

test('the reference carries the same-shape case first, and the behavior-consolidation case second', () => {
  const ref = read('references/task-decomposition-granularity.md');
  const case1 = ref.indexOf('## Case 1 (every plan)');
  const case2 = ref.indexOf('## Case 2 (every plan)');
  assert.ok(case1 > 0 && case2 > case1, 'Case 1 (same-shape) precedes Case 2 (coalesce behaviors)');
  const body1 = ref.slice(case1, case2);
  assert.match(body1, /\*\*one task with N files\*\*/);
  assert.match(body1, /\*\*N checks\*\*/);
  assert.match(body1, /Reserve one task per edit for work that needs its own judgment, its own tests, or its own review surface/);
  assert.match(body1, /safety-relevant behavior .* keeps its own task/i);
});

test('the reference no longer reasons about parallel waves', () => {
  assert.doesNotMatch(read('references/task-decomposition-granularity.md'), /parallel/i);
});
