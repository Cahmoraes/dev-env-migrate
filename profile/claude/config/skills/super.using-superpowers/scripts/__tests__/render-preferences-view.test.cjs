'use strict';
/**
 * render-preferences-view.test.cjs — the preferences view of triage option 0 is RENDERED,
 * not hand-written.
 *
 * Observed 2026-09-19 (real session): asked for the view, the model printed one sentence —
 * "commit automático ativo, code-review final desligado, gate de QA e finalização com
 * pergunta, e stack Node" — dropping the model tiers, the companion, the corporate
 * artifacts and every gloss. A script prints the eight
 * rows from the same JSON the router read; the prose prints that output verbatim.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'render-preferences-view.cjs');
const { renderRows, renderView, LANGS } = require('../render-preferences-view.cjs');

function repoWith(yaml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prefs-view-'));
  fs.mkdirSync(path.join(root, '.superpowers'));
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), yaml);
  return root;
}

const FULL = `workflow:
  auto_commit: true
  qa_gate: ask
  finish_action: ask
  visual_companion: true
claude_code:
  review_final: false
  review_effort: medium
context:
  has_corporate_artifacts: false
model_tiers:
  cheap: haiku
  standard: sonnet
  capable: sonnet
project:
  stack: node
  manifest: package.json
`;

function run(args) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
}

const report = (root, platform = 'claude-code') => ({
  ...JSON.parse(execFileSync('node', [path.resolve(__dirname, '..', 'derive-session-state.cjs'), '--platform', platform, '--repo-root', root], { encoding: 'utf8' })),
});

test('the view is eight rows on Claude Code, in the documented order, each with a bold state and a gloss', () => {
  const rows = renderRows(report(repoWith(FULL)), 'pt-BR');
  assert.equal(rows.length, 8);
  const labels = rows.map((r) => r.match(/^- \*\*([^*]+)\*\*: \*\*/)[1]);
  assert.deepEqual(labels, [
    'Commit automático', 'Gate de QA', 'Ao finalizar', 'Visual Companion',
    'Code-review final', 'Modelos por tier', 'Artefatos corporativos', 'Perfil do projeto',
  ]);
  for (const r of rows) assert.match(r, / — /, `every row carries a gloss: ${r}`);
  // The rows the hand-written summary dropped.
  assert.ok(rows.some((r) => /Modelos por tier\*\*: \*\*haiku \/ sonnet \/ sonnet\*\*/.test(r)), 'the model tiers must be a row');
  assert.ok(rows.some((r) => /Visual Companion\*\*: \*\*ativo\*\*/.test(r)), 'the companion must be a row');
  assert.ok(rows.some((r) => /Artefatos corporativos\*\*: \*\*desligado\*\*/.test(r)), 'the corporate switch must be a row');
  assert.ok(rows.some((r) => /Gate de QA\*\*: \*\*perguntar\*\*/.test(r)), 'qa_gate: ask must print "perguntar"');
});

test('the native-review row follows the platform: Claude Code, Copilot, none elsewhere', () => {
  const root = repoWith(FULL);
  assert.ok(renderRows(report(root, 'claude-code')).some((r) => /Code-review final/.test(r)));
  const copilot = renderRows(report(root, 'copilot'));
  assert.ok(copilot.some((r) => /Copilot review final/.test(r)));
  assert.ok(!copilot.some((r) => /Code-review final/.test(r)));
  const other = renderRows(report(root, 'other'));
  assert.equal(other.length, 7, 'no native-review row on a platform without one');
  assert.ok(!other.some((r) => /review final/i.test(r)));
});

test('the tier row and the gloss are printed on every platform', () => {
  // Regression, 2026-08-01: on Copilot the hand-written summary dropped "Modelos por tier"
  // as if it were Claude-Code-specific. The renderer owns the invariant now.
  const root = repoWith(FULL);
  for (const platform of ['claude-code', 'copilot', 'other']) {
    const rows = renderRows(report(root, platform), 'pt-BR');
    assert.ok(rows.some((r) => /Modelos por tier\*\*: \*\*haiku \/ sonnet \/ sonnet\*\*/.test(r)), `tier row on ${platform}`);
    assert.ok(rows.every((r) => / — /.test(r)), `every row carries its gloss on ${platform}`);
  }
});

