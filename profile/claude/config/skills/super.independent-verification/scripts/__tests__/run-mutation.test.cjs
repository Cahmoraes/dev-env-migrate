'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'run-mutation.cjs');

function run(args) {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
    return { code: 0, json: JSON.parse(out.trim().split('\n').pop()) };
  } catch (e) {
    const out = (e.stdout || '').toString().trim();
    let json = null;
    try { json = JSON.parse(out.split('\n').pop()); } catch (_) { /* noop */ }
    return { code: e.status, json };
  }
}

function tmpFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-'));
  const f = path.join(dir, 'subject.txt');
  fs.writeFileSync(f, contents);
  return f;
}

// The "test command" checks the file still contains the ORIGINAL token. Under a
// mutation that changes the token, the check fails (exit != 0) => mutant KILLED.
function guardCmd(file, token) {
  return `node -e "const fs=require('fs');process.exit(fs.readFileSync('${file}','utf8').includes('${token}')?0:1)"`;
}

test('mutant is KILLED when the guard test detects the change', () => {
  const file = tmpFile('const limit = 100;\n');
  const r = run(['--file', file, '--find', '100', '--replace', '999', '--test', guardCmd(file, '100')]);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json.killed, true);
  assert.strictEqual(r.json.survived, false);
  assert.notStrictEqual(r.json.testExitCode, 0);
});

test('mutant SURVIVES when the guard test passes regardless', () => {
  const file = tmpFile('const limit = 100;\n');
  // Guard always exits 0 -> the fault is not detected.
  const r = run(['--file', file, '--find', '100', '--replace', '999', '--test', 'node -e "process.exit(0)"']);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json.killed, false);
  assert.strictEqual(r.json.survived, true);
  assert.strictEqual(r.json.testExitCode, 0);
});

test('working tree is restored byte-identical after the cycle', () => {
  const before = 'const limit = 100;\nreturn limit;\n';
  const file = tmpFile(before);
  run(['--file', file, '--find', '100', '--replace', '999', '--test', 'node -e "process.exit(1)"']);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
});

test('restored flag is true on a normal cycle', () => {
  const file = tmpFile('x = 1;\n');
  const r = run(['--file', file, '--find', '1', '--replace', '2', '--test', 'node -e "process.exit(1)"']);
  assert.strictEqual(r.json.restored, true);
});

test('--line scopes the mutation to that line only', () => {
  const before = 'a = 1;\nb = 1;\n'; // "1" appears on both lines
  const file = tmpFile(before);
  const r = run(['--file', file, '--line', '2', '--find', '1', '--replace', '9', '--test', 'node -e "process.exit(1)"']);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.json.line, 2);
  // restored, so the file is unchanged; correctness of line-scoping is covered by unit test below
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
});

test('exit 2 when --find is not present', () => {
  const file = tmpFile('hello\n');
  const r = run(['--file', file, '--find', 'nope', '--replace', 'x', '--test', 'true']);
  assert.strictEqual(r.code, 2);
  assert.ok(r.json.error);
});

test('exit 2 when a required arg is missing', () => {
  const r = run(['--file', '/tmp/whatever', '--find', 'a', '--replace', 'b']); // no --test
  assert.strictEqual(r.code, 2);
});

test('unit: mutate() replaces only the first occurrence in file mode', () => {
  const { mutate } = require('..' + path.sep + 'run-mutation.cjs');
  const { mutated, applied } = mutate('x1 y1 z1', '1', '9');
  assert.strictEqual(applied, true);
  assert.strictEqual(mutated, 'x9 y1 z1');
});

test('unit: mutate() with line only touches that line', () => {
  const { mutate } = require('..' + path.sep + 'run-mutation.cjs');
  const { mutated, applied } = mutate('a1\nb1\nc1', '1', '9', 2);
  assert.strictEqual(applied, true);
  assert.strictEqual(mutated, 'a1\nb9\nc1');
});
