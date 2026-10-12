'use strict';

// The MUTATE step of SKILL.md is the one place a task proves its tests fail when the code is
// wrong. Its fenced command must name the batch runner that ships beside it, and the step must
// keep the parts a reader acts on: the task's Sabotage: lines and the report's Mutation: line.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..', '..');
const body = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const step = (body.split('### MUTATE - Prove the Test Discriminates')[1] || '').split('\n### ')[0];

test('SKILL.md has a MUTATE step between Verify GREEN and REFACTOR', () => {
  assert.ok(step, 'the MUTATE heading exists');
  const at = (h) => body.indexOf(h);
  assert.ok(at('### Verify GREEN') < at('### MUTATE') && at('### MUTATE') < at('### REFACTOR'));
});

test('the fenced command runs the batch runner shipped with this skill', () => {
  const m = step.match(/node <super\.test-driven-development-base-dir>\/(scripts\/run-mutation-batch\.cjs) --plan/);
  assert.ok(m, 'the step carries the fenced command');
  assert.ok(fs.existsSync(path.join(SKILL_DIR, m[1])), `${m[1]} exists`);
});

test('the step includes every Sabotage: line and names the report line', () => {
  assert.match(step, /\*\*every\*\* `Sabotage:` line of the task file/);
  assert.match(step, /`Mutation: <killed>\/<total> killed \(<ids>\); survivors: none`/);
});
