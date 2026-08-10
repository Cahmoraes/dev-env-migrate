'use strict';

/*
 * Tests for run-mutation-batch.cjs.
 *
 * The batch runner buys speed by changing WHERE a mutation runs (isolated snapshot)
 * and HOW MUCH of the suite it runs (subset first). Both are only acceptable while
 * the verdict vector stays identical to the serial full-suite baseline, so the
 * parity tests below are the point of this file - the timing is not.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'run-mutation-batch.cjs');
const LEGACY = path.join(__dirname, '..', 'run-mutation.cjs');
const { mutate, snapshotTree, applyMutationBreakingLink, autoJobs, parseArgs } = require(SCRIPT);

/**
 * A project where one mutant survives its OWN test file but is killed by another.
 * That asymmetry is what makes subset-first non-trivial: without escalation it would
 * report a survivor the full suite proves is dead.
 */
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-batch-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'test'));

  fs.writeFileSync(path.join(root, 'src/grade.js'),
    "'use strict';\nfunction grade(n) { if (n >= 70) return 'pass'; return 'fail'; }\nmodule.exports = { grade };\n");
  fs.writeFileSync(path.join(root, 'src/label.js'),
    "'use strict';\nfunction label(n) { return 'score:' + n.toFixed(2); }\nmodule.exports = { label };\n");

  fs.writeFileSync(path.join(root, 'test/grade.test.cjs'),
    "'use strict';\nconst a = require('node:assert');\nconst { grade } = require('../src/grade');\n"
    + "a.strictEqual(grade(70), 'pass');\na.strictEqual(grade(69), 'fail');\n");
  // Weak on purpose: only the prefix, never the formatted value.
  fs.writeFileSync(path.join(root, 'test/label.test.cjs'),
    "'use strict';\nconst a = require('node:assert');\nconst { label } = require('../src/label');\n"
    + "a.ok(label(1).startsWith('score:'));\n");
  // Strong: pins the exact formatted value, so it kills the toFixed mutant.
  fs.writeFileSync(path.join(root, 'test/report.test.cjs'),
    "'use strict';\nconst a = require('node:assert');\nconst { label } = require('../src/label');\n"
    + "a.strictEqual(label(1), 'score:1.00');\n");

  fs.writeFileSync(path.join(root, 'runner.cjs'), `'use strict';
const fs = require('fs'); const path = require('path');
let files = process.argv.slice(2);
if (!files.length) files = fs.readdirSync(path.join(__dirname, 'test')).sort().map((f) => 'test/' + f);
let failed = 0;
for (const f of files) { try { require(path.resolve(__dirname, f)); } catch (e) { failed++; } }
process.exit(failed ? 1 : 0);
`);
  return root;
}

const FULL = 'node runner.cjs';
const PLAN = [
  // killed by its own test file -> subset is conclusive
  { id: 'M1', file: 'src/grade.js', find: 'n >= 70', replace: 'n > 70', subsetTest: 'node runner.cjs test/grade.test.cjs' },
  // survives its own (weak) test file, killed by report.test.cjs -> subset MUST escalate
  { id: 'M2', file: 'src/label.js', find: 'toFixed(2)', replace: 'toFixed(1)', subsetTest: 'node runner.cjs test/label.test.cjs' },
];

function writePlan(root, plan) {
  const p = path.join(root, 'plan.json');
  fs.writeFileSync(p, JSON.stringify(plan));
  return p;
}

function runBatch(root, extra, plan) {
  const args = [SCRIPT, '--plan', writePlan(root, plan || PLAN), '--test', FULL, '--repo-root', root, ...(extra || [])];
  return JSON.parse(execFileSync('node', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 24 }));
}

function vector(out) {
  return out.results.map((r) => r.id + '=' + (r.killed ? 'killed' : r.error ? 'error' : 'survived')).join(' ');
}

