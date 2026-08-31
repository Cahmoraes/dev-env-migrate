'use strict';

/**
 * branch-guard.test.cjs — the execution skill must ACTIVELY guard against starting
 * implementation on the repository's default branch, not merely list it as a Red Flag.
 *
 * Regression guard for an observed real run: the controller went from session setup
 * straight to dispatching the first implementer while on `main`, never checking the
 * branch nor asking consent, so 8 feature commits landed on `main`. The Red Flag
 * "never start on main/master without consent" existed but was passive (a bottom-of-file
 * reminder with no procedural step). This test pins the guard as an active step: a
 * deterministic branch check before the first dispatch, with a stop-and-ask outcome.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/branch-guard.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const SKILL = path.join(SKILLS, 'super.subagent-driven-development', 'SKILL.md');
const body = fs.readFileSync(SKILL, 'utf8');

test('the skill has an active Branch Guard step in The Process', () => {
  assert.match(body, /^### Branch Guard$/m,
    'The Process must contain a "### Branch Guard" step');
  assert.match(body, /before the first implementer dispatch/i,
    'the guard must state it runs before the first implementer dispatch');
});

test('the Branch Guard does a deterministic branch check', () => {
  assert.match(body, /git rev-parse --abbrev-ref HEAD/,
    'the guard must read the current branch deterministically');
  assert.match(body, /symbolic-ref[^\n]*refs\/remotes\/origin\/HEAD/,
    'the guard must resolve the default branch (origin/HEAD), not assume main');
});

test('on the default branch the guard STOPS and asks before dispatching', () => {
  // The stop-and-ask outcome must be explicit, and offer a feature branch.
  assert.match(body, /STOP and ask the user before dispatching/i,
    'on main/master the guard must stop and ask, not proceed');
  assert.match(body, /git checkout -b/,
    'the guard must offer to create a feature branch');
});

test('the Red Flag points to the active guard (no longer a passive reminder)', () => {
  // The old passive Red Flag must now reference the deterministic Branch Guard.
  const redFlag = body.split('## Red Flags')[1] || '';
  assert.match(redFlag, /main\/master without explicit user consent/,
    'the Red Flag for starting on main/master must remain');
  assert.match(redFlag, /Branch Guard/,
    'the Red Flag must reference the active "Branch Guard" section, not stand alone');
});

// Cross-skill invariant: ALL three execution skills must guard the base branch with the
// SAME deterministic check, not a soft "confirm you are not on main" prose line. The
// parallel modes carry identical risk — in-tree commits straight onto the base branch,
// and the worktree mode integrates the result onto it.
const EXECUTION_SKILLS = [
  'super.subagent-driven-development',
  'super.parallel-subagent-development',
  'super.parallel-subagent-in-tree',
];

for (const skill of EXECUTION_SKILLS) {
  test(`${skill} has the deterministic branch check`, () => {
    const text = fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
    assert.match(text, /git rev-parse --abbrev-ref HEAD/,
      `${skill} must read the current branch deterministically`);
    assert.match(text, /symbolic-ref[^\n]*refs\/remotes\/origin\/HEAD/,
      `${skill} must resolve the default branch (origin/HEAD), not assume main`);
    assert.match(text, /STOP and ask the user/i,
      `${skill} must stop and ask before working on the default branch`);
    assert.match(text, /git checkout -b/,
      `${skill} must offer to create a feature branch`);
  });
}

/*
 * The resume exemption used to be keyed on progress — "skip on a session resume, the branch
 * is already established". Simulating a real entry against a consumer's finished feature
 * showed what that costs: `current=main default=main`, all 8 tasks DONE, so the guard was
 * skipped on the grounds that the branch was "established" — and the established branch was
 * the default one. The finish tail still dispatches fix implementers, and those commit, so
 * the exemption disarmed the guard in the one state where every remaining commit lands on
 * `main` with nobody asked.
 *
 * The check is three git commands and prompts nothing by itself. So it runs always, and the
 * QUESTION is gated on the check's result. That keeps the property the old wording was
 * reaching for — no re-prompting mid-feature — because a non-default branch is silent either
 * way, while removing the state where silence is wrong.
 */
for (const skill of EXECUTION_SKILLS) {
  test(`${skill} runs the branch check on resume too, gating only the question`, () => {
    const text = fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');

    assert.doesNotMatch(
      text, /skip on (a )?resume|[Ss]kip on a session resume/,
      `${skill}: the branch check must not be skipped because work is already in progress. `
      + 'A resume sitting on the default branch is the case the STOP exists for — every '
      + 'implementer from that point commits.',
    );
    assert.match(
      text, /resume included/i,
      `${skill}: state explicitly that the check runs on every session, resume included.`,
    );
    assert.match(
      text, /the \*question\*, not the \*check\*|never on task status/i,
      `${skill}: the exemption must be keyed on the check's RESULT (non-default branch), `
      + 'not on progress state. Say which of the two a resume skips.',
    );
  });
}
