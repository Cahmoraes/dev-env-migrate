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

// ─── Tier↔model equality gate ───────────────────────────────────────────────

test('cheap tier dispatched with the tier model → valid, no mismatch', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    modelTiers: { cheap: 'haiku', standard: 'sonnet', capable: 'sonnet' },
    agents: [
      validAgent({ label: 'A', model: 'haiku', tier: 'cheap' }),
      validAgent({ label: 'B', model: 'haiku', tier: 'cheap' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.type === 'tier_model_mismatch').length, 0);
});

test('cheap tier dispatched with a higher model and NO escalation → tier_model_mismatch', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    modelTiers: { cheap: 'haiku', standard: 'sonnet', capable: 'sonnet' },
    agents: [
      validAgent({ label: 'A', model: 'haiku', tier: 'cheap' }),
      validAgent({ label: 'DriftedTask', model: 'sonnet', tier: 'cheap' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.type === 'tier_model_mismatch');
  assert.ok(err, 'expected tier_model_mismatch');
  assert.equal(err.agent, 'DriftedTask');
  assert.equal(err.tier, 'cheap');
  assert.equal(err.expected, 'haiku');
  assert.equal(err.actual, 'sonnet');
});

test('cheap tier + higher model WITH escalationReason → warning tier_escalation, valid stays true', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    modelTiers: { cheap: 'haiku', standard: 'sonnet', capable: 'sonnet' },
    agents: [
      validAgent({ label: 'A', model: 'haiku', tier: 'cheap' }),
      validAgent({
        label: 'Escalated',
        model: 'sonnet',
        tier: 'cheap',
        escalationReason: 'haiku returned BLOCKED: needs more reasoning for the recursive merge',
      }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.type === 'tier_model_mismatch').length, 0);
  const w = r.warnings.find((w) => w.type === 'tier_escalation');
  assert.ok(w, 'expected tier_escalation warning recording the audit trail');
  assert.equal(w.agent, 'Escalated');
  assert.equal(w.expected, 'haiku');
  assert.equal(w.actual, 'sonnet');
  assert.match(w.reason, /BLOCKED/);
});

test('tier resolving to "auto" → no equality enforced (harness picks)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    modelTiers: { cheap: 'auto', standard: 'auto', capable: 'auto' },
    agents: [
      validAgent({ label: 'A', model: 'whatever-harness-chose', tier: 'cheap' }),
      validAgent({ label: 'B', model: 'other-model', tier: 'standard' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.type === 'tier_model_mismatch').length, 0);
});

test('no modelTiers map → gate falls back to per-agent expectedModel', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'Ok', model: 'haiku', tier: 'cheap', expectedModel: 'haiku' }),
      validAgent({ label: 'Bad', model: 'sonnet', tier: 'cheap', expectedModel: 'haiku' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === 'tier_model_mismatch' && e.agent === 'Bad'));
});

test('agent without a tier field → gate skipped (backward compatible)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    modelTiers: { cheap: 'haiku', standard: 'sonnet', capable: 'sonnet' },
    agents: [
      validAgent({ label: 'A', model: 'sonnet' }),
      validAgent({ label: 'B', model: 'sonnet' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.type === 'tier_model_mismatch').length, 0);
});

test('empty model with a tier → only empty_model, no tier_model_mismatch (no double report)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    modelTiers: { cheap: 'haiku' },
    agents: [
      validAgent({ label: 'A', model: '', tier: 'cheap' }),
      validAgent({ label: 'B', model: 'haiku', tier: 'cheap' }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.type === 'empty_model' && e.agent === 'A'));
  assert.equal(r.errors.filter((e) => e.type === 'tier_model_mismatch').length, 0);
});

// ─── Read∩write hazard + unverifiable write-set (parity with check-wave-disjoint) ──

