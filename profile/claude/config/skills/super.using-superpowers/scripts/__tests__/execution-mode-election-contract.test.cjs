'use strict';

/**
 * The execution-mode election, guarded at the three layers a measured misroute went through.
 *
 * What happened: a run asked to "execute the plan in parallel" entered
 * super.parallel-subagent-in-tree and never loaded super.parallel-subagent-development. The
 * plan's own rubric had elected the latter (`executionRecommendation.mode: "parallel-subagent"`,
 * `decisionRequired: true`). Three independent defects had to line up:
 *
 *   1. The election's "the user already named a mode" exception fired on the word "parallel",
 *      which is a PROPERTY two of the three modes share, not a mode.
 *   2. super.parallel-subagent-in-tree's `description` claimed the disjoint-files case with an
 *      OR — and every well-formed parallel wave has disjoint files, so it claimed all of them.
 *   3. The `decisionRequired` re-entry guard existed only in super.subagent-driven-development,
 *      the skill the ORIGINAL bug landed in. Neither parallel skill had one, so a wrong entry
 *      into either was uncatchable.
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

const IN_TREE = 'super.parallel-subagent-in-tree/SKILL.md';
const WORKTREE = 'super.parallel-subagent-development/SKILL.md';
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
      /in parallel/iu,
      `${file}: name the exact phrase that was misread, or the correction stays abstract`,
    );
    assert.match(
      text,
      /(two of the three|both have|elect neither|select neither|names two modes)/u,
      `${file}: say WHY the phrase fails — it fits more than one mode`,
    );
  }
});

// ─── cause 2: the in-tree description must not claim the universal case ──────

test('the in-tree description does not claim every plan with disjoint wave files', () => {
  const desc = /description:\s*"([^"]*)"/u.exec(read(IN_TREE));
  assert.ok(desc, 'in-tree SKILL.md must have a quoted description');
  const text = desc[1];
  assert.doesNotMatch(
    text,
    /or plans whose wave tasks touch disjoint files/u,
    'disjointness inside a wave is what MAKES it a wave — as an OR-trigger it captures every parallel plan and starves super.parallel-subagent-development',
  );
  assert.match(
    text,
    /precondition/u,
    'say what disjointness actually is here, so removing the trigger does not read as an oversight',
  );
});

test('the in-tree description routes the default case to the worktree skill', () => {
  const desc = /description:\s*"([^"]*)"/u.exec(read(IN_TREE))[1];
  assert.match(
    desc,
    /super\.parallel-subagent-development is the default/u,
    'the description is the ONLY governance on a direct entry; without this line the skill that over-claimed keeps the traffic',
  );
});

test('the in-tree description no longer routes to worktrees for "shared files"', () => {
  const desc = /description:\s*"([^"]*)"/u.exec(read(IN_TREE))[1];
  assert.doesNotMatch(
    desc,
    /when tasks must mutate shared files/u,
    'this was factually wrong: super.parallel-subagent-development STOPs on writeOverlap too. Routing on a condition neither skill accepts sends the case nowhere.',
  );
});

// ─── cause 3: the re-entry guard must exist in ALL THREE execution skills ────

test('every execution skill carries the decisionRequired election guard', () => {
  for (const file of [SEQUENTIAL, IN_TREE, WORKTREE]) {
    assert.match(
      read(file),
      /decisionRequired/u,
      `${file}: the guard lived only in the sequential skill because that is where the ORIGINAL bug landed. A backstop installed on one of three doors is not a backstop.`,
    );
  }
});

test('both parallel skills spell out that a parallelism word elects neither of them', () => {
  for (const file of [IN_TREE, WORKTREE]) {
    assert.match(
      read(file),
      /\*"In parallel"\* names two modes, so it names none/u,
      `${file}: the guard has to name the phrase that defeats it, not just cite the field`,
    );
  }
});

test('the in-tree guard defers to the rubric when the rubric picked worktrees', () => {
  assert.match(
    read(IN_TREE),
    /`executionRecommendation\.mode` is `parallel-subagent`/u,
    'in-tree is where the misroute LANDED — it is the skill that must recognise it was not the elected one',
  );
});

test('the guard sits after the parse call that produces the field it reads', () => {
  // Ordering is the defect, not just presence: in the measured run the mode was chosen
  // BEFORE parse-waves.cjs ran, so the recommendation could not inform it. A guard printed
  // above the command that computes its input is advice about data nobody has yet.
  for (const file of [IN_TREE, WORKTREE]) {
    const text = read(file);
    const parseCall = text.indexOf('parse-waves.cjs --tasks-index');
    const guard = text.indexOf('decisionRequired');
    assert.ok(parseCall !== -1, `${file}: expected the parse-waves invocation`);
    assert.ok(
      guard > parseCall,
      `${file}: the election guard must come after parse-waves.cjs runs, or it reads a field that does not exist yet`,
    );
  }
});
