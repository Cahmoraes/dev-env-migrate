'use strict';

/**
 * reviewer-judgment-standard.test.cjs — every code reviewer grades the spec's silence by
 * what a reasonable person using the software expects; no implementer does.
 *
 * The failure this closes was measured upstream (2026-09, 21 clean reps on one fixture):
 * every implementer shipped the same crash on an input the spec implied but never named,
 * the reviewer found it every time and graded it Minor — "the spec doesn't mention it, so
 * it's out of scope" — so the Critical/Important gate let it ship. A standard for behavior
 * the spec is silent on moved that grade from Minor 6/6 to Important 6/6.
 *
 * The boundary matters as much as the standard. The same prose on the implementer was
 * inert, so the standard lives in the reviewer templates and nowhere
 * else, and this file pins both directions.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/reviewer-judgment-standard.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

// Templates that carry their own dispatched prompt.
const REVIEWERS = [
  'super.requesting-code-review/agents/code-reviewer.md',
  'super.subagent-driven-development/agents/task-reviewer.md',
];

// The lens that pulls the other way: "extra/unneeded work" reads an unlisted-input handler
// as over-engineering unless told otherwise. The spec-grader carries it.
const EXTRA_WORK_LENS = [
  'super.subagent-driven-development/agents/task-reviewer.md',
];

// Where the standard must NOT appear.
const NOT_REVIEWERS = [
  'super.subagent-driven-development/agents/implementer.md',
  'super.subagent-driven-development/agents/whole-plan-implementer.md',
];

const STANDARD = /reasonable person using this software/;

test('the roster still names the reviewer templates', () => {
  assert.ok(REVIEWERS.length >= 2, 'roster shrank — re-derive it before trusting this file');
  for (const rel of [...REVIEWERS, ...NOT_REVIEWERS]) {
    assert.ok(fs.existsSync(path.join(SKILLS, rel)), `${rel} moved — re-derive the roster`);
  }
});

for (const rel of REVIEWERS) {
  test(`${rel}: grades the spec's silence by the reasonable-person standard, inside the prompt`, () => {
    const body = read(rel);
    const promptStart = body.indexOf('prompt: |');
    assert.ok(promptStart > -1, `${rel}: no \`prompt: |\` — the dispatch block moved`);
    const standardAt = body.indexOf('The spec is a vision document');
    assert.ok(standardAt > promptStart,
      `${rel}: the "spec is a vision document" section must sit inside the dispatched prompt`);
    assert.match(body.slice(promptStart), STANDARD,
      `${rel}: the prompt must name the reasonable-person standard`);
    assert.match(body, /silence is not permission/i,
      `${rel}: the prompt must say the spec's silence is not permission`);
  });
}

for (const rel of EXTRA_WORK_LENS) {
  test(`${rel}: the extra-work lens exempts inputs the spec implies`, () => {
    const body = read(rel);
    const lens = body.indexOf('**Extra/unneeded work:**');
    assert.ok(lens > -1, `${rel}: the extra-work lens moved`);
    const next = body.indexOf('**Misunderstandings:**', lens);
    const region = body.slice(lens, next > -1 ? next : undefined);
    assert.match(region, /Not extra work/,
      `${rel}: without the exemption the two rules contradict each other in one prompt`);
    assert.match(region, /Never flag it as extra/,
      `${rel}: the exemption must forbid flagging implied-input handling as extra`);
  });
}

for (const rel of NOT_REVIEWERS) {
  test(`${rel}: does not carry the reviewer's judgment standard`, () => {
    assert.doesNotMatch(read(rel), STANDARD,
      `${rel}: the standard is inert on an implementer`);
  });
}

test('code-reviewer.md lists what it declined to judge, and the final review consumes the list', () => {
  const reviewer = read('super.requesting-code-review/agents/code-reviewer.md');
  const taskReviewer = read('super.subagent-driven-development/agents/task-reviewer.md');
  const tail = read('super.subagent-driven-development/references/final-stage.md');
  assert.match(reviewer, /### Declined to judge/, 'code-reviewer.md must have a Declined to judge output section');
  assert.match(taskReviewer, /Declined to judge:/, 'task-reviewer.md must return a Declined to judge line');
  assert.match(reviewer, /\{REVIEW_FOCUS\}/, 'code-reviewer.md must carry the Review Focus slot for the final review');
  assert.match(tail, /\{REVIEW_FOCUS\}/, 'final-stage gate 1 must pass the plan\'s Review Focus section verbatim');
  assert.match(tail, /Declined to judge/, 'final-stage gate 1 must consume the Declined to judge list, or it is dead prose');
});
