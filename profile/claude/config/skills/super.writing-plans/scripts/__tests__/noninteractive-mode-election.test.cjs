'use strict';

/*
 * The execution gate is always opened after a plan is written or located: the user reads the
 * plan and picks deep review (0), sequential (1) or parallel (2). The plan's shape only decides
 * where `(recommended)` lands; `decisionRequired` never decides whether the user is asked.
 *
 * History. The original contract always asked. 2026-09-13 made a sequential plan proceed on
 * the parser's verdict without a question ("a question there buys nothing"). 2026-09-16 reverted
 * it: a measured Copilot session (gpt-5.6-luna, `decisionRequired: false` from a tightly-coupled
 * parallel wave) went from the plan straight into `super.subagent-driven-development` without one
 * visible line — the "one line naming the mode" of the no-question branch was dropped along with
 * the question — and execution is the stage that spends the most credits. So the gate is
 * unconditional again, and the guards below pin that plus the two invariants that survived every
 * version: `auto_commit: false` moves the tag to option 1, and an answer that cannot arrive
 * (the structured-question tool is absent from the toolset — a checkable fact, never a judgment
 * like "the user delegated") falls back to the rubric instead of waiting forever.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (relative) => fs.readFileSync(path.join(SKILLS, relative), 'utf8');

const HANDOFF = 'super.writing-plans/references/execution-handoff-message.md';
const SESSION_START = 'super.using-superpowers/references/session-start.md';
const GATES = 'super.using-superpowers/references/session-state-and-gates.md';
const SDD = 'super.subagent-driven-development/SKILL.md';
const SDD_ROUTING = 'super.subagent-driven-development/references/entry-routing.md';

function electionSection(gates) {
  const start = gates.indexOf('## Execution Mode Election (option 5)');
  assert.ok(start > 0, 'the option-5 section must exist in session-state-and-gates.md');
  const end = gates.indexOf('\n## ', start + 1);
  return gates.slice(start, end === -1 ? undefined : end);
}

test('the handoff has exactly one gate, opened whatever the plan shape is', () => {
  const handoff = read(HANDOFF);
  assert.match(handoff, /## Step 3 — Open the gate \(always\)/, 'the gate step must be unconditional in its heading');
  assert.doesNotMatch(handoff, /## Step 3a|## Step 3b|Proceed \(no question\)/, 'the no-question branch must not come back');
  assert.match(
    handoff,
    /Option 1 is always the one tagged `\(recommended\)`: one subagent execution mode, one recommendation/,
    'the recommendation is fixed, never derived from plan shape',
  );
  assert.match(handoff, /\*\*0\. Deep review by a subagent first\*\*/, 'option 0 names its actor (a paid subagent)');
  assert.match(handoff, /\*\*1\. Subagent-Driven\*\*/);
  assert.doesNotMatch(handoff, /\*\*2\. /, 'there is no option 2: one subagent execution mode');
  assert.match(handoff, /\*\*3\. Single implementer\*\*/);
  assert.match(handoff, /Do not invoke an execution skill before the answer arrives/);
  assert.match(handoff, /\*\*Once answered, the feature runs to its end\.\*\*/, 'completion is defined at the gate: one answer, no later "continue?"');
});

test('the router paths open the same gate instead of proceeding on the verdict', () => {
  const sessionStart = read(SESSION_START);
  const election = electionSection(read(GATES));
  assert.match(sessionStart, /the user is asked once, at the gate that starts execution/);
  assert.doesNotMatch(sessionStart, /invoke the\s+named `mode` in the same turn/, 'the same-turn invocation for sequential plans is the reverted behavior');
  assert.match(election, /\*\*the user is always asked\s+before execution starts\*\*/);
  assert.match(election, /3\. \*\*Open the gate:\*\*/);
  assert.doesNotMatch(election, /`decisionRequired: false` → one line naming the mode and the reason, then invoke it/);
});

test('the execution skill treats a description match as an unanswered gate', () => {
  assert.match(read(SDD), /the user has not passed the execution gate, so open it before running anything/);
  assert.match(read(SDD_ROUTING), /A description match means nobody answered the execution gate yet, so \*\*open it\*\*/);
  assert.doesNotMatch(read(SDD_ROUTING), /`decisionRequired: false` → proceed on this skill/);
});

test('the headless fallback still exists and takes option 1', () => {
  const handoff = read(HANDOFF);
  const election = electionSection(read(GATES));
  assert.match(handoff, /answer cannot arrive[\s\S]*take option 1 and proceed/i);
  for (const [name, body] of [['handoff', handoff], ['gates (option 5)', election]]) {
    assert.match(body, /cannot arrive only when that tool is absent from the toolset/i, `${name}: the fallback is keyed on a checkable fact`);
    assert.match(body, /last call of the turn/i, `${name}: the question ends the turn`);
    assert.doesNotMatch(body, /delegated the decision|delegated decision/i, `${name}: "delegated" is the judgment a weaker model reads wide`);
  }
  assert.match(election, /apply the autonomous fallback[\s\S]*invoke the selected skill/i);
  assert.match(read(SESSION_START), /autonomous\/non-interactive fallback[\s\S]*session-state-and-gates\.md/i);
});
