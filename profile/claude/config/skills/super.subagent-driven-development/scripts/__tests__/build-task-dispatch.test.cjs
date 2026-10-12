'use strict';
/**
 * build-task-dispatch.test.cjs — the SDD prompts are rendered in code, whole, with the data the
 * controller used to drop.
 *
 * Mined 2026-09-22 (Copilot CLI, gpt-5.6-luna controller, session eaef5004): all 18
 * dispatches were 950-1,800-char paraphrases of 11-13 KB templates; 0/18 carried the index's
 * `## Restrições Globais` (reviewers were told "none"), 0/8 reviewers got the PRD, and the
 * calibration never reached them. An independent review then found 4 Important defects the
 * eight reviews had approved — three of them prescribed by the plan itself.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/build-task-dispatch.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const BUILD = path.resolve(__dirname, '..', 'build-task-dispatch.cjs');
const { promptFileOf } = require('../../../super.using-superpowers/scripts/lib/dispatch-pointer.cjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture({ tier = 'capable' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-task-dispatch-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.mkdirSync(path.join(root, '.superpowers'));
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), [
    'workflow:', '  auto_commit: true',
    'model_tiers:', '  cheap: haiku', '  standard: sonnet', '  capable: opus', '',
  ].join('\n'));
  const feat = path.join(root, 'docs', 'superpowers', 'feat-x');
  const plans = path.join(feat, 'plans');
  fs.mkdirSync(plans, { recursive: true });
  fs.mkdirSync(path.join(feat, 'specs'));
  fs.mkdirSync(path.join(feat, 'prd'));
  fs.writeFileSync(path.join(feat, 'specs', 'feat-x-design.md'), '# Design\n');
  fs.writeFileSync(path.join(feat, 'prd', 'prd-feat-x.md'), '# PRD\n');
  fs.writeFileSync(path.join(plans, 'tasks-feat-x.md'), [
    // the index header as the writing-plans template ships it: Spec and PRD split by a blank line
    '# Tarefas: X', '', '**Spec:** `../specs/feat-x-design.md`', '', '**PRD:** `../prd/prd-feat-x.md`', '', '---', '',
    '## Tarefas', '', '- [ ] 1. Criar o formulário [FR-001] → `task-01.md`', '',
    '## Restrições Globais', '', '- O campo `cliente` é texto livre.', '- A rota `/assinatura` permanece intocada.', '',
    '## Foco de Revisão', '', '- Falha ao alternar status aparece para o usuário → `task-01`', '',
  ].join('\n'));
  fs.writeFileSync(path.join(plans, 'task-01.md'), [
    '# Task 1: Criar o formulário [FR-001]', '', '**Status:** PENDING', '**PRD:** `../prd/prd-feat-x.md`',
    '**Spec:** `../specs/feat-x-design.md`', `**Tier:** ${tier}`, '',
    '## Arquivos', '', '- Create: `src/form.tsx`', '- Test: `src/form.test.tsx`', '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(root, 'form.tsx'), 'export const Form = () => null\n');
  git(root, 'add', 'form.tsx');
  git(root, 'commit', '-qm', 'task 1');
  const ledgerFile = path.join(root, '.superpowers', 'sdd', 'feat-x', 'progress.md');
  return { root, plans, index: path.join(plans, 'tasks-feat-x.md'), base, b7: base.slice(0, 7), ledgerFile };
}

function writeLedger(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function build(root, args) {
  const out = JSON.parse(execFileSync('node', [BUILD, ...args, '--prompt-dir', path.join(root, '.prompts')], { cwd: root, encoding: 'utf8' }));
  return { out, body: fs.readFileSync(out.promptFile, 'utf8') };
}

test('reviewer: whole rubric, global constraints verbatim, PRD, write-set, ledger base, standard-floored model', () => {
  const { root, index, b7, ledgerFile } = fixture({ tier: 'cheap' });
  writeLedger(ledgerFile, `# Ledger — feat-x\nTask 1: started (base ${b7})\n`);
  const { out, body } = build(root, ['--role', 'reviewer', '--tasks-index', index, '--task-number', '1']);
  assert.strictEqual(out.tier, 'standard', 'a cheap task is reviewed one rung up');
  assert.strictEqual(out.model, 'sonnet');
  assert.strictEqual(out.base, b7, 'BASE comes from the ledger, not from memory');
  assert.match(fs.readFileSync(out.diffFile, 'utf8'), /## Commits\n[0-9a-f]+ task 1[\s\S]*\+export const Form/, 'the review package carries commits and the diff');
  assert.match(body, new RegExp(`DIFF_FILE: ${out.diffFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(body, /Read the implementer's report: .*task-1-report\.md/);
  assert.match(out.diffFile, /\.superpowers\/sdd\/feat-x\/review-/, 'the package lives in the git-ignored plan workspace');
  assert.strictEqual(promptFileOf(out.prompt), out.promptFile, 'the controller relays a pointer, never the body');
  assert.match(body, /- O campo `cliente` é texto livre\.\n- A rota `\/assinatura` permanece intocada\./);
  assert.match(body, /PRD — Functional Requirements:\*\* \/.*prd-feat-x\.md/);
  assert.match(body, /labeled `plan-mandated`/);
  assert.match(body, /swallowed error/);
  assert.match(body, /WRITE_SET: src\/form\.tsx\n\s+src\/form\.test\.tsx/);
  assert.doesNotMatch(body, /\{[A-Z_]+\}/, 'no token survives');
  assert.doesNotMatch(body, /^## Findings under verification$/m, 'a first review carries no findings section');
  assert.ok(body.length > 8000, `the rendered rubric is whole (${body.length} chars)`);
});

test('reviewer re-review and implementer fix round carry the findings file verbatim', () => {
  const { root, index, base, ledgerFile } = fixture();
  const findings = path.join(root, 'findings.md');
  fs.writeFileSync(findings, '- Important: src/form.tsx:12 — o erro do PATCH é engolido');
  const re = build(root, ['--role', 'reviewer', '--tasks-index', index, '--task-number', '1', '--base', base, '--findings-file', findings]);
  const head7 = git(root, 'rev-parse', '--short=7', 'HEAD');
  assert.strictEqual(re.out.round, 1);
  assert.match(fs.readFileSync(ledgerFile, 'utf8'), new RegExp(`^Task 1: fix round 1 \\(findings: findings\\.md; commits ${base.slice(0, 7)}\\.\\.${head7}\\)$`, 'm'),
    'the re-review writes the round line itself — a real run ran two task fix rounds and ledgered neither');
  assert.match(re.body, /## Findings under verification\n\nThis is a scoped re-review[\s\S]*`Out-of-scope:`[\s\S]*\n\n- Important: src\/form\.tsx:12/);
  const fix = build(root, ['--role', 'implementer', '--tasks-index', index, '--task-number', '1', '--findings-file', findings]);
  assert.match(fix.body, /## Review Findings to Address \(fix re-dispatch only\)[\s\S]*src\/form\.tsx:12/);
  assert.strictEqual(fix.out.model, 'opus', 'the implementer runs at the task tier');
  assert.match(fix.body, /`workflow\.auto_commit` is \*\*true\*\*/);
  assert.strictEqual(fix.out.reportFile, re.out.reportFile, 'implementer writes the report the reviewer reads');
  assert.match(fix.body, new RegExp(`Write your full report to ${fix.out.reportFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('implementer: context passed through', () => {
  const { root, index } = fixture();
  const { body } = build(root, ['--role', 'implementer', '--tasks-index', index, '--task-number', '1', '--context', 'Task 0 criou o schema.']);
  assert.match(body, /## Context\n\nTask 0 criou o schema\./);
  assert.doesNotMatch(body, /## Review Findings to Address/);
});

test('implementer: the MUTATE step names a script that exists and asks for the Mutation: line', () => {
  const { root, index } = fixture();
  const { body } = build(root, ['--role', 'implementer', '--tasks-index', index, '--task-number', '1']);
  const m = body.match(/node (\S+run-mutation-batch\.cjs) --plan/);
  assert.ok(m, 'the implementer prompt carries the mutation command');
  assert.ok(path.isAbsolute(m[1]) && fs.existsSync(m[1]), `the base-dir placeholder resolves to a real script: ${m[1]}`);
  assert.match(body, /every `Sabotage:`\s+line of the task file/);
  assert.match(body, /`Mutation: <killed>\/<total> killed \(<ids>\); survivors: none`/);
});

test('final: capable always, review focus and deferred ledger lines from disk, PRD named as authority', () => {
  const { root, index, base, ledgerFile } = fixture({ tier: 'cheap' });
  writeLedger(ledgerFile, [
    '# Ledger — feat-x', 'Task 1: started (base abc1234)', 'Task 1: minor (deferred): nome genérico',
    'Task 1: declined: --top abc imprime nada — parsing mora no helper', 'Task 1: Ruling: manter X — porque Y — custo Z', 'Task 1: complete (commits abc1234..def5678, review clean)', '',
  ].join('\n'));
  const { out, body } = build(root, ['--role', 'final', '--tasks-index', index, '--base', base]);
  assert.strictEqual(out.tier, 'capable');
  assert.strictEqual(out.model, 'opus');
  assert.match(body, /Task 1: minor \(deferred\): nome genérico/);
  assert.match(body, /Task 1: declined: --top abc imprime nada/, 'a per-task declined behavior reaches the final review');
  assert.doesNotMatch(body, /Ruling:/, 'rulings go to the user at finish, not to the reviewer as deferred items');
  assert.match(body, /Falha ao alternar status aparece para o usuário/);
  assert.match(body, /where a task file contradicts the PRD or the spec, they win/);
  assert.match(body, /- Design spec: \S*specs\/feat-x-design\.md/, 'the final reviewer gets the index header Spec, not N/A');
  assert.match(body, /- PRD: \S*prd\/prd-feat-x\.md/, 'the final reviewer gets the index header PRD, not N/A');
  assert.match(body, /- Spec coverage: map every `AC-NN`\/`INV-NN` of the spec to a test that asserts it/,
    'spec coverage (each AC/INV asserted with the spec value) is on the final reviewer, the one whole-branch read');
  assert.doesNotMatch(body, /\{[A-Z_]+\}/);
  assert.match(fs.readFileSync(ledgerFile, 'utf8'), /^Final review: dispatched \(range [0-9a-f]{7}\.\.[0-9a-f]{7}\)$/mu, 'the render is the proof sdd-finish.cjs requires');
});

test('a collapsed tier map (capable = standard) is reported, and a missing base is refused', () => {
  const { root, index, base } = fixture();
  const prefs = path.join(root, '.superpowers', 'preferences.yml');
  fs.writeFileSync(prefs, fs.readFileSync(prefs, 'utf8').replace('capable: opus', 'capable: sonnet'));
  const { out } = build(root, ['--role', 'final', '--tasks-index', index, '--base', base]);
  assert.match(out.warnings.join('\n'), /capable and standard to the same model/);
  const r = spawnSync('node', [BUILD, '--role', 'reviewer', '--tasks-index', index, '--task-number', '1'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /no --base and no "Task 1: started" line/);
});

test('implementer --start marks the task IN_PROGRESS and writes the ledger started line in the same call', () => {
  // S10: the controller spent one Bash on mark-task-status IN_PROGRESS and another on the
  // builder for every task; --start folds them, and marks only after the prompt rendered.
  const { root, plans, index, ledgerFile } = fixture();
  const head7 = git(root, 'rev-parse', '--short=7', 'HEAD');
  const { out } = build(root, ['--role', 'implementer', '--tasks-index', index, '--task-number', '1', '--start']);
  assert.ok(out.started, 'the JSON reports the status write');
  assert.match(fs.readFileSync(path.join(plans, 'task-01.md'), 'utf8'), /\*\*Status:\*\* IN_PROGRESS/);
  assert.match(fs.readFileSync(ledgerFile, 'utf8'), new RegExp(`Task 1: started \\(base ${head7}\\)`));
  const fix = spawnSync('node', [BUILD, '--role', 'implementer', '--tasks-index', index, '--task-number', '1', '--start', '--findings-file', index], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(fix.status, 1, 'a fix round is never a start');
  const rev = spawnSync('node', [BUILD, '--role', 'reviewer', '--tasks-index', index, '--task-number', '1', '--start'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(rev.status, 1, '--start is implementer-only');
});

test('without --start the task status is untouched', () => {
  const { root, plans, index } = fixture();
  const { out } = build(root, ['--role', 'implementer', '--tasks-index', index, '--task-number', '1']);
  assert.strictEqual(out.started, null);
  assert.match(fs.readFileSync(path.join(plans, 'task-01.md'), 'utf8'), /\*\*Status:\*\* PENDING/);
});

test('reviewer refuses a range it cannot hand over: empty with auto_commit on, HEAD off BASE', () => {
  const { root, index, base } = fixture();
  const head = git(root, 'rev-parse', 'HEAD');
  const empty = spawnSync('node', [BUILD, '--role', 'reviewer', '--tasks-index', index, '--task-number', '1', '--base', head], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(empty.status, 1);
  assert.match(empty.stderr, /empty .* with auto_commit on/);
  git(root, 'checkout', '-q', '-b', 'side', base);
  fs.writeFileSync(path.join(root, 'b.txt'), 'b\n');
  git(root, 'add', 'b.txt');
  git(root, 'commit', '-qm', 'side');
  const off = spawnSync('node', [BUILD, '--role', 'reviewer', '--tasks-index', index, '--task-number', '1', '--base', head], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(off.status, 1);
  assert.match(off.stderr, /does not descend from BASE/);
  // auto_commit off: BASE = HEAD is the working-tree review, not a stop.
  const prefs = path.join(root, '.superpowers', 'preferences.yml');
  fs.writeFileSync(prefs, fs.readFileSync(prefs, 'utf8').replace('auto_commit: true', 'auto_commit: false'));
  const sideHead = git(root, 'rev-parse', 'HEAD');
  const { out } = build(root, ['--role', 'reviewer', '--tasks-index', index, '--task-number', '1', '--base', sideHead]);
  assert.match(out.diffFile, /review-.*\.diff$/);
});

test('final without --base derives the merge-base with the default branch and checks the range itself', () => {
  // S11 E-O3: `git merge-base main HEAD`, a `git log --graph` and the range script — three calls
  // before the final dispatch. The builder derives the base and refuses what the script flagged.
  const { root, index, base } = fixture();
  git(root, 'branch', '-q', '-m', 'main');
  git(root, 'checkout', '-q', '-b', 'feat/x', base);
  fs.writeFileSync(path.join(root, 'f.txt'), 'f\n');
  git(root, 'add', 'f.txt');
  git(root, 'commit', '-qm', 'feature');
  const { out, body } = build(root, ['--role', 'final', '--tasks-index', index]);
  assert.strictEqual(out.base, base, 'merge-base of main and HEAD, never main itself');
  assert.match(body, new RegExp(`\\*\\*Base:\\*\\* ${base}`));
  git(root, 'checkout', '-q', 'main');
  const empty = spawnSync('node', [BUILD, '--role', 'final', '--tasks-index', index], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(empty.status, 1, 'on the default branch the range is empty — a STOP with auto_commit on');
  assert.match(empty.stderr, /empty .* with auto_commit on/);
});

test('final-fix: one fixer for the whole branch, own report, standard floor, ledger fix-round line written by the script', () => {
  // S11 E-O3: the controller ran --help, then borrowed task 3's number for the fixer (its report
  // overwrote task 3's) and wrote the fix-round ledger line by heredoc.
  const { root, index, ledgerFile } = fixture({ tier: 'cheap' });
  const findings = path.join(root, 'findings.md');
  fs.writeFileSync(findings, '1. `src/cli.js:12` — --top abc imprime nada com código 0\n');
  const { out, body } = build(root, ['--role', 'final-fix', '--tasks-index', index, '--findings-file', findings]);
  assert.strictEqual(out.round, 1);
  assert.strictEqual(out.tier, 'standard', 'findings span tasks: the cheap tier is floored');
  assert.strictEqual(out.model, 'sonnet');
  assert.match(out.reportFile, /final-fix-1-report\.md$/, 'never a task\'s report file');
  assert.match(body, /fix round 1 \(whole branch\)/);
  assert.match(body, /## Review Findings to Address[\s\S]*--top abc imprime nada/);
  assert.match(body, /task-01\.md/, 'every task file travels as background');
  assert.match(body, /feat-x-design\.md/);
  assert.doesNotMatch(body, /\{[A-Z_]+\}/);
  assert.match(fs.readFileSync(ledgerFile, 'utf8'), /^Final review: fix round 1 \(findings: findings\.md\)$/m);
  const second = build(root, ['--role', 'final-fix', '--tasks-index', index, '--findings-file', findings]);
  assert.strictEqual(second.out.round, 2);
  const third = build(root, ['--role', 'final-fix', '--tasks-index', index, '--findings-file', findings]);
  assert.match(third.out.warnings.join('\n'), /is the cap/);
  const bare = spawnSync('node', [BUILD, '--role', 'final-fix', '--tasks-index', index], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(bare.status, 1);
  assert.match(bare.stderr, /requires --findings-file/);
  const numbered = spawnSync('node', [BUILD, '--role', 'final-fix', '--tasks-index', index, '--task-number', '1', '--findings-file', findings], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(numbered.status, 1, 'the fixer is not a task');
});

test('task fix rounds count up from the last started line; a first review writes none; round 3 warns', () => {
  const { root, index, base, b7, ledgerFile } = fixture();
  writeLedger(ledgerFile, `# Ledger — feat-x\n\nTask 1: started (base ${b7})\n`);
  build(root, ['--role', 'reviewer', '--tasks-index', index, '--task-number', '1']);
  assert.doesNotMatch(fs.readFileSync(ledgerFile, 'utf8'), /fix round/, 'the first review is not a fix round');
  const findings = path.join(root, 'findings.md');
  fs.writeFileSync(findings, '- Important: x');
  const rounds = [1, 2, 3].map(() => build(root, ['--role', 'reviewer', '--tasks-index', index, '--task-number', '1', '--base', base, '--findings-file', findings]).out);
  assert.deepStrictEqual(rounds.map((r) => r.round), [1, 2, 3]);
  assert.deepStrictEqual(rounds.map((r) => /Review loop bounds/.test(r.warnings.join('\n'))), [false, false, true]);
  assert.strictEqual(fs.readFileSync(ledgerFile, 'utf8').match(/^Task 1: fix round \d/gm).length, 3);
});
