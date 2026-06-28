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

// The canonical caveman levels currently offered (render-caveman-block stays
// forward-compatible: it lowercases but does not reject unknowns, so all of these
// must pass through verbatim).
const CAVEMAN_LEVELS = ['lite', 'full', 'ultra', 'wenyan-lite', 'wenyan-full', 'wenyan-ultra'];
// The valid final-review effort levels (ultra is unsupported and clamps to medium).
const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'];

test('FULL option set: every preferences.yml option round-trips write -> read', () => {
  const root = mkRepo();
  try {
    const input = {
      workflow: { auto_commit: false, confirm_destructive_actions: false },
      communication: { language: 'en-US' },
      copilot: { rubber_duck: true, review_final: true },
      claude_code: { simplify: true, code_review_final: true, code_review_effort: 'high' },
      context: { has_corporate_artifacts: true },
      optimization: { caveman: true, caveman_level: 'wenyan-ultra' },
      memory: { persistent_memory: true },
      model_tiers: { cheap: 'haiku', standard: 'sonnet', capable: 'opus' },
    };
    const w = write(root, input);
    assert.equal(w.written, true);
    assert.equal(w.roundTripValid, true);
    const r = read(root).preferences;
    assert.deepEqual(r.workflow, { auto_commit: false, confirm_destructive_actions: false });
    assert.equal(r.communication.language, 'en-US');
    assert.deepEqual(r.copilot, { rubber_duck: true, review_final: true });
    assert.deepEqual(r.claude_code, { simplify: true, code_review_final: true, code_review_effort: 'high' });
    assert.equal(r.context.has_corporate_artifacts, true);
    assert.deepEqual(r.optimization, { caveman: true, caveman_level: 'wenyan-ultra' });
    assert.equal(r.memory.persistent_memory, true);
    assert.deepEqual(r.model_tiers, { cheap: 'haiku', standard: 'sonnet', capable: 'opus' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('context.has_corporate_artifacts round-trips both true and false', () => {
  for (const value of [true, false]) {
    const root = mkRepo();
    try {
      write(root, { context: { has_corporate_artifacts: value } });
      assert.equal(read(root).preferences.context.has_corporate_artifacts, value, `corporate=${value}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('all six caveman levels pass through verbatim (write -> read -> derive)', () => {
  for (const level of CAVEMAN_LEVELS) {
    const root = mkRepo();
    try {
      write(root, { optimization: { caveman: true, caveman_level: level } });
      assert.equal(read(root).preferences.optimization.caveman_level, level, `read ${level}`);
      const s = derive(root).sessionState;
      assert.equal(s.session_caveman_active, true, `active ${level}`);
      assert.equal(s.session_caveman_level, level, `derive ${level}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('caveman off is honored regardless of the level still on file', () => {
  const root = mkRepo();
  try {
    write(root, { optimization: { caveman: false, caveman_level: 'ultra' } });
    const s = derive(root).sessionState;
    assert.equal(s.session_caveman_active, false);
    assert.equal(s.session_caveman_level, 'ultra'); // level retained, just inactive
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('code_review_effort accepts low/medium/high/max and surfaces on Claude Code', () => {
  for (const eff of EFFORT_LEVELS) {
    const root = mkRepo();
    try {
      write(root, { claude_code: { code_review_final: true, code_review_effort: eff } });
      assert.equal(read(root).preferences.claude_code.code_review_effort, eff, `read ${eff}`);
      assert.equal(derive(root, 'claude-code').sessionState.session_code_review_effort, eff, `derive ${eff}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('code_review_effort ultra/garbage clamps to medium and never reaches the file', () => {
  for (const bad of ['ultra', 'bogus', 'EXTREME']) {
    const root = mkRepo();
    try {
      const w = write(root, { claude_code: { code_review_effort: bad } });
      assert.equal(w.preferences.claude_code.code_review_effort, 'medium', `clamp ${bad}`);
      assert.equal(read(root).preferences.claude_code.code_review_effort, 'medium', `read clamp ${bad}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('communication.language round-trips arbitrary locale tags', () => {
  for (const lang of ['pt-BR', 'en', 'en-US', 'es-ES', 'fr']) {
    const root = mkRepo();
    try {
      write(root, { communication: { language: lang } });
      assert.equal(read(root).preferences.communication.language, lang, `lang ${lang}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('every boolean option round-trips both true and false', () => {
  const BOOLEANS = [
    ['workflow', 'auto_commit'],
    ['workflow', 'confirm_destructive_actions'],
    ['copilot', 'rubber_duck'],
    ['copilot', 'review_final'],
    ['claude_code', 'simplify'],
    ['claude_code', 'code_review_final'],
    ['context', 'has_corporate_artifacts'],
    ['optimization', 'caveman'],
    ['memory', 'persistent_memory'],
  ];
  for (const [section, key] of BOOLEANS) {
    for (const value of [true, false]) {
      const root = mkRepo();
      try {
        write(root, { [section]: { [key]: value } });
        assert.equal(read(root).preferences[section][key], value, `${section}.${key}=${value}`);
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
    assert.equal(r.preferences.optimization.caveman_level, 'full');
    assert.equal(r.preferences.context.has_corporate_artifacts, false);
    assert.equal(derive(root).preferencesFound, false, 'preferencesFound mirrors found');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
