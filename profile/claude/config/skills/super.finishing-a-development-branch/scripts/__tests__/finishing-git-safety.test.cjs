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
const FIN = path.join(SKILLS, 'super.finishing-a-development-branch');
const body = fs.readFileSync(path.join(FIN, 'SKILL.md'), 'utf8');
// Step 5 lives in one reference per menu (only one menu runs per session); the option
// invariants below are pinned where the commands now live.
const standard = fs.readFileSync(path.join(FIN, 'references', 'options-standard.md'), 'utf8');
const detached = fs.readFileSync(path.join(FIN, 'references', 'options-detached.md'), 'utf8');

test('Option 1 guards the base-branch checkout before merging', () => {
  assert.match(standard, /if ! git checkout <base-branch>; then/,
    'the checkout to the base branch must be guarded (STOP on failure), not fire-and-forget');
  // The guard must exist BEFORE the merge, so a failed checkout never reaches the merge.
  const guardIdx = standard.indexOf('if ! git checkout <base-branch>; then');
  const mergeIdx = standard.indexOf('if ! git merge <feature-branch>; then');
  assert.ok(guardIdx !== -1 && mergeIdx !== -1 && guardIdx < mergeIdx,
    'the checkout guard must precede the merge so a failed checkout stops before merging');
});

test('Option 1 re-runs the suite only when the merge produced a tree the feature tip never had', () => {
  // A fast-forward merge yields exactly the tree Step 2 proved green; two sessions on 2026-09-16
  // paid 92s and 165s re-running the suite on it. The guard compares trees, not SHAs, so a
  // merge commit with an identical tree (merge.ff=false) is also skipped.
  const treeGuard = 'if [ "$(git rev-parse "HEAD^{tree}")" != "$(git rev-parse "<feature-branch>^{tree}")" ]; then';
  const guardIdx = standard.indexOf(treeGuard);
  const testIdx = standard.indexOf('if ! <test command>; then');
  const resetIdx = standard.indexOf('git reset --hard "$BASE_BEFORE"');
  assert.ok(guardIdx !== -1, 'the post-merge test run must sit behind a tree-comparison guard');
  assert.ok(testIdx !== -1 && guardIdx < testIdx, 'the guard must wrap the test run');
  assert.ok(resetIdx !== -1 && testIdx < resetIdx, 'a failing post-merge run must still roll base back to BASE_BEFORE');
});

test('the checkout guard explains the wrong-branch corruption it prevents', () => {
  assert.match(standard, /land on whatever branch MAIN_ROOT is still on/,
    'the guard must state why an unguarded checkout is dangerous (merge lands on the wrong branch)');
});

test('detached-HEAD options have their own execution block', () => {
  assert.match(body, /Detached-HEAD 3 options → `references\/options-detached\.md`/,
    'Step 5 must route the detached-HEAD menu to its reference, not leave it to improvisation');
  assert.match(detached, /^# Detached-HEAD options/m,
    'the reference must open with the menu it executes');
});

test('detached-HEAD push names the work on a branch before pushing', () => {
  assert.match(detached, /git branch <feature-name> "\$DETACHED_TIP"/,
    'detached Option 1 must create a branch at the current commit before pushing');
  const branchIdx = detached.indexOf('git branch <feature-name> "$DETACHED_TIP"');
  const pushIdx = detached.indexOf('git push -u origin <feature-name>', branchIdx);
  assert.ok(branchIdx !== -1 && pushIdx !== -1 && branchIdx < pushIdx,
    'the branch must be created BEFORE the push (detached commits are GC-able)');
});

test('WORKTREE_PATH is captured in Step 3 (before any option cd), not recomputed in Step 6', () => {
  // Step 3 must capture the invocation tree BEFORE Option 1/4 cd into MAIN_ROOT.
  assert.match(body, /WORKTREE_PATH=\$\(git rev-parse --show-toplevel\)/,
    'Step 3 must capture WORKTREE_PATH in the original invocation directory');
  const step3Idx = body.indexOf('### Step 3');
  const step6Idx = body.indexOf('### Step 6');
  const wtCaptureIdx = body.indexOf('WORKTREE_PATH=$(git rev-parse --show-toplevel)');
  assert.ok(wtCaptureIdx > step3Idx && wtCaptureIdx < step6Idx,
    'the WORKTREE_PATH capture must live in Step 3, before Step 6');
  // Step 6 must reuse, not recompute (recomputing after the cd misreads the worktree).
  const step6 = body.slice(step6Idx);
  assert.doesNotMatch(step6, /WORKTREE_PATH=\$\(git rev-parse --show-toplevel\)/,
    'Step 6 must NOT recompute WORKTREE_PATH — it cd\'d to MAIN_ROOT and would misidentify the tree');
  assert.match(step6, /do NOT recompute them here/,
    'Step 6 must instruct reuse of the Step 3 captures');
});
