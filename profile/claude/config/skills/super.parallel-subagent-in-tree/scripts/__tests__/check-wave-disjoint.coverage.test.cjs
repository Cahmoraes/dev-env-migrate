'use strict';

/**
 * Coverage-focused tests for check-wave-disjoint.cjs.
 *
 * The companion check-wave-disjoint.test.cjs exercises the disjointness logic
 * (write-sets, overlaps, waves). This file drives the remaining CLI edges that
 * it does not touch: --help/-h output, argument-parsing errors, and the
 * defensive read-failure path — closing the 93-95, 102-103, 189-191 gaps so the
 * script reaches 100% line/function coverage.
 *
 * Run with: node --test super.parallel-subagent-in-tree/scripts/__tests__/check-wave-disjoint.coverage.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'check-wave-disjoint.cjs');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'check-wave-disjoint-cov-'));
}

/** Run the script and capture stdout for an expected exit-0 invocation. */
function runOk(args) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Run the script expecting a non-zero exit. Returns { status, stderr, stdout }
 * harvested from the thrown error so assertions can inspect the failure.
 */
function runFail(args) {
  try {
    execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return { status: err.status, stderr: err.stderr, stdout: err.stdout };
  }
  throw new assert.AssertionError({ message: 'expected the script to exit non-zero, but it succeeded' });
}

/** Minimal valid index file so we can reach main() past the existence check. */
function writeIndex(dir) {
  const content = ['# Tarefas: X', '', '## Tarefas', '- [ ] 1. Thing → `task-01.md`', ''].join('\n');
  const p = path.join(dir, 'tasks-x.md');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ─── --help / -h (covers lines 93-95 and the -h branch on 92) ──────────────

test('--help prints usage text to stdout and exits 0', () => {
  const out = runOk(['--help']);
  assert.match(out, /check-wave-disjoint\.cjs/u);
  assert.match(out, /Usage:/u);
  assert.match(out, /Provide exactly one/u);
});

test('-h is treated as an alias for --help (exit 0, prints usage)', () => {
  const out = runOk(['-h']);
  assert.match(out, /Usage:/u);
});

// ─── Unknown argument (covers lines 102-103) ───────────────────────────────

test('an unrecognized flag triggers a usage error and exits 1', () => {
  const r = runFail(['--bogus']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown argument: --bogus/u);
  assert.match(r.stderr, /Run with --help for usage\./u);
});

// ─── Argument-validation usage errors (branch coverage on 104-106) ─────────

test('missing --tasks-index is a usage error', () => {
  const r = runFail(['--tasks', '1']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--tasks-index <path> is required/u);
});

test('neither --tasks nor --wave is a usage error', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir);
    const r = runFail(['--tasks-index', index]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /provide --tasks <list> or --wave <N>/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a non-numeric --wave is rejected', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir);
    const r = runFail(['--tasks-index', index, '--wave', 'abc']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--wave must be a number/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a selection that resolves to zero task numbers is a usage error', () => {
  const dir = mkdir();
  try {
    const index = writeIndex(dir);
    const r = runFail(['--tasks-index', index, '--tasks', 'none-here']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no task numbers resolved from the selection/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a tasks index that does not exist on disk is reported', () => {
  const dir = mkdir();
  try {
    const r = runFail(['--tasks-index', path.join(dir, 'nope.md'), '--tasks', '1']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Tasks index not found:/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Defensive read failure (covers lines 188-191) ─────────────────────────
// A directory passes fs.existsSync but throws EISDIR on fs.readFileSync,
// deterministically driving the catch block without monkey-patching fs.

test('a tasks-index path that is a directory surfaces a read error', () => {
  const dir = mkdir();
  try {
    const r = runFail(['--tasks-index', dir, '--tasks', '1']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Error reading tasks index:/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
