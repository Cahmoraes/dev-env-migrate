'use strict';

/**
 * write-preferences.cjs — the writer's own contract: round-trip, partial writes that never
 * reset what they do not name, null/empty handling, --dry-run.
 *
 * Per-option coverage (every boolean, effort levels, clamping, locale tags) lives in
 * preferences-options-matrix.test.cjs; the loader's internals in read-preferences.coverage.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/write-preferences.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPTS = path.resolve(__dirname, '..');
const WRITE = path.join(SCRIPTS, 'write-preferences.cjs');
const READ = path.join(SCRIPTS, 'read-preferences.cjs');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'write-prefs-'));
}

function write(root, input, extra = []) {
  const inputFile = path.join(root, 'in.json');
  fs.writeFileSync(inputFile, JSON.stringify(input), 'utf8');
  const out = execFileSync('node', [WRITE, '--input-file', inputFile, '--repo-root', root, ...extra], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  // The dry-run path prints YAML then JSON; grab the trailing JSON object.
  const start = out.lastIndexOf('\n{');
  return JSON.parse(start >= 0 ? out.slice(start + 1) : out);
}

function read(root) {
  const out = execFileSync('node', [READ, '--repo-root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

test('writes defaults and reads them back identically (round-trip)', () => {
  const root = mkRepo();
  try {
    const w = write(root, {});
    assert.equal(w.written, true);
    assert.equal(w.roundTripValid, true);
    const r = read(root);
    assert.equal(r.found, true);
    assert.equal(r.malformed, false);
    assert.deepEqual(r.preferences, w.preferences);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a partial write preserves keys it does not name (no silent reset to defaults)', () => {
  const root = mkRepo();
  try {
    // Persist non-default values first.
    write(root, {
      model_tiers: { capable: 'opus-x' },
      claude_code: { review_final: true, review_effort: 'high' },
      workflow: { auto_commit: true },
    });
    // A one-key partial write must change ONLY that key — never reset the rest.
    write(root, { workflow: { auto_commit: false } });
    const r = read(root).preferences;
    assert.equal(r.workflow.auto_commit, false); // changed
    assert.equal(r.model_tiers.capable, 'opus-x'); // preserved
    assert.equal(r.claude_code.review_final, true); // preserved
    assert.equal(r.claude_code.review_effort, 'high'); // preserved
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('custom values survive the write→read round-trip', () => {
  const root = mkRepo();
  try {
    const input = {
      workflow: { auto_commit: false },
      context: { has_corporate_artifacts: true },
      model_tiers: { cheap: 'haiku-x', standard: 'sonnet-x', capable: 'opus-x' },
    };
    write(root, input);
    const r = read(root).preferences;
    assert.equal(r.workflow.auto_commit, false);
    assert.equal(r.workflow.qa_gate, true); // default preserved
    assert.equal(r.context.has_corporate_artifacts, true);
    assert.deepEqual(r.model_tiers, { cheap: 'haiku-x', standard: 'sonnet-x', capable: 'opus-x' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('finish_action round-trips verbatim and an invalid value is clamped to ask before the write', () => {
  let root = mkRepo();
  try {
    const w = write(root, { workflow: { finish_action: 'merge' } });
    assert.equal(w.roundTripValid, true);
    assert.equal(read(root).preferences.workflow.finish_action, 'merge');
    assert.equal(read(root).preferences.workflow.qa_gate, true); // untouched sibling key
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  root = mkRepo();
  try {
    const w = write(root, { workflow: { finish_action: 'discard' } });
    assert.equal(w.roundTripValid, true, 'clamping happens before rendering, so the round-trip still holds');
    assert.equal(w.preferences.workflow.finish_action, 'ask');
    assert.match(fs.readFileSync(w.path, 'utf8'), /finish_action: ask/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('qa_gate: ask round-trips as a bare scalar; an invalid value is clamped to true before the write', () => {
  let root = mkRepo();
  try {
    const w = write(root, { workflow: { qa_gate: 'ask' } });
    assert.equal(w.roundTripValid, true);
    assert.match(fs.readFileSync(w.path, 'utf8'), /^  qa_gate: ask$/m, 'rendered unquoted, like finish_action');
    assert.equal(read(root).preferences.workflow.qa_gate, 'ask');
    assert.equal(read(root).preferences.workflow.finish_action, 'ask'); // untouched sibling key
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  root = mkRepo();
  try {
    const w = write(root, { workflow: { qa_gate: 'always' } });
    assert.equal(w.roundTripValid, true, 'clamping happens before rendering, so the round-trip still holds');
    assert.equal(w.preferences.workflow.qa_gate, true);
    assert.match(fs.readFileSync(w.path, 'utf8'), /qa_gate: true/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a partial claude_code object keeps the unspecified flag at its default', () => {
  const root = mkRepo();
  try {
    write(root, { claude_code: { review_final: true } });
    const r = read(root).preferences;
    assert.equal(r.claude_code.review_final, true);
    assert.equal(r.claude_code.review_effort, 'medium'); // default preserved
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('null model tiers round-trip back to null (not the string "null")', () => {
  const root = mkRepo();
  try {
    write(root, { model_tiers: { cheap: 'fast', standard: null, capable: null } });
    const r = read(root).preferences;
    assert.equal(r.model_tiers.cheap, 'fast');
    assert.equal(r.model_tiers.standard, null);
    assert.equal(r.model_tiers.capable, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('empty project fields are persisted as null (stack not decided yet)', () => {
  const root = mkRepo();
  try {
    const w = write(root, { project: { stack: '', manifest: '' } });

    assert.equal(w.roundTripValid, true);
    assert.equal(w.projectDeclared, true);
    assert.deepEqual(read(root).preferences.project, { stack: null, manifest: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--dry-run does not create the file', () => {
  const root = mkRepo();
  try {
    const w = write(root, { workflow: { auto_commit: false } }, ['--dry-run']);
    assert.equal(w.written, false);
    assert.equal(w.dryRun, true);
    assert.equal(fs.existsSync(path.join(root, '.superpowers', 'preferences.yml')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
