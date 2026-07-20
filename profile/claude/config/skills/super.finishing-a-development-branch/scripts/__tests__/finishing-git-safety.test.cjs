'use strict';

/**
 * finishing-git-safety.test.cjs — pins two git-safety invariants whose absence was
 * shown (by simulation) to corrupt a branch or lose commits.
 *
 * 1. Option 1 (Merge Locally) MUST guard `git checkout <base-branch>`. In a worktree
 *    flow the merge runs in MAIN_ROOT, whose cleanliness Step 2 did NOT verify. An
 *    unguarded checkout that fails (dirty MAIN_ROOT, or base checked out in another
 *    worktree) leaves you on the wrong branch, and the merge below lands on — and
 *    pollutes — that wrong branch. Simulated: `feat.txt` + a merge commit leaked onto
 *    an unrelated `other` branch.
 *
 * 2. Detached-HEAD options MUST name the work on a branch BEFORE pushing/moving.
 *    Detached commits are garbage-collected once HEAD moves, and the standard
 *    `git push -u origin <feature-branch>` has no branch to push on a detached HEAD.
 *
 * Run: node --test super.finishing-a-development-branch/scripts/__tests__/finishing-git-safety.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const SKILL = path.join(SKILLS, 'super.finishing-a-development-branch', 'SKILL.md');
const body = fs.readFileSync(SKILL, 'utf8');

test('Option 1 guards the base-branch checkout before merging', () => {
  assert.match(body, /if ! git checkout <base-branch>; then/,
    'the checkout to the base branch must be guarded (STOP on failure), not fire-and-forget');
  // The guard must exist BEFORE the merge, so a failed checkout never reaches the merge.
  const guardIdx = body.indexOf('if ! git checkout <base-branch>; then');
  const mergeIdx = body.indexOf('if ! git merge <feature-branch>; then');
  assert.ok(guardIdx !== -1 && mergeIdx !== -1 && guardIdx < mergeIdx,
    'the checkout guard must precede the merge so a failed checkout stops before merging');
});

test('the checkout guard explains the wrong-branch corruption it prevents', () => {
  assert.match(body, /land on whatever branch MAIN_ROOT is still on/,
    'the guard must state why an unguarded checkout is dangerous (merge lands on the wrong branch)');
});

test('detached-HEAD options have their own execution block', () => {
  assert.match(body, /#### Detached-HEAD options/,
    'Step 6 must give execution for the detached-HEAD menu, not leave it to improvisation');
});

test('detached-HEAD push names the work on a branch before pushing', () => {
  assert.match(body, /git branch <feature-name> "\$DETACHED_TIP"/,
    'detached Option 1 must create a branch at the current commit before pushing');
  const branchIdx = body.indexOf('git branch <feature-name> "$DETACHED_TIP"');
  const pushIdx = body.indexOf('git push -u origin <feature-name>', branchIdx);
  assert.ok(branchIdx !== -1 && pushIdx !== -1 && branchIdx < pushIdx,
    'the branch must be created BEFORE the push (detached commits are GC-able)');
});

test('WORKTREE_PATH is captured in Step 3 (before any option cd), not recomputed in Step 7', () => {
  // Step 3 must capture the invocation tree BEFORE Option 1/4 cd into MAIN_ROOT.
  assert.match(body, /WORKTREE_PATH=\$\(git rev-parse --show-toplevel\)/,
    'Step 3 must capture WORKTREE_PATH in the original invocation directory');
  const step3Idx = body.indexOf('### Step 3');
  const step7Idx = body.indexOf('### Step 7');
  const wtCaptureIdx = body.indexOf('WORKTREE_PATH=$(git rev-parse --show-toplevel)');
  assert.ok(wtCaptureIdx > step3Idx && wtCaptureIdx < step7Idx,
    'the WORKTREE_PATH capture must live in Step 3, before Step 7');
  // Step 7 must reuse, not recompute (recomputing after the cd misreads the worktree).
  const step7 = body.slice(step7Idx);
  assert.doesNotMatch(step7, /WORKTREE_PATH=\$\(git rev-parse --show-toplevel\)/,
    'Step 7 must NOT recompute WORKTREE_PATH — it cd\'d to MAIN_ROOT and would misidentify the tree');
  assert.match(step7, /do NOT recompute them here/,
    'Step 7 must instruct reuse of the Step 3 captures');
});
