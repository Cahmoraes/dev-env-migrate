'use strict';

/**
 * The execution-mode election, guarded at the three layers a measured misroute went through.
 *
 * What happened: a run asked to "execute the plan in parallel" and entered a parallel
 * execution skill directly, without ever presenting the options — the plan's own rubric
 * had not been consulted (`executionRecommendation`, `decisionRequired: true`). Three
 * independent defects had to line up:
 *
 *   1. The election's "the user already named a mode" exception fired on the word "parallel",
 *      which describes the SHAPE OF THE PLAN — the thing parse-waves.cjs already reports —
 *      not a mode the user typed.
 *   2. A skill's `description` claimed a condition every well-formed parallel wave meets,
 *      so it claimed all of them: `description` is the ONLY governance on a direct entry.
 *   3. The `decisionRequired` re-entry guard existed only in super.subagent-driven-development,
 *      the skill the ORIGINAL bug landed in. The parallel skill had none, so a wrong entry
 *      into it was uncatchable.
 *
 * Each test below fails if one of the three reopens. They are textual because all three
 * defects were textual — the scripts were correct throughout and said so in their output.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/execution-mode-election-contract.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const SEQUENTIAL = 'super.subagent-driven-development/SKILL.md';
const ROUTER_SHORT = 'super.using-superpowers/references/session-start.md';
const ROUTER_FULL = 'super.using-superpowers/references/session-state-and-gates.md';

// ─── cause 1: the exception must require a NAME, not a property ──────────────

test('both statements of the election exception say a property is not a mode', () => {
  for (const file of [ROUTER_SHORT, ROUTER_FULL]) {
    const text = read(file);
    assert.match(
      text,
      /named? a \*\*mode\*\*/u,
      `${file}: the exception has to key on the mode's NAME; "the user already named a mode" alone reads wide`,
    );
    assert.match(
      text,
      /they're independent|the tasks are independent/iu,
      `${file}: name an exact phrase that gets misread as a mode, or the correction stays abstract`,
    );
    assert.match(
      text,
      /not a mode/u,
      `${file}: say WHY the phrase fails — it describes the plan, not a mode the user typed`,
    );
    assert.match(
      text,
      /(still owe|still owed)/u,
      `${file}: say what is owed anyway — naming the defect without the obligation leaves the wrong branch open`,
    );
  }
});

// ─── the gate itself: one recommended option, option 3 opt-in only ────────────

test('both router statements tag option 1 and never elect from plan shape', () => {
  for (const file of [ROUTER_SHORT, ROUTER_FULL]) {
    const text = read(file);
    assert.match(text, /always.*`\(recommended\)`|always the one tagged `\(recommended\)`/su, `${file}: option 1 is the fixed recommendation`);
    assert.match(text, /singleImplementer\.eligible/u, `${file}: option 3 is gated on the parser's eligibility field`);
    assert.match(text, /never tagged/u, `${file}: option 3 is never the recommendation`);
  }
});

test('the sequential description no longer routes a parallelizable plan elsewhere', () => {
  const text = read(SEQUENTIAL);
  const desc = /description:\s*(.*)/u.exec(text)[1];
  assert.doesNotMatch(desc, /parallel-subagent-in-tree/u, 'there is no sibling execution skill to hand off to');
});

// ─── the re-entry guard exists in the one execution skill ────────────────────

test('the execution skill carries an election guard that keys on the skill name', () => {
  const text = read(SEQUENTIAL);
  assert.match(text, /execution gate/u, 'the skill must speak of the gate it may have to open');
  assert.doesNotMatch(text, /decisionRequired/u, 'the guard no longer reads a parser field that does not exist');
});
