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
];

// The execution skill delegates its
// fix-loop prose to final-stage.md (the single canonical source) instead of
// duplicating it — include it here too so the guards see the real content.
// final-stage.md hard-wraps its prose at ~100 cols, so a sentence checked by a
// literal-space regex can straddle a line break; collapse whitespace runs to a
// single space so wrapping never masks content that is actually present.
const FINAL_STAGE = read('super.subagent-driven-development/references/final-stage.md').replace(/\s+/g, ' ');
// The sequential skill used to carry an inline copy of the tail; that copy was 7.7 KB
// sitting past the 20.000-char compaction window, so on resume the model had the gates in
// neither place. It now points at the canonical file.
const DELEGATES_FINAL_STAGE = new Set([
  'super.subagent-driven-development/SKILL.md',
]);

for (const rel of EXECUTION_SKILLS) {
  const body = read(rel) + (DELEGATES_FINAL_STAGE.has(rel) ? '\n' + FINAL_STAGE : '');

  test(`${rel}: final review states findings are fixed, not just reported`, () => {
    assert.match(
      body,
      /fixed, not just reported/i,
      `${rel} final-review step must say findings are fixed, not just reported`,
    );
  });

  test(`${rel}: final review fix loop dispatches an implementer and re-reviews`, () => {
    // The fix loop must name the implementer (who fixes) and a re-run/loop (re-review).
    // Allow up to 80 chars between "subagent" and "to fix": final-stage.md is a shared
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

  test(`${rel}: declined lines are ruled, never dropped; findings are re-graded by effect`, () => {
    // Upstream measured the failure this closes: the final reviewer found a crash on an input
    // the spec implied but never named, graded it Minor 6/6 "because the spec doesn't mention
    // it", and the Critical/Important gate let it ship. The reviewer now lists what it set
    // aside; the controller must rule on every line and grade by effect, or the list is prose
    // that nobody consumes.
    assert.match(body, /Declined to judge/, `${rel} must consume the reviewer's Declined to judge list`);
    assert.match(body, /rule on every line/i, `${rel} must rule on every declined line`);
    assert.match(body, /Nothing the reviewer set aside is dropped silently/i,
      `${rel} must say declined lines are never dropped silently`);
    assert.match(body, /reasonable person using this software/i,
      `${rel} must re-grade findings by their effect on a reasonable person, not by the spec's silence`);
    assert.match(body, /carry every ruling into the final message/i,
      `${rel} must carry the rulings to the human in the final message`);
  });

  test(`${rel}: a tested fix is its own re-review; the reviewer re-runs only for untestable findings`, () => {
    // Upstream: twelve scoped re-reviews across arms returned "all addressed, no new breakage"
    // every time — paid for nothing the covering test and the green suite had not answered.
    assert.match(body, /test that reproduced the finding and failed first/i,
      `${rel} must require a RED→GREEN test per fix`);
    assert.match(body, /do not dispatch a reviewer to re-read a diff whose covering test already answers/i,
      `${rel} must not re-dispatch a reviewer over a tested fix`);
    assert.match(body, /only when the fix carries no such test/i,
      `${rel} must keep the re-review for findings a test cannot pin`);
  });
}
