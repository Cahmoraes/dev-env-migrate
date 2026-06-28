'use strict';

/**
 * Coverage top-up for check-pmem-deps.cjs — exercises the branches the original
 * suite leaves uncovered (uncovered lines 79-81 and 119-120):
 *   - parseArgs --help / -h (prints HELP, exit 0)
 *   - checkModules JSON.parse failure path (probe emits non-JSON → returns null)
 *
 * Same house style as check-pmem-deps.test.cjs: fake python shims in a tmpdir,
 * CLI invoked via execFileSync, JSON parsed off stdout. No real Python needed.
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

/** Run the CLI; return raw stdout/stderr + exit code (no JSON assumption). */
function runRaw(args) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status, stdout: `${err.stdout || ''}`, stderr: `${err.stderr || ''}` };
  }
}

function run(args) {
  const r = runRaw(args);
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

/**
 * Fake python whose `--version` works but whose `-c` probe prints garbage, so
 * checkModules' JSON.parse throws and the catch returns null (lines 119-120).
 */
function makeBadJsonPython() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-pmem-badjson-'));
  const bin = path.join(dir, 'fake-python3');
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "Python 3.12.0 (fake)"; exit 0; fi
# -c probe answers with output that is NOT valid JSON
echo 'definitely not json {{{'
`,
    { mode: 0o755 },
  );
  return { dir, bin };
}

test('--help prints usage and exits 0 (lines 79-81)', () => {
  const r = runRaw(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /check-pmem-deps\.cjs/);
  assert.match(r.stdout, /Usage:/);
});

test('-h is an alias for --help and exits 0', () => {
  const r = runRaw(['-h']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /check-pmem-deps\.cjs/);
});

test('non-JSON module probe → checkModules returns null → reported as python missing (lines 119-120)', () => {
  const { dir, bin } = makeBadJsonPython();
  try {
    const r = run(['--python', bin]);
    assert.equal(r.code, 0);
    // --version succeeded so the interpreter is reported as available...
    assert.equal(r.json.pythonAvailable, true);
    // ...but the unparseable probe makes checkModules return null, so buildReport
    // takes the "cannot check" path: all module flags null, missing=[python3].
    assert.equal(r.json.modules.numpy, null);
    assert.equal(r.json.modules.sentence_transformers, null);
    assert.equal(r.json.modules.sqlite_vec, null);
    assert.deepEqual(r.json.missing, ['python3']);
    assert.equal(r.json.coreAvailable, false);
    assert.equal(r.json.installCommand, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
