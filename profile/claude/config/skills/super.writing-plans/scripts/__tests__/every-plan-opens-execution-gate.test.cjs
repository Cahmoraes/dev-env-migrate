'use strict';

/**
 * every-plan-opens-execution-gate.test.cjs — every plan `super.writing-plans` writes opens the
 * execution gate (deep review / subagent-driven / single implementer, with the `/<skill> <index>`
 * resume line); no plan continues into implementation on its own. The inline path is the bounded
 * path only — the one that never plans.
 *
 * Measured 2026-09-16 (real session on the consumer repo, 3-task plan): the prose of the
 * morning's commit sent a small plan into the inline path "in the same turn", and the controller
 * implemented all three tasks without the user ever reading the plan. The user's rule is older
 * than that commit: execution is the stage that spends the most credits, and the plan is read
 * before it is paid for. This guard pins the rule where the model reads it — the handoff, the
 * SKILL.md, the inline path, the pause list — and forbids any size-scoped branch around it.
 *
 * Run: node --test super.writing-plans/scripts/__tests__/every-plan-opens-execution-gate.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const HANDOFF = 'super.writing-plans/references/execution-handoff-message.md';
const WP_SKILL = 'super.writing-plans/SKILL.md';
const ENTRY = 'super.writing-plans/references/entry-phase.md';
const INLINE = 'super.using-superpowers/references/bounded-path.md';
const SESSION_START = 'super.using-superpowers/references/session-start.md';
const SDD_ROUTING = 'super.subagent-driven-development/references/entry-routing.md';
const BRAIN_SKILL = 'super.brainstorming/SKILL.md';

const RUNTIME_PROSE = [
  HANDOFF, WP_SKILL, ENTRY, INLINE, SESSION_START, SDD_ROUTING, BRAIN_SKILL,
  'super.subagent-driven-development/SKILL.md',
  'super.writing-plans/references/task-decomposition-granularity.md',
];

test('the execution handoff is reached by every plan, whatever its size', () => {
  const handoff = read(HANDOFF);
  const head = handoff.slice(0, handoff.indexOf('## Step 1'));
  assert.match(head, /\*\*Who reaches this gate: every plan `super\.writing-plans` writes, whatever its size\.\*\*/);
  assert.match(head, /A plan on disk is executed by dispatch/);
  assert.match(head, /inline path \(`super\.using-superpowers\/references\/bounded-path\.md`\) is for a bounded change, which never plans/);
  assert.doesNotMatch(head, /do not render the options/);
  assert.doesNotMatch(head, /in the same turn/);
  assert.match(handoff, /## Step 3 — Open the gate \(always\)\n\nAlways — for every plan, whatever its task count/);
  assert.match(handoff, /including a two-task chain whose answer is obvious/, 'the obvious-recommendation case is named as still gated');
});

test('writing-plans SKILL.md sends every plan to the handoff with no size branch', () => {
  const skill = read(WP_SKILL);
  const section = skill.slice(skill.indexOf('## Execution Handoff'), skill.lastIndexOf('# Entry Phase'));
  assert.match(section, /follow `\.\/references\/execution-handoff-message\.md` — for every plan this skill writes, however small; no plan continues into implementation from here/);
  assert.match(section, /`\/<skill> <tasks-index>` resume line rendered under the options/);
  assert.match(section, /The question is the last call of the turn; execution starts only from the answer/);
  assert.doesNotMatch(section, /no gate/);
  assert.doesNotMatch(section, /bounded-path\.md/);
});

test('the inline path is the bounded path only and refuses a feature that has a plan on disk', () => {
  const inline = read(INLINE);
  assert.match(inline, /^# Bounded Path — inline execution \+ one final review$/m);
  const done = inline.slice(inline.indexOf('## Done means'), inline.indexOf('## When it applies'));
  assert.match(done, /no user gate between entering it and finishing/);
  assert.match(done, /It has no pause at all: a bounded change is announced, not asked/);
  assert.match(done, /your green run is the author's run/);
  assert.match(done, /dispatched to a subagent that did not write the code/);
  const guard = inline.slice(inline.indexOf('## Hard stop'), inline.indexOf('## Tripwire'));
  assert.match(guard, /This path is \*\*only\*\* for bounded changes/);
  assert.match(guard, /classified \*\*architectural\*\*[^\n]*\*\*STOP\.\*\*/);
  assert.match(guard, /\*\*Check for a plan on disk\.\*\*[^\n]*find-feature-files\.cjs[^\n]*\*\*STOP\*\*/);
  assert.doesNotMatch(inline, /is not opened/);
});

test('the pause list owes the execution gate to every plan on disk', () => {
  const start = read(SESSION_START);
  const pauses = start.split('\n').find((l) => l.startsWith('**User pauses per path — the whole list.**'));
  assert.ok(pauses, 'session-start.md must carry the closed list of pauses per path');
  assert.match(pauses, /Spike: the nod on the probe\. Bounded: none\./);
  assert.match(pauses, /the execution gate owed by every plan on disk/);
  assert.match(pauses, /A question outside this list is model-invented\./);
});

test('brainstorming says the plan after the design opens the execution gate', () => {
  assert.match(read(BRAIN_SKILL), /the plan that follows it opens the execution gate/);
});

test('the execution skill accepts every plan and only bounces a bounded change back to the inline path', () => {
  const routing = read(SDD_ROUTING);
  assert.match(routing, /announced \*\*bounded\*\* this session, \*\*pause and verify\*\*/);
  assert.match(routing, /the feature is bounded and the route here was accidental/);
  assert.match(read('super.subagent-driven-development/SKILL.md'), /The execution mechanism for every plan on disk; only a bounded change, which never plans, runs inline/);
});

test('no runtime prose sends a plan into implementation "in the same turn" or scopes the gate by size', () => {
  for (const rel of RUNTIME_PROSE) {
    const body = read(rel);
    assert.doesNotMatch(body, /plan[^\n]*(implementation|inline path)[^\n]*in the same turn/, `${rel}: same-turn continuation for a plan`);
    assert.doesNotMatch(body, /(0\/1\/2|execution gate)[^\n]*(belongs to|only in|só em)/, `${rel}: gate scoped by size`);
    assert.doesNotMatch(body, /medium-inline-path\.md/, `${rel}: stale reference name`);
  }
});

test('the bounded announcement names the closing reviewer (definition of done)', () => {
  const start = read(SESSION_START);
  const para = start.split('\n').find((l) => l.startsWith('- **Bounded**'));
  assert.ok(para, 'session-start.md must define the bounded path');
  assert.match(para, /Skip `super\.brainstorming` and `super\.writing-plans`/);
  assert.match(para, /\*\*what closes the work\*\* — the fresh reviewer's verdict, then the final stage/);
  assert.match(para, /"full" is the escape/);
});

test('the small-plan writing exception stays, scoped to writing, with the writer boundary', () => {
  const entry = read(ENTRY);
  assert.doesNotMatch(entry, /at most 7 tasks/);
  assert.match(entry, /\*\*The one exception — a decomposition of at most four tasks:\*\*/);
  assert.match(entry, /The count is the decomposition's real one, read before any file is written/);
  assert.match(entry, /The exception covers \*writing\* only: the finished plan opens the same execution gate as every other plan/);
  assert.match(entry, /no runner, typecheck, lint or build while the plan is being written/);
  assert.match(entry, /Five or more task files always get the writer subagent/);
});
