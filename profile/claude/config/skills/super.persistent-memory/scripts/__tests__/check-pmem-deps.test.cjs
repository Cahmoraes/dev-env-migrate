'use strict';

/**
 * Tests for check-pmem-deps.cjs — pmem availability probe.
 *
 * The machine's real Python environment is irrelevant here: every scenario uses a
 * fake interpreter shim written to a tmpdir, so results are deterministic on any
 * runner (with or without python3/numpy/sentence-transformers installed).
 *
 * Run with: node --test super.persistent-memory/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-pmem-deps.cjs');

/** Write a fake python interpreter that reports the given module availability. */
function makeFakePython(modules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-pmem-'));
  const bin = path.join(dir, 'fake-python3');
  const payload = JSON.stringify(modules).replace(/'/g, "'\\''");
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "Python 3.12.0 (fake)"; exit 0; fi
# any -c probe answers with the canned module map
echo '${payload}'
`,
    { mode: 0o755 },
  );
  return { dir, bin };
}

function run(args) {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, json: JSON.parse(out) };
  } catch (err) {
    return { code: err.status, json: err.stdout ? JSON.parse(err.stdout) : null, stderr: err.stderr };
  }
}

test('is requireable as a module with stable exports', () => {
  const mod = require(SCRIPT);
  assert.equal(typeof mod.buildReport, 'function');
  assert.equal(typeof mod.checkPython, 'function');
  assert.equal(typeof mod.checkModules, 'function');
  assert.deepEqual(mod.REQUIRED_MODULES, ['numpy', 'sentence_transformers']);
  assert.deepEqual(mod.OPTIONAL_MODULES, ['sqlite_vec']);
});

test('python missing → coreAvailable false, missing=[python3], no installCommand, exit 0', () => {
  const r = run(['--python', '/nonexistent/definitely-not-python']);
  assert.equal(r.code, 0); // availability lives in the JSON, not the exit code
  assert.equal(r.json.pythonAvailable, false);
  assert.equal(r.json.coreAvailable, false);
  assert.equal(r.json.fullyAvailable, false);
  assert.deepEqual(r.json.missing, ['python3']);
  assert.equal(r.json.installCommand, null); // pip cannot install Python itself
  assert.equal(r.json.modules.numpy, null); // unknown — could not probe
});

test('everything installed → fullyAvailable, nothing missing, no installCommand', () => {
  const { dir, bin } = makeFakePython({ numpy: true, sentence_transformers: true, sqlite_vec: true });
  try {
    const r = run(['--python', bin]);
    assert.equal(r.code, 0);
    assert.equal(r.json.pythonAvailable, true);
    assert.equal(r.json.coreAvailable, true);
    assert.equal(r.json.embeddingAvailable, true);
    assert.equal(r.json.fullyAvailable, true);
    assert.deepEqual(r.json.missing, []);
    assert.equal(r.json.installCommand, null);
    assert.deepEqual(r.json.notes, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('numpy missing → core unavailable, installCommand uses pip package names', () => {
  const { dir, bin } = makeFakePython({ numpy: false, sentence_transformers: false, sqlite_vec: false });
  try {
    const r = run(['--python', bin]);
    assert.equal(r.code, 0);
    assert.equal(r.json.coreAvailable, false);
    assert.equal(r.json.fullyAvailable, false);
    assert.deepEqual(r.json.missing, ['numpy', 'sentence_transformers']);
    // pip names, not python module names (sentence-transformers, not sentence_transformers)
    assert.equal(r.json.installCommand, `${bin} -m pip install numpy sentence-transformers`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('only sentence_transformers missing → core ok, embedding unavailable, targeted install', () => {
  const { dir, bin } = makeFakePython({ numpy: true, sentence_transformers: false, sqlite_vec: true });
  try {
    const r = run(['--python', bin]);
    assert.equal(r.json.coreAvailable, true);
    assert.equal(r.json.embeddingAvailable, false);
    assert.equal(r.json.fullyAvailable, false);
    assert.deepEqual(r.json.missing, ['sentence_transformers']);
    assert.equal(r.json.installCommand, `${bin} -m pip install sentence-transformers`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sqlite_vec missing alone → still fullyAvailable (optional), only a note', () => {
  const { dir, bin } = makeFakePython({ numpy: true, sentence_transformers: true, sqlite_vec: false });
  try {
    const r = run(['--python', bin]);
    assert.equal(r.json.fullyAvailable, true);
    assert.deepEqual(r.json.missing, []); // never blocks the gate
    assert.equal(r.json.installCommand, null);
    assert.equal(r.json.notes.length, 1);
    assert.match(r.json.notes[0], /sqlite-vec/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown argument → usage error, exit 1', () => {
  const r = run(['--bogus']);
  assert.equal(r.code, 1);
  assert.match(`${r.stderr}`, /Unknown argument/);
});

test('buildReport is pure: same inputs → same report (no Date/random/env dependence)', () => {
  const { buildReport } = require(SCRIPT);
  const probe = { available: true, version: 'Python 3.12.0' };
  const modules = { numpy: true, sentence_transformers: false, sqlite_vec: false };
  const a = buildReport('python3', probe, modules);
  const b = buildReport('python3', probe, modules);
  assert.deepEqual(a, b);
  assert.equal(a.installCommand, 'python3 -m pip install sentence-transformers');
});
