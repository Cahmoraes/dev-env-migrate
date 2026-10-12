'use strict';

/**
 * Prose contract: "other tests" in Verify GREEN means every test the run
 * showed, and every failure seen — including pre-existing ones — is reported
 * by name. Position is the active ingredient: the rule sits directly under
 * "Other tests fail? Fix now", at the moment the model decides "done"; the
 * same text at the top of the file measured inert.
 *
 * Run with: node --test super.test-driven-development/scripts/__tests__/verify-green-report-failures.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = fs.readFileSync(path.resolve(__dirname, '..', '..', 'SKILL.md'), 'utf8');

const ANCHOR = '**Other tests fail?** Fix now.';
const RULE = '**"Other tests" means every test the run showed, not just the one you wrote.**';
const REPORT = 'goes in your report by name';
const OMISSION = 'a report falsified by omission';

test('the rule sits directly under "Other tests fail? Fix now", inside Verify GREEN', () => {
  const anchorAt = SKILL.indexOf(ANCHOR);
  const ruleAt = SKILL.indexOf(RULE);
  const refactorAt = SKILL.indexOf('### REFACTOR');
  assert.ok(anchorAt > 0, 'anchor line missing');
  assert.ok(ruleAt > anchorAt, 'rule must come after the anchor');
  assert.ok(ruleAt < refactorAt, 'rule must stay inside Verify GREEN, before REFACTOR');
  const between = SKILL.slice(anchorAt + ANCHOR.length, ruleAt);
  assert.equal(between.trim(), '', 'nothing may sit between the anchor and the rule');
});

test('the rule names the two duties: report every failure by name, and omission is falsification', () => {
  const paragraph = SKILL.slice(SKILL.indexOf(RULE), SKILL.indexOf('### REFACTOR'));
  assert.ok(paragraph.includes(REPORT), 'must say failures go in the report by name');
  assert.ok(paragraph.includes("including one you didn't cause"), 'must cover failures the implementer did not cause');
  assert.ok(paragraph.includes(OMISSION), 'must name silent omission as falsification');
  assert.ok(paragraph.includes('bounds the deliverable, not what you report'), 'scope bounds the deliverable, not the report');
});

test('the rule is not restated at the top of the file (bootstrap placement measured inert)', () => {
  const head = SKILL.slice(0, SKILL.indexOf('### Verify GREEN'));
  assert.ok(!head.includes('falsified by omission'), 'rule leaked above Verify GREEN');
  assert.ok(!head.includes('every test the run showed'), 'rule leaked above Verify GREEN');
});

test('the rule does not absorb "run the whole suite before done" — suite runs belong to the SDD gates', () => {
  const paragraph = SKILL.slice(SKILL.indexOf(RULE), SKILL.indexOf('### REFACTOR'));
  assert.ok(!/run the project'?s (test command|whole suite|full suite)/i.test(paragraph));
  assert.ok(!/before you call the change done, run/i.test(paragraph));
});
