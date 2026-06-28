'use strict';

/**
 * Line/function coverage for read-preferences.cjs.
 *
 * Strategy:
 *  - Pure helpers (parseYaml, deepMerge, normalizeCodeReviewEffort, detectGitRoot)
 *    are exercised in-process via require() so every branch is reachable directly.
 *  - The CLI/main path is driven as a subprocess (Node 24 captures subprocess
 *    coverage), feeding fixtures in temp repos to hit help/not-found/read-error/
 *    malformed/effort-clamp branches.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/read-preferences.coverage.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'read-preferences.cjs');
const mod = require(SCRIPT);

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'read-prefs-cov-'));
}

function writePrefs(root, body) {
  const dir = path.join(root, '.superpowers');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'preferences.yml'), body, 'utf8');
}

// spawnSync so we can inspect exit code + stderr on the failure branches.
function run(args, opts = {}) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', ...opts });
}

// ─── Pure helpers (in-process) ────────────────────────────────────────────────

test('parseYaml: parses every scalar shape, sections, top-level kv, comments', () => {
  const yaml = [
    '# a leading comment',
    '   ', // whitespace-only line → skipped
    '  orphan: before-any-section', // nested line with currentSection still null
    'workflow:',
    '  auto_commit: true',
    '  confirm_destructive_actions: false',
    '  empty_value:', // empty → null
    '  explicit_null: null',
    '  tilde_null: ~',
    '  quoted: "double"',
    '  single_quoted: \'single\'',
    '  with_comment: keepme  # trailing stripped',
    'communication:',
    '  language: pt-BR', // value containing a non-leading-space # is not present here
    'topbool: true', // top-level kv → true
    'topfalse: false', // top-level kv → false
    'topstr: plainvalue', // top-level kv → string
  ].join('\n');

  const { parsed, malformed } = mod.parseYaml(yaml);
  assert.equal(malformed, false);
  assert.equal(parsed.workflow.auto_commit, true);
  assert.equal(parsed.workflow.confirm_destructive_actions, false);
  assert.equal(parsed.workflow.empty_value, null);
  assert.equal(parsed.workflow.explicit_null, null);
  assert.equal(parsed.workflow.tilde_null, null);
  assert.equal(parsed.workflow.quoted, 'double');
  assert.equal(parsed.workflow.single_quoted, 'single');
  assert.equal(parsed.workflow.with_comment, 'keepme');
  assert.equal(parsed.communication.language, 'pt-BR');
  assert.equal(parsed.topbool, true);
  assert.equal(parsed.topfalse, false);
  assert.equal(parsed.topstr, 'plainvalue');
  // orphan nested line before any section is dropped (currentSection was null)
  assert.equal(parsed.orphan, undefined);
});

test('parseYaml: structural junk flags malformed (suspicious branch)', () => {
  // Each of these trips a different leg of the `suspicious` OR.
  for (const bad of ['[bracket array]', '{brace map}', '- dash item', 'key without colon']) {
    const { malformed } = mod.parseYaml(`workflow:\n${bad}\n`);
    assert.equal(malformed, true, `"${bad}" should be malformed`);
  }
});

test('parseYaml: an unmatched-but-harmless token is NOT malformed (suspicious=false leg)', () => {
  // A bare single word: no colon, no space, starts with a letter → not suspicious.
  const { malformed } = mod.parseYaml('workflow:\nfoobar\n');
  assert.equal(malformed, false);
});

test('deepMerge: non-object override returns defaults untouched', () => {
  assert.equal(mod.deepMerge(mod.DEFAULTS, null), mod.DEFAULTS);
  assert.equal(mod.deepMerge(mod.DEFAULTS, 'nope'), mod.DEFAULTS);
});

test('deepMerge: nested merge, missing keys, scalars and arrays', () => {
  const merged = mod.deepMerge(mod.DEFAULTS, { workflow: { auto_commit: false } });
  assert.equal(merged.workflow.auto_commit, false);
  assert.equal(merged.communication.language, 'pt-BR'); // key absent in overrides → default kept
  // Array-valued default takes the override wholesale (Array.isArray short-circuit).
  const arr = mod.deepMerge({ a: [1, 2] }, { a: [9] });
  assert.deepEqual(arr.a, [9]);
  // Scalar default overwritten by scalar override.
  assert.equal(mod.deepMerge({ a: 1 }, { a: 2 }).a, 2);
  // Override missing the key leaves the default (the `key in overrides` false leg).
  assert.deepEqual(mod.deepMerge({ a: { x: 1 } }, {}), { a: { x: 1 } });
});

test('normalizeCodeReviewEffort: null prefs, valid level, and clamp', () => {
  assert.deepEqual(mod.normalizeCodeReviewEffort(null), []);
  assert.deepEqual(mod.normalizeCodeReviewEffort({ claude_code: { code_review_effort: 'high' } }), []);
  const prefs = { claude_code: { code_review_effort: 'ultra' } };
  const notes = mod.normalizeCodeReviewEffort(prefs);
  assert.equal(notes.length, 1);
  assert.equal(prefs.claude_code.code_review_effort, 'medium');
});

test('normalizeCavemanLevel: null prefs, already-lowercase no-op, and case-normalization', () => {
  assert.deepEqual(mod.normalizeCavemanLevel(null), []);
  // already lower-case (incl. hyphenated wenyan variants) → no change, no note
  assert.deepEqual(mod.normalizeCavemanLevel({ optimization: { caveman_level: 'ultra' } }), []);
  assert.deepEqual(mod.normalizeCavemanLevel({ optimization: { caveman_level: 'wenyan-full' } }), []);
  // hand-edited upper-case → lower-cased in place, with a note (NOT clamped to a list)
  const prefs = { optimization: { caveman_level: 'ULTRA' } };
  const notes = mod.normalizeCavemanLevel(prefs);
  assert.equal(notes.length, 1);
  assert.equal(prefs.optimization.caveman_level, 'ultra');
  // non-string value is ignored (no throw, no note)
  assert.deepEqual(mod.normalizeCavemanLevel({ optimization: { caveman_level: null } }), []);
});

test('detectGitRoot: returns the repo top-level when run inside a git repo', () => {
  const root = mod.detectGitRoot();
  assert.ok(typeof root === 'string' && root.length > 0);
});

// ─── CLI / main (subprocess) ──────────────────────────────────────────────────

test('--help prints usage and exits 0', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(out, /read-preferences/);
});

test('no git root and no --repo-root → repo_not_found, exit 0', () => {
  const nonGit = mkRepo();
  try {
    const r = run([], { cwd: nonGit });
    assert.equal(r.status, 0);
    const json = JSON.parse(r.stdout);
    assert.equal(json.found, false);
    assert.equal(json.repo_not_found, true);
  } finally {
    fs.rmSync(nonGit, { recursive: true, force: true });
  }
});

test('git root detected via cwd (no --repo-root), file absent → found:false', () => {
  const root = mkRepo();
  try {
    execFileSync('git', ['init', '-q', root]);
    const r = run([], { cwd: root });
    assert.equal(r.status, 0);
    const json = JSON.parse(r.stdout);
    assert.equal(json.found, false);
    assert.equal(json.repo_not_found, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('valid preferences.yml is read, parsed, and merged over defaults', () => {
  const root = mkRepo();
  try {
    writePrefs(root, 'workflow:\n  auto_commit: false\ncommunication:\n  language: en\n');
    const r = run(['--repo-root', root]);
    assert.equal(r.status, 0);
    const json = JSON.parse(r.stdout);
    assert.equal(json.found, true);
    assert.equal(json.malformed, false);
    assert.equal(json.preferences.workflow.auto_commit, false);
    assert.equal(json.preferences.communication.language, 'en');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('preferences.yml that is a directory → read error, exit 1', () => {
  const root = mkRepo();
  try {
    // existsSync(prefsPath) is true, but readFileSync on a directory throws (EISDIR).
    fs.mkdirSync(path.join(root, '.superpowers', 'preferences.yml'), { recursive: true });
    const r = run(['--repo-root', root]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Error reading preferences file/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('malformed preferences.yml warns on stderr but still returns merged defaults', () => {
  const root = mkRepo();
  try {
    writePrefs(root, 'workflow:\n[ this is not valid ]\n');
    const r = run(['--repo-root', root]);
    assert.equal(r.status, 0);
    const json = JSON.parse(r.stdout);
    assert.equal(json.malformed, true);
    assert.match(r.stderr, /malformed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid code_review_effort in the file is clamped to medium with a warning', () => {
  const root = mkRepo();
  try {
    writePrefs(root, 'claude_code:\n  code_review_effort: ultra\n');
    const r = run(['--repo-root', root]);
    assert.equal(r.status, 0);
    const json = JSON.parse(r.stdout);
    assert.equal(json.preferences.claude_code.code_review_effort, 'medium');
    assert.match(r.stderr, /code_review_effort/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