test('one agent reads a file another writes → read_write_hazard error', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'Writer', writeFiles: ['src/api-types.ts'] }),
      validAgent({ label: 'Reader', writeFiles: ['src/hooks.ts'], readFiles: ['src/api-types.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const hz = r.errors.find((e) => e.type === 'read_write_hazard');
  assert.ok(hz, 'expected read_write_hazard');
  assert.equal(hz.writer, 'Writer');
  assert.equal(hz.reader, 'Reader');
  assert.equal(hz.file, 'src/api-types.ts');
});

test('same agent reads and writes the same file → no self read_write_hazard', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: ['src/a.ts'], readFiles: ['src/a.ts'] }),
      validAgent({ label: 'B', writeFiles: ['src/b.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.errors.filter((e) => e.type === 'read_write_hazard').length, 0);
});

test('reads that no one writes → no hazard (backward compatible)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: ['src/a.ts'], readFiles: ['src/shared-const.ts'] }),
      validAgent({ label: 'B', writeFiles: ['src/b.ts'], readFiles: ['src/shared-const.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.type === 'read_write_hazard').length, 0);
});

test('enforceWriteSets: agent with no writeFiles in a 2+ dispatch → unverifiable_writeset', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    enforceWriteSets: true,
    agents: [
      validAgent({ label: 'HasSet', writeFiles: ['src/a.ts'] }),
      validAgent({ label: 'NoSet', writeFiles: [] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, false);
  const u = r.errors.find((e) => e.type === 'unverifiable_writeset');
  assert.ok(u, 'expected unverifiable_writeset');
  assert.equal(u.agent, 'NoSet');
});

test('enforceWriteSets absent → empty writeFiles is still valid (backward compatible)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: [] }),
      validAgent({ label: 'B', writeFiles: [] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.type === 'unverifiable_writeset').length, 0);
});

test('enforceWriteSets with all agents declaring write-sets → valid', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    enforceWriteSets: true,
    agents: [
      validAgent({ label: 'A', writeFiles: ['src/a.ts'] }),
      validAgent({ label: 'B', writeFiles: ['src/b.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.filter((e) => e.type === 'unverifiable_writeset').length, 0);
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

// ─── readOnly agents: making the mixed reviewer+implementer dispatch declarable ──
// A reviewer writes nothing, so `enforceWriteSets` flagged it `unverifiable_writeset`
// and blocked the dispatch — even though a non-writer is trivially disjoint from every
// writer. The only way to declare a wave that reviews task N while implementing task M
// was to fail the gate, so the gate got skipped entirely for those waves instead
// (observed: 3 of 6 parallel waves dispatched with no disjointness proof at all).
// `readOnly: true` states the intent, exempts the agent from the write-set proof it
// cannot supply, and keeps it in the read∩write hazard check where it belongs.

test('readOnly agent is exempt from unverifiable_writeset under enforceWriteSets', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    enforceWriteSets: true,
    agents: [
      validAgent({ label: 'Implement Task 17', writeFiles: ['src/a.ts'] }),
      validAgent({ label: 'Combined review Task 12', readOnly: true, readFiles: ['src/b.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(
    r.errors.filter((e) => e.type === 'unverifiable_writeset').length, 0,
    'a declared read-only agent has no write-set to prove — it must not be flagged',
  );
  assert.equal(r.valid, true, 'the mixed reviewer+implementer wave must be declarable');
});

test('a non-readOnly agent with no writeFiles is still flagged (the exemption is opt-in)', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    enforceWriteSets: true,
    agents: [
      validAgent({ label: 'Implement Task 17', writeFiles: ['src/a.ts'] }),
      validAgent({ label: 'Implement Task 18', writeFiles: [] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.ok(
    r.errors.find((e) => e.type === 'unverifiable_writeset'),
    'silence about a write-set is still unprovable — only an explicit readOnly claim exempts',
  );
});

test('readOnly agent still participates in the read∩write hazard check', () => {
  // The whole point: a reviewer reading a file a concurrent implementer is rewriting
  // reads a half-written tree. Exempting it from the write proof must not exempt it
  // from the hazard it is actually exposed to.
  const dir = tmpDir();
  const p = writeManifest(dir, {
    enforceWriteSets: true,
    agents: [
      validAgent({ label: 'Implement Task 19', writeFiles: ['src/shared.ts'] }),
      validAgent({ label: 'Review Task 17', readOnly: true, readFiles: ['src/shared.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  const h = r.errors.find((e) => e.type === 'read_write_hazard');
  assert.ok(h, 'expected read_write_hazard for the reviewer reading a concurrently-written file');
  assert.equal(h.writer, 'Implement Task 19');
  assert.equal(h.reader, 'Review Task 17');
  assert.equal(r.valid, false);
});

test('readOnly agent declaring writeFiles is a contradiction, not a silent override', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    enforceWriteSets: true,
    agents: [
      validAgent({ label: 'Implement Task 1', writeFiles: ['src/a.ts'] }),
      validAgent({ label: 'Review Task 1', readOnly: true, writeFiles: ['src/b.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.ok(
    r.errors.find((e) => e.type === 'readonly_with_writeset' && e.agent === 'Review Task 1'),
    'declaring both readOnly and a write-set must fail loudly — one of the two is wrong',
  );
  assert.equal(r.valid, false);
});

test('readOnly is backward compatible: absent field behaves exactly as before', () => {
  const dir = tmpDir();
  const p = writeManifest(dir, {
    agents: [
      validAgent({ label: 'A', writeFiles: ['src/a.ts'] }),
      validAgent({ label: 'B', writeFiles: ['src/b.ts'] }),
    ],
  });
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true);
  assert.equal(r.errors.length, 0);
});

// --- --help carries a manifest skeleton that actually validates -------------
// The skeleton exists so a controller never has to read this script's source to
// learn the manifest shape (measured: a dry-run spent a --help call, a grep of
// the source, and still shipped a manifest missing a required field). A prose
// example drifts silently; this guard executes it, so it cannot.

function helpSkeleton() {
  const help = runRaw(['--help']);
  const lines = help.split('\n');
  const start = lines.findIndex((l) => /Manifest skeleton/.test(l));
  assert.ok(start !== -1, '--help must carry a "Manifest skeleton" block');
  const body = [];
  let depth = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!body.length && !/\{/.test(l)) continue;
    body.push(l);
    depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    if (depth === 0) break;
  }
  assert.ok(body.length && depth === 0, '--help skeleton block must be a balanced JSON object');
  return JSON.parse(body.join('\n'));
}

test('the --help manifest skeleton is valid JSON and passes the gate as written', () => {
  const skeleton = helpSkeleton();
  const dir = tmpDir();
  const p = writeManifest(dir, skeleton);
  const r = run(['--dispatch', p]);
  assert.equal(r.valid, true, `skeleton rejected: ${JSON.stringify(r.errors)}`);
  assert.equal(r.errors.length, 0);
});

test('the --help skeleton still passes when grown into a real 2-agent wave', () => {
  const skeleton = helpSkeleton();
  const second = JSON.parse(JSON.stringify(skeleton.agents[0]));
  second.label = 'task-02-implementer';
  second.writeFiles = ['src/b.ts'];
  second.readFiles = [];
  skeleton.agents.push(second);
  const dir = tmpDir();
  const r = run(['--dispatch', writeManifest(dir, skeleton)]);
  assert.equal(r.valid, true, `grown skeleton rejected: ${JSON.stringify(r.errors)}`);
  assert.equal(r.warnings.filter((w) => w.type === 'single_agent').length, 0);
});

test('the --help skeleton names every field the gate requires', () => {
  const help = runRaw(['--help']);
  for (const field of ['modelTiers', 'enforceWriteSets', 'agents', 'label', 'model', 'goal', 'tier', 'escalationReason', 'writeFiles', 'readFiles', 'readOnly']) {
    assert.match(help, new RegExp(`\\b${field}\\b`), `--help must document "${field}"`);
  }
});

test('the --help skeleton names no concrete vendor model (tiers stay abstract)', () => {
  const help = runRaw(['--help']);
  const block = help.slice(help.indexOf('Manifest skeleton'));
  // The tier->model map is per-harness and per-vendor; it comes from the consuming
  // repo's preferences. A worked example naming one vendor's models reads as the
  // rule and couples every consumer to that vendor.
  for (const vendorModel of ['haiku', 'sonnet', 'opus', 'gpt-', 'gemini', 'claude-', 'kimi', 'llama', 'mistral', 'grok', 'deepseek']) {
    assert.doesNotMatch(block, new RegExp(vendorModel, 'i'), `--help must not name the concrete model "${vendorModel}"`);
  }
  assert.match(block, /model_tiers/, '--help must point at the preferences model_tiers map instead');
});

test('the SKILL.md manifest example names no concrete vendor model either', () => {
  const skill = fs.readFileSync(path.resolve(__dirname, '..', '..', 'SKILL.md'), 'utf8');
  const fences = [...skill.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
  const manifest = fences.filter((f) => f.includes('modelTiers'));
  assert.ok(manifest.length >= 1, 'SKILL.md must still carry a modelTiers manifest example');
  for (const f of manifest) {
    for (const vendorModel of ['haiku', 'sonnet', 'opus', 'gpt-', 'gemini', 'claude-', 'kimi', 'llama', 'mistral', 'grok', 'deepseek']) {
      assert.doesNotMatch(f, new RegExp(vendorModel, 'i'), `the manifest example must not name "${vendorModel}" — tiers are abstract and the map is per-harness`);
    }
  }
});
