'use strict';
/*
 * alldone-entry-branch.test.cjs — `allDone: true` is an entry state with its own branch,
 * not a loop that happens to run zero times.
 *
 * `parse-tasks.cjs` has always reported `allDone`, and the skill has always listed it among
 * the script's outputs. Nothing read it. The Execution Loop said "skip the `[x]` ones, run
 * what remains" — and with nothing remaining that is not an instruction, it is an empty
 * procedure the controller has to interpret.
 *
 * Simulating a real entry against a consumer's finished feature (8 tasks, all `[x]` and all
 * `Status: DONE`) surfaced it: the controller got there, reported the gap unprompted, and
 * had to INFER that the right route was the final stage. Its own words — "tive de inferir
 * que a rota correta é ir direto às gates finais". A controller that infers differently
 * re-dispatches implementers over code that is already on the branch.
 *
 * Two halves, and both are load-bearing:
 *   - the branch must exist where the parse result is READ, not further down where the
 *     reader has already started interpreting the loop;
 *   - it must forbid restarting, because "nothing remains" and "start over" are both
 *     consistent with an empty pending list.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/alldone-entry-branch.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const body = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const REFERENCE = path.join(SKILL_DIR, 'references', 'execution-loop.md');

test('the skill branches on allDone where the parse result is read', () => {
  assert.match(
    body, /`allDone: true`/,
    'the SKILL.md must act on `allDone`, not merely list it among the script outputs. A field '
    + 'that is named but never read is indistinguishable from one that does not exist.',
  );
  // The branch has to sit with the parse output, before the Execution Loop — a controller
  // that has already entered the loop is past the decision.
  const parseIdx = body.indexOf('`allDone: true`');
  const loopIdx = body.indexOf('### Execution Loop');
  assert.ok(parseIdx !== -1 && loopIdx !== -1 && parseIdx < loopIdx,
    'the allDone branch must appear BEFORE "### Execution Loop": it decides whether the loop '
    + 'runs at all.');
});

test('the allDone branch routes to the final stage and forbids restarting', () => {
  const line = body.split('\n').find((l) => l.includes('`allDone: true`')) || '';
  assert.match(line, /final stage/i,
    'say where to go: the final stage. "Nothing to run" without a destination leaves the '
    + 'controller to pick one.');
  assert.match(line, /[Nn]ever restart|do not restart|não reinicie/,
    'an empty pending list is equally consistent with "start over". The prohibition is what '
    + 'separates the two readings, and re-dispatching over finished code is the expensive one.');
});

/*
 * Re-simulating the same entry AFTER the allDone branch and the Branch Guard fix landed
 * showed the two fixes colliding — a defect introduced by fixing, not a pre-existing one.
 *
 * Both verdicts arrive in the SAME call, because the skill requires it ("Both parsers go in
 * this one call"). The parser said present the execution options; `allDone: true` said go to the final
 * stage. Neither qualified the other. The controller resolved it correctly and said so:
 * "isso é inferência minha (…) nada no texto diz que allDone curto-circuita a linha 40".
 *
 * And the Branch Guard fired — `current=main default=main` — but its prescribed action is
 * "do not dispatch the first implementer until they choose", and with allDone there is no
 * first implementer. A guard whose action has no referent is a guard that gets read past,
 * which is what its own wording calls out.
 */
test('allDone settles the mode election, and the Branch Guard keeps its bite without a dispatch', () => {
  const line = body.split('\n').find((l) => l.includes('`allDone: true`')) || '';
  assert.match(line, /settles the mode election/i,
    'both verdicts come out of the one required call, so the precedence has to be written. '
    + 'Without it the controller picks — correctly here, by inference, which is the thing '
    + 'this file exists to stop.');

  const guard = body.split('### Branch Guard')[1].split('\n### ')[0];
  assert.match(guard, /no first implementer to hold/i,
    'the STOP has to name what it stops when there is no pending dispatch');
  assert.match(guard, /before the final stage/i,
    'and where it applies instead — the tail dispatches fix implementers and integrates '
    + 'onto this branch, so the consent is still owed');
});

test('the recovery pointer resolves to a real section', () => {
  // A pointer into a reference is only worth its bytes if the target exists — and section
  // headings drift while the sentence that names them does not.
  assert.match(body, /execution-loop\.md.*Arriving at a finished plan/,
    'the SKILL.md must point at the section carrying the full procedure');
  assert.ok(fs.existsSync(REFERENCE), 'references/execution-loop.md must exist');
  const ref = fs.readFileSync(REFERENCE, 'utf8');
  assert.match(ref, /^## Arriving at a finished plan$/m,
    'the named section must exist in references/execution-loop.md');
  assert.match(ref, /mismatches/,
    'the reference must cover the mirror case: an index/task-file disagreement makes BOTH '
    + 'allDone values untrustworthy, so it has to be resolved before allDone is read.');
});
