'use strict';
/*
 * grilling-contract.test.cjs — the interview is an architect's grilling: a decision tree asked in
 * rounds, each question with a recommendation, facts looked up instead of asked, and lenses that
 * decide which questions a senior architect asks.
 *
 * Why the rules live in SKILL.md step 3 and not only in the reference: mining 37 real sessions
 * (2026-09-23) showed the references that govern the interview are the least read —
 * decision-tree-interviewing.md 2/37, architecture-characteristics.md 7/37 and 0/17 since 09-12 —
 * while the characteristics table was still written, chosen by the model alone (Claude Code asked
 * the user 0/20 times), and failure behavior was asked in 9 of 194 questions. SKILL.md is the
 * layer that is always in context; the reference carries the procedure (round format, lens
 * table, depth per tier, close-out).
 *
 * Run: node --test super.brainstorming/scripts/__tests__/grilling-contract.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILL, rel), 'utf8');

function step(n, nextHead) {
  const md = read('SKILL.md');
  const start = md.search(new RegExp(`\\n${n}\\. \\*\\*`));
  const end = md.indexOf(nextHead, start + 1);
  assert.ok(start > 0 && end > start, `checklist step ${n} must exist`);
  return md.slice(start, end);
}

test('step 3 asks the frontier in rounds, each question with a reasoned recommendation', () => {
  const s3 = step(3, '\n4. **Propose 2-3 approaches**');
  assert.match(s3, /\*\*Grill in rounds — the architect's interview\.\*\*/);
  assert.match(s3, /ask its \*\*frontier\*\* each round: every open decision whose parents are settled, at most four per message/);
  assert.match(s3, /each with your recommended answer and the fact, priority or risk behind it/);
  assert.match(s3, /An unanswered question takes the recommendation/);
});

test('step 3 separates facts (looked up, sourced) from decisions (asked)', () => {
  const s3 = step(3, '\n4. **Propose 2-3 approaches**');
  assert.match(s3, /\*\*Facts are looked up, never asked:\*\*/);
  assert.match(s3, /an unverified claim is labeled an assumption/);
  assert.match(s3, /supplies what only they know — volumes, deadlines, consumers outside the repo/);
  assert.match(s3, /The opening round asks only what no research can answer/);
});

test('step 3 names the lenses inline, and the quality attributes are never chosen silently', () => {
  const s3 = step(3, '\n4. **Propose 2-3 approaches**');
  for (const lens of ['quality attributes', 'ownership and source of truth', 'integration and coupling',
    'failure behavior', 'data consistency and migration', 'rollout for live consumers', 'security and privacy']) {
    assert.ok(s3.includes(lens), `step 3 must name the "${lens}" lens`);
  }
  assert.match(s3, /recommend a top 3, each with a measurable criterion — never chosen silently/);
  assert.match(s3, /`\.\/references\/grilling\.md`/);
});

test('step 4 asks for radically different approaches and grills the children of the chosen one', () => {
  const s4 = step(4, '\n5. **Present the design once**');
  assert.match(s4, /radically different in shape/);
  assert.match(s4, /never variations of one library or column choice/);
  assert.match(s4, /The chosen approach opens children/);
});

test('the reference carries the round format, the lens table, depth rule and the close-out', () => {
  const ref = read('references/grilling.md');
  assert.match(ref, /\*\*at most four questions\*\*/);
  assert.match(ref, /→ \*\*Recomendo:\*\*/);
  assert.match(ref, /o que ficar sem resposta segue a recomendação/);
  for (const lens of ['Propósito e escopo', 'Atributos de qualidade', 'Domínio e propriedade', 'Integração e acoplamento',
    'Dados e consistência', 'Falhas', 'Evolução e rollout', 'Segurança e privacidade']) {
    assert.ok(ref.includes(`| **${lens}** |`), `the lens table must carry "${lens}"`);
  }
  assert.match(ref, /## Depth — the tree decides/);
  assert.doesNotMatch(ref, /\| \*\*(Medium|Large|Complex)\b/, 'depth comes from the tree, not from a size table');
  assert.match(ref, /\*\*A node no research answered\.\*\*[^\n]*offer `super\.deep-research` inside that round/);
  assert.match(ref, /## A named property is a node you owe/);
  assert.match(ref, /\*\*Closing is not building\.\*\*/);
  assert.match(ref, /The spec has no "open questions" section/);
});

test('every lens maps to a spec section that the structure reference defines', () => {
  const ref = read('references/grilling.md');
  const structure = read('references/design-spec-structure.md');
  for (const section of ['Visão Geral', 'Escopo', 'Características Arquiteturais', 'Componentes',
    'Fronteiras e Contratos', 'Dados e Consistência', 'Falhas e Erros', 'Rollout e Compatibilidade']) {
    assert.ok(ref.includes(section), `grilling.md must route a lens to "${section}"`);
    assert.ok(structure.includes(`\`## ${section}\``), `design-spec-structure.md must define "## ${section}"`);
  }
});

test('decision blocks record rejected alternatives, consequences and conformance', () => {
  const structure = read('references/design-spec-structure.md');
  assert.match(structure, /- \*\*Contexto:\*\*[^\n]*Alternativas:/);
  assert.match(structure, /- \*\*Consequências:\*\*/);
  assert.match(structure, /- \*\*Conformidade:\*\*/);
  assert.match(structure, /^2\. Every architecturally significant decision names the alternatives it rejected/m);
  assert.match(structure, /^8\. Every external call and every state change has its failure behavior/m);
});

test('the retired decision-tree reference is gone and nothing points at it', () => {
  assert.ok(!fs.existsSync(path.join(SKILL, 'references', 'decision-tree-interviewing.md')));
  for (const rel of ['SKILL.md', ...fs.readdirSync(path.join(SKILL, 'references')).map((f) => `references/${f}`)]) {
    assert.doesNotMatch(read(rel), /decision-tree-interviewing/, `${rel} still points at the retired reference`);
  }
});
