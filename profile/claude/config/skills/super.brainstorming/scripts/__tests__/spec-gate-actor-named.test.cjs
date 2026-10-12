'use strict';

/*
 * The spec approval gate is the user's reading pause, and every "review" it offers names who
 * reviews. Measured 2026-09-15 (Copilot, gpt-5.6-luna): the gate offered "approve + spec review
 * first" and the user read it as their own review, meaning to stop and read the file, while the
 * option meant the paid `super.reviewing-specs` subagent. The same session also asked twice —
 * once with the design summary ("approve and generate the PRD"), once after the spec was
 * written — two gates for one decision.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(SKILL, relative), 'utf8');

test('the gate message tells the user the pause is for reading the file', () => {
  const after = read('references/after-the-design.md');
  assert.match(after, /Spec written and committed to `<path>`\. Read it before answering — this pause is your review\./);
  assert.match(read('SKILL.md'), /this pause is for the user to read the file/);
});

test('the deep-review option names its actor and its cost; "spec review" alone is gone', () => {
  const after = read('references/after-the-design.md');
  assert.match(after, /fourth option \*\*deep review by a subagent first\*\* — `super\.reviewing-specs`/);
  assert.match(after, /costs credits/);
  assert.doesNotMatch(after, /\*\*approve \+ spec review first\*\*/);
  assert.match(after, /\*\*Name the actor in every option\*\*/);
  assert.match(read('SKILL.md'), /\*\*\(d\) deep review by a subagent first\*\* \(`super\.reviewing-specs`, costs credits/);
});

test('presenting the design carries no question; the spec gate is the only one', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /\*\*Present the design once\*\* — one message[^\n]*\*\*no question with it\*\*: steps 6-7 run in the same turn/);
  assert.match(skill, /A "design approved\?" question here is a second gate for the same decision/);
});
