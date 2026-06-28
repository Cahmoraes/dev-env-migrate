'use strict';

/**
 * Tests for superpowers-status.cjs — feature pipeline phase/progress reporting.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/superpowers-status.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'superpowers-status.cjs');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sp-status-'));
}

function runJson(repoRoot, extraArgs = []) {
  const out = execFileSync('node', [SCRIPT, '--repo-root', repoRoot, ...extraArgs], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function writeArtifact(repoRoot, feature, kind, body = '# content\n') {
  const featureDir = path.join(repoRoot, 'docs', 'superpowers', feature);
  const map = {
    research: ['research', `research-${feature}.md`],
    spec: ['specs', `${feature}-design.md`],
    prd: ['prd', `prd-${feature}.md`],
    plan: ['plans', `tasks-${feature}.md`],
    qa: ['qa', `qa-report-${feature}.md`],
  };
  const [subdir, file] = map[kind];
  const dir = path.join(featureDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}

function tasksIndex(tasks) {
  // tasks: array of booleans (done?)
  const lines = ['# Tarefas: X', '', '## Tarefas', ''];
  tasks.forEach((done, i) => {
    const box = done ? 'x' : ' ';
    lines.push(`- [${box}] ${i + 1}. Task title here → \`task-0${i + 1}.md\``);
  });
  return lines.join('\n') + '\n';
}

test('feature with no directory reports not-started → brainstorming', () => {
  const repo = mkRepo();
  const result = runJson(repo, ['--feature-name', 'ghost']);
  assert.equal(result.count, 1);
  const f = result.features[0];
  assert.equal(f.phase, 'not-started');
  assert.equal(f.nextAction, 'super.brainstorming');
  assert.deepEqual(f.artifacts, { research: false, spec: false, prd: false, plan: false, qa: false });
  assert.equal(f.tasks, null);
});

test('spec only reports phase spec with prd/plan choice next', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'feat', 'spec');
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.phase, 'spec');
  assert.match(f.nextAction, /generating-prd.*writing-plans/);
  assert.equal(f.artifacts.spec, true);
});

test('spec + prd reports phase prd → writing-plans', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'feat', 'spec');
  writeArtifact(repo, 'feat', 'prd');
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.phase, 'prd');
  assert.equal(f.nextAction, 'super.writing-plans');
});

test('plan with mixed checkboxes reports executing with task counts', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'feat', 'spec');
  writeArtifact(repo, 'feat', 'plan', tasksIndex([true, false, false]));
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.phase, 'executing');
  assert.deepEqual(f.tasks, { total: 3, done: 1 });
  assert.match(f.nextAction, /resume execution/);
});

test('plan with zero done reports planned', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'feat', 'plan', tasksIndex([false, false]));
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.phase, 'planned');
  assert.deepEqual(f.tasks, { total: 2, done: 0 });
});

test('all tasks done WITH prd routes to QA gate', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'feat', 'prd');
  writeArtifact(repo, 'feat', 'plan', tasksIndex([true, true]));
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.phase, 'execution-complete');
  assert.equal(f.nextAction, 'super.user-story-verification');
});

test('all tasks done WITHOUT prd skips QA and routes to finishing', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'feat', 'plan', tasksIndex([true, true]));
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.phase, 'execution-complete');
  assert.equal(f.nextAction, 'super.finishing-a-development-branch');
});

test('qa report present reports qa-complete → finishing', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'feat', 'prd');
  writeArtifact(repo, 'feat', 'plan', tasksIndex([true, true]));
  writeArtifact(repo, 'feat', 'qa');
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.phase, 'qa-complete');
  assert.equal(f.nextAction, 'super.finishing-a-development-branch');
});

test('scan mode (no --feature-name) lists every feature sorted', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'zebra', 'spec');
  writeArtifact(repo, 'alpha', 'spec');
  const result = runJson(repo);
  assert.equal(result.count, 2);
  assert.deepEqual(result.features.map((f) => f.featureName), ['alpha', 'zebra']);
  assert.equal(result.docsExists, true);
});

test('scan mode skips hidden directories', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'visible', 'spec');
  fs.mkdirSync(path.join(repo, 'docs', 'superpowers', '.hidden'), { recursive: true });
  const result = runJson(repo);
  assert.deepEqual(result.features.map((f) => f.featureName), ['visible']);
});

test('scan mode with no docs dir reports docsExists false and empty list', () => {
  const repo = mkRepo();
  const result = runJson(repo);
  assert.equal(result.docsExists, false);
  assert.equal(result.count, 0);
});

test('research-only reports phase research → brainstorming', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'feat', 'research');
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.phase, 'research');
  assert.equal(f.nextAction, 'super.brainstorming');
});

// ─── --pending filter (the "locate pending work" query) ─────────────────────

test('--pending keeps only planned/executing features and drops the rest', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'planned-feat', 'plan', tasksIndex([false, false]));          // planned
  writeArtifact(repo, 'executing-feat', 'plan', tasksIndex([true, false]));         // executing
  writeArtifact(repo, 'spec-only', 'spec');                                          // phase spec → excluded
  writeArtifact(repo, 'done-feat', 'plan', tasksIndex([true, true]));               // execution-complete → excluded
  const result = runJson(repo, ['--pending']);
  assert.equal(result.pending, true);
  assert.deepEqual(result.features.map((f) => f.featureName).sort(), ['executing-feat', 'planned-feat']);
});

test('--pending with a single --feature-name filters that feature too', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'spec-only', 'spec'); // phase spec → not pending
  const result = runJson(repo, ['--feature-name', 'spec-only', '--pending']);
  assert.equal(result.count, 0);
});

test('without --pending the result reports pending:false and includes all phases', () => {
  const repo = mkRepo();
  writeArtifact(repo, 'spec-only', 'spec');
  const result = runJson(repo);
  assert.equal(result.pending, false);
  assert.equal(result.count, 1);
});

// ─── CLI surface & error branches ───────────────────────────────────────────

test('--help exits 0 and prints usage', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(out, /superpowers-status/);
});

test('unknown argument exits non-zero', () => {
  assert.throws(() => {
    execFileSync('node', [SCRIPT, '--bogus'], { stdio: ['ignore', 'ignore', 'ignore'] });
  });
});

test('flags require a value (--feature-name / --repo-root / --base-dir)', () => {
  for (const flag of ['--feature-name', '--repo-root', '--base-dir']) {
    assert.throws(
      () => execFileSync('node', [SCRIPT, flag], { stdio: ['ignore', 'ignore', 'ignore'] }),
      undefined,
      `${flag} with no value should fail`,
    );
  }
});

test('no git root and no --repo-root reports repoNotFound', () => {
  const nonGit = mkRepo(); // mkdtemp dir is not a git repo
  const out = execFileSync('node', [SCRIPT], { encoding: 'utf8', cwd: nonGit, stdio: ['ignore', 'pipe', 'ignore'] });
  const result = JSON.parse(out);
  assert.equal(result.repoNotFound, true);
  assert.equal(result.count, 0);
});

test('absolute --base-dir is honored as-is', () => {
  const repo = mkRepo();
  const abs = path.join(repo, 'elsewhere');
  fs.mkdirSync(path.join(abs, 'feat', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(abs, 'feat', 'specs', 'feat-design.md'), '# x\n');
  const result = runJson(repo, ['--feature-name', 'feat', '--base-dir', abs]);
  assert.equal(result.baseDir, abs);
  assert.equal(result.features[0].artifacts.spec, true);
});

test('uppercase [X] checkboxes count as done', () => {
  const repo = mkRepo();
  const planPath = path.join(repo, 'docs', 'superpowers', 'feat', 'plans', 'tasks-feat.md');
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, '## Tarefas\n\n- [X] 1. Title here → `task-01.md`\n- [ ] 2. Another title → `task-02.md`\n');
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.deepEqual(f.tasks, { total: 2, done: 1 });
});

test('plan with zero task lines reports total 0 → planned', () => {
  const repo = mkRepo();
  const planPath = path.join(repo, 'docs', 'superpowers', 'feat', 'plans', 'tasks-feat.md');
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, '# Tarefas: feat\n\n(no task lines yet)\n');
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.deepEqual(f.tasks, { total: 0, done: 0 });
  assert.equal(f.phase, 'planned');
});

test('unreadable tasks index (path is a directory) degrades to null task counts', () => {
  const repo = mkRepo();
  // Create the tasks index PATH as a directory: existsSync(plan) is true but read throws.
  const planPath = path.join(repo, 'docs', 'superpowers', 'feat', 'plans', 'tasks-feat.md');
  fs.mkdirSync(planPath, { recursive: true });
  const f = runJson(repo, ['--feature-name', 'feat']).features[0];
  assert.equal(f.artifacts.plan, true);
  assert.equal(f.tasks, null);
  assert.equal(f.phase, 'planned'); // no countable tasks → treated as planned
});
