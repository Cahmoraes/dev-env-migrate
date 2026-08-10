'use strict';

/**
 * Prose-guard: the heavy run (suite / typecheck / build) has exactly ONE owner per wave.
 *
 * Measured failure this locks out (session 303caf93, a plan with 4 single-task
 * waves): the in-tree SKILL.md named `barrier.cjs` only in the multi-task
 * branch, so the four `sequential` waves ran with no named owner for the heavy sequence.
 * `barrier.cjs` was invoked ZERO times in 4h52m; instead the same green was proven up to
 * three times per task — the implementer ran the full suite (because the controller wrote
 * it into the prompt), the controller ran it again as a hand-rolled barrier, and a
 * read-only reviewer ran it a third time (because the controller wrote "confirm nothing
 * broke" into the review prompt). 49 min of wall clock went to test execution, of which
 * ~23 min proved a green that was already in hand.
 *
 * The two textual defects that allowed it, both fixed and both locked here:
 *   1. the single-task branch delegated to `super.subagent-driven-development` by POINTER,
 *      and that skill's "full-suite checkpoint, once per wave/batch" rule lives in a
 *      SKILL.md the single-task path never obliges anyone to load (the session's
 *      controller only ever grepped that file for `model_tiers`);
 *   2. the reviewer templates licensed "test runs" with no ceiling, in the very paragraph
 *      the controller reads while assembling the dispatch.
 *
 * Run: node --test super.parallel-subagent-in-tree/scripts/__tests__/heavy-run-single-owner.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const IN_TREE_SKILL = 'super.parallel-subagent-in-tree/SKILL.md';
const IN_TREE_IMPLEMENTER = 'super.parallel-subagent-in-tree/agents/implementer.md';
const VBC = 'super.verification-before-completion/SKILL.md';
const REVIEWERS = [
  'super.subagent-driven-development/agents/spec-reviewer.md',
  'super.subagent-driven-development/agents/code-quality-reviewer.md',
  'super.subagent-driven-development/agents/combined-reviewer.md',
];

/** The single-task branch runs from its heading to the multi-task branch heading. */
function singleTaskBranch(content) {
  const start = content.indexOf('**Single-task wave');
  const end = content.indexOf('**Multi-task wave');
  assert.ok(start !== -1, 'single-task branch marker missing from Step 4');
  assert.ok(end > start, 'multi-task branch marker missing or out of order');
  return content.slice(start, end);
}

test('single-task branch names barrier.cjs as the heavy run', () => {
  const branch = singleTaskBranch(read(IN_TREE_SKILL));
  assert.match(
    branch,
    /barrier\.cjs/,
    'a `sequential` wave with no named owner for the heavy sequence is exactly how the ' +
      'controller ends up hand-rolling it — the branch must name the script',
  );
  assert.match(
    branch,
    /barrier\.cjs[^`]*--changed/,
    'the barrier INVOCATION must carry --changed; an unscoped barrier runs every workspace ' +
      'the wave could not have touched. Mentioning the flag in prose nearby is not enough.',
  );
});

test('single-task branch forbids delegating the heavy run to a subagent prompt', () => {
  const branch = singleTaskBranch(read(IN_TREE_SKILL));
  assert.match(
    branch,
    /never put a suite\/typecheck\/build command in a subagent prompt/i,
    'the observed regression was the controller WRITING the suite command into the ' +
      'dispatch — a rule aimed only at the subagent does not reach the author of that prompt',
  );
});

test('single-task branch answers the VBC-needs-evidence motive', () => {
  const branch = singleTaskBranch(read(IN_TREE_SKILL));
  // Naming VBC is not enough — the gate sequence one sentence earlier already names it.
  // The branch has to say the barrier output SATISFIES that gate, because "I still owe
  // fresh evidence" is the motive that drives the duplicate run.
  assert.match(
    branch,
    /satisfies that gate/,
    'the branch must state that reading the barrier JSON discharges VBC; a bare prohibition ' +
      'leaves the controller with an unmet obligation and it will re-run the suite to meet it',
  );
});

test('in-tree implementer block extends to single-task waves', () => {
  const block = read(IN_TREE_IMPLEMENTER);
  assert.match(
    block,
    /[Ss]ingle-task \(`sequential`\) waves get this block too/,
    'the scoping block was scoped to parallel waves, so a lone implementer inherited none ' +
      'of it — including "run only your scoped test"',
  );
});

test('the scoped-test placeholder does not model a filter that fails to narrow', () => {
  const block = read(IN_TREE_IMPLEMENTER);
  const line = block.split('\n').find((l) => l.includes('**Your scoped test command:**'));
  assert.ok(line, 'the scoped test command placeholder is missing');
  assert.match(
    line,
    /FILE argument/,
    'the example the controller copies was `test -t "<name>"` — a name-only filter that still ' +
      'collects every file. A smoke A/B on both harnesses reproduced the copy: the placeholder ' +
      'is the template, so a trap modelled here is a trap dispatched every wave.',
  );
});

test('the no-full-suite rule survives the lone-implementer case', () => {
  const block = read(IN_TREE_IMPLEMENTER);
  const rule = block.slice(block.indexOf('**Run only your scoped test.**'));
  assert.ok(rule.length > 0, 'rule 4 ("Run only your scoped test") missing');
  assert.match(
    rule,
    /only implementer in the wave/i,
    'rule 4 justified itself with "races with your siblings", which is FALSE for a lone ' +
      'implementer — the model correctly discounted it. The reason must be ownership, not race.',
  );
});

test('every reviewer template caps Bash below a full-suite run', () => {
  for (const rel of REVIEWERS) {
    const content = read(rel);
    assert.match(
      content,
      /never the full suite/i,
      `${rel}: an uncapped "test runs" license is read as permission to re-prove the green`,
    );
    assert.match(
      content,
      /Do not write suite\/typecheck\/build commands into the prompt you assemble/i,
      `${rel}: the rule must address the CONTROLLER assembling the prompt, not only the reviewer`,
    );
  }
});

test('VBC tells the reader to verify the filter actually applied', () => {
  const content = read(VBC);
  const scope = content.slice(content.indexOf('## Scope: per-task'));
  assert.ok(scope.length > 0, 'VBC "Scope" section missing');
  assert.match(
    scope,
    /Confirm the scoping actually applied/i,
    'a scoped command that silently loses its filter reports everything green and costs a ' +
      'full suite — it reads as rigor while being the redundancy this section prevents',
  );
  assert.match(
    scope,
    /no file argument/i,
    'a name filter with no file argument still collects every file; that specific trap cost ' +
      '6 min across a 60s-per-run debugging loop in the observed session',
  );
  assert.match(
    scope,
    /pnpm --filter <ws> test -- <path>/,
    'the extra `--` that eats the filter is the concrete monorepo trap; naming the shape is ' +
      'what makes the warning actionable rather than a general caution',
  );
});
