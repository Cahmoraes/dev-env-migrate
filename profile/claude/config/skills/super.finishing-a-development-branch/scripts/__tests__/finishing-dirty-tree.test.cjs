'use strict';

/**
 * finishing-dirty-tree.test.cjs — finishing must STOP on a dirty working tree instead
 * of integrating it, which is the expected state when execution ran with
 * `workflow.auto_commit: false` (each task's changes left uncommitted by design).
 *
 * Regression guard: Step 2's clean-tree gate is a load-bearing safety invariant carried
 * only by prose. A merge or PR from a dirty tree would silently omit the uncommitted work
 * (or fold it into an unrelated commit), so the skill must run `git status --porcelain`,
 * recognize the auto_commit:false state, and refuse to present integration options until
 * the work is committed. Without this test the gate could be edited away and the suite
 * would stay green (same class as the brainstorming 5-vs-8 count drift).
 *
 * Run: node --test super.finishing-a-development-branch/scripts/__tests__/finishing-dirty-tree.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const SKILL = path.join(SKILLS, 'super.finishing-a-development-branch', 'SKILL.md');
const body = fs.readFileSync(SKILL, 'utf8');

test('Step 2 runs the deterministic clean-tree gate before integrating', () => {
  assert.match(body, /git status --porcelain/,
    'finishing must check the working tree with `git status --porcelain` before Step 3');
});

test('a dirty tree is recognized as the expected auto_commit:false state', () => {
  assert.match(body, /workflow\.auto_commit: false/,
    'the dirty-tree branch must name the auto_commit:false state that produces it');
  assert.match(body, /A merge or PR from a dirty tree would silently omit the uncommitted work/,
    'the skill must state WHY a dirty tree cannot be integrated (silent work loss)');
});

test('a dirty tree STOPS integration until the work is committed', () => {
  assert.match(body, /do \*\*not\*\* present integration options yet/,
    'the skill must refuse to present integration options while the tree is dirty');
  assert.match(body, /Resolve this[\s\S]*?before proceeding to Step 3/,
    'the dirty-tree path must require resolution (commit or explicit override) before Step 3');
});
