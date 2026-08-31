'use strict';

/**
 * Tests for the generate-slugs.cjs zero-extraction warning.
 *
 * A PRD with a "## Histórias de Usuário" section but no template-shaped story lines must NOT
 * silently report 0 stories — it should carry a warning so the QA gate isn't run against nothing.
 *
 * Run with: node --test super.user-story-verification/scripts/__tests__/generate-slugs-warning.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'generate-slugs.cjs');

function writePrd(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slugs-warn-'));
  const prd = path.join(dir, 'prd-x.md');
  fs.writeFileSync(prd, body);
  return prd;
}

function run(prd) {
  const out = execFileSync('node', [SCRIPT, '--prd', prd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

test('story section present but lines off-template → 0 stories WITH a warning', () => {
  const prd = writePrd([
    '# PRD',
    '',
    '## Histórias de Usuário',
    '',
    '- O usuário faz login.', // not the "Como ..., eu quero ... para que ..." shape
    '- O usuário exporta dados.',
    '',
  ].join('\n'));
  const r = run(prd);
  assert.equal(r.count, 0);
  assert.ok(Array.isArray(r.warnings) && r.warnings.length >= 1);
  assert.match(r.warnings[0], /0 user stories extracted/);
});

test('well-formed stories with FR annotations → no warning, mapping populated', () => {
  const prd = writePrd([
    '# PRD',
    '',
    '## Histórias de Usuário',
    '',
    '- **US-01** — Como usuário, eu quero exportar CSV para que eu compartilhe dados',
    '- **US-02** — Como gestor, eu quero agendar o export para que eu receba por e-mail',
    '',
    '## Funcionalidades Principais',
    '',
    '- **FR-001** (US-01) — O sistema deve gerar o arquivo CSV.',
    '- **FR-002** (US-01, US-02) — O sistema deve respeitar o filtro ativo.',
    '- **FR-003** (US-02) — O sistema deve enviar o arquivo por e-mail.',
    '',
  ].join('\n'));
  const r = run(prd);
  assert.equal(r.count, 2);
  assert.equal(r.requirementsMapped, true);
  assert.deepEqual(r.warnings, []);
  // Many-to-many: FR-002 serves both stories, and each story keeps its own list sorted.
  assert.deepEqual(r.userStories[0].requirements, ['FR-001', 'FR-002']);
  assert.deepEqual(r.userStories[1].requirements, ['FR-002', 'FR-003']);
});

test('well-formed stories with NO FR annotation → warning, empty mapping, still valid', () => {
  // Every PRD written before the annotation existed looks like this. It must keep working:
  // the stories extract, the gate runs, and the controller is told the mapping is its own
  // inference rather than being handed a confident empty array.
  const prd = writePrd([
    '# PRD',
    '',
    '## Histórias de Usuário',
    '',
    '- **US-01** — Como usuário, eu quero exportar CSV para que eu compartilhe dados',
    '',
    '## Funcionalidades Principais',
    '',
    '- **FR-001** — O sistema deve gerar o arquivo CSV.',
    '',
  ].join('\n'));
  const r = run(prd);
  assert.equal(r.count, 1);
  assert.equal(r.requirementsMapped, false);
  assert.deepEqual(r.userStories[0].requirements, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /No FR->US annotation found/);
});

test('a legacy HU- annotation maps onto the normalized US- id', () => {
  const prd = writePrd([
    '# PRD',
    '',
    '## Histórias de Usuário',
    '',
    '- **HU-01** — Como usuário, eu quero exportar CSV para que eu compartilhe dados',
    '',
    '## Funcionalidades Principais',
    '',
    '- **FR-001** (HU-01) — O sistema deve gerar o arquivo CSV.',
    '',
  ].join('\n'));
  const r = run(prd);
  assert.equal(r.userStories[0].id, 'US-01');
  assert.deepEqual(r.userStories[0].requirements, ['FR-001']);
});

test('story lines dropped by the shape are counted, not swallowed', () => {
  // Real PRD shape: only the first story ends in "para que ..."; the rest use
  // "para <verbo> ...". Zero extraction has its own guard; PARTIAL extraction used to
  // return a clean-looking success with most of the feature missing.
  const prd = writePrd([
    '# PRD',
    '',
    '## Histórias de Usuário',
    '',
    '- **US-01** — Como admin, eu quero desativar uma academia para que ela suma das buscas',
    '- **US-02** — Como admin, eu quero ver uma confirmação para evitar cliques acidentais',
    '- **US-03** — Como admin, eu quero acessar o detalhe para poder reativá-la',
    '',
  ].join('\n'));
  const r = run(prd);
  assert.equal(r.count, 1);
  const partial = r.warnings.find((w) => /look like user stories but only/.test(w));
  assert.ok(partial, `expected a partial-extraction warning, got ${JSON.stringify(r.warnings)}`);
  assert.match(partial, /3 line\(s\)/);
  assert.match(partial, /2 were dropped silently/);
});

test('no story section at all → no warning (count 0 is legitimate)', () => {
  const prd = writePrd('# PRD\n\n## Objetivos\n\nMetas aqui.\n');
  const r = run(prd);
  assert.equal(r.count, 0);
  assert.deepEqual(r.warnings, []);
});
