'use strict';

/**
 * The AC-NN / INV-NN contract, prose side. lib/spec-ids.cjs parses the IDs and check-spec.cjs
 * judges them; this file locks that the prose teaching the shape agrees with both:
 *
 *   1. The examples in design-spec-structure.md pass check-spec. A template the checker rejects
 *      makes every spec written from it fail step 7, and the model "fixes" the spec away from
 *      the template, or the template away from the checker.
 *   2. The category and guarantor tokens the template names are the lib's.
 *   3. Step 7 of brainstorming runs the checker by a fenced command (a described command gets
 *      improvised; a check nobody runs is dead).
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/spec-ids-contract.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { GUARANTORS, CATEGORIES } = require('../lib/spec-ids.cjs');
const { checkSpec } = require('../../../super.brainstorming/scripts/check-spec.cjs');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');
const TEMPLATE = read('super.brainstorming/references/design-spec-structure.md');

/** The first ```markdown fence after a `## Section: <name>` heading of the template. */
function exampleOf(section) {
  const start = TEMPLATE.indexOf(`## Section: ${section}`);
  assert.ok(start >= 0, `template has no "## Section: ${section}"`);
  const m = /```markdown\n([\s\S]*?)\n```/.exec(TEMPLATE.slice(start));
  assert.ok(m, `no markdown example under "${section}"`);
  return m[1];
}

test('the template examples, assembled into a spec, pass check-spec with the IDs they show', () => {
  const spec = [
    '# Emissão de Certificados: Design',
    '## Escopo',
    '**Dentro:** emissão.',
    '**Lentes fechadas:** Atributos de qualidade (exemplo); Evolução e rollout (exemplo)',
    '## Fronteiras e Contratos',
    exampleOf('Fronteiras e Contratos'),
    '## Dados e Consistência',
    exampleOf('Dados e Consistência'),
    '## Falhas e Erros',
    exampleOf('Falhas e Erros'),
    '## Decisões Arquiteturais',
    exampleOf('Decisões Arquiteturais').replace(/^## Decisões Arquiteturais\n/, ''),
    '## Testes',
    exampleOf('Testes'),
  ].join('\n\n');
  const r = checkSpec(spec);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.acceptance.length >= 2, 'the Testes example shows at least two criteria');
  assert.ok(r.invariants.length >= 1, 'the Dados example shows the invariant table');
  assert.equal(Object.keys(r.migration.labels).length, 4, 'the Dados example shows the four migration labels');
  assert.match(exampleOf('Fronteiras e Contratos'), /^\*\*Contrato:\*\*/m, 'the first Fronteiras example is the contract table');
  assert.match(exampleOf('Dados e Consistência'), /^\*\*Modelo:\*\*/m, 'the Dados example shows the model block');
});

test('the Falhas example column cites criteria the Testes example defines', () => {
  const defined = new Set(exampleOf('Testes').match(/AC-\d{2}/g));
  const cited = exampleOf('Falhas e Erros').match(/AC-\d{2}/g) || [];
  assert.ok(cited.length >= 1);
  for (const id of cited) assert.ok(defined.has(id), `${id} cited in Falhas and not defined in Testes`);
});

test('the template names exactly the lib tokens for category and guarantor', () => {
  for (const token of [...CATEGORIES, ...GUARANTORS]) {
    assert.ok(TEMPLATE.includes(`\`${token}\``), `design-spec-structure.md does not name \`${token}\``);
  }
});

test('brainstorming step 7 runs check-spec by a fenced command', () => {
  const skill = read('super.brainstorming/SKILL.md');
  const step7 = skill.slice(skill.indexOf('7. **Spec self-review**'), skill.indexOf('8. **Approval gate'));
  assert.match(step7, /```\n\s*node <super\.brainstorming-base-dir>\/scripts\/check-spec\.cjs \S+design\.md\n\s*```/);
});
