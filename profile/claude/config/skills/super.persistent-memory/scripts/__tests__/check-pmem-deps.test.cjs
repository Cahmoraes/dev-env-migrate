'use strict';

/**
 * Tests for check-pmem-deps.cjs — pmem availability + version probe.
 *
 * The machine's real Python environment is irrelevant here: every scenario uses a
 * fake interpreter shim written to a tmpdir, so results are deterministic on any
 * runner (with or without python3/numpy/sentence-transformers installed). Version
 * floors come from a temp requirements.txt so tests never couple to the shipped one.
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

/**
 * Write a fake python interpreter that reports the given module map.
 * `modules` is { module: { present: bool, version: string|null } }.
 */
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

/** Write a temp requirements.txt with the given pip floors; return its path. */
function makeReq(dir, lines) {
  const p = path.join(dir, 'requirements.txt');
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

function run(args) {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, json: JSON.parse(out) };
  } catch (err) {
    return { code: err.status, json: err.stdout ? JSON.parse(err.stdout) : null, stderr: err.stderr };
  }
}

const FLOORS = ['numpy>=1.26', 'sentence-transformers>=5.6.0'];
const CURRENT = { present: true, version: '9.9.9' }; // safely above any floor

test('is requireable as a module with stable exports', () => {
  const mod = require(SCRIPT);
  assert.equal(typeof mod.buildReport, 'function');
  assert.equal(typeof mod.checkPython, 'function');
  assert.equal(typeof mod.checkModules, 'function');
  assert.equal(typeof mod.parseFloors, 'function');
  assert.equal(typeof mod.compareVersions, 'function');
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
  assert.equal(r.json.versions.numpy, null);
});

test('everything installed and current → fullyAvailable, nothing missing/outdated, no installCommand', () => {
  const { dir, bin } = makeFakePython({ numpy: CURRENT, sentence_transformers: CURRENT, sqlite_vec: CURRENT });
  try {
    const req = makeReq(dir, FLOORS);
    const r = run(['--python', bin, '--requirements', req]);
    assert.equal(r.code, 0);
    assert.equal(r.json.pythonAvailable, true);
    assert.equal(r.json.coreAvailable, true);
    assert.equal(r.json.embeddingAvailable, true);
    assert.equal(r.json.fullyAvailable, true);
    assert.deepEqual(r.json.missing, []);
    assert.deepEqual(r.json.outdated, []);
    assert.equal(r.json.installCommand, null);
    assert.deepEqual(r.json.notes, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('numpy + sentence_transformers missing → core unavailable, installCommand uses -r requirements', () => {
  const { dir, bin } = makeFakePython({
    numpy: { present: false, version: null },
    sentence_transformers: { present: false, version: null },
    sqlite_vec: { present: false, version: null },
  });
  try {
    const req = makeReq(dir, FLOORS);
    const r = run(['--python', bin, '--requirements', req]);
    assert.equal(r.code, 0);
    assert.equal(r.json.coreAvailable, false);
    assert.equal(r.json.fullyAvailable, false);
    assert.deepEqual(r.json.missing, ['numpy', 'sentence_transformers']);
    assert.equal(r.json.installCommand, `${bin} -m pip install -r ${req}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('only sentence_transformers missing → core ok, embedding unavailable, -r install', () => {
  const { dir, bin } = makeFakePython({
    numpy: CURRENT,
    sentence_transformers: { present: false, version: null },
    sqlite_vec: CURRENT,
  });
  try {
    const req = makeReq(dir, FLOORS);
    const r = run(['--python', bin, '--requirements', req]);
    assert.equal(r.json.coreAvailable, true);
    assert.equal(r.json.embeddingAvailable, false);
    assert.equal(r.json.fullyAvailable, false);
    assert.deepEqual(r.json.missing, ['sentence_transformers']);
    assert.equal(r.json.installCommand, `${bin} -m pip install -r ${req}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('present but below floor → outdated, fullyAvailable still true, recommend note', () => {
  const { dir, bin } = makeFakePython({
    numpy: { present: true, version: '1.20.0' }, // below 1.26
    sentence_transformers: CURRENT,
    sqlite_vec: CURRENT,
  });
  try {
    const req = makeReq(dir, FLOORS);
    const r = run(['--python', bin, '--requirements', req]);
    assert.equal(r.json.coreAvailable, true);
    assert.equal(r.json.fullyAvailable, true); // present → usable, just stale
    assert.deepEqual(r.json.missing, []);
    assert.deepEqual(r.json.outdated, ['numpy']);
    assert.equal(r.json.installCommand, `${bin} -m pip install -r ${req}`);
    assert.equal(r.json.notes.length, 1);
    assert.match(r.json.notes[0], /below the tested minimum/);
    assert.match(r.json.notes[0], /numpy 1\.20\.0 < 1\.26/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sqlite_vec missing alone → still fullyAvailable (optional), only a note', () => {
  const { dir, bin } = makeFakePython({
    numpy: CURRENT,
    sentence_transformers: CURRENT,
    sqlite_vec: { present: false, version: null },
  });
  try {
    const req = makeReq(dir, FLOORS);
    const r = run(['--python', bin, '--requirements', req]);
    assert.equal(r.json.fullyAvailable, true);
    assert.deepEqual(r.json.missing, []); // never blocks the gate
    assert.deepEqual(r.json.outdated, []);
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

test('parseFloors reads >= bounds, ignores comments and non->= specs', () => {
  const { parseFloors } = require(SCRIPT);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-pmem-floors-'));
  try {
    const req = makeReq(dir, [
      '# a comment',
      'numpy>=1.26',
      'sentence-transformers >= 5.6.0',
      '# sqlite-vec>=0.1.6   (optional, commented)',
    ]);
    const floors = parseFloors(req);
    assert.equal(floors.numpy, '1.26');
    assert.equal(floors.sentence_transformers, '5.6.0');
    assert.equal(floors.sqlite_vec, undefined); // commented → not a floor
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parseFloors on a missing file returns {} (graceful, no throw)', () => {
  const { parseFloors } = require(SCRIPT);
  assert.deepEqual(parseFloors('/nonexistent/requirements.txt'), {});
});

test('compareVersions orders dotted versions and ignores non-numeric suffixes', () => {
  const { compareVersions } = require(SCRIPT);
  assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.26'), 1);
  assert.equal(compareVersions('5.6.0', '5.6.0'), 0);
  assert.equal(compareVersions('2.12.1+cu130', '2.12.0'), 1);
  assert.equal(compareVersions('1.26', '1.26.0'), 0);
});

test('buildReport is pure: same inputs → same report (no Date/random/env dependence)', () => {
  const { buildReport, DEFAULT_REQUIREMENTS } = require(SCRIPT);
  const pythonProbe = { available: true, version: 'Python 3.12.0' };
  const probe = {
    numpy: { present: true, version: '9.9.9' },
    sentence_transformers: { present: false, version: null },
    sqlite_vec: { present: false, version: null },
  };
  const floors = { numpy: '1.26', sentence_transformers: '5.6.0' };
  const a = buildReport('python3', pythonProbe, probe, floors, DEFAULT_REQUIREMENTS);
  const b = buildReport('python3', pythonProbe, probe, floors, DEFAULT_REQUIREMENTS);
  assert.deepEqual(a, b);
  assert.equal(a.installCommand, `python3 -m pip install -r ${DEFAULT_REQUIREMENTS}`);
});
