'use strict';

/**
 * Tests for validate-dispatch.cjs.
 *
 * Run with: node --test super.dispatching-parallel-agents/scripts/__tests__/validate-dispatch.test.cjs
 * Or from skills/: node --test super.dispatching-parallel-agents/scripts/__tests__/*.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'validate-dispatch.cjs');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-dispatch-'));
}

function writeManifest(dir, manifest) {
  const filePath = path.join(dir, 'dispatch.json');
  fs.writeFileSync(filePath, JSON.stringify(manifest), 'utf8');
  return filePath;
}

function run(args) {
  const out = execFileSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function runRaw(args) {
  return execFileSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runFail(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err.status == null) throw err;
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
  throw new Error('expected a non-zero exit but the script succeeded');
}

function validAgent(overrides = {}) {
  return {
    label: 'Fix auth tests',
    model: 'claude-haiku-4-5',
    goal: 'Fix the 3 failing tests in src/auth/__tests__/auth.test.ts',
    writeFiles: [],
    ...overrides,
  };
}

// ─── CLI argument handling ──────────────────────────────────────────────────

test('--help prints usage and exits 0', () => {
  const out = runRaw(['--help']);
  assert.match(out, /validate-dispatch\.cjs/);
  assert.match(out, /--dispatch <path>/);
});

test('missing --dispatch exits 1 with error on stderr', () => {
  const r = runFail([]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--dispatch <path> is required/);
});

test('--dispatch without value exits 1', () => {
  const r = runFail(['--dispatch']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--dispatch <path> is required/);
});

test('unknown argument exits 1', () => {
  const r = runFail(['--unknown']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown argument/);
});

test('file not found exits 1', () => {
  const r = runFail(['--dispatch', '/tmp/does-not-exist-12345.json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Cannot read manifest/);
});

test('invalid JSON exits 1', () => {
  const dir = tmpDir();
  const p = path.join(dir, 'bad.json');
  fs.writeFileSync(p, '{ not json }', 'utf8');
  const r = runFail(['--dispatch', p]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON/);
});

test('manifest is JSON null exits 1 with shape error', () => {
  const dir = tmpDir();
  const p = path.join(dir, 'null.json');
  fs.writeFileSync(p, 'null', 'utf8');
  const r = runFail(['--dispatch', p]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Manifest must be a JSON object/);
});

test('manifest is JSON array exits 1 with shape error', () => {
  const dir = tmpDir();
  const p = path.join(dir, 'array.json');
  fs.writeFileSync(p, '[]', 'utf8');
  const r = runFail(['--dispatch', p]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Manifest must be a JSON object/);
});

// ─── Valid dispatch ─────────────────────────────────────────────────────────

test('two valid agents with no write conflicts → valid: true, no errors, no warnings', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'Fix auth', writeFiles: ['src/auth.service.ts'] }),
      validAgent({ label: 'Fix payments', writeFiles: ['src/payments.service.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.agentCount, 2);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('three valid agents with disjoint write sets → valid: true', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: ['src/a.ts'] }),
      validAgent({ label: 'B', writeFiles: ['src/b.ts'] }),
      validAgent({ label: 'C', writeFiles: ['src/c.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.agentCount, 3);
  assert.deepEqual(r.errors, []);
});

test('agents without writeFiles field → valid: true', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      { label: 'A', model: 'claude-haiku-4-5', goal: 'investigate failures' },
      { label: 'B', model: 'claude-haiku-4-5', goal: 'investigate timeouts' },
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test('read-only shared file (not in writeFiles) → no write_conflict error', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: ['src/a.ts'] }),
      validAgent({ label: 'B', writeFiles: ['src/b.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.type === 'write_conflict').length, 0);
});

// ─── model: invariant ──────────────────────────────────────────────────────

test('agent missing model field → error missing_field(model)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      { label: 'A', goal: 'do thing' },
      validAgent({ label: 'B' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.type === 'missing_field' && e.field === 'model');
  assert.ok(err, 'expected missing_field(model) error');
  assert.equal(err.agent, 'A');
});

test('agent with empty string model → error empty_model', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', model: '' }),
      validAgent({ label: 'B' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.type === 'empty_model');
  assert.ok(err);
  assert.equal(err.agent, 'A');
});

test('agent with whitespace-only model → error empty_model', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', model: '   ' }),
      validAgent({ label: 'B' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === 'empty_model' && e.agent === 'A'));
});

test('model: null → error missing_field(model)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', model: null }),
      validAgent({ label: 'B' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === 'missing_field' && e.field === 'model' && e.agent === 'A'));
});

test('all agents missing model → multiple missing_field errors', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      { label: 'A', goal: 'fix A' },
      { label: 'B', goal: 'fix B' },
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const modelErrors = r.errors.filter((e) => e.type === 'missing_field' && e.field === 'model');
  assert.equal(modelErrors.length, 2);
});

// ─── Required fields: label and goal ──────────────────────────────────────

test('agent missing label → error missing_field(label), fallback to agent[N]', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      { model: 'claude-haiku-4-5', goal: 'fix thing' },
      validAgent({ label: 'B' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.type === 'missing_field' && e.field === 'label');
  assert.ok(err);
  assert.equal(err.agent, 'agent[0]');
});

test('agent missing goal → error missing_field(goal)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      { label: 'A', model: 'claude-haiku-4-5' },
      validAgent({ label: 'B' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === 'missing_field' && e.field === 'goal' && e.agent === 'A'));
});

// ─── Write-set conflict ─────────────────────────────────────────────────────

test('two agents sharing a write file → error write_conflict', () => {
  const dir = tmpDir();
  const sharedFile = 'src/shared.service.ts';
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: [sharedFile] }),
      validAgent({ label: 'B', writeFiles: [sharedFile] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.type === 'write_conflict');
  assert.ok(err);
  assert.equal(err.file, sharedFile);
  assert.ok(err.agents.includes('A'));
  assert.ok(err.agents.includes('B'));
});

test('three agents sharing a file → write_conflict lists all three', () => {
  const dir = tmpDir();
  const sharedFile = 'src/shared.ts';
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: [sharedFile] }),
      validAgent({ label: 'B', writeFiles: [sharedFile] }),
      validAgent({ label: 'C', writeFiles: [sharedFile] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.type === 'write_conflict' && e.file === sharedFile);
  assert.ok(err);
  assert.equal(err.agents.length, 3);
});

test('two separate write conflicts → two write_conflict errors', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: ['src/x.ts', 'src/y.ts'] }),
      validAgent({ label: 'B', writeFiles: ['src/x.ts', 'src/y.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const conflicts = r.errors.filter((e) => e.type === 'write_conflict');
  assert.equal(conflicts.length, 2);
});

// ─── Null agent elements (valid JSON, invalid agent) ───────────────────────

test('null element in agents array → missing_field errors for all required fields', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [null, validAgent({ label: 'B' })],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const labelErr = r.errors.find((e) => e.type === 'missing_field' && e.field === 'label' && e.agent === 'agent[0]');
  const modelErr = r.errors.find((e) => e.type === 'missing_field' && e.field === 'model' && e.agent === 'agent[0]');
  const goalErr  = r.errors.find((e) => e.type === 'missing_field' && e.field === 'goal'  && e.agent === 'agent[0]');
  assert.ok(labelErr, 'expected missing_field(label) for null element');
  assert.ok(modelErr, 'expected missing_field(model) for null element');
  assert.ok(goalErr,  'expected missing_field(goal) for null element');
});

// ─── Agent count edge cases ─────────────────────────────────────────────────

test('empty agents array → error no_agents, valid: false', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, { agents: [] });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === 'no_agents'));
});

test('agents key missing → error no_agents', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {});
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === 'no_agents'));
  assert.equal(r.agentCount, 0);
});

test('single agent → valid: true but warning single_agent', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [validAgent({ label: 'A' })],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.agentCount, 1);
  assert.ok(r.warnings.some((w) => w.type === 'single_agent'));
});

// ─── Output shape ───────────────────────────────────────────────────────────

test('output always contains valid, agentCount, errors, warnings', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [validAgent({ label: 'A' }), validAgent({ label: 'B' })],
  });
  const r = run(['--dispatch', p]);
  assert.ok('valid' in r);
  assert.ok('agentCount' in r);
  assert.ok(Array.isArray(r.errors));
  assert.ok(Array.isArray(r.warnings));
});

test('exit code is 0 even when valid: false', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, { agents: [] });
  // run() calls execFileSync which throws on non-zero exit — if this returns, exit was 0
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
});
