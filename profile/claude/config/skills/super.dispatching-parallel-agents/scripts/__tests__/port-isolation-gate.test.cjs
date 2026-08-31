'use strict';

/**
 * Tests for the port-isolation gate inside validate-dispatch.cjs.
 *
 * Why this file exists, separately from validate-dispatch.test.cjs: every other
 * invariant in that script is a pure function of the manifest. This one reaches
 * OUT — it runs the sibling allocator against a real git repo — so its fixtures
 * are real worktrees and a real lease ledger, not JSON literals.
 *
 * The defect it closes: the wave-level port audit lived in prose only. Seventeen
 * textual guards asserted the sentence was present in the skills; none of them
 * could observe whether the command ever ran, and a measured run skipped it. The
 * outcome was accidentally correct (no ports.yml → nothing to audit), which is
 * precisely what made it invisible: "audited, nothing to do" and "never audited"
 * produced byte-identical output. Every test below asserts on the RECEIPT, not on
 * the verdict alone.
 *
 * Run with: node --test super.dispatching-parallel-agents/scripts/__tests__/port-isolation-gate.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-dispatch.cjs');
const ALLOCATOR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'super.using-git-worktrees',
  'scripts',
  'allocate-ports.cjs'
);

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
}

/**
 * A real repo with two real linked worktrees — the exact shape a parallel wave creates.
 * Anything less (a bare directory, a stubbed allocator) would let the gate pass for a
 * reason the production path does not have.
 */
function makeRepoWithWorktrees() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'port-gate-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(repo, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n', 'utf8');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'init']);
  const wtA = path.join(root, 'wt-a');
  const wtB = path.join(root, 'wt-b');
  git(repo, ['worktree', 'add', '-q', wtA, '-b', 'task-a']);
  git(repo, ['worktree', 'add', '-q', wtB, '-b', 'task-b']);
  const commonDir = path.resolve(repo, git(repo, ['rev-parse', '--git-common-dir']).trim());
  return { root, repo, wtA, wtB, commonDir };
}

function enablePorts(repo) {
  fs.mkdirSync(path.join(repo, '.superpowers'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.superpowers', 'ports.yml'),
    'enabled: true\nrange: 20000-32767\nblock_size: 16\nservices:\n  api: 3333\n',
    'utf8'
  );
}

function writeLedger(commonDir, leases) {
  const dir = path.join(commonDir, 'superpowers');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'port-leases.json'), JSON.stringify({ version: 1, leases }), 'utf8');
}

function agent(label, workspace) {
  const a = { label, model: 'haiku', goal: 'g', tier: 'cheap', writeFiles: [`${label}.js`] };
  if (workspace) a.workspace = workspace;
  return a;
}

