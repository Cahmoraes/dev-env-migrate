'use strict';

/**
 * Line/function coverage for write-preferences.cjs.
 *
 * The script runs main() at load (no module export), so every branch is driven
 * as a subprocess (Node 24 captures subprocess coverage). These cases target the
 * argument/usage/round-trip/no-repo-root/write-error legs that the happy-path
 * suite in write-preferences.test.cjs does not reach.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/write-preferences.coverage.test.cjs
 *
 * Deliberately uncovered (defensive, not hacked around):
 *   - Lines 88-89: the readInput() stdin catch. fs.readFileSync(0) only throws
 *     when fd 0 is unreadable; with a real fd (or /dev/null) it returns '' rather
 *     than throwing, so the catch is unreachable without faking a broken stdin.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'write-preferences.cjs');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'write-prefs-cov-'));
}

// spawnSync so the exit-2 (round-trip) vs exit-1 (usage) distinction is assertable.
function run(args, opts = {}) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', ...opts });
}

// The script reads stdin via fs.readFileSync(0). Back it with a real fd so the
// read succeeds (spawnSync's `input` option is unreliable for direct fd reads).
function runStdin(args, stdinContent, opts = {}) {
  const tmp = path.join(os.tmpdir(), `stdin-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, stdinContent, 'utf8');
  const fd = fs.openSync(tmp, 'r');
  try {
    return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: [fd, 'pipe', 'pipe'], ...opts });
  } finally {
    fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
  }
}

function writeInput(root, obj) {
  const f = path.join(root, 'in.json');
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
  return f;
}

// ─── arg parsing / usage ───────────────────────────────────────────────────────

test('--help prints usage and exits 0', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(out, /write-preferences\.cjs/);
});

test('unknown argument → usage error, exit 1', () => {
  const r = run(['--bogus']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown argument: --bogus/);
});

test('--input-file pointing at a missing file → usage error, exit 1', () => {
  const root = mkRepo();
  try {
    const r = run(['--input-file', path.join(root, 'nope.json'), '--repo-root', root]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /input file not found/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid JSON in --input-file → usage error, exit 1', () => {
  const root = mkRepo();
  try {
    const f = writeInput(root, 'definitely not json');
    const r = run(['--input-file', f, '--repo-root', root]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not valid JSON/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── input acquisition ─────────────────────────────────────────────────────────

test('reads preferences from stdin (no --input-file) and writes them', () => {
  const root = mkRepo();
  try {
    const r = runStdin(['--repo-root', root], JSON.stringify({ communication: { language: 'es' } }));
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout.slice(r.stdout.lastIndexOf('\n{') + 1));
    assert.equal(out.written, true);
    assert.equal(out.preferences.communication.language, 'es');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('empty input file → all defaults are written', () => {
  const root = mkRepo();
  try {
    const f = writeInput(root, ''); // empty → readInput returns {} → defaults
    const r = run(['--input-file', f, '--repo-root', root]);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout.slice(r.stdout.lastIndexOf('\n{') + 1));
    assert.equal(out.written, true);
    assert.equal(out.preferences.communication.language, 'pt-BR');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--dry-run prints the rendered YAML and result without writing', () => {
  const root = mkRepo();
  try {
    const f = writeInput(root, { communication: { language: 'es' } });
    const r = run(['--input-file', f, '--repo-root', root, '--dry-run']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^# Superpowers Workflow Preferences/m);
    assert.match(r.stdout, /language: es/);
    const out = JSON.parse(r.stdout.slice(r.stdout.lastIndexOf('\n{') + 1));
    assert.equal(out.written, false);
    assert.equal(out.dryRun, true);
    assert.equal(fs.existsSync(path.join(root, '.superpowers', 'preferences.yml')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── round-trip validation failure ─────────────────────────────────────────────

test('a value that the parser would mangle fails round-trip validation, exit 2', () => {
  const root = mkRepo();
  try {
    // " #" in a value is stripped as an inline comment on re-parse, so the
    // reparsed value diverges from intended → roundTripValid:false → exit 2.
    const f = writeInput(root, { communication: { language: 'pt #BR' } });
    const r = run(['--input-file', f, '--repo-root', root]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /round-trip validation failed/);
    const out = JSON.parse(r.stdout);
    assert.equal(out.written, false);
    assert.equal(out.roundTripValid, false);
    assert.equal(fs.existsSync(path.join(root, '.superpowers', 'preferences.yml')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── repo-root resolution failure ──────────────────────────────────────────────

test('no repo root and not --dry-run → usage error, exit 1', () => {
  const nonGit = mkRepo(); // not a git repo, no --repo-root
  try {
    const r = runStdin([], '{}', { cwd: nonGit });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /repository root not found/);
  } finally {
    fs.rmSync(nonGit, { recursive: true, force: true });
  }
});

// ─── write failure ─────────────────────────────────────────────────────────────

test('.superpowers occupied by a file → write fails, exit 1', () => {
  const root = mkRepo();
  try {
    // .superpowers exists as a FILE → mkdirSync(dirname) throws → write catch.
    fs.writeFileSync(path.join(root, '.superpowers'), 'blocker', 'utf8');
    const f = writeInput(root, {});
    const r = run(['--input-file', f, '--repo-root', root]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Error writing preferences/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
