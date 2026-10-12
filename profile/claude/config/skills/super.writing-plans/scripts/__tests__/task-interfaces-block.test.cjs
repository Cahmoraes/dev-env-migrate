'use strict';

/**
 * Prose-guard: every task file carries an `## Interfaces` block, and the writer is told
 * to fill it with exact signatures.
 *
 * Why: a plan on disk is executed task by task, one fresh subagent per task, and that
 * implementer reads ONLY its own `task-NN.md`. The names its neighbors chose — function
 * names, parameter lists, return types — reach it through this block or not at all; a
 * name absent here is a name it invents, and the mismatch surfaces one task later, in the
 * reviewer's diff. The `Consome:`/`Produz:` pair is the whole mechanism, so it is fixed
 * in two places: the template the writer copies, and the writer's own prompt.
 *
 * The task-writer assertions scan the body of `prompt: |` only. A rule written above the
 * prompt block is read by the controller and never reaches the subagent.
 *
 * Run: node --test super.writing-plans/scripts/__tests__/task-interfaces-block.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLANS = path.resolve(__dirname, '..', '..'); // .../super.writing-plans

const TEMPLATE = fs.readFileSync(path.join(PLANS, 'templates', 'task-file-template.md'), 'utf8');
const WRITER = fs.readFileSync(path.join(PLANS, 'agents', 'task-writer.md'), 'utf8');

/** The body of the `prompt: |` block — what the subagent actually receives. */
function promptBody(source) {
  const start = source.indexOf('prompt: |');
  assert.notEqual(start, -1, 'task-writer.md must dispatch with a `prompt: |` block');
  const after = source.slice(start + 'prompt: |'.length);
  const end = after.indexOf('\n```');
  assert.notEqual(end, -1, 'the `prompt: |` block must be closed by the fence');
  return after.slice(0, end);
}

test('the task file template carries an ## Interfaces section', () => {
  assert.match(
    TEMPLATE,
    /^##\s+Interfaces\s*$/mu,
    'task-file-template.md must declare a `## Interfaces` section',
  );
});

test('the template asks for both halves of the block', () => {
  assert.match(
    TEMPLATE,
    /^-\s+\*\*Consome:\*\*/mu,
    'the Interfaces block must carry a `- **Consome:**` line (what earlier tasks hand over)',
  );
  assert.match(
    TEMPLATE,
    /^-\s+\*\*Produz:\*\*/mu,
    'the Interfaces block must carry a `- **Produz:**` line (what later tasks will call)',
  );
});

test('the template says why the block exists: the implementer sees only its own task', () => {
  const block = TEMPLATE.slice(TEMPLATE.search(/^##\s+Interfaces\s*$/mu));
  assert.match(
    block,
    /only this file|only its own task|never the neighboring task/iu,
    'the Interfaces comment must state that the implementer reads only this task file',
  );
  assert.match(
    block,
    /N\/A/u,
    'the Interfaces comment must say what to write when a line carries nothing',
  );
});

test('the template keeps Interfaces between the file manifest and the compliance subsection', () => {
  const arquivos = TEMPLATE.search(/^##\s+Arquivos\s*$/mu);
  const interfaces = TEMPLATE.search(/^##\s+Interfaces\s*$/mu);
  const passos = TEMPLATE.search(/^##\s+Passos\s*$/mu);
  assert.ok(arquivos !== -1 && interfaces !== -1 && passos !== -1);
  assert.ok(
    arquivos < interfaces && interfaces < passos,
    'Interfaces belongs after `## Arquivos` and before `## Passos` — the names are read with the manifest, not after the steps',
  );
});

test('the writer prompt orders the Interfaces block filled with exact signatures', () => {
  const prompt = promptBody(WRITER);
  assert.match(
    prompt,
    /##\s+Interfaces/u,
    'the dispatched prompt itself must name `## Interfaces` — a rule above `prompt: |` never reaches the writer',
  );
  assert.match(prompt, /Consome/u, 'the prompt must name the `Consome:` half');
  assert.match(prompt, /Produz/u, 'the prompt must name the `Produz:` half');
  assert.match(
    prompt,
    /exact\s+signatures?/iu,
    'the prompt must demand exact signatures, not a paraphrase of the neighbor task',
  );
});

test('the writer prompt makes each Consome item cite its producer task', () => {
  const prompt = promptBody(WRITER);
  const interfaces = prompt.search(/##\s+Interfaces/u);
  const tail = prompt.slice(interfaces);
  assert.match(
    tail,
    /\(task-NN\)/u,
    'the Interfaces instruction must demand the producer id `(task-NN)` — those ids are the only edges parse-plan.cjs and the pre-flight read',
  );
});