function run(root, manifest) {
  const file = path.join(root, 'dispatch.json');
  fs.writeFileSync(file, JSON.stringify(manifest), 'utf8');
  const out = execFileSync('node', [SCRIPT, '--dispatch', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

const types = (list) => list.map((x) => x.type);

test('the sibling allocator resolves from this script — the autorun path is not vapour', () => {
  assert.ok(
    fs.existsSync(ALLOCATOR),
    `validate-dispatch resolves the allocator at ${ALLOCATOR}; if this moved, the gate silently degrades to "declare it yourself"`
  );
});

test('a worktree fan-out runs the audit itself, without being asked', () => {
  const { root, wtA, wtB } = makeRepoWithWorktrees();
  const res = run(root, { agents: [agent('t1', wtA), agent('t2', wtB)] });
  assert.ok(
    types(res.warnings).includes('port_audit_autorun'),
    'the controller never invoked allocate-ports; the gate must have done it unprompted'
  );
});

test('no ports.yml is a PASS WITH A RECEIPT, not a silent skip', () => {
  const { root, wtA, wtB } = makeRepoWithWorktrees();
  const res = run(root, { agents: [agent('t1', wtA), agent('t2', wtB)] });
  assert.equal(res.valid, true, 'a repo that binds no ports must not be blocked');
  assert.ok(
    types(res.warnings).includes('port_isolation_off'),
    'this is the whole defect: the pass has to be distinguishable from never having looked'
  );
});

test('overlapping port blocks are a hard error — the STOP is now mechanical', () => {
  const { root, repo, wtA, wtB, commonDir } = makeRepoWithWorktrees();
  enablePorts(repo);
  writeLedger(commonDir, {
    [wtA]: { blockStart: 20000, blockSize: 16, branch: 'task-a' },
    [wtB]: { blockStart: 20008, blockSize: 16, branch: 'task-b' },
  });
  const res = run(root, { agents: [agent('t1', wtA), agent('t2', wtB)] });
  assert.equal(res.valid, false);
  assert.ok(types(res.errors).includes('port_block_overlap'));
  const err = res.errors.find((e) => e.type === 'port_block_overlap');
  assert.ok(err.worktrees.length === 2, 'the error must name both colliding worktrees, not just fail');
});

test('disjoint blocks across every worktree pass', () => {
  const { root, repo, wtA, wtB, commonDir } = makeRepoWithWorktrees();
  enablePorts(repo);
  writeLedger(commonDir, {
    [wtA]: { blockStart: 20000, blockSize: 16, branch: 'task-a' },
    [wtB]: { blockStart: 20016, blockSize: 16, branch: 'task-b' },
  });
  const res = run(root, { agents: [agent('t1', wtA), agent('t2', wtB)] });
  assert.equal(res.valid, true, JSON.stringify(res.errors));
});

test('auditing before every worktree has a lease proves less than it claims', () => {
  const { root, repo, wtA, wtB, commonDir } = makeRepoWithWorktrees();
  enablePorts(repo);
  writeLedger(commonDir, { [wtA]: { blockStart: 20000, blockSize: 16, branch: 'task-a' } });
  const res = run(root, { agents: [agent('t1', wtA), agent('t2', wtB)] });
  assert.equal(res.valid, false);
  const err = res.errors.find((e) => e.type === 'port_audit_scope_stale');
  assert.ok(err, 'one lease covering a two-worktree fan-out must not read as a clean audit');
  assert.equal(err.leaseCount, 1);
  assert.equal(err.workspaceCount, 2);
});

test('workspaces that do not exist yet fail loudly instead of auditing the wrong repo', () => {
  const { root } = makeRepoWithWorktrees();
  const res = run(root, {
    agents: [agent('t1', path.join(root, 'never-created-a')), agent('t2', path.join(root, 'never-created-b'))],
  });
  assert.equal(res.valid, false);
  assert.ok(
    types(res.errors).includes('missing_port_audit'),
    'the allocator falls back to cwd git detection when handed a dead path, and "enabled:false" about some OTHER repo reads exactly like a clean pass'
  );
});

test('a declared portAudit is the fallback when no real run is possible', () => {
  const { root } = makeRepoWithWorktrees();
  const res = run(root, {
    portAudit: { mode: 'check', enabled: true, leaseCount: 2, disjoint: true, conflicts: [] },
    agents: [agent('t1', path.join(root, 'never-created-a')), agent('t2', path.join(root, 'never-created-b'))],
  });
  assert.equal(res.valid, true, 'a caller that cannot run the allocator must still have a way through');
  assert.ok(!types(res.warnings).includes('port_audit_autorun'), 'a declared audit is not an autorun');
});

test('a real run beats a declared audit — the declared one cannot launder a collision', () => {
  const { root, repo, wtA, wtB, commonDir } = makeRepoWithWorktrees();
  enablePorts(repo);
  writeLedger(commonDir, {
    [wtA]: { blockStart: 20000, blockSize: 16, branch: 'task-a' },
    [wtB]: { blockStart: 20008, blockSize: 16, branch: 'task-b' },
  });
  const res = run(root, {
    portAudit: { mode: 'check', enabled: true, leaseCount: 2, disjoint: true, conflicts: [] },
    agents: [agent('t1', wtA), agent('t2', wtB)],
  });
  assert.equal(res.valid, false, 'declaring "all clear" must not override an audit we can run ourselves');
  assert.ok(types(res.errors).includes('port_block_overlap'));
});

test('an in-tree wave pays nothing — no workspace, no port keys at all', () => {
  const { root } = makeRepoWithWorktrees();
  const res = run(root, { agents: [agent('t1'), agent('t2')] });
  assert.equal(res.valid, true);
  const emitted = [...types(res.errors), ...types(res.warnings)];
  assert.deepEqual(
    emitted.filter((t) => t.startsWith('port_') || t === 'missing_port_audit'),
    [],
    'in-tree waves and ad-hoc dispatches must not even spawn the allocator'
  );
});

test('two agents in the SAME tree is not a fan-out', () => {
  const { root, wtA } = makeRepoWithWorktrees();
  const res = run(root, { agents: [agent('t1', wtA), agent('t2', wtA)] });
  const emitted = [...types(res.errors), ...types(res.warnings)];
  assert.deepEqual(
    emitted.filter((t) => t.startsWith('port_') || t === 'missing_port_audit'),
    [],
    'the gate keys on distinct workspaces, not on the field being present'
  );
});

test('a single-agent dispatch never arms the gate', () => {
  const { root, wtA } = makeRepoWithWorktrees();
  const res = run(root, { agents: [agent('t1', wtA)] });
  const emitted = [...types(res.errors), ...types(res.warnings)];
  assert.deepEqual(
    emitted.filter((t) => t.startsWith('port_') || t === 'missing_port_audit'),
    []
  );
});

test('the manifest skeleton in --help teaches the workspace field', () => {
  const help = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(help, /"workspace"/, 'a field the gate keys on must appear in the skeleton the controller copies');
  assert.match(
    help,
    /port_isolation_off/,
    'the pass-with-a-receipt semantics must be discoverable without reading the source'
  );
});
