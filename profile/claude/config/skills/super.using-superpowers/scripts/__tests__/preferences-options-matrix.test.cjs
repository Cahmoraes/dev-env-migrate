'use strict';

/**
 * preferences-options-matrix.test.cjs — the ENUMERATED no-regression contract for
 * EVERY option currently supported in `.superpowers/preferences.yml`.
 *
 * Other suites cover the loader internals (read-preferences.coverage), the writer
 * (write-preferences), the derived session vars + platform gating
 * (derive-session-state) and the gating prose (preference-gating). This file is the
 * single place that walks the FULL option list end to end — write -> read -> derive —
 * so that adding/renaming/removing a preference option without updating the schema is
 * caught here. If a new option is added to preferences.yml, add it to this matrix.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/preferences-options-matrix.test.cjs
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
const DERIVE = path.join(SCRIPTS, 'derive-session-state.cjs');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pref-matrix-'));
}

function write(root, input, extra = []) {
  const inputFile = path.join(root, 'in.json');
  fs.writeFileSync(inputFile, JSON.stringify(input), 'utf8');
  const out = execFileSync('node', [WRITE, '--input-file', inputFile, '--repo-root', root, ...extra], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  const start = out.lastIndexOf('\n{'); // dry-run prints YAML then JSON; grab trailing JSON
  return JSON.parse(start >= 0 ? out.slice(start + 1) : out);
}

function read(root) {
  const out = execFileSync('node', [READ, '--repo-root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function derive(root, platform = 'claude-code') {
  const out = execFileSync('node', [DERIVE, '--repo-root', root, '--platform', platform], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

// The valid final-review effort levels (ultra is unsupported and clamps to medium).
const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'];

test('FULL option set: every preferences.yml option round-trips write -> read', () => {
  const root = mkRepo();
  try {
    const input = {
      workflow: { auto_commit: false, qa_gate: false, visual_companion: false, finish_action: 'pr' },
      copilot: { review_final: true },
      claude_code: { review_final: true, review_effort: 'high' },
      context: { has_corporate_artifacts: true },
      model_tiers: { cheap: 'haiku', standard: 'sonnet', capable: 'opus' },
    };
    const w = write(root, input);
    assert.equal(w.written, true);
    assert.equal(w.roundTripValid, true);
    const r = read(root).preferences;
    assert.deepEqual(r.workflow, { auto_commit: false, qa_gate: false, visual_companion: false, finish_action: 'pr' });
    assert.deepEqual(r.copilot, { review_final: true });
    assert.deepEqual(r.claude_code, { review_final: true, review_effort: 'high' });
    assert.equal(r.context.has_corporate_artifacts, true);
    assert.deepEqual(r.model_tiers, { cheap: 'haiku', standard: 'sonnet', capable: 'opus' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('review_effort accepts low/medium/high/max and surfaces on Claude Code', () => {
  for (const eff of EFFORT_LEVELS) {
    const root = mkRepo();
    try {
      write(root, { claude_code: { review_final: true, review_effort: eff } });
      assert.equal(read(root).preferences.claude_code.review_effort, eff, `read ${eff}`);
      assert.equal(derive(root, 'claude-code').sessionState.session_code_review_effort, eff, `derive ${eff}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('review_effort ultra/garbage clamps to medium at every layer and never reaches the file', () => {
  // ultra is unsupported (cloud, separate tier): the writer clamps before rendering, the
  // reader clamps a hand-edited file, and the derived session var inherits the clamp.
  for (const bad of ['ultra', 'bogus', 'EXTREME']) {
    const root = mkRepo();
    try {
      const w = write(root, { claude_code: { review_effort: bad } });
      assert.equal(w.preferences.claude_code.review_effort, 'medium', `clamp ${bad}`);
      assert.ok(!new RegExp(`review_effort:\\s*${bad}`).test(fs.readFileSync(w.path, 'utf8')), `${bad} must not reach the file`);
      assert.equal(read(root).preferences.claude_code.review_effort, 'medium', `read clamp ${bad}`);
      // A hand edit bypasses the writer: the reader and the derived var must clamp on their own.
      fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), `claude_code:\n  review_effort: ${bad}\n`, 'utf8');
      assert.equal(read(root).preferences.claude_code.review_effort, 'medium', `read hand-edited ${bad}`);
      assert.equal(derive(root, 'claude-code').sessionState.session_code_review_effort, 'medium', `derive ${bad}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

// The finishing destinations a user may declare up front. `discard` is deliberately NOT one:
// destroying work stays a typed confirmation at the menu, never a standing preference.
const FINISH_ACTIONS = ['ask', 'merge', 'pr', 'keep'];

test('finish_action accepts ask/merge/pr/keep, defaults to ask, and surfaces on every platform', () => {
  for (const action of FINISH_ACTIONS) {
    const root = mkRepo();
    try {
      write(root, { workflow: { finish_action: action } });
      assert.equal(read(root).preferences.workflow.finish_action, action, `read ${action}`);
      for (const platform of ['claude-code', 'copilot', 'codex', 'gemini', 'opencode', 'other']) {
        assert.equal(derive(root, platform).sessionState.session_finish_action, action, `derive ${action} on ${platform}`);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  const root = mkRepo();
  try {
    write(root, {});
    assert.equal(read(root).preferences.workflow.finish_action, 'ask', 'default is the menu');
    assert.equal(derive(root).sessionState.session_finish_action, 'ask');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('finish_action discard/garbage clamps to ask at every layer and never reaches the file', () => {
  for (const bad of ['discard', 'delete', 'MERGE', 'bogus']) {
    const root = mkRepo();
    try {
      const w = write(root, { workflow: { finish_action: bad } });
      assert.equal(w.preferences.workflow.finish_action, 'ask', `clamp ${bad}`);
      assert.ok(!new RegExp(`finish_action:\\s*${bad}`).test(fs.readFileSync(w.path, 'utf8')), `${bad} must not reach the file`);
      assert.equal(read(root).preferences.workflow.finish_action, 'ask', `read clamp ${bad}`);
      // A hand edit bypasses the writer: the reader and the derived var must clamp on their own.
      fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), `workflow:\n  finish_action: ${bad}\n`, 'utf8');
      assert.equal(read(root).preferences.workflow.finish_action, 'ask', `read hand-edited ${bad}`);
      assert.equal(derive(root).sessionState.session_finish_action, 'ask', `derive ${bad}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('every boolean option round-trips both true and false, and touches nothing else', () => {
  // A single-key write must read back as DEFAULTS with exactly that key changed — so a
  // writer or loader that couples sections (enabling claude_code.review_final leaking into
  // copilot.review_final, or a section defaulting as a block) fails here for every key.
  const { DEFAULTS } = require(READ);
  const BOOLEANS = [
    ['workflow', 'auto_commit'],
    ['workflow', 'qa_gate'],
    ['workflow', 'visual_companion'],
    ['copilot', 'review_final'],
    ['claude_code', 'review_final'],
    ['context', 'has_corporate_artifacts'],
  ];
  for (const [section, key] of BOOLEANS) {
    for (const value of [true, false]) {
      const root = mkRepo();
      try {
        write(root, { [section]: { [key]: value } });
        const expected = JSON.parse(JSON.stringify(DEFAULTS));
        expected[section][key] = value;
        assert.deepEqual(read(root).preferences, expected, `${section}.${key}=${value} must be the only change`);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

test('model_tiers: empty -> null, full set verbatim, partial leaves the rest null', () => {
  // empty
  let root = mkRepo();
  try {
    write(root, {});
    assert.deepEqual(read(root).preferences.model_tiers, { cheap: null, standard: null, capable: null });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  // full
  root = mkRepo();
  try {
    write(root, { model_tiers: { cheap: 'c', standard: 's', capable: 'p' } });
    const s = derive(root).sessionState;
    assert.equal(s.session_model_tier_cheap, 'c');
    assert.equal(s.session_model_tier_standard, 's');
    assert.equal(s.session_model_tier_capable, 'p');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  // partial
  root = mkRepo();
  try {
    write(root, { model_tiers: { standard: 'only-standard' } });
    const r = read(root).preferences.model_tiers;
    assert.equal(r.cheap, null);
    assert.equal(r.standard, 'only-standard');
    assert.equal(r.capable, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no preferences.yml -> found:false / preferencesFound:false (onboarding trigger, defaults populated)', () => {
  const root = mkRepo(); // never written
  try {
    const r = read(root);
    assert.equal(r.found, false, 'found must be false when the file is absent');
    // The defaults are still fully populated — a populated object is NOT proof of existence.
    assert.equal(r.preferences.workflow.qa_gate, true);
    assert.equal(r.preferences.context.has_corporate_artifacts, false);
    assert.equal(derive(root).preferencesFound, false, 'preferencesFound mirrors found');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
