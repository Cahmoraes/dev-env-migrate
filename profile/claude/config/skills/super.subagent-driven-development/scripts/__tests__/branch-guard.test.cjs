'use strict';

/**
 * branch-guard.test.cjs — the execution skill must ACTIVELY guard against starting
 * implementation on the repository's default branch, not merely list it as a Red Flag.
 *
 * Regression guard for an observed real run: the controller went from session setup
 * straight to dispatching the first implementer while on `main`, never checking the
 * branch, so 8 feature commits landed on `main`. The Red Flag "never start on main/master"
 * existed but was passive (a bottom-of-file reminder with no procedural step). This test
 * pins the guard as an active step: a deterministic branch check before the first dispatch.
 *
 * 2026-09-13: the guard's OUTCOME changed. It used to STOP and ask ("feature branch, or
 * consent to stay on main?"). Measured on 54 real sessions, that question was one of the
 * consent gates a headless run dies on and an interactive user answers monosyllabically
 * ("cria branch nova"). Creating a local branch is safe and reversible, so the skill now
 * creates `feat/<feature-name>` itself and announces it; only two exceptions still ask —
 * the branch already exists, or the repo's instructions pin work to the default branch.
 * The check itself is unchanged and still runs every session, resume included.
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

test('the Branch Guard is a script verdict, not a shell block the controller judges', () => {
  // 2026-09-15: the three git commands moved into scripts/branch-guard.cjs (pinned by
  // branch-guard-script.test.cjs). The prose only maps its three verdicts to an action —
  // the judgment "am I on main?" is what used to turn into a question.
  const guard = body.split('### Branch Guard')[1].split('\n### ')[0];
  assert.match(guard, /scripts\/branch-guard\.cjs/,
    'the guard must run the verdict script');
  assert.doesNotMatch(guard, /git rev-parse --abbrev-ref HEAD|symbolic-ref/,
    'the shell block must not come back beside the script — two sources of the same verdict drift');
  for (const action of ['create', 'ask-existing', 'proceed']) {
    assert.match(guard, new RegExp('`(action: )?' + action + '`'),
      `the prose must map the script verdict "${action}" to an action`);
  }
});

test('on the default branch the guard creates the feature branch and announces it — no question', () => {
  const guard = body.split('### Branch Guard')[1].split('\n### ')[0];
  assert.match(guard, /`action: create`[^\n]*run the returned `command`/,
    'on the default branch the guard runs the command the script returned, not ask whether to');
  assert.match(guard, /git checkout -b feat\/<feature-name>/,
    'the branch is created deterministically from the tasks index slug');
  assert.match(guard, /announced?, never asked|announce it in the user's language/i,
    'the creation is announced, never turned into a consent question');
  assert.doesNotMatch(guard, /STOP and ask/i,
    'the old stop-and-ask outcome must not come back — a local branch is reversible, not a consent gate');
});

test('the guard still asks only in the cases where creating a branch is not safe', () => {
  const guard = body.split('### Branch Guard')[1].split('\n### ')[0];
  assert.match(guard, /`action: ask-existing`[^\n]*`feat\/<feature-name>` already exists: ask/,
    'an existing branch of the same name is a real collision — the user picks');
  assert.match(guard, /`action: ask-mismatch`[^\n]*another feature's branch[^\n]*ask/,
    "another feature's branch is the other collision — never stack two features in silence");
  assert.match(guard, /instructions file pins work to the default branch/i,
    'a repo that explicitly works on the default branch is the other exception');
});

test('the Red Flag points to the active guard (no longer a passive reminder)', () => {
  const redFlag = body.split('## Red Flags')[1] || '';
  assert.match(redFlag, /main`\/`master/,
    'the Red Flag for starting on main/master must remain');
  assert.match(redFlag, /Branch Guard/,
    'the Red Flag must reference the active "Branch Guard" section, not stand alone');
});

// The execution skill guards the base branch with the deterministic check: it commits
// per task straight onto the current branch.
const EXECUTION_SKILLS = [
  'super.subagent-driven-development',
];

for (const skill of EXECUTION_SKILLS) {
  test(`${skill} has the deterministic branch check and creates the branch itself`, () => {
    const text = fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
    assert.match(text, /super\.subagent-driven-development-base-dir>\/scripts\/branch-guard\.cjs/,
      `${skill} must run the shared verdict script (one source of the check for both skills)`);
    assert.doesNotMatch(text, /git rev-parse --abbrev-ref HEAD/,
      `${skill} must not carry a second, hand-run copy of the check`);
    assert.match(text, /`(action: )?create`[^\n]*run the returned `command`/,
      `${skill} must run the returned command on the default branch — announced, not asked`);
    assert.match(text, /git checkout -b feat\/<feature-name>/,
      `${skill} must name the exact branch it creates`);
    assert.match(text, /`(action: )?ask-existing`[^\n]*already exists: ask/,
      `${skill} must keep the existing-branch collision as the case that asks`);
    assert.match(text, /instructions file pins work to the default branch/i,
      `${skill} must keep the pinned-default-branch exception`);
    assert.doesNotMatch(text, /STOP and ask the user/i,
      `${skill} must not reintroduce the stop-and-ask outcome`);
  });
}

/*
 * The resume exemption used to be keyed on progress — "skip on a session resume, the branch
 * is already established". Simulating a real entry against a consumer's finished feature
 * showed what that costs: `current=main default=main`, all 8 tasks DONE, so the guard was
 * skipped on the grounds that the branch was "established" — and the established branch was
 * the default one. The final stage still dispatches fix implementers, and those commit.
 *
 * The check is three git commands and prompts nothing by itself. So it runs always, and the
 * ACTION is gated on the check's result. A non-default branch is silent either way.
 */
for (const skill of EXECUTION_SKILLS) {
  test(`${skill} runs the branch check on resume too, gating only the action`, () => {
    const text = fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');

    assert.doesNotMatch(
      text, /skip on (a )?resume|[Ss]kip on a session resume/,
      `${skill}: the branch check must not be skipped because work is already in progress.`,
    );
    assert.match(
      text, /resume included/i,
      `${skill}: state explicitly that the check runs on every session, resume included.`,
    );
    assert.match(
      text, /never on task status/i,
      `${skill}: the exemption must be keyed on the check's RESULT (non-default branch), `
      + 'not on progress state.',
    );
  });
}
