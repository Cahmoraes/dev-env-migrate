#!/usr/bin/env node
'use strict';
/*
 * resume-invocation-dynamic.test.cjs — the "resume in a later session" fence in
 * execution-handoff-message.md must not hard-code one execution mode's skill.
 *
 * Observed failure: the message recommended the parallel option but the fenced
 * resume command always printed `super.subagent-driven-development` (option 1),
 * with the other mode demoted to a prose bullet ("same shape, with that skill's
 * name"). A fenced command runs verbatim; a described one gets improvised — so the
 * model copy-pasted the wrong invocation into a fresh session.
 *
 * The fix ties the fence to a placeholder derived from whichever option carries
 * `(recommended)`, and requires the leading `/` so the line is directly re-runnable
 * as a slash command. This guard pins both: no literal mode name inside the fence,
 * and both real skill names present in the surrounding prose so the model has
 * something concrete to substitute.
 *
 * Second observed failure, after the first fix: the fence rendered with the
 * placeholder token itself left in place (`/<skill-da-opção-escolhida> ...`,
 * translated but never substituted) even though the correct skill name was
 * already written out a few lines above, next to `(recommended)`. A verbose
 * possessive placeholder (`<elected-option's-REQUIRED-SUB-SKILL>`) reads like a
 * description to copy, not a slot to fill — unlike `<feature-name>`, which the
 * same message substitutes reliably because it is short and reused throughout.
 * The fix shortens the token to match that shape and tells the model explicitly
 * to copy the value it already wrote, never leave the bracketed form. This guard
 * additionally pins the token's shape and the umbrella fill-in instruction.
 *
 * Run: node --test super.writing-plans/scripts/__tests__/resume-invocation-dynamic.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REFERENCE_PATH = path.resolve(
  __dirname, '..', '..', 'references', 'execution-handoff-message.md',
);
const md = fs.readFileSync(REFERENCE_PATH, 'utf8');

function resumeFence(text) {
  const marker = text.indexOf('To resume in a later session');
  assert.ok(marker >= 0, 'expected a "To resume in a later session" section');
  const fenceStart = text.indexOf('```', marker);
  const fenceEnd = text.indexOf('```', fenceStart + 3);
  assert.ok(fenceStart >= 0 && fenceEnd > fenceStart, 'expected a fenced code block after the resume heading');
  return text.slice(fenceStart + 3, fenceEnd).trim();
}

test('the resume fence does not hard-code a single execution mode', () => {
  const fence = resumeFence(md);
  assert.doesNotMatch(
    fence,
    /^\/?super\.subagent-driven-development\s/,
    `resume fence hard-codes one mode's skill name: "${fence}". It must render whichever ` +
    'option is tagged (recommended), not a fixed one.',
  );
});

test('the resume fence is a slash-prefixed placeholder pointing at the elected option', () => {
  const fence = resumeFence(md);
  assert.match(fence, /^\//, `resume fence must start with "/" so it is a runnable slash command, got: "${fence}"`);
  assert.match(
    fence,
    /elected|recommended|REQUIRED-SUB-SKILL/i,
    `resume fence must reference the elected/recommended option, not a literal skill name, got: "${fence}"`,
  );
});

test('the real skill name is still spelled out near the resume fence for substitution', () => {
  const marker = md.indexOf('To resume in a later session');
  const section = md.slice(marker, marker + 800);
  for (const skill of [
    'super.subagent-driven-development',
  ]) {
    assert.ok(section.includes(skill), `expected "${skill}" spelled out near the resume fence, section:\n${section}`);
  }
});

test('the fence placeholder is short and token-shaped, not a verbose possessive description', () => {
  const fence = resumeFence(md);
  const token = fence.match(/<([^>]+)>/);
  assert.ok(token, `expected a single bracketed placeholder in the fence, got: "${fence}"`);
  assert.doesNotMatch(
    token[1],
    /'|REQUIRED-SUB-SKILL/,
    `placeholder "<${token[1]}>" reads like a description to copy rather than a fill-in slot (an apostrophe or ` +
    'a spelled-out field name), which is what caused the model to leave it unresolved in the rendered message.',
  );
  assert.ok(
    token[1].split('-').length <= 3,
    `placeholder "<${token[1]}>" is not short/token-shaped like <feature-name>, got: "<${token[1]}>"`,
  );
});

test('the opening "fill in" instruction covers the elected skill name, same as the other placeholders', () => {
  const intro = md.slice(0, md.indexOf('\n\n', md.indexOf('fill in')));
  assert.match(
    intro,
    /fill in feature name.*elected option'?s? skill name/is,
    'the top instruction line must tell the model to fill in the elected skill name exactly like the other ' +
    `placeholders (feature name, task count), got: "${intro}"`,
  );
});
