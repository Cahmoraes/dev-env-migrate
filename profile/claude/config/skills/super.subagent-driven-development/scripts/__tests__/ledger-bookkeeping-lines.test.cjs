'use strict';
/**
 * ledger-bookkeeping-lines.test.cjs — the ledger's two bookkeeping lines are written by the
 * script that flips the status, never left to the controller.
 *
 * Mined 2026-09-22 (Copilot CLI, gpt-5.6-luna controller, 7 tasks, session eaef5004):
 * the controller's ledger held the header, two deferred minors and one ruling — no task BASE,
 * no completion range, not the fix round Task 2 actually ran. A compaction mid-task would have
 * left the resume without the review range's BASE. Upstream 6.4.1 keeps `Task N: complete
 * (commits a..b)` in the ledger for exactly this.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/ledger-bookkeeping-lines.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPTS = path.resolve(__dirname, '..');
const MARK = path.join(SCRIPTS, 'mark-task-status.cjs');
const PARSE = path.join(SCRIPTS, 'parse-tasks.cjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-lines-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  const plans = path.join(root, 'docs', 'superpowers', 'feat-x', 'plans');
  fs.mkdirSync(plans, { recursive: true });
  fs.writeFileSync(path.join(plans, 'tasks-feat-x.md'), '# Tarefas\n\n## Tarefas\n\n- [ ] 1. Primeira → `task-01.md`\n- [ ] 2. Segunda → `task-02.md`\n');
  for (const n of [1, 2]) {
    fs.writeFileSync(path.join(plans, `task-0${n}.md`), `# Task ${n}: T\n\n**Status:** PENDING\n**Spec:** N/A\n**PRD:** N/A\n`);
  }
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  return { root, plans, index: path.join(plans, 'tasks-feat-x.md'), ledgerFile: path.join(root, '.superpowers', 'sdd', 'feat-x', 'progress.md') };
}

const run = (script, args, cwd) => JSON.parse(execFileSync('node', [script, ...args], { cwd, encoding: 'utf8' }));

test('IN_PROGRESS writes `started (base)`, DONE writes `complete (commits base..head, note)`, re-runs add nothing', () => {
  const { root, plans, index, ledgerFile } = fixture();
  const base = git(root, 'rev-parse', 'HEAD');
  const started = run(MARK, ['--task-file', path.join(plans, 'task-01.md'), '--status', 'IN_PROGRESS'], root);
  assert.deepStrictEqual(started.ledger.appended, [`Task 1: started (base ${base.slice(0, 7)})`]);

  const again = run(MARK, ['--task-file', path.join(plans, 'task-01.md'), '--status', 'IN_PROGRESS'], root);
  assert.deepStrictEqual(again.ledger.appended, [], 'a resume keeps the original base');

  fs.writeFileSync(path.join(root, 'b.txt'), 'b\n');
  git(root, 'add', 'b.txt');
  git(root, 'commit', '-qm', 'task 1');
  const head = git(root, 'rev-parse', 'HEAD');

  const done = run(MARK, ['--tasks-index', index, '--task-number', '1', '--status', 'DONE', '--note', 'review clean', '--verify', '--', 'node', '-e', 'console.log("4 pass")'], root);
  assert.strictEqual(done.verify.marked, true);
  assert.deepStrictEqual(done.ledger.appended, [`Task 1: complete (commits ${base.slice(0, 7)}..${head.slice(0, 7)}, review clean, tests: node -e 'console.log("4 pass")' → 4 pass)`]);

  const ledgerText = fs.readFileSync(ledgerFile, 'utf8');
  assert.match(ledgerText, /^# Ledger — feat-x\n/, 'the header names the feature');
  assert.ok(!fs.existsSync(path.join(plans, 'progress.md')), 'nothing is written beside the tasks index');
  assert.strictEqual(fs.readFileSync(path.join(root, '.superpowers', 'sdd', '.gitignore'), 'utf8'), '*\n', 'the workspace ignores itself');
  assert.strictEqual(git(root, 'status', '--porcelain', '--', '.superpowers'), '', 'the ledger never shows in git status');
  assert.strictEqual(ledgerText.match(/Task 1: complete/g).length, 1);
});

test('a failed verify writes no complete line', () => {
  const { root, plans, index, ledgerFile } = fixture();
  run(MARK, ['--task-file', path.join(plans, 'task-01.md'), '--status', 'IN_PROGRESS'], root);
  const failed = run(MARK, ['--tasks-index', index, '--task-number', '1', '--status', 'DONE', '--verify', '--', 'false'], root);
  assert.strictEqual(failed.verify.marked, false);
  assert.doesNotMatch(fs.readFileSync(ledgerFile, 'utf8'), /complete/);
});

test('parse-tasks hands a resumed IN_PROGRESS task its base and fix round from the ledger', () => {
  const { root, plans, index, ledgerFile } = fixture();
  const base = git(root, 'rev-parse', 'HEAD').slice(0, 7);
  run(MARK, ['--task-file', path.join(plans, 'task-01.md'), '--status', 'IN_PROGRESS'], root);
  fs.appendFileSync(ledgerFile, 'Task 1: fix round 2 (findings: f.md; commits aaaaaaa..bbbbbbb)\n');
  const parsed = run(PARSE, ['--tasks-index', index], root);
  assert.strictEqual(parsed.inProgress.length, 1);
  assert.strictEqual(parsed.inProgress[0].base, base);
  assert.strictEqual(parsed.inProgress[0].fixRound, 2);
  assert.strictEqual(parsed.ledgerPath, ledgerFile);
});

test('lib/ledger.cjs: the last started line wins (a QA reopen restarts the task), fix rounds reset with it', () => {
  const ledger = require('../lib/ledger.cjs');
  const text = [
    '# Ledger — x',
    'Task 3: started (base aaaaaaa)',
    'Task 3: fix round 1 (1 addressed, 0 open)',
    'Task 3: complete (commits aaaaaaa..bbbbbbb, 1 fix round)',
    'Task 3: started (base ccccccc)',
  ].join('\n');
  assert.strictEqual(ledger.lastStartedBase(text, 3), 'ccccccc');
  assert.strictEqual(ledger.lastFixRound(text, 3), 0);
  assert.strictEqual(ledger.completeLine(3, null, 'ddddddddd'), 'Task 3: complete (head ddddddd)');
});

test('--note is refused outside DONE', () => {
  const { root, plans } = fixture();
  assert.throws(() => execFileSync('node', [MARK, '--task-file', path.join(plans, 'task-01.md'), '--status', 'IN_PROGRESS', '--note', 'x'], { cwd: root, stdio: 'pipe' }));
});

test('each ledger entry sits after a blank line, so a Markdown preview renders one entry per paragraph', () => {
  const ledger = require('../lib/ledger.cjs');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ledger-sep-'));
  const plans = path.join(dir, 'feat-x', 'plans');
  fs.mkdirSync(plans, { recursive: true });
  const file = ledger.ledgerPathFor(plans, dir);
  ledger.appendLine(file, 'Task 1: started (base abc1234)');
  fs.appendFileSync(file, '\nTask 1: declined: cosmetic\n'); // the controller's printf recipe
  ledger.appendLine(file, ledger.completeLine(1, 'abc1234', 'def5678', 'review clean', {
    command: ['npx', 'vitest'], outputTail: ' Test Files  1 passed (1)\n      Tests  8 passed (8)\n',
  }));
  assert.equal(fs.readFileSync(file, 'utf8'), [
    '# Ledger — feat-x', '', 'Task 1: started (base abc1234)', '', 'Task 1: declined: cosmetic', '',
    'Task 1: complete (commits abc1234..def5678, review clean, tests: npx vitest → Test Files 1 passed (1) Tests 8 passed (8))', '',
  ].join('\n'));
});

test('fixRoundLine: the round, the findings file and the fix range; lastFixRound reads it back', () => {
  const ledger = require('../lib/ledger.cjs');
  const line = ledger.fixRoundLine(4, 2, '/tmp/x/task-4-findings-2.md', 'aaaaaaaaaa', 'bbbbbbbbbb');
  assert.strictEqual(line, 'Task 4: fix round 2 (findings: task-4-findings-2.md; commits aaaaaaa..bbbbbbb)');
  assert.strictEqual(ledger.lastFixRound(`Task 4: started (base aaaaaaa)\n\n${line}\n`, 4), 2);
});