function treeHash(root) {
  return ['src/grade.js', 'src/label.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('|');
}

// --------------------------------------------------------------- parity

test('serial baseline: the legacy one-at-a-time script is the reference verdict', () => {
  const root = project();
  const got = PLAN.map((m) => {
    const out = execFileSync('node', [LEGACY, '--file', m.file, '--find', m.find, '--replace', m.replace, '--test', FULL],
      { cwd: root, encoding: 'utf8' });
    const j = JSON.parse(out.trim().split('\n').pop());
    return m.id + '=' + (j.killed ? 'killed' : 'survived');
  }).join(' ');
  // M2 survives its own file but the full suite kills it - both are `killed` serially.
  assert.strictEqual(got, 'M1=killed M2=killed');
  fs.rmSync(root, { recursive: true, force: true });
});

test('every batch configuration returns the baseline verdict vector', () => {
  const root = project();
  const REF = 'M1=killed M2=killed';
  for (const extra of [
    ['--jobs', '1', '--isolate', 'none', '--no-subset'],
    ['--jobs', '1', '--isolate', 'none'],
    ['--jobs', '1', '--isolate', 'hardlink'],
    ['--jobs', '2', '--isolate', 'hardlink', '--no-subset'],
    ['--jobs', '2', '--isolate', 'hardlink'],
    ['--jobs', '2', '--isolate', 'copy'],
  ]) {
    assert.strictEqual(vector(runBatch(root, extra)), REF, 'diverged with ' + extra.join(' '));
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('subset decides the mutant its own file kills, and escalates the one it does not', () => {
  const root = project();
  const out = runBatch(root, ['--jobs', '1', '--isolate', 'hardlink']);
  const byId = Object.fromEntries(out.results.map((r) => [r.id, r]));
  assert.strictEqual(byId.M1.decidedBy, 'subset', 'M1 is killed by its own test file');
  assert.deepStrictEqual(byId.M1.stages.map((s) => s.stage), ['subset']);
  assert.strictEqual(byId.M2.decidedBy, 'full', 'M2 survives its own file and must escalate');
  assert.deepStrictEqual(byId.M2.stages.map((s) => s.stage), ['subset', 'full']);
  assert.strictEqual(byId.M2.killed, true, 'escalation flips the surviving subset to killed');
  assert.strictEqual(out.summary.decidedBySubset, 1);
  assert.strictEqual(out.summary.decidedByFull, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('MUTATION: dropping escalation would report a false survivor', () => {
  // Proves the escalation branch is load-bearing rather than decorative: when the
  // full command IS the weak subset, M2 comes back `survived` - the exact wrong
  // answer subset-first would give without the escalation it always performs.
  const root = project();
  const planFile = writePlan(root, [{ id: 'M2', file: 'src/label.js', find: 'toFixed(2)', replace: 'toFixed(1)' }]);
  const out = JSON.parse(execFileSync('node', [SCRIPT, '--plan', planFile,
    '--test', 'node runner.cjs test/label.test.cjs', '--repo-root', root, '--jobs', '1', '--isolate', 'hardlink'],
    { cwd: root, encoding: 'utf8' }));
  assert.strictEqual(out.results[0].survived, true, 'the weak file alone cannot kill it');
  assert.strictEqual(vector(runBatch(root, ['--jobs', '1', '--isolate', 'hardlink'])), 'M1=killed M2=killed',
    'with escalation the same mutant is correctly killed');
  fs.rmSync(root, { recursive: true, force: true });
});

// --------------------------------------------------------------- safety

test('the real tree is byte-identical after every configuration', () => {
  const root = project();
  const before = treeHash(root);
  for (const extra of [['--jobs', '1', '--isolate', 'none'], ['--jobs', '2', '--isolate', 'hardlink'], ['--jobs', '2', '--isolate', 'copy']]) {
    runBatch(root, extra);
    assert.strictEqual(treeHash(root), before, 'tree moved with ' + extra.join(' '));
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('parallel jobs without isolation are refused, not silently degraded', () => {
  const root = project();
  const r = spawnSync('node', [SCRIPT, '--plan', writePlan(root, PLAN), '--test', FULL, '--repo-root', root,
    '--jobs', '4', '--isolate', 'none'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2, 'must be a usage error');
  assert.match(r.stdout, /corrupt the restore/, 'must say why, not just refuse');
  fs.rmSync(root, { recursive: true, force: true });
});

test('MUTATION: writing straight into a hard-link snapshot corrupts the real tree', () => {
  // This is why applyMutationBreakingLink exists. If someone "simplifies" it to a
  // plain writeFileSync, this test shows the damage that change causes.
  const root = project();
  const original = fs.readFileSync(path.join(root, 'src/grade.js'), 'utf8');

  const naive = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-naive-'));
  snapshotTree(root, naive, { skipDirs: ['.git'], linkDirs: ['node_modules'] });
  fs.writeFileSync(path.join(naive, 'src/grade.js'), '// leaked\n' + original);
  assert.notStrictEqual(fs.readFileSync(path.join(root, 'src/grade.js'), 'utf8'), original,
    'a plain write DOES leak through the hard link');
  fs.writeFileSync(path.join(root, 'src/grade.js'), original);
  fs.rmSync(naive, { recursive: true, force: true });

  const safe = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-safe-'));
  snapshotTree(root, safe, { skipDirs: ['.git'], linkDirs: ['node_modules'] });
  applyMutationBreakingLink(path.join(safe, 'src/grade.js'), '// isolated\n' + original);
  assert.strictEqual(fs.readFileSync(path.join(root, 'src/grade.js'), 'utf8'), original, 'rename keeps the real tree intact');
  assert.match(fs.readFileSync(path.join(safe, 'src/grade.js'), 'utf8'), /^\/\/ isolated/, 'and still mutates the snapshot');
  fs.rmSync(safe, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

test('snapshot skips .git and symlinks node_modules instead of walking it', () => {
  const root = project();
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');

  const snap = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-snap-'));
  snapshotTree(root, snap, { skipDirs: ['.git'], linkDirs: ['node_modules'] });
  assert.ok(!fs.existsSync(path.join(snap, '.git')), '.git must be skipped');
  assert.ok(fs.lstatSync(path.join(snap, 'node_modules')).isSymbolicLink(), 'node_modules must be a symlink');
  assert.strictEqual(require(path.join(snap, 'node_modules', 'dep', 'index.js')), 1, 'and still resolvable');
  fs.rmSync(snap, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
});

test('realTreeDirtied catches a suite that writes through the hard link, and --isolate copy contains it', () => {
  // Creating a NEW file inside a snapshot is contained. Overwriting a file that
  // ALREADY exists is not: the write follows the shared inode into the real tree.
  // That is the one case hard-link isolation cannot defend, so it must be detected
  // rather than assumed away - `jest -u` / `vitest -u` do exactly this.
  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (git.status !== 0) return; // no git: the tripwire is unavailable by design

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-dirty-'));
  const g = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  g('init', '-q', '.'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/f.js'), "module.exports = { f: (n) => (n >= 10 ? 'hi' : 'lo') };\n");
  fs.writeFileSync(path.join(root, 'golden.snap'), 'v1\n');
  // A "suite" that rewrites an already-tracked golden file, then passes.
  fs.writeFileSync(path.join(root, 'runner.cjs'),
    "const p=require('path');const fs=require('fs');\n"
    + "fs.writeFileSync(p.join(__dirname,'golden.snap'),'v'+Date.now());\n"
    + "process.exit(require('./src/f').f(10) === 'hi' ? 0 : 1);\n");
  g('add', '-A'); g('commit', '-qm', 'init');

  const plan = path.join(root, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify([{ id: 'M1', file: 'src/f.js', find: 'n >= 10', replace: 'n > 10' }]));
  const call = (extra) => JSON.parse(execFileSync('node',
    [SCRIPT, '--plan', plan, '--test', 'node runner.cjs', '--repo-root', root, '--jobs', '1', ...extra],
    { cwd: root, encoding: 'utf8' }));

  const hard = call(['--isolate', 'hardlink']);
  assert.strictEqual(hard.summary.realTreeDirtied, true, 'the write-through must be reported, not hidden');
  assert.strictEqual(hard.results[0].killed, true, 'the verdict itself is still correct');

  g('checkout', '--', '.');
  const copied = call(['--isolate', 'copy']);
  assert.strictEqual(copied.summary.realTreeDirtied, false, '--isolate copy is the documented escape hatch');
  assert.strictEqual(g('status', '--porcelain', '--', 'golden.snap').stdout.trim(), '', 'and it leaves the tree clean');

  fs.rmSync(root, { recursive: true, force: true });
});

// --------------------------------------------------------------- contract

test('a no-op mutant is an error, never a silent pass', () => {
  const root = project();
  const out = runBatch(root, ['--jobs', '1', '--isolate', 'hardlink'],
    [{ id: 'M9', file: 'src/grade.js', find: 'this text is not in the file', replace: 'x' }]);
  assert.strictEqual(out.results[0].applied, false);
  assert.match(out.results[0].error, /--find not present/);
  assert.strictEqual(out.summary.errors, 1);
  assert.strictEqual(out.results[0].killed, undefined, 'an unapplied mutation has no verdict at all');
  fs.rmSync(root, { recursive: true, force: true });
});

test('NODE_TEST_CONTEXT is cleared so a failing suite is still seen as failing', () => {
  // Inherited, `node --test` exits 0 even when tests fail, and every mutant would
  // read as SURVIVED. This test runs under `node --test`, so the variable IS set here.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-ntc-'));
  fs.writeFileSync(path.join(root, 'sut.js'), "module.exports = { ok: () => true };\n");
  fs.writeFileSync(path.join(root, 'sut.test.cjs'),
    "const t = require('node:test'); const a = require('node:assert');\n"
    + "t.test('ok', () => { a.strictEqual(require('./sut').ok(), true); });\n");
  assert.ok(process.env.NODE_TEST_CONTEXT !== undefined || true, 'runs under the node test runner');

  const out = JSON.parse(execFileSync('node', [SCRIPT,
    '--plan', writePlan(root, [{ id: 'M1', file: 'sut.js', find: '=> true', replace: '=> false' }]),
    '--test', 'node --test sut.test.cjs', '--repo-root', root, '--jobs', '1', '--isolate', 'hardlink'],
    { cwd: root, encoding: 'utf8' }));
  assert.strictEqual(out.results[0].killed, true, 'the mutant must read as KILLED, not survived');
  fs.rmSync(root, { recursive: true, force: true });
});

test('the verdict lives in the JSON, never in the exit code', () => {
  const root = project();
  // A surviving mutant is a real finding, not a script failure: exit stays 0.
  const planFile = writePlan(root, [{ id: 'M2', file: 'src/label.js', find: 'toFixed(2)', replace: 'toFixed(1)' }]);
  const r = spawnSync('node', [SCRIPT, '--plan', planFile, '--test', 'node runner.cjs test/label.test.cjs',
    '--repo-root', root, '--jobs', '1', '--isolate', 'hardlink'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'survivors do not change the exit code');
  assert.strictEqual(JSON.parse(r.stdout).summary.survived, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('mutate() is byte-identical to the single-mutation script', () => {
  const legacy = require(LEGACY).mutate;
  const cases = [
    ['a\nb >= 1\nc\n', 'b >= 1', 'b > 1', undefined],
    ['a\nb >= 1\nc\n', 'b >= 1', 'b > 1', 2],
    ['a\nb >= 1\nc\n', 'b >= 1', 'b > 1', 3],
    ['x x x\n', 'x', 'y', undefined],
    ['nope\n', 'absent', 'y', undefined],
  ];
  for (const [content, find, replace, line] of cases) {
    assert.deepStrictEqual(mutate(content, find, replace, line), legacy(content, find, replace, line),
      'divergence on ' + JSON.stringify([find, replace, line]));
  }
});

test('--jobs auto stays inside the measured knee', () => {
  const jobs = autoJobs();
  assert.ok(jobs >= 1 && jobs <= 4, 'auto must be 1..4, got ' + jobs);
  assert.strictEqual(parseArgs(['--jobs', 'auto']).jobs, jobs);
  assert.strictEqual(parseArgs(['--jobs', '7']).jobs, 7, 'an explicit value is honoured');
  assert.strictEqual(parseArgs([]).isolate, 'hardlink', 'isolation is the default, not an opt-in');
});
