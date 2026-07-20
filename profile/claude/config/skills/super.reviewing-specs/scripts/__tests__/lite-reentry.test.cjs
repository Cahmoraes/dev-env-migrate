'use strict';

// Tests lite-reentry.cjs — the standalone projection of the three preferences a spec
// review consumes (capable model, caveman state, language). Key invariants: it reuses
// read-preferences.cjs's parse/normalize (so semantics match the full re-entry), it
// degrades to DEFAULTS when the file/repo is absent (found:false), and it never emits
// anything outside the projected shape.
//
// Run: node --test scripts/__tests__/lite-reentry.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'lite-reentry.cjs');

function makeRepo(prefsBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-reentry-'));
  if (prefsBody != null) {
    fs.mkdirSync(path.join(dir, '.superpowers'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.superpowers', 'preferences.yml'), prefsBody, 'utf8');
  }
  return dir;
}

function run(repoRoot) {
  const out = execFileSync('node', [SCRIPT, '--repo-root', repoRoot], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

test('absent preferences.yml → found:false with safe DEFAULTS', () => {
  const dir = makeRepo(null); // no .superpowers/preferences.yml
  const r = run(dir);
  assert.equal(r.found, false);
  assert.equal(r.capableModel, 'auto'); // null model_tiers.capable → "auto"
  assert.equal(r.caveman.active, false);
  assert.equal(r.caveman.level, 'full');
  assert.equal(r.language, 'pt-BR');
});

test('populated file projects exactly the three consumed inputs', () => {
  const dir = makeRepo([
    'communication:',
    '  language: en-US',
    'optimization:',
    '  caveman: true',
    '  caveman_level: ultra',
    'model_tiers:',
    '  cheap: haiku',
    '  standard: sonnet',
    '  capable: opus',
  ].join('\n'));
  const r = run(dir);
  assert.equal(r.found, true);
  assert.equal(r.capableModel, 'opus');
  assert.equal(r.caveman.active, true);
  assert.equal(r.caveman.level, 'ultra');
  assert.equal(r.language, 'en-US');
  // Projection only — no leakage of other preference sections.
  assert.deepEqual(Object.keys(r).sort(), ['capableModel', 'caveman', 'found', 'language', 'repoRoot']);
});

test('caveman_level is case-normalized to lower-case, like read-preferences', () => {
  const dir = makeRepo('optimization:\n  caveman: true\n  caveman_level: ULTRA\n');
  const r = run(dir);
  assert.equal(r.caveman.level, 'ultra');
});

test('model_tiers.capable unset → "auto" (harness picks); set → verbatim', () => {
  const unset = run(makeRepo('model_tiers:\n  capable:\n'));
  assert.equal(unset.capableModel, 'auto');

  const explicitAuto = run(makeRepo('model_tiers:\n  capable: auto\n'));
  assert.equal(explicitAuto.capableModel, 'auto');

  const named = run(makeRepo('model_tiers:\n  capable: claude-opus-4-8\n'));
  assert.equal(named.capableModel, 'claude-opus-4-8');
});

test('module API: liteReentry() matches the CLI projection', () => {
  const { liteReentry } = require('../lite-reentry.cjs');
  const dir = makeRepo('optimization:\n  caveman: true\n  caveman_level: lite\n');
  const r = liteReentry(dir);
  assert.equal(r.found, true);
  assert.equal(r.caveman.active, true);
  assert.equal(r.caveman.level, 'lite');
  assert.equal(r.repoRoot, dir);
});
