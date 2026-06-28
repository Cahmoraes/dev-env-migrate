'use strict';

/**
 * Tests for write-preferences.cjs + the read-preferences.cjs module refactor.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/
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
      communication: { language: 'en-US' },
      optimization: { caveman: true, caveman_level: 'ultra' },
      memory: { persistent_memory: true },
      workflow: { auto_commit: true },
    });
    // A one-key partial write must change ONLY that key — never reset the rest.
    write(root, { workflow: { auto_commit: false } });
    const r = read(root).preferences;
    assert.equal(r.workflow.auto_commit, false); // changed
    assert.equal(r.communication.language, 'en-US'); // preserved
    assert.equal(r.optimization.caveman, true); // preserved
    assert.equal(r.optimization.caveman_level, 'ultra'); // preserved
    assert.equal(r.memory.persistent_memory, true); // preserved
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('custom values survive the write→read round-trip', () => {
  const root = mkRepo();
  try {
    const input = {
      workflow: { auto_commit: false },
      communication: { language: 'en' },
      memory: { persistent_memory: true },
      model_tiers: { cheap: 'haiku-x', standard: 'sonnet-x', capable: 'opus-x' },
    };
    write(root, input);
    const r = read(root).preferences;
    assert.equal(r.workflow.auto_commit, false);
    assert.equal(r.workflow.confirm_destructive_actions, true); // default preserved
    assert.equal(r.communication.language, 'en');
    assert.equal(r.memory.persistent_memory, true);
    assert.deepEqual(r.model_tiers, { cheap: 'haiku-x', standard: 'sonnet-x', capable: 'opus-x' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('claude_code native-skill flags default to false and survive the round-trip', () => {
  const root = mkRepo();
  try {
    // Defaults: both off until the user opts in during onboarding.
    const w = write(root, {});
    assert.equal(w.roundTripValid, true);
    assert.deepEqual(w.preferences.claude_code, { simplify: false, code_review_final: false, code_review_effort: 'medium' });

    // Opt-in values persist and read back identically.
    write(root, { claude_code: { simplify: true, code_review_final: true } });
    const r = read(root).preferences;
    assert.equal(r.claude_code.simplify, true);
    assert.equal(r.claude_code.code_review_final, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('code_review_effort (final review) defaults to medium and a valid level survives the round-trip', () => {
  const root = mkRepo();
  try {
    assert.equal(write(root, {}).preferences.claude_code.code_review_effort, 'medium');
    write(root, { claude_code: { code_review_effort: 'high' } });
    assert.equal(read(root).preferences.claude_code.code_review_effort, 'high');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an ultra or invalid code_review_effort is clamped to medium and never persisted', () => {
  const root = mkRepo();
  try {
    // ultra is unsupported (cloud, separate tier) — must clamp, not write through.
    const w = write(root, { claude_code: { code_review_effort: 'ultra' } });
    assert.equal(w.roundTripValid, true);
    assert.equal(w.preferences.claude_code.code_review_effort, 'medium');
    const onDisk = fs.readFileSync(w.path, 'utf8');
    assert.ok(!/code_review_effort:\s*ultra/.test(onDisk), 'ultra must not reach the file');
    assert.equal(read(root).preferences.claude_code.code_review_effort, 'medium');

    // A garbage value clamps the same way.
    write(root, { claude_code: { code_review_effort: 'bogus' } });
    assert.equal(read(root).preferences.claude_code.code_review_effort, 'medium');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copilot review_final defaults to false and survives the round-trip', () => {
  const root = mkRepo();
  try {
    const w = write(root, {});
    assert.deepEqual(w.preferences.copilot, { rubber_duck: false, review_final: false });

    write(root, { copilot: { review_final: true } });
    const r = read(root).preferences;
    assert.equal(r.copilot.review_final, true);
    assert.equal(r.copilot.rubber_duck, false); // unrelated default preserved
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a partial claude_code object keeps the unspecified flag at its default', () => {
  const root = mkRepo();
  try {
    write(root, { claude_code: { simplify: true } });
    const r = read(root).preferences;
    assert.equal(r.claude_code.simplify, true);
    assert.equal(r.claude_code.code_review_final, false); // default preserved
    assert.equal(r.claude_code.code_review_effort, 'medium'); // default preserved
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

test('--dry-run does not create the file', () => {
  const root = mkRepo();
  try {
    const w = write(root, { communication: { language: 'es' } }, ['--dry-run']);
    assert.equal(w.written, false);
    assert.equal(w.dryRun, true);
    assert.equal(fs.existsSync(path.join(root, '.superpowers', 'preferences.yml')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('read-preferences.cjs is requireable as a module with stable exports', () => {
  const mod = require(READ);
  assert.equal(typeof mod.parseYaml, 'function');
  assert.equal(typeof mod.deepMerge, 'function');
  assert.ok(mod.DEFAULTS.model_tiers);
  // Requiring it must not have executed the CLI (no stdout side effects to assert,
  // but the merge helper must behave):
  const merged = mod.deepMerge(mod.DEFAULTS, { workflow: { auto_commit: false } });
  assert.equal(merged.workflow.auto_commit, false);
  assert.equal(merged.communication.language, 'pt-BR');
});

test('read-preferences.cjs still works as a CLI on a missing file (regression)', () => {
  const root = mkRepo();
  try {
    const r = read(root);
    assert.equal(r.found, false);
    assert.equal(r.preferences.optimization.caveman_level, 'full');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
