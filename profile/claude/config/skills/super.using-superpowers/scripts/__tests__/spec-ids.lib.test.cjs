'use strict';

/**
 * lib/spec-ids.cjs is the ONE parser of the AC-NN / INV-NN IDs a design spec defines.
 *
 * Locked here: what counts as a definition (bullet or table row, in the owner section) and
 * what does not (mentions, fenced examples, the same shape in another section). A parser that
 * drifts on either side turns a defined criterion into an unseen one, and the plan drops it
 * with no error anywhere.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/spec-ids.lib.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OWNER_SECTIONS,
  GUARANTORS,
  CATEGORIES,
  splitSections,
  parseSpecIds,
  parseOrigin,
  leadingToken,
  normalizeText,
} = require('../lib/spec-ids.cjs');

const SPEC = [
  '# Emissão de Certificados: Design',
  '',
  '## Visão Geral',
  'O certificado cita INV-01 e AC-01 aqui, e isso é menção.',
  '',
  '## Dados e Consistência',
  '| ID | Enunciado | Categoria | Garantidor | Rede |',
  '|---|---|---|---|---|',
  '| INV-01 | Um certificado por matrícula | unique (unicidade) | db | - |',
  '| **INV-03** | Emissão repetida não duplica | idempotent | app+lock | índice único |',
  '',
  '## Falhas e Erros',
  '| Falha | AC |',
  '|---|---|',
  '| PDF indisponível | AC-02 |',
  '',
  '## Testes',
  '- AC-01 · WHEN a matrícula conclui THEN um pedido é gravado (origem: D1)',
  '- **AC-02**: WHEN o PDF falha THEN o pedido volta à fila (origem: Falhas: PDF indisponível)',
  '- AC-04 - WHEN o aluno pede de novo THEN recebe o mesmo certificado (origem: fato do usuário (Escopo, Dentro))',
  '',
  '```markdown',
  '- AC-09 · WHEN exemplo THEN cercado (origem: D1)',
  '## Testes',
  '```',
].join('\n');

test('owner sections are the ones the plan names (T2)', () => {
  assert.deepEqual([...OWNER_SECTIONS.AC], ['Testes']);
  assert.deepEqual([...OWNER_SECTIONS.INV], ['Dados e Consistência']);
  assert.deepEqual([...GUARANTORS], ['app', 'app-pure', 'app+lock', 'db']);
  assert.deepEqual([...CATEGORIES], ['limit', 'unique', 'preserve', 'idempotent', 'transition', 'roundtrip']);
});

test('AC definitions: every separator, bold ID, gaps kept, fenced example ignored', () => {
  const { acceptance } = parseSpecIds(SPEC);
  assert.deepEqual(acceptance.map((a) => a.id), ['AC-01', 'AC-02', 'AC-04']);
  assert.ok(acceptance.every((a) => a.wellFormed && a.hasWhenThen));
  assert.equal(acceptance[0].line, 18);
  assert.equal(acceptance[0].origin, 'D1');
  assert.equal(acceptance[1].origin, 'Falhas: PDF indisponível');
  assert.equal(acceptance[2].origin, 'fato do usuário (Escopo, Dentro)');
});

test('INV definitions: table rows of the owner section with ASCII tokens and localized labels', () => {
  const { invariants, owners } = parseSpecIds(SPEC);
  assert.equal(owners.INV, 'Dados e Consistência');
  assert.deepEqual(invariants.map((i) => [i.id, i.category, i.guarantor, i.net]), [
    ['INV-01', 'unique', 'db', '-'],
    ['INV-03', 'idempotent', 'app+lock', 'índice único'],
  ]);
  assert.equal(invariants[0].text, 'Um certificado por matrícula');
});

test('mentions are never definitions: prose and the AC column of Falhas define nothing', () => {
  const { acceptance, invariants, misplaced } = parseSpecIds(SPEC);
  assert.equal(acceptance.filter((a) => a.id === 'AC-02').length, 1);
  assert.equal(invariants.filter((i) => i.id === 'INV-01').length, 1);
  assert.deepEqual(misplaced, []);
});

test('INV is defined only in Dados e Consistência: a table in Testes is misplaced, with or without Dados', () => {
  const noDados = '## Testes\n| INV-01 | regra | limit | app | - |\n- AC-01 · WHEN x THEN y (origem: D1)\n';
  const r = parseSpecIds(noDados);
  assert.equal(r.owners.INV, null);
  assert.deepEqual(r.invariants, []);
  assert.deepEqual(r.misplaced.map((m) => [m.kind, m.id, m.section]), [['INV', 'INV-01', 'Testes']]);

  const withDados = '## Dados e Consistência\ntexto\n\n## Testes\n| INV-01 | regra | limit | app | - |\n';
  const r2 = parseSpecIds(withDados);
  assert.deepEqual(r2.invariants, []);
  assert.deepEqual(r2.misplaced.map((m) => [m.kind, m.id, m.section]), [['INV', 'INV-01', 'Testes']]);
});

test('the definition shape outside its owner section is reported as misplaced', () => {
  const md = '## Riscos\n- AC-05 · WHEN x THEN y (origem: D1)\n\n## Testes\n- AC-01 · WHEN a THEN b (origem: D1)\n';
  const r = parseSpecIds(md);
  assert.deepEqual(r.acceptance.map((a) => a.id), ['AC-01']);
  assert.deepEqual(r.misplaced.map((m) => [m.id, m.section, m.line]), [['AC-05', 'Riscos', 2]]);
});

test('malformed numbers are captured as not well formed instead of being skipped', () => {
  const r = parseSpecIds('## Testes\n- AC-1 · WHEN a THEN b (origem: D1)\n- AC-001 · WHEN a THEN b (origem: D1)\n');
  assert.deepEqual(r.acceptance.map((a) => [a.id, a.wellFormed]), [['AC-1', false], ['AC-001', false]]);
});

test('WHEN must come before THEN, and both are the uppercase ASCII tokens', () => {
  const r = parseSpecIds('## Testes\n- AC-01 · THEN b WHEN a (origem: D1)\n- AC-02 · quando a então b (origem: D1)\n');
  assert.deepEqual(r.acceptance.map((a) => a.hasWhenThen), [false, false]);
});

test('headings inside fenced code do not open sections', () => {
  const names = splitSections(SPEC).map((s) => s.name).filter(Boolean);
  assert.deepEqual(names, ['Visão Geral', 'Dados e Consistência', 'Falhas e Erros', 'Testes']);
});

test('helpers: origin, leading token, normalized text', () => {
  assert.equal(parseOrigin('WHEN a THEN b (origem: D2, D3)'), 'D2, D3');
  assert.equal(parseOrigin('WHEN a THEN b (origin: corp ref CA-7 · CA001).'), 'corp ref CA-7 · CA001');
  assert.equal(parseOrigin('WHEN a THEN b'), null);
  assert.equal(leadingToken('db (banco)'), 'db');
  assert.equal(leadingToken('`app+lock`'), 'app+lock');
  assert.equal(leadingToken('Banco'), null);
  assert.equal(normalizeText('  a \n  b\tc '), 'a b c');
});
