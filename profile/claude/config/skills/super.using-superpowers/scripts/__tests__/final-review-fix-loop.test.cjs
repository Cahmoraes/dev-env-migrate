'use strict';

/**
 * Prose-guard: the final code review must FIX its findings, not just report them.
 *
 * The per-task gates already loop "implementer fixes → re-review until ✅". The
 * final review (broad reviewer + optional /code-review or Copilot `review`) must
 * carry the same contract, or Critical/Important bugs found at the end would be
 * merely printed and the branch finished anyway. These tests fail if any execution
 * skill's final-review step loses the fix loop.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/final-review-fix-loop.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const EXECUTION_SKILLS = [
  'super.subagent-driven-development/SKILL.md',
  'super.parallel-subagent-in-tree/SKILL.md',
  'super.parallel-subagent-development/SKILL.md',
];

for (const rel of EXECUTION_SKILLS) {
  const body = read(rel);

  test(`${rel}: final review states findings are fixed, not just reported`, () => {
    assert.match(
      body,
      /fixed, not just reported/i,
      `${rel} final-review step must say findings are fixed, not just reported`,
    );
  });

  test(`${rel}: final review fix loop dispatches an implementer and re-reviews`, () => {
    // The fix loop must name the implementer (who fixes) and a re-run/loop (re-review).
    assert.match(body, /dispatch a fresh implementer subagent.{0,40}to fix/is, `${rel} must dispatch an implementer to fix final findings`);
    assert.match(body, /(re-run the review|Loop until)/i, `${rel} must re-review and loop until clean`);
  });

  test(`${rel}: Critical/Important findings block finishing`, () => {
    assert.match(
      body,
      /not proceed to the QA gate or finishing while a Critical\/Important finding is open/i,
      `${rel} must block finishing while a Critical/Important final finding is open`,
    );
  });
}
