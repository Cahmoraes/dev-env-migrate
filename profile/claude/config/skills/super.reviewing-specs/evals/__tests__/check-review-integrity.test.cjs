'use strict';

// Tests evals/check-review-integrity.cjs — the deterministic gate that decides,
// over raw bytes, whether a produced review report is well-formed (a needs-changes
// report with severity-tagged findings, OR an honest clean verdict). Grading never
// depends on a grader's compressible Read of the report.
//
// Run: node --test evals/__tests__/check-review-integrity.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-review-integrity.cjs');

function run(args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function tmp(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-integrity-'));
  const p = path.join(dir, 'report.md');
  fs.writeFileSync(p, content, 'utf8');
  return { dir, p };
}

const changesReport = [
  '## Revisão da spec: broker-fanout',
  '', '### Achados',
  '#### 🔴 Critical (bloqueia a implementação)',
  '- **Severity:** Critical · **Section:** D3 · duplicate delivery não endereçado.',
  '', '### Veredito',
  'Cobertura: verifiquei as quatro lentes — D4 e os 7 exchanges íntegros.',
  '1 achado Critical. Recomendo aplicar.',
  '', 'x'.repeat(400),
].join('\n') + '\n';

const cleanReport = [
  '## Revisão da spec: rate-limit',
  '', '### Veredito: sem mudanças necessárias',
  'Verifiquei as quatro lentes. A spec fecha todos os forks e é consistente com o código e as tasks.',
  'Nenhum ponto aberto, inconsistência ou gap encontrado.',
  '', 'x'.repeat(400),
].join('\n') + '\n';

test('a needs-changes report with a severity tag is intact and classified "changes"', () => {
  const { dir, p } = tmp(changesReport);
  try {
    const r = run(['--report', p, '--expect', 'changes']);
    assert.equal(r.intact, true, JSON.stringify(r.errors));
    assert.equal(r.shape, 'changes');
    assert.ok(r.severityMentions >= 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an honest clean verdict is intact and classified "clean" (not a failure)', () => {
  const { dir, p } = tmp(cleanReport);
  try {
    const r = run(['--report', p, '--expect', 'clean']);
    assert.equal(r.intact, true, JSON.stringify(r.errors));
    assert.equal(r.shape, 'clean');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a clean verdict carrying one genuinely-Minor polish note is still "clean"', () => {
  // honest-reporting.md allows a sound spec to keep "at most one genuinely-Minor note".
  // A blocking finding (Critical/Important) is what makes a report "changes"; a lone Minor
  // alongside a clean verdict must NOT be misclassified as changes-required.
  const cleanWithMinor = [
    '## Revisão da spec: api-rate-limiting',
    '', '### Veredito: sem mudanças necessárias',
    'Verifiquei as lentes; a spec fecha seus forks (fail-open, incremento atômico).',
    '', '#### 🟢 Minor (opcional)',
    '- **Severity:** Minor · nota de prosa: `ThrottlerException` citado mas Dependências diz "nenhuma nova".',
    '', 'x'.repeat(400),
  ].join('\n') + '\n';
  const { dir, p } = tmp(cleanWithMinor);
  try {
    const r = run(['--report', p, '--expect', 'clean']);
    assert.equal(r.intact, true, JSON.stringify(r.errors));
    assert.equal(r.shape, 'clean');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a report that is neither clean nor has findings is unclassifiable → not intact', () => {
  const { dir, p } = tmp('## Revisão\n\nAlgum texto vago sem veredito nem severidade.\n' + 'x'.repeat(400));
  try {
    const r = run(['--report', p]);
    assert.equal(r.intact, false);
    assert.ok(r.errors.some((e) => /unclassifiable/.test(e)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a truncated report (too small, unbalanced fence) fails', () => {
  const { dir, p } = tmp('## Revisão\n\n#### 🔴 Critical\n```js\nconst x =');
  try {
    const r = run(['--report', p]);
    assert.equal(r.intact, false);
    assert.ok(r.errors.some((e) => /bytes/.test(e)));
    assert.ok(r.errors.some((e) => /unbalanced code fences/.test(e)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a U+FFFD replacement char (mojibake) fails', () => {
  const { dir, p } = tmp(changesReport + '\nGarbled: �� section.\n');
  try {
    const r = run(['--report', p]);
    assert.equal(r.intact, false);
    assert.ok(r.errors.some((e) => /U\+FFFD|replacement char/.test(e)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--expect mismatch is reported (a clean report when changes were expected)', () => {
  const { dir, p } = tmp(cleanReport);
  try {
    const r = run(['--report', p, '--expect', 'changes']);
    assert.equal(r.intact, false);
    assert.ok(r.errors.some((e) => /expected a "changes"/.test(e)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a nonexistent report is reported, not crashed', () => {
  const r = run(['--report', path.join(os.tmpdir(), 'no-such-review-xyz.md')]);
  assert.equal(r.intact, false);
  assert.ok(r.errors.some((e) => /does not exist/.test(e)));
});
