'use strict';
/**
 * sdd-start.test.cjs — the controller's entry is one call that returns the four verdicts the
 * entry scripts own (S10, 2026-09-22: ~10 controller Bash calls before the first implementer,
 * against one for upstream's). Each part is the real script; a part that fails is named in
 * `errors`, never dropped.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/sdd-start.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const START = path.resolve(__dirname, '..', 'sdd-start.cjs');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-start-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.mkdirSync(path.join(root, '.superpowers'));
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), 'workflow:\n  auto_commit: true\nmodel_tiers:\n  cheap: haiku\n  standard: sonnet\n  capable: opus\n');
  const feat = path.join(root, 'docs', 'superpowers', 'feat-x');
  const plans = path.join(feat, 'plans');
  fs.mkdirSync(plans, { recursive: true });
  fs.mkdirSync(path.join(feat, 'specs'));
  fs.writeFileSync(path.join(feat, 'specs', 'feat-x-design.md'), '# Design\n');
  fs.writeFileSync(path.join(plans, 'tasks-feat-x.md'), [
    '# Tarefas: X', '', '**Spec:** `../specs/feat-x-design.md`', '**PRD:** N/A', '', '---', '',
    '## Tarefas', '', '- [x] 1. Primeira → `task-01.md`', '- [ ] 2. Segunda → `task-02.md`', '',
  ].join('\n'));
  for (const [n, status] of [[1, 'DONE'], [2, 'PENDING']]) {
    fs.writeFileSync(path.join(plans, `task-0${n}.md`), [
      `# Task ${n}: T${n}`, '', `**Status:** ${status}`, '**PRD:** N/A', '**Spec:** `../specs/feat-x-design.md`',
      '**Tier:** cheap', '', '## Arquivos', '', `- Create: \`src/t${n}.js\``, '',
    ].join('\n'));
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  return { root, index: path.join(plans, 'tasks-feat-x.md') };
}

test('one call returns session state, plan tiers, progress and the branch verdict', () => {
  const { root, index } = fixture();
  const out = JSON.parse(execFileSync('node', [START, '--tasks-index', index, '--platform', 'claude-code'], { cwd: root, encoding: 'utf8' }));
  assert.deepStrictEqual(out.errors, []);
  assert.ok(out.session.sessionState, 'derive-session-state output');
  assert.ok(Array.isArray(out.plan.tasks), 'parse-plan output');
  assert.deepStrictEqual(out.tasks.completed.map((t) => t.number ?? t), [1]);
  assert.strictEqual(out.branch.action, 'create', 'on main the guard creates feat/<slug>');
});

test('a part that cannot run is named in errors, never silently absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-start-nogit-'));
  const index = path.join(root, 'tasks-x.md');
  fs.writeFileSync(index, '# Tarefas\n');
  const out = JSON.parse(execFileSync('node', [START, '--tasks-index', index, '--platform', 'claude-code'], { cwd: root, encoding: 'utf8' }));
  assert.ok(out.errors.includes('branch'), 'outside a git repo the branch guard cannot run');
  for (const name of out.errors) assert.ok(out[name].error, `${name} carries its error`);
  const missing = spawnSync('node', [START, '--tasks-index', index], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(missing.status, 1, '--platform is required');
});

// ─── The ledger: moved into the workspace, pre-flight table written once ─────

const startJson = (root, index) => JSON.parse(execFileSync('node', [START, '--tasks-index', index, '--platform', 'claude-code'], { cwd: root, encoding: 'utf8' }));
const ledgerOf = (root) => path.join(root, '.superpowers', 'sdd', 'feat-x', 'progress.md');

test('a plan with work left gets the pre-flight table once, in the git-ignored workspace', () => {
  const { root, index } = fixture();
  const out = startJson(root, index);
  assert.deepStrictEqual(out.errors, []);
  assert.strictEqual(out.ledger.path, ledgerOf(root));
  assert.strictEqual(out.ledger.preflight.written, true);
  assert.deepStrictEqual(out.ledger.preflight.flagged, []);
  const text = fs.readFileSync(ledgerOf(root), 'utf8');
  assert.match(text, /^# Ledger — feat-x\n\n## Pre-flight\n/);
  assert.match(text, /^\| T2 \| task-02\.md \| Consome ↔ order \| ok \|$/m);
  assert.strictEqual(git(root, 'status', '--porcelain'), '', 'the workspace ignores itself: nothing new in git status');
  const again = startJson(root, index);
  assert.strictEqual(again.ledger.preflight.written, false, 'a resume never writes a second table');
  assert.strictEqual(fs.readFileSync(ledgerOf(root), 'utf8').match(/^## Pre-flight$/gm).length, 1);
});

test('conflict rows are flagged until the ledger holds their ruling', () => {
  const { root, index } = fixture();
  const plans = path.dirname(index);
  fs.writeFileSync(path.join(plans, 'task-02.md'), [
    '# Task 2: T2', '', '**Status:** PENDING', '**PRD:** N/A', '**Spec:** `../specs/feat-x-design.md`', '**Tier:** cheap',
    '', '## Arquivos', '', '- Create: `src/t1.js`', '', '## Interfaces', '',
    '- **Consome:** `one` (task-01)', '- **Produz:** N/A', '',
  ].join('\n'));
  const out = startJson(root, index);
  assert.deepStrictEqual(out.ledger.preflight.flagged, [
    'F1 `src/t1.js`: conflict: created by tasks 1 and 2',
  ], 'consuming an earlier task is not a finding');
  fs.appendFileSync(ledgerOf(root), '\nPre-flight F1: Ruling: task 2 modifica, não cria — o arquivo já existe — nenhum\n');
  assert.deepStrictEqual(startJson(root, index).ledger.preflight.flagged, []);
});

test('a finished plan gets no pre-flight table', () => {
  const { root, index } = fixture();
  const plans = path.dirname(index);
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('- [ ] 2.', '- [x] 2.'));
  fs.writeFileSync(path.join(plans, 'task-02.md'), fs.readFileSync(path.join(plans, 'task-02.md'), 'utf8').replace('PENDING', 'DONE'));
  const out = startJson(root, index);
  assert.strictEqual(out.tasks.allDone, true);
  assert.strictEqual(out.ledger.preflight.written, false);
  assert.ok(!fs.existsSync(ledgerOf(root)));
});

test('F4: [unverified] criteria and the spec\'s human actions are seeded in the ledger once', () => {
  const { root, index } = fixture();
  const plans = path.dirname(index);
  const specFile = path.join(plans, '..', 'specs', 'feat-x-design.md');
  fs.writeFileSync(specFile, [
    '# Design', '', '## Riscos', '',
    '| Risco | Onde | Impacto | Probabilidade | Score | Mitigação |', '|---|---|---|---|---|---|',
    '| App antigo não tolera nulos | app mobile | 3 | 3 | 9 🔴 | confirmar com o time do app (ação humana · time mobile · antes do release) |',
    '| Fornecedor muda contrato | adaptador | 2 | 1 | 2 🟢 | teste de contrato |', '',
  ].join('\n'));
  fs.appendFileSync(path.join(plans, 'task-02.md'), [
    '', '## Critérios de Sucesso', '',
    '- INV-02 [unverified]: Um padrão por cliente · sem banco de teste · conferência: `SELECT 1`', '',
    '```markdown', '- INV-09 [unverified]: exemplo cercado · conferência: x', '```', '',
  ].join('\n'));
  const out = startJson(root, index);
  assert.deepStrictEqual(out.ledger.seeded, [
    'Task 2: unverified: INV-02 · Um padrão por cliente · sem banco de teste · conferência: `SELECT 1`',
    'Task 2: parked — ação humana: App antigo não tolera nulos · time mobile · antes do release',
  ]);
  assert.deepStrictEqual(startJson(root, index).ledger.seeded, [], 'a resume never seeds twice');
  const text = fs.readFileSync(ledgerOf(root), 'utf8');
  assert.strictEqual(text.match(/^Task 2: unverified: INV-02/gm).length, 1);
});

test('lib/seeds.cjs: no [unverified] criterion and no marked risk seeds nothing; a spec that is gone seeds only the plan', () => {
  const { pendingSeeds } = require('../lib/seeds.cjs');
  const { root, index } = fixture();
  assert.deepStrictEqual(pendingSeeds(index, root), []);
  fs.rmSync(path.join(path.dirname(index), '..', 'specs', 'feat-x-design.md'));
  fs.appendFileSync(path.join(path.dirname(index), 'task-01.md'), '\n## Critérios de Sucesso\n\n- AC-01 [unverified]: WHEN a THEN b · sem ambiente · conferência: olhar o log\n');
  assert.deepStrictEqual(pendingSeeds(index, root), ['Task 1: unverified: AC-01 · WHEN a THEN b · sem ambiente · conferência: olhar o log']);
});
