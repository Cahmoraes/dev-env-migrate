'use strict';
/*
 * parallelism-precedence.test.cjs — the parallelism check reads the script's verdict; it
 * does not re-derive one from the script's own evidence.
 *
 * The old wording gave the controller two inputs and no precedence:
 *
 *   "`parallelizable: true` and `maxParallelWave > 1` → Prefer super.parallel-subagent-*.
 *    Stay here only if the user chose it or the wave is tightly coupled."
 *
 * Both halves come out of the SAME call. Simulating a real entry, `parse-waves.cjs`
 * returned `parallelizable: true`, `maxParallelWave: 5` AND the signal "2 high-fan-in
 * task(s) (#1, #5) — tightly coupled". So one JSON object licensed both "hand off" and
 * "stay", and nothing said which wins. The controller's own words: "o mesmo script produz
 * o sinal de sair e o sinal de ficar, sem regra de precedência".
 *
 * The script had already settled it. `deriveExecutionRecommendation` folds wave shape,
 * fan-in and coupling into one `mode`, and puts the coupling case in `alternatives[]` with
 * a `when` — as a refinement of the verdict, not a competitor to it. `signals[]` is the
 * evidence it reasoned from. Reading the evidence and re-deciding is how a deterministic
 * call gets turned back into a judgement call, which is the same failure `reviewShape`
 * already guards against elsewhere in this file.
 *
 * `decisionRequired` answers the second half of the ambiguity — whether this is a stop to
 * consult the user or the controller's own call. It is the former.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/parallelism-precedence.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const body = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const section = body.split('### Parallelism check')[1].split('\n### ')[0];

test('the parallelism check defers to executionRecommendation.mode', () => {
  assert.match(
    section, /executionRecommendation\.mode/,
    'the check must name the field that carries the verdict. Without it the controller has '
    + 'only raw signals and has to invent a precedence rule.',
  );
  assert.match(
    section, /do not re-derive it|não re-derive/i,
    'say it explicitly. `parallelizable` and `maxParallelWave` are still in the output, so '
    + '"read the mode" alone leaves re-deriving from them as an available reading.',
  );
});

test('the coupling signal is framed as evidence, not as a competing verdict', () => {
  assert.match(
    section, /tightly coupled/,
    'the coupling case must still be addressed — it is the one that routes back to this skill',
  );
  assert.match(
    section, /signals\[\]/,
    'name where the coupling signal lives, so it is not mistaken for a second conclusion',
  );
});

test('decisionRequired routes to the user rather than to the controller', () => {
  assert.match(
    section, /decisionRequired/,
    'the check must say what `decisionRequired: true` obliges',
  );
  assert.match(
    section, /present the options|apresente as opções/i,
    'the ambiguity was whether this is a consult-the-user stop or a controller decision. '
    + 'It is the former; silence here lets a controller keep the default unasked.',
  );
});

test('the script still emits every field the prose depends on', () => {
  // A prose pointer at a JSON field is only as good as the field. If the script drops one,
  // the instruction becomes unfollowable and nothing else would notice.
  const script = fs.readFileSync(
    path.join(SKILL_DIR, '..', 'super.parallel-subagent-development', 'scripts', 'parse-waves.cjs'),
    'utf8',
  );
  for (const field of ['executionRecommendation', 'decisionRequired', 'alternatives', 'signals']) {
    assert.match(script, new RegExp(field),
      `parse-waves.cjs must still emit \`${field}\` — the SKILL.md instructs reading it`);
  }
});
