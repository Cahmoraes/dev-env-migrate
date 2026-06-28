'use strict';

/**
 * Tests for frontmatter-utils.cjs — read/update markdown YAML frontmatter.
 *
 * Run with: node --test super.brainstorming/scripts/__tests__/frontmatter-utils.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'frontmatter-utils.cjs');
const { parseFrontmatter, parseScalar, serializeScalar } = require('../frontmatter-utils.cjs');

function mkfile(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontmatter-'));
  const file = path.join(dir, 'doc.md');
  fs.writeFileSync(file, body);
  return file;
}

function runJson(args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

// ─── Unit: exported helpers ─────────────────────────────────────────────────

test('parseScalar coerces booleans, numbers, null, and quoted strings', () => {
  assert.equal(parseScalar('true'), true);
  assert.equal(parseScalar('false'), false);
  assert.equal(parseScalar('null'), null);
  assert.equal(parseScalar(''), null);
  assert.equal(parseScalar('42'), 42);
  assert.equal(parseScalar('-3.5'), -3.5);
  assert.equal(parseScalar('"hello"'), 'hello');
  assert.equal(parseScalar("'world'"), 'world');
  assert.equal(parseScalar('bare'), 'bare');
});

test('serializeScalar round-trips with parseScalar for tricky values', () => {
  assert.equal(serializeScalar(true), 'true');
  assert.equal(serializeScalar(null), 'null');
  assert.equal(serializeScalar(7), '7');
  // ISO datetime has colons → must be quoted to survive a re-parse.
  const iso = '2026-05-07T16:54:36-03:00';
  assert.equal(parseScalar(serializeScalar(iso)), iso);
});

test('parseFrontmatter extracts entries and reports absence', () => {
  const parsed = parseFrontmatter('---\ncreated_at: "2026-01-01T00:00:00-03:00"\ntitle: hi\n---\n\nbody\n');
  assert.equal(parsed.hasFrontmatter, true);
  assert.equal(parsed.values.title, 'hi');
  assert.equal(parsed.values.created_at, '2026-01-01T00:00:00-03:00');
  assert.match(parsed.body, /body/);

  const none = parseFrontmatter('# just a heading\n');
  assert.equal(none.hasFrontmatter, false);
});

test('parseFrontmatter throws on missing closing delimiter', () => {
  assert.throws(() => parseFrontmatter('---\nkey: value\nno closing\n'), /closing delimiter/);
});

// ─── CLI: get / set ─────────────────────────────────────────────────────────

test('--get-key returns the value when present', () => {
  const file = mkfile('---\nstatus: draft\n---\n\nbody\n');
  const result = runJson(['--file', file, '--get-key', 'status']);
  assert.equal(result.found, true);
  assert.equal(result.value, 'draft');
});

test('--get-key on a missing file returns found:false without error', () => {
  const result = runJson(['--file', '/nonexistent/path/doc.md', '--get-key', 'created_at']);
  assert.equal(result.found, false);
  assert.equal(result.hasFrontmatter, false);
});

test('--set-key preserves created_at while updating updated_at (the canonical use case)', () => {
  const file = mkfile('---\ncreated_at: "2026-01-01T00:00:00-03:00"\nupdated_at: "2026-01-01T00:00:00-03:00"\n---\n\nbody\n');
  runJson(['--file', file, '--set-key', 'updated_at', '--set-value', '2026-06-14T10:00:00-03:00']);
  const after = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  assert.equal(after.values.created_at, '2026-01-01T00:00:00-03:00');
  assert.equal(after.values.updated_at, '2026-06-14T10:00:00-03:00');
  assert.match(after.body, /body/);
});

test('--set-key adds a new key when absent', () => {
  const file = mkfile('---\ntitle: t\n---\n\nbody\n');
  runJson(['--file', file, '--set-key', 'status', '--set-value', 'done']);
  const after = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  assert.equal(after.values.status, 'done');
  assert.equal(after.values.title, 't');
});

test('--set-key on a missing file exits non-zero', () => {
  assert.throws(() => {
    execFileSync('node', [SCRIPT, '--file', '/nonexistent/doc.md', '--set-key', 'a', '--set-value', 'b'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  });
});

// ─── Additional branch coverage ─────────────────────────────────────────────

test('parseScalar treats ~ as null and unquoted text as string', () => {
  assert.equal(parseScalar('~'), null);
  assert.equal(parseScalar('  spaced  '), 'spaced');
});

test('serializeScalar leaves regex-safe bare tokens unquoted but JSON-quotes the rest', () => {
  assert.equal(serializeScalar('plain_token-1.0/x'), 'plain_token-1.0/x');
  assert.equal(serializeScalar('has spaces'), '"has spaces"');
  assert.equal(serializeScalar(false), 'false');
  assert.equal(serializeScalar(true), 'true');
});

test('--set-value without --set-key is rejected', () => {
  const file = mkfile('---\na: 1\n---\n');
  assert.throws(() => execFileSync('node', [SCRIPT, '--file', file, '--set-value', 'orphan'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('--help exits 0 and prints usage', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(out, /frontmatter-utils/);
});

test('unknown argument and missing --file exit non-zero', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--bogus'], { stdio: ['ignore', 'ignore', 'ignore'] }));
  assert.throws(() => execFileSync('node', [SCRIPT, '--get-key', 'x'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('mutually exclusive / incomplete flag combinations are rejected', () => {
  const file = mkfile('---\na: 1\n---\n');
  // both get and set
  assert.throws(() => execFileSync('node', [SCRIPT, '--file', file, '--get-key', 'a', '--set-key', 'a', '--set-value', '2'], { stdio: ['ignore', 'ignore', 'ignore'] }));
  // neither get nor set
  assert.throws(() => execFileSync('node', [SCRIPT, '--file', file], { stdio: ['ignore', 'ignore', 'ignore'] }));
  // set-key without set-value
  assert.throws(() => execFileSync('node', [SCRIPT, '--file', file, '--set-key', 'a'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('--get-key for an absent key in a file WITH frontmatter returns found:false', () => {
  const file = mkfile('---\ntitle: t\n---\n\nbody\n');
  const result = runJson(['--file', file, '--get-key', 'missing']);
  assert.equal(result.found, false);
  assert.equal(result.hasFrontmatter, true);
});

test('--set-key on a file WITHOUT frontmatter creates the block', () => {
  const file = mkfile('# heading\n\nbody text\n');
  runJson(['--file', file, '--set-key', 'status', '--set-value', 'draft']);
  const after = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  assert.equal(after.hasFrontmatter, true);
  assert.equal(after.values.status, 'draft');
  assert.match(after.body, /heading/);
});

test('--get-key on malformed frontmatter exits non-zero', () => {
  const file = mkfile('---\nnot a valid line\n---\n\nbody\n');
  assert.throws(() => execFileSync('node', [SCRIPT, '--file', file, '--get-key', 'x'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('--set-key on malformed frontmatter exits non-zero', () => {
  const file = mkfile('---\nnot a valid line\n---\n\nbody\n');
  assert.throws(() => execFileSync('node', [SCRIPT, '--file', file, '--set-key', 'x', '--set-value', 'y'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('reading an unreadable path (a directory) exits non-zero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontmatter-dir-'));
  // path exists (it is a directory) so the missing-file guard is skipped; readFileSync throws.
  assert.throws(() => execFileSync('node', [SCRIPT, '--file', dir, '--get-key', 'x'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('parseFrontmatter on a lone "---" enters the scanner and throws (no closing delimiter)', () => {
  // Exercises the `normalizedContent !== "---"` arm of the opening guard: it is false here,
  // so the early "no frontmatter" return is skipped and the scanner runs, finding no close.
  assert.throws(() => parseFrontmatter('---'), /closing delimiter/);
});

test('-h alias also prints usage', () => {
  const out = execFileSync('node', [SCRIPT, '-h'], { encoding: 'utf8' });
  assert.match(out, /frontmatter-utils/);
});

test('--set-key on a frontmatter-only file (empty body) keeps a clean block', () => {
  const file = mkfile('---\na: 1\n---\n');
  runJson(['--file', file, '--set-key', 'b', '--set-value', '2']);
  const raw = fs.readFileSync(file, 'utf8');
  const after = parseFrontmatter(raw);
  assert.equal(after.values.a, 1);
  assert.equal(after.values.b, 2);
  assert.equal(after.body.trim(), '');
});
