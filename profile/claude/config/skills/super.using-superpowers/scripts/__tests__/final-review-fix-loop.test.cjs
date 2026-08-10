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

// parallel-subagent-in-tree and parallel-subagent-development delegate their
// fix-loop prose to finish-tail.md (the single canonical source) instead of
// duplicating it — include it here too so the guards see the real content.
// finish-tail.md hard-wraps its prose at ~100 cols, so a sentence checked by a
// literal-space regex can straddle a line break; collapse whitespace runs to a
// single space so wrapping never masks content that is actually present.
const FINISH_TAIL = read('super.subagent-driven-development/references/finish-tail.md').replace(/\s+/g, ' ');
// All three now delegate. The sequential skill used to carry an inline copy of the tail;
// that copy was 7.7 KB sitting past the 20.000-char compaction window, so on resume the
// model had the gates in neither place. It now points at the same canonical file the two
// parallel skills use — which is what this set has always meant.
const DELEGATES_FINISH_TAIL = new Set([
  'super.subagent-driven-development/SKILL.md',
  'super.parallel-subagent-in-tree/SKILL.md',
  'super.parallel-subagent-development/SKILL.md',
]);

for (const rel of EXECUTION_SKILLS) {
  const body = read(rel) + (DELEGATES_FINISH_TAIL.has(rel) ? '\n' + FINISH_TAIL : '');

  test(`${rel}: final review states findings are fixed, not just reported`, () => {
    assert.match(
      body,
      /fixed, not just reported/i,
      `${rel} final-review step must say findings are fixed, not just reported`,
    );
  });

  test(`${rel}: final review fix loop dispatches an implementer and re-reviews`, () => {
    // The fix loop must name the implementer (who fixes) and a re-run/loop (re-review).
    // Allow up to 80 chars between "subagent" and "to fix": finish-tail.md is a shared
    // reference cited from multiple skills, so it names the fully-qualified agent path
    // (`super.subagent-driven-development/agents/implementer.md`) rather than the short
    // `./agents/implementer.md` form the single-skill inline version uses.
    assert.match(body, /dispatch a fresh implementer subagent.{0,80}to fix/is, `${rel} must dispatch an implementer to fix final findings`);
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
