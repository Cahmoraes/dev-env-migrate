'use strict';

/**
 * finishing-base-branch.test.cjs — finishing must handle the case where the work was
 * committed straight onto the base/default branch (no separate feature branch).
 *
 * Regression guard for an observed real run: execution ran on `main`, so at finishing
 * there was no feature branch to merge. The skill's environment table had no row for
 * "current branch == base", and Step 5 mandated "present exactly 4 options" whose
 * option 1 (merge to base) is a no-op on `main` — forcing the model to improvise the
 * menu. This test pins the on-base-branch environment, menu, execution, and the
 * relaxed Red Flag so the path is canonical, not improvised.
 *
 * Run: node --test super.finishing-a-development-branch/scripts/__tests__/finishing-base-branch.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const SKILL = path.join(SKILLS, 'super.finishing-a-development-branch', 'SKILL.md');
const body = fs.readFileSync(SKILL, 'utf8');

test('Step 3 detection captures the current branch and the default branch', () => {
  assert.match(body, /git rev-parse --abbrev-ref HEAD/,
    'environment detection must read the current branch');
  assert.match(body, /symbolic-ref[^\n]*refs\/remotes\/origin\/HEAD/,
    'environment detection must resolve the default branch (origin/HEAD), not assume main');
});

test('the environment table has an on-base-branch row distinct from the feature-branch row', () => {
  assert.match(body, /on a feature branch/,
    'the table must still cover the normal feature-branch case');
  assert.match(body, /on the base branch \(`BRANCH` == `DEFAULT`\)/,
    'the table must add a row for work committed straight onto the base branch');
});

test('Step 5 presents an on-base-branch menu (no merge), starting with push to base', () => {
  assert.match(body, /On the base branch[^\n]*present exactly these 4 options/i,
    'Step 5 must present a dedicated on-base-branch menu');
  assert.match(body, /Push to origin\/<base-branch>/,
    'the on-base menu option 1 must be a direct push, not a merge-to-self');
  assert.match(body, /Move the commits to a new branch and open a Pull Request/,
    'the on-base menu must offer moving the commits to a branch + PR');
});

test('Step 6 gives execution for the on-base-branch options without merge/worktree cleanup', () => {
  assert.match(body, /#### On-base-branch options/,
    'Step 6 must have an execution subsection for the on-base-branch options');
  assert.match(body, /no feature branch to merge or delete/i,
    'the execution must state there is nothing to merge or delete');
  // Moving to a branch must capture the work before any rewind (safety invariant).
  assert.match(body, /capture the work on a branch FIRST/i,
    'the move-to-branch path must capture the branch before reset --hard');
});

test('the Red Flag no longer demands "exactly 4 options" unconditionally', () => {
  const redFlag = body.split('## Red Flags')[1] || '';
  assert.doesNotMatch(redFlag, /Present exactly 4 options \(or 3 for detached HEAD\)/,
    'the rigid "exactly 4 options" Red Flag must be replaced by an env-matched menu rule');
  assert.match(redFlag, /the on-base-branch 4 options/,
    'the Red Flag must acknowledge the on-base-branch menu as a valid environment menu');
});
