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

test('well-formed stories → no warning', () => {
  const prd = writePrd([
    '# PRD',
    '',
    '## Histórias de Usuário',
    '',
    '- **US-01** — Como usuário, eu quero exportar CSV para que eu compartilhe dados',
    '',
  ].join('\n'));
  const r = run(prd);
  assert.equal(r.count, 1);
  assert.deepEqual(r.warnings, []);
});

test('no story section at all → no warning (count 0 is legitimate)', () => {
  const prd = writePrd('# PRD\n\n## Objetivos\n\nMetas aqui.\n');
  const r = run(prd);
  assert.equal(r.count, 0);
  assert.deepEqual(r.warnings, []);
});
