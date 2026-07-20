'use strict';

// Tests evals/check-spec-integrity.cjs — the deterministic artifact-integrity gate that
// decides "is the produced spec intact" mechanically, so grading never depends on a
// grader's compressible Read of the file.
//
// Run: node --test evals/__tests__/check-spec-integrity.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-spec-integrity.cjs');

function run(args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function tmp(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-integrity-'));
  const p = path.join(dir, 'spec.md');
  fs.writeFileSync(p, content, 'utf8');
  return { dir, p };
}

const goodSpec = [
  '# Design Spec — Something',
  '', '## Visão Geral', 'Body text.',
  '', '## Características Arquiteturais', 'Body.',
  '', '## Decisões Arquiteturais', '### D1', 'Trade-off body.',
  '', '## Riscos', '- risk one with a mitigation.',
  '', '## Testes', '- a scenario.',
  '', 'Fechamento: every end closed.',
].join('\n') + '\n' + 'x'.repeat(2000) + '\n';

test('an intact multi-section spec passes', () => {
  const { dir, p } = tmp(goodSpec);
  try {
    const r = run(['--spec', p, '--require', 'Decisões Arquiteturais', '--require', 'Riscos']);
    assert.equal(r.intact, true);
    assert.equal(r.errors.length, 0);
    assert.ok(r.h2 >= 4);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a truncated spec (small, unbalanced fence, few sections) fails', () => {
  const { dir, p } = tmp('# Spec\n\n## Decisões Arquiteturais\n\n```js\nconst x =');
  try {
    const r = run(['--spec', p, '--require', 'Riscos']);
    assert.equal(r.intact, false);
    assert.ok(r.errors.some((e) => /bytes/.test(e)));
    assert.ok(r.errors.some((e) => /unbalanced code fences/.test(e)));
    assert.ok(r.errors.some((e) => /Riscos/.test(e)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a U+FFFD replacement char (mojibake) fails', () => {
  const { dir, p } = tmp(goodSpec + '\nGarbled: �� table.\n');
  try {
    const r = run(['--spec', p]);
    assert.equal(r.intact, false);
    assert.ok(r.errors.some((e) => /U\+FFFD|replacement char/.test(e)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a missing required section fails even when otherwise intact', () => {
  const { dir, p } = tmp(goodSpec);
  try {
    const r = run(['--spec', p, '--require', 'Especificação Visual']);
    assert.equal(r.intact, false);
    assert.ok(r.errors.some((e) => /Especificação Visual/.test(e)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a nonexistent file is reported, not crashed', () => {
  const r = run(['--spec', path.join(os.tmpdir(), 'does-not-exist-xyz.md')]);
  assert.equal(r.intact, false);
  assert.ok(r.errors.some((e) => /does not exist/.test(e)));
});

test('mid-sentence truncation surfaces as a warning (soft signal)', () => {
  // Ends mid-word with no sentence/table/list boundary — a soft truncation signal.
  const { dir, p } = tmp(goodSpec.replace(/Fechamento: every end closed\.\n/, 'Fechamento: every end was sudden'));
  try {
    const r = run(['--spec', p]);
    assert.ok(r.warnings.some((w) => /mid-sentence truncation/.test(w)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
