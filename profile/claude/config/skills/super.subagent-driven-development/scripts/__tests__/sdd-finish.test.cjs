'use strict';
/**
 * sdd-finish.test.cjs — the final stage's bookkeeping is one call (S11 E-O3, 2026-09-22: eight
 * controller Bash calls between the final fix round and the finishing menu — the done-state gate
 * twice, the ledger read and `git rm`, then status/diff/commit for tracker edits nobody had
 * committed). The gate is parse-tasks.cjs's; a plan that is not done touches nothing. A done plan
 * loses its workspace `.superpowers/sdd/<feature>/` too, as upstream 6.4.1's finish does.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/sdd-finish.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const FINISH = path.resolve(__dirname, '..', 'sdd-finish.cjs');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture({ autoCommit = true, done = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-finish-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.mkdirSync(path.join(root, '.superpowers'));
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), `workflow:\n  auto_commit: ${autoCommit}\n`);
  fs.writeFileSync(path.join(root, '.gitignore'), '.superpowers/\n');
  const plans = path.join(root, 'docs', 'superpowers', 'feat-x', 'plans');
  fs.mkdirSync(plans, { recursive: true });
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 't1.js'), 'module.exports = 1\n');
  const index = path.join(plans, 'tasks-feat-x.md');
  const write = (status, box) => {
    fs.writeFileSync(index, ['# Tarefas: X', '', '## Tarefas', '', `- [${box}] 1. Primeira → \`task-01.md\``, ''].join('\n'));
    fs.writeFileSync(path.join(plans, 'task-01.md'), ['# Task 1: T1', '', `**Status:** ${status}`, '**Tier:** cheap', '', '## Arquivos', '', '- Create: `src/t1.js`', ''].join('\n'));
  };
  write('PENDING', ' ');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  if (done) write('DONE', 'x');
  const sdd = path.join(root, '.superpowers', 'sdd');
  for (const f of ['feat-x', 'feat-y']) {
    fs.mkdirSync(path.join(sdd, f), { recursive: true });
    fs.writeFileSync(path.join(sdd, f, 'task-1-report.md'), 'RED/GREEN\n');
  }
  fs.writeFileSync(path.join(sdd, '.gitignore'), '*\n');
  const ledgerFile = path.join(sdd, 'feat-x', 'progress.md');
  fs.writeFileSync(ledgerFile, [
    '# Ledger — feat-x', '', '## Pre-flight', '', 'Before Task 1, each `conflict` row gets its ruling line below (execution-loop.md, "Pre-flight table").', '',
    '| Row | Subject | Tasks | Finding |', '|---|---|---|---|', '| T1 | task-01.md | Consome ↔ order | ok |', '',
    'Task 1: started (base abc1234)', '', 'Task 1: minor (deferred): nome genérico', '',
    'Task 1: Ruling: manter X — porque Y — custo Z', '', 'Task 1: fix round 1 (findings: f.md; commits abc1234..def5678)', '',
    'Task 1: complete (commits abc1234..def5678, review clean)', '',
    'Final review: dispatched (range abc1234..def5678)', '',
    'Final review: Ruling: aceito por design — task-01 manda — custo: mensagem enganosa', '',
    'Final review: Ruling: Task 1 minor open — nome genérico não muda comportamento — custo: nenhum', '',
  ].join('\n'));
  return { root, plans, index, workspace: path.join(sdd, 'feat-x'), sdd, ledgerFile };
}

const run = (root, index) => JSON.parse(execFileSync('node', [FINISH, '--tasks-index', index], { cwd: root, encoding: 'utf8' }));

test('all done: rulings and deferred lines returned, ledger and workspace deleted, tracker edits committed under auto_commit', () => {
  const { root, plans, index, workspace, sdd, ledgerFile } = fixture();
  const out = run(root, index);
  assert.strictEqual(out.allDone, true);
  assert.deepStrictEqual(out.rulings, ['Task 1: Ruling: manter X — porque Y — custo Z', 'Final review: Ruling: aceito por design — task-01 manda — custo: mensagem enganosa',
    'Final review: Ruling: Task 1 minor open — nome genérico não muda comportamento — custo: nenhum'],
    'every Ruling: line, per-task and final, in ledger order — the pre-flight table and its instruction line are not rulings');
  assert.deepStrictEqual(out.deferred, ['Task 1: minor (deferred): nome genérico']);
  assert.strictEqual(out.ledgerRemoved, true);
  assert.ok(!fs.existsSync(ledgerFile), 'the ledger lives in the workspace and goes with it');
  assert.ok(!fs.existsSync(path.join(plans, 'progress.md')));
  assert.strictEqual(out.workspaceRemoved, true);
  assert.ok(!fs.existsSync(workspace), 'the plan\'s workspace is scratch: gone once the plan is done');
  assert.ok(fs.existsSync(path.join(sdd, 'feat-y', 'task-1-report.md')), 'another plan\'s workspace is not this plan\'s to delete');
  assert.ok(fs.existsSync(path.join(sdd, '.gitignore')), 'the self-ignore stays for the next plan');
  assert.match(out.trackerCommit, /^[0-9a-f]{7}$/);
  assert.match(git(root, 'log', '-1', '--format=%s'), /^chore\(feat-x\): /);
  assert.strictEqual(git(root, 'status', '--porcelain'), '', 'the finishing skill finds a clean tree');
  assert.deepStrictEqual(out.errors, []);
});

test('not done: nothing is touched — ledger and workspace stay for the fix and no commit is made', () => {
  const { root, index, workspace, ledgerFile } = fixture({ done: false });
  const head = git(root, 'rev-parse', 'HEAD');
  const out = run(root, index);
  assert.strictEqual(out.allDone, false);
  assert.ok(out.open.length > 0, 'the gate reasons are passed through');
  assert.ok(fs.existsSync(ledgerFile));
  assert.strictEqual(out.workspaceRemoved, false);
  assert.ok(fs.existsSync(path.join(workspace, 'task-1-report.md')));
  assert.strictEqual(out.trackerCommit, null);
  assert.strictEqual(git(root, 'rev-parse', 'HEAD'), head);
});

test('auto_commit off: ledger deleted, tracker left uncommitted for the user', () => {
  const { root, index, ledgerFile } = fixture({ autoCommit: false });
  fs.appendFileSync(ledgerFile, '\nTask 1: Ruling: antigo — a — b\n');
  const head = git(root, 'rev-parse', 'HEAD');
  const out = run(root, index);
  assert.strictEqual(out.ledgerRemoved, true);
  assert.ok(!fs.existsSync(ledgerFile));
  assert.ok(out.rulings.includes('Task 1: Ruling: antigo — a — b'));
  assert.strictEqual(out.trackerCommit, null);
  assert.strictEqual(git(root, 'rev-parse', 'HEAD'), head);
});

test('work outside the plans directory is reported, never swept into the tracker commit', () => {
  const { root, index } = fixture();
  fs.writeFileSync(path.join(root, 'src', 'stray.js'), 'x\n');
  const out = run(root, index);
  assert.deepStrictEqual(out.dirty, ['src/stray.js']);
  assert.doesNotMatch(git(root, 'show', '--name-only', '--format=', 'HEAD'), /stray/);
});

test('a gate that cannot run is named in errors, and nothing is touched', () => {
  const { root, index, workspace, ledgerFile } = fixture();
  fs.rmSync(index);
  fs.mkdirSync(index);
  const out = run(root, index);
  assert.strictEqual(out.allDone, false);
  assert.match(out.errors.join('\n'), /done-state gate did not run/);
  assert.ok(fs.existsSync(ledgerFile));
  assert.ok(fs.existsSync(workspace));
});

test('no final review dispatched: nothing is deleted, and the error names the render command', () => {
  const { root, index, workspace, ledgerFile } = fixture();
  fs.writeFileSync(ledgerFile, fs.readFileSync(ledgerFile, 'utf8').replace(/^Final review: dispatched.*$/mu, ''));
  const head = git(root, 'rev-parse', 'HEAD');
  const out = run(root, index);
  assert.strictEqual(out.allDone, true);
  assert.match(out.errors.join('\n'), /final code review never dispatched — run `node \S+build-task-dispatch\.cjs --role final --tasks-index /u);
  assert.ok(fs.existsSync(ledgerFile), 'a `Final review: Ruling:` line is not the dispatch proof');
  assert.ok(fs.existsSync(workspace));
  assert.strictEqual(out.trackerCommit, null);
  assert.strictEqual(git(root, 'rev-parse', 'HEAD'), head);
});

test('summary: done, rulings and what is left, rendered from ledger lines and git only, in the plan\'s language', () => {
  const { root, index, ledgerFile } = fixture();
  fs.appendFileSync(ledgerFile, ['Task 1: unverified: cache invalidation under concurrent writes', '',
    'Task 1: declined: CLI --help — not in the spec', '', 'Final review: no Critical/Important findings', '',
    'Final review: Ruling: Task 1 unverified open — sem teste de concorrência — custo: cache velho', ''].join('\n'));
  fs.writeFileSync(path.join(root, 'notes.txt'), 'scratch\n');
  const out = run(root, index);
  assert.deepStrictEqual(out.pending, ['Task 1: minor (deferred): nome genérico',
    'Task 1: unverified: cache invalidation under concurrent writes'],
  'a declined line is judged by the final review and ruled on — listing it as left to do was noise in a real run (2026-09-23)');
  const s = out.summary;
  assert.match(s, /^## Resumo da execução: feat-x\n/u, '`## Tarefas` in the index → pt-BR headings');
  const [done, rulings, todo] = ['### O que foi feito', '### Decisões que tomei (4)', '### O que falta fazer (2)'].map((h) => {
    assert.ok(s.includes(h), h);
    return s.split(h)[1].split('\n### ')[0];
  });
  assert.match(done, /- Task 1 — Primeira: aprovada na 1ª revisão\n/, 'the task\'s title from the index, its outcome — not the per-task range');
  assert.match(done, /- Revisão final do branch inteiro: feita, sem problemas que exigissem correção\n/,
    'dispatch and verdict read as one line: a real run (2026-09-23) ledgered no verdict line and its summary never said the review happened');
  assert.match(done, new RegExp(`- Commit do tracker: ${out.trackerCommit}`));
  assert.doesNotMatch(done, /started|fix round|declined|\| T1|Before Task 1/, 'loop bookkeeping is not what was done');
  assert.doesNotMatch(todo, /declined/);
  assert.match(rulings, /1\. \*\*Task 1\*\* — manter X — porque Y — custo Z\n\n\*\*Revisão final\*\*\n\n2\. aceito por design — task-01 manda — custo: mensagem enganosa\n/,
    'every ruling, in ledger order, words unchanged');
  assert.match(todo, /\n- Task 1 — Ajuste menor: nome genérico\n- Task 1 — Não verificado: cache invalidation under concurrent writes/u,
    'plain bullets: a real run (2026-09-24) rendered `- [ ]` and the list read as a checklist for the user to tick');
  assert.doesNotMatch(s, /\[ \]/u);
  assert.deepStrictEqual(out.dirty, ['notes.txt']);
  assert.doesNotMatch(s, /notes\.txt|Não commitado/u,
    'printed after finishing\'s clean-tree step: a real run (2026-09-23) listed 11 QA files as uncommitted that the merge already held');
  assert.strictEqual(out.summaryFile, path.join(root, '.superpowers', 'sdd', 'feat-x-summary.md'));
  assert.strictEqual(fs.readFileSync(out.summaryFile, 'utf8'), `${s}\n`,
    'the finishing skill prints this file in the turn the final message is written — the workspace is gone by then');
  assert.strictEqual(git(root, 'status', '--porcelain'), '?? notes.txt', 'the summary file is ignored with the rest of .superpowers/');
});

test('summary: a done line drops the test command and the deleted findings file; the index\'s [FR-…] refs go', () => {
  const { root, index, ledgerFile } = fixture();
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('1. Primeira', '1. Primeira [FR-001, FR-002]'));
  fs.writeFileSync(ledgerFile, fs.readFileSync(ledgerFile, 'utf8').replace('review clean)',
    "review clean, tests: sh -c 'npx vitest --run a.test.ts, b.test.ts' → Test Files 2 passed (2))")
    + '\nFinal review: fix round 1 (findings: final-findings-1.md)\n');
  const s = run(root, index).summary;
  assert.match(s, /- Task 1 — Primeira: aprovada na 1ª revisão\n/u);
  assert.match(s, /- Revisão final do branch inteiro: feita, com 1 rodada de correção\n/u);
  assert.doesNotMatch(s, /vitest|passed|FR-00|final-findings/u, 'a real run (2026-09-23): 400-character done lines');
});

test('summary: a final-review ruling that closes a task\'s unverified items takes them off what is left', () => {
  const { root, index, ledgerFile } = fixture();
  fs.appendFileSync(ledgerFile, ['Task 1: unverified: falsy body in ResponseFactory', 'Task 1: unverified: isExpired boundary',
    'Final review: Ruling: Task 1 unverified items closed — callers audited — cost if wrong: none found',
    'Final review: Ruling: Task 1 minor stays deferred — closed by nobody — cost: small', ''].join('\n'));
  const out = run(root, index);
  assert.deepStrictEqual(out.pending, ['Task 1: minor (deferred): nome genérico'],
    'a real run (2026-09-23) closed both Task 5 unverified items by ruling and still listed them as left to do; "stays deferred" closes nothing, nor does a "closed" in the why');
  assert.match(out.summary, /Task 1 unverified items closed/u, 'the ruling itself is still handed over');
});

test('a task\'s complete line is what was done, never what is left, whatever its note says', () => {
  const { root, index, ledgerFile } = fixture();
  fs.writeFileSync(ledgerFile, fs.readFileSync(ledgerFile, 'utf8').replace('Task 1: complete (commits abc1234..def5678, review clean)',
    'Task 1: complete (commits abc1234..def5678, review clean | 0 fix rounds | 4 minors deferred, tests: vitest → 12 passed)'));
  const out = run(root, index);
  assert.deepStrictEqual(out.pending, ['Task 1: minor (deferred): nome genérico'],
    'a real run (2026-09-24) listed every `Task N: complete (… deferred …)` line under "O que falta fazer": 18 of its 49 items');
  assert.deepStrictEqual(out.deferred, ['Task 1: minor (deferred): nome genérico']);
  const [done, todo] = out.summary.split('### O que falta fazer');
  assert.match(done, /- Task 1 — Primeira: aprovada/u);
  assert.doesNotMatch(todo, /complete|aprovada/u);
});

test('a task\'s pending line no ruling checked stops the finish: nothing deleted, the error names it and the ruling to write', () => {
  const { root, index, workspace, ledgerFile } = fixture();
  fs.appendFileSync(ledgerFile, ['Task 1: unverified: contraste do hover', 'Final review: minor (deferred): nome de teste', ''].join('\n'));
  const head = git(root, 'rev-parse', 'HEAD');
  const out = run(root, index);
  const err = out.errors.join('\n');
  assert.match(err, /1 ledger item\(s\) left open by a task and never checked against the finished branch — nothing was deleted/u,
    'a real run (2026-09-24) handed the user 49 open items; asked, the controller said most were settled by later work');
  assert.match(err, /Final review: Ruling: Task N <kind> closed — /u);
  assert.match(err, /\n {2}Task 1: unverified: contraste do hover$/u, 'only the unchecked line: the minor above has its `open` ruling, and the final review\'s own minor is current');
  assert.strictEqual(out.summary, null);
  assert.ok(fs.existsSync(ledgerFile));
  assert.ok(fs.existsSync(workspace));
  assert.strictEqual(git(root, 'rev-parse', 'HEAD'), head);
});

test('a ruling covers the lines above it: a closed item\'s still-open part, ledgered after, is what is left', () => {
  const { root, index, ledgerFile } = fixture();
  fs.appendFileSync(ledgerFile, ['Task 1: complete (commits abc1234..def5678, review clean, 2 unverified ledgered)',
    'Task 1: unverified: contraste em surface-2; build do shadow-glow',
    'Final review: Ruling: Task 1 unverified closed — contraste corrigido na Task 2 — custo: nenhum',
    'Task 1: unverified: contraste em hover',
    'Final review: Ruling: Task 1 unverified open — hover não medido — custo: contraste baixo no hover', ''].join('\n'));
  const out = run(root, index);
  assert.deepStrictEqual(out.errors, []);
  assert.deepStrictEqual(out.pending, ['Task 1: minor (deferred): nome genérico', 'Task 1: unverified: contraste em hover']);
  assert.doesNotMatch(out.summary, /que os? encerrou/u, 'the task line cannot say the review closed its unverified items while one is still left');
});

test('a task\'s deferred minors all closed by a ruling: its line points at the ruling, not at what is left', () => {
  const { root, index, ledgerFile } = fixture();
  fs.appendFileSync(ledgerFile, ['Task 1: complete (commits abc1234..def5678, review clean, 1 minor deferred)',
    'Final review: Ruling: Task 1 minor closed — renomeado na rodada 1 — custo: nenhum', ''].join('\n'));
  const out = run(root, index);
  assert.deepStrictEqual(out.pending, []);
  assert.match(out.summary, /1 ajuste menor ficou para depois; a revisão final o encerrou \(ver decisão 4\)/u);
  assert.match(out.summary, /### O que falta fazer \(0\)\n\nNada pendente\./u);
});

test('summary: each task note reads as an outcome; a note outside the vocabulary is kept as written', () => {
  const { root, index, ledgerFile } = fixture();
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('- [x] 1. Primeira → `task-01.md`',
    ['- [x] 1. Primeira → `task-01.md`', '- [x] 2. Segunda → `task-01.md`', '- [x] 3. Terceira → `task-01.md`', '- [x] 4. Quarta → `task-01.md`'].join('\n')));
  fs.appendFileSync(ledgerFile, ['Task 2: complete (commits abc1234..def5678, 2 fix rounds, 1 minor parked)',
    'Task 3: complete (commits abc1234..def5678, 1 fix round, 1 parked, rebased on main)',
    'Task 4: complete (commits abc1234..def5678, review clean, 2 unverified ledgered)',
    'Final review: Ruling: Task 4 unverified items closed — callers audited — cost: none', ''].join('\n'));
  const s = run(root, index).summary;
  assert.match(s, /- Task 2 — Segunda: aprovada após 2 rodadas de correção; 1 ajuste menor ficou para depois \(ver "O que falta fazer"\)\n/u);
  assert.match(s, /- Task 3 — Terceira: aprovada após 1 rodada de correção; 1 apontamento mantido por decisão \(ver "Decisões que tomei"\); rebased on main\n/u);
  assert.match(s, /- Task 4 — Quarta: aprovada na 1ª revisão; 2 pontos não verificados foram para a revisão final, que os encerrou \(ver decisão 4\)\n/u,
    'a real run (2026-09-23): "2 unverified ledgered" read as still open though ruling 7 had closed them');
  assert.doesNotMatch(s, /review clean|fix rounds?\b|parked|ledgered/u, 'no loop label reaches the user');
});

test('summary: rulings from the same origin are grouped under it once, numbered across groups', () => {
  const { root, index, ledgerFile } = fixture();
  fs.appendFileSync(ledgerFile, ['Task 1: unverified: falsy body', 'Final review: Ruling: segundo — b — c',
    'Final review: Ruling: Task 1 unverified items closed — auditado — nenhum', ''].join('\n'));
  const out = run(root, index);
  assert.match(out.summary, /### Decisões que tomei \(5\)\n\n1\. \*\*Task 1\*\* — manter X — porque Y — custo Z\n\n\*\*Revisão final\*\*\n\n2\. aceito por design — task-01 manda — custo: mensagem enganosa\n3\. Task 1 minor open — nome genérico não muda comportamento — custo: nenhum\n4\. segundo — b — c\n5\. Task 1 unverified items closed — auditado — nenhum\n\n### /u,
    'a real run (2026-09-23) repeated "Revisão final —" on four rulings in a row');
  assert.strictEqual(out.rulings.length, 5, 'the JSON keeps the ledger lines as they are');
});

test('summary: a cross-reference to a ruling uses the grouped numbering', () => {
  const { root, index, ledgerFile } = fixture();
  fs.appendFileSync(ledgerFile, ['Task 1: complete (commits abc1234..def5678, review clean, 1 unverified ledgered)',
    'Final review: Ruling: Task 1 unverified closed — auditado — nenhum', 'Task 1: Ruling: depois — a — b', ''].join('\n'));
  const s = run(root, index).summary;
  assert.match(s, /que o encerrou \(ver decisão 5\)/u, 'ledger order would call it 4; the list shows it as 5');
  assert.match(s, /\n5\. Task 1 unverified closed — auditado — nenhum/u);
});

test('summary: an English plan gets English headings; nothing pending and no ruling are said, not left blank', () => {
  const { root, index, ledgerFile } = fixture();
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('## Tarefas', '## Tasks'));
  fs.writeFileSync(ledgerFile, ['# Ledger — feat-x', '', 'Task 1: complete (commits abc1234..def5678, review clean)', '',
    'Final review: dispatched (range abc1234..def5678)', ''].join('\n'));
  const s = run(root, index).summary;
  assert.match(s, /## Run summary: feat-x/);
  assert.match(s, /- Task 1 — Primeira: approved on the first review\n- Final review of the whole branch: done\n/u);
  assert.match(s, /### Rulings I made \(0\)\n\nNo ruling recorded\./);
  assert.match(s, /### What is left to do \(0\)\n\nNothing pending\./);
});

test('summary is null whenever the gate stops the finish', () => {
  const { root, index, sdd } = fixture({ done: false });
  const out = run(root, index);
  assert.strictEqual(out.summary, null);
  assert.strictEqual(out.summaryFile, null);
  assert.ok(!fs.existsSync(path.join(sdd, 'feat-x-summary.md')));
});

test('F4: an item unverified by decision cannot be ruled closed; open reaches the summary', () => {
  const { index, workspace, ledgerFile, root } = fixture();
  fs.appendFileSync(ledgerFile, ['Task 1: unverified: INV-02 · sem banco de teste · conferência: `SELECT 1`', '',
    'Final review: Ruling: Task 1 unverified closed — parece ok — custo: nenhum', ''].join('\n'));
  const out = run(root, index);
  assert.match(out.errors.join('\n'), /unverified by decision were ruled closed — nothing was deleted/u);
  assert.ok(fs.existsSync(workspace));
  const { ledgerFile: l2, index: i2, root: r2 } = fixture();
  fs.appendFileSync(l2, ['Task 1: unverified: INV-02 · sem banco de teste · conferência: `SELECT 1`', '',
    'Final review: Ruling: Task 1 unverified open — unverified by decision — custo: duplicata em produção', ''].join('\n'));
  const ok = run(r2, i2);
  assert.deepStrictEqual(ok.errors, []);
  assert.match(JSON.stringify(ok.summary), /INV-02/u);
});
