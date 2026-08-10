#!/usr/bin/env node
'use strict';
/*
 * restated-step-count.test.cjs — SKILL.md must not hard-code how many steps the
 * self-review checklist has.
 *
 * The failure mode, twice observed in this repo: SKILL.md says "run through all five
 * steps", someone adds step 6 to `references/self-review-checklist.md`, and nothing
 * fails. The suite stays green because no test reads the two files against each other,
 * and the model dutifully runs five — silently switching OFF the last backstop. The
 * live instance switched off step 6 (visual coverage for curated mockups), which is one
 * half of the mockup safety net: `validate-tasks --mockups` checks linkage, step 6
 * checks that every discussed screen state actually reached a task. Semantic coverage
 * has no deterministic gate, so losing the checklist step loses the check entirely.
 *
 * The fix is not "keep the number in sync" — that just resets the clock on the same
 * drift. It is to not restate the count at all: the checklist itself already says
 * "run through each step below". This test pins that.
 *
 * It deliberately allows a correct explicit count rather than banning numerals outright,
 * so a future author who really wants one is not blocked — only a WRONG one fails.
 *
 * Run: node --test super.writing-plans/scripts/__tests__/restated-step-count.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const skillMd = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const checklist = fs.readFileSync(path.join(SKILL_DIR, 'references', 'self-review-checklist.md'), 'utf8');

const WORD_TO_NUMBER = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Top-level steps look like `**1. Title:**`. Sub-steps (`**4b.`, `**4c.`) refine a
// top-level one and are not counted separately — matching how a reader numbers them.
function countTopLevelSteps(md) {
  const seen = new Set();
  for (const m of md.matchAll(/^\*\*(\d+)\.\s/gm)) seen.add(Number(m[1]));
  return seen.size;
}

test('the self-review checklist still parses as a numbered step list', () => {
  // Anti-staleness: if the checklist is ever restructured away from `**N.` headings,
  // this guard would silently compare against 0 and pass forever.
  const n = countTopLevelSteps(checklist);
  assert.ok(n >= 5, `expected the checklist to have several numbered steps, counted ${n}`);
});

test('SKILL.md points at the checklist without hard-coding its length', () => {
  assert.match(
    skillMd,
    /Read `\.\/references\/self-review-checklist\.md`/,
    'SKILL.md must still tell the model to read the checklist',
  );

  const claim = skillMd.match(
    /run through (?:all )?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+steps/i,
  );
  if (!claim) return; // the intended state: no count restated

  const claimed = WORD_TO_NUMBER[claim[1].toLowerCase()] ?? Number(claim[1]);
  const actual = countTopLevelSteps(checklist);
  assert.equal(
    claimed,
    actual,
    `SKILL.md claims ${claimed} self-review steps but self-review-checklist.md has ${actual}. ` +
    'A stale count silently switches off the trailing steps — prefer "every step in it" over a number.',
  );
});
