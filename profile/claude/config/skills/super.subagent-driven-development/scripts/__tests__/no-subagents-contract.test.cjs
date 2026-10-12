'use strict';
/**
 * no-subagents-contract.test.cjs — every dispatched worker and reviewer carries, INSIDE its
 * prompt body, the rule that it dispatches no subagent of its own.
 *
 * Upstream 6.4.1 carries this section in all three of its prompts after measuring that every
 * reviewer a worker spawned duplicated the task review the controller dispatched anyway — a
 * full extra review seat per task. Our fork had none of the four (implementer, whole-plan
 * implementer, task reviewer, final code reviewer) as of the 2026-09-21 review, and the
 * read-only toolset does not cover the platform the templates themselves admit ("no per-dispatch
 * tool scoping on this platform → the default subagent"). The rule has to travel in the prompt.
 *
 * Also pins the implementer's commit rule as a DATUM the controller pastes: the previous prompt
 * had the implementer read `.superpowers/preferences.yml` itself and, when it was missing (it is
 * git-ignored, so a linked worktree never has it), "warn the user and ask" — a subagent cannot.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/no-subagents-contract.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const PROMPTS = {
  'super.subagent-driven-development/agents/implementer.md': /never spawn a reviewer to check your work/,
  'super.subagent-driven-development/agents/whole-plan-implementer.md': /never spawn a reviewer to check your work/,
  'super.subagent-driven-development/agents/task-reviewer.md': /never spawn another reviewer for a second opinion/,
  'super.requesting-code-review/agents/code-reviewer.md': /never spawn another reviewer for a second opinion/,
};

function promptBody(text) {
  // Everything after the `prompt: |` line inside the fenced dispatch block — the only text that
  // reaches the subagent. A rule written outside it is a note to the controller, not a contract.
  const at = text.indexOf('prompt: |');
  assert.ok(at > 0, 'template has a prompt: | block');
  return text.slice(at);
}

for (const [rel, specific] of Object.entries(PROMPTS)) {
  test(`${rel} tells the subagent, inside its prompt, that it dispatches no subagents`, () => {
    const body = promptBody(read(rel));
    assert.match(body, /## You Do Not Dispatch Subagents/, `${rel}: the section heading`);
    assert.match(body, specific, `${rel}: the role-specific line`);
    assert.match(body, /counts for nothing/, `${rel}: a spawned reviewer's verdict has no standing`);
  });
}

test('the implementer receives auto_commit as a datum and never reads or asks about the preferences file', () => {
  const body = promptBody(read('super.subagent-driven-development/agents/implementer.md'));
  assert.match(body, /## Commit Rule/);
  assert.match(body, /`workflow\.auto_commit` is \*\*\{AUTO_COMMIT\}\*\*/);
  assert.match(body, /Do not read the preferences file yourself/);
  assert.match(body, /never ask the user about it/);
  assert.doesNotMatch(body, /warn the user and ask/, 'a subagent has no user to ask');
  assert.doesNotMatch(body, /read `\.superpowers\/preferences\.yml`/, 'the file is git-ignored and absent in a linked worktree');
});

test('the rule also rides inside `## Your Job`, the section a controller keeps when it trims the template for a cheap task', () => {
  // Measured 2026-09-21 (headless SDD, tally fixture): the controller dropped every rule-only section
  // from the haiku implementer's prompt — `## You Do Not Dispatch Subagents` included — and kept the
  // sections carrying paths or placeholders. `## Your Job` survived in 15/15 dispatches.
  for (const rel of ['super.subagent-driven-development/agents/implementer.md', 'super.subagent-driven-development/agents/task-reviewer.md']) {
    const body = promptBody(read(rel));
    const job = body.split('## Your Job')[1].split('\n    ## ')[0];
    assert.match(job, /no subagent of your own/, `${rel}: the line lives inside ## Your Job`);
  }
});