test('the corporate row covers all four declared x enabled states', () => {
  const rows = (c) => renderRows({ platform: 'claude-code', sessionState: {}, corporateArtifacts: c, projectProfile: {} }, 'pt-BR')
    .find((r) => /Artefatos corporativos/.test(r));
  assert.match(rows({ declared: true, enabled: true, count: 2 }), /\*\*ativo\*\* — 2 em `\.superpowers\/corporate-artifacts\.yml`/);
  assert.match(rows({ declared: true, enabled: false, count: 2 }), /\*\*desligado\*\* — 2 declarado\(s\)[^\n]*\*\*não carregados\*\*/);
  assert.match(rows({ declared: false, enabled: true }), /\*\*ativo\*\* — mas `\.superpowers\/corporate-artifacts\.yml` não existe/);
  const none = rows({ declared: false, enabled: false });
  assert.match(none, /\*\*desligado\*\*/);
  assert.doesNotMatch(none, /corporate-artifacts\.yml/, 'with no file there is no path to name');
});

test('the CLI prints the heading plus the rows, in pt-BR by default and in English on --lang en', () => {
  const root = repoWith(FULL);
  const pt = run(['--platform', 'claude-code', '--repo-root', root]);
  assert.match(pt, /^\*\*Preferências desta sessão\*\* \(`\.superpowers\/preferences\.yml`\):\n- \*\*Commit automático\*\*/);
  // heading + 8 rows + blank + the change-or-back question: the reply is this output.
  assert.equal(pt.trim().split('\n').length, 11);
  assert.match(pt, /\n\nResponda \*\*1\*\* para alterar essas preferências ou \*\*0\*\* para voltar ao menu\.\n$/,
    'the question is the last line — the reply needs no question tool');
  const en = run(['--platform', 'claude-code', '--repo-root', root, '--lang', 'en']);
  assert.match(en, /^\*\*Preferences for this session\*\*/);
  assert.match(en, /- \*\*Model tiers\*\*: \*\*haiku \/ sonnet \/ sonnet\*\*/);
  assert.match(en, /Reply \*\*1\*\* to change these preferences or \*\*0\*\* to go back to the menu\.\n$/);
  assert.deepEqual(LANGS, ['pt-BR', 'en']);
});

test('finish_action outcomes and an undecided profile print their documented wording', () => {
  const root = repoWith(FULL.replace('finish_action: ask', 'finish_action: pr').replace('stack: node', 'stack: ""').replace('manifest: package.json', 'manifest: ""'));
  const rows = renderRows(report(root), 'pt-BR');
  assert.ok(rows.some((r) => /Ao finalizar\*\*: \*\*push \+ PR\*\*/.test(r)), 'a declared PR must be visible as the destination');
  assert.ok(rows.some((r) => /Perfil do projeto\*\*: \*\*não decidido\*\*/.test(r)));
});

test('a tier no rung alias resolves prints the literal "auto", never an improvised wording', () => {
  // Claude Code fills a missing tier from its rung aliases; a platform without rungs
  // ("other") leaves it as auto — that is the case the row must print verbatim.
  const root = repoWith(FULL.replace('  capable: sonnet\n', ''));
  const rows = renderRows(report(root, 'other'), 'pt-BR');
  const tiers = rows.find((r) => /Modelos por tier/.test(r));
  assert.match(tiers, /\*\*haiku \/ sonnet \/ auto\*\*/);
  assert.doesNotMatch(renderView(report(root, 'other'), 'pt-BR'), /não definido/);
});

test('corporate artifacts declared but not consented print "não carregados" with the file', () => {
  const root = repoWith(FULL);
  fs.writeFileSync(path.join(root, '.superpowers', 'corporate-artifacts.yml'), 'artifacts:\n  - path: docs/x.md\n');
  const rows = renderRows(report(root), 'pt-BR');
  const corp = rows.find((r) => /Artefatos corporativos/.test(r));
  assert.match(corp, /\*\*desligado\*\*/);
  assert.match(corp, /não carregados/);
  assert.match(corp, /\.superpowers\/corporate-artifacts\.yml/);
  assert.doesNotMatch(corp, /docs\/x\.md/, 'never the declared entries');
});

test('the CLI rejects an unknown language or platform', () => {
  const root = repoWith(FULL);
  assert.throws(() => run(['--platform', 'claude-code', '--repo-root', root, '--lang', 'fr']));
  assert.throws(() => run(['--platform', 'vscode', '--repo-root', root]));
});
