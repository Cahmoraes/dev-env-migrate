'use strict';

// Tests lite-reentry.cjs — the standalone projection of the preference a spec
// review consumes (the capable model). Key invariants: it reuses
// read-preferences.cjs's parse/normalize (so semantics match the full re-entry), it
// degrades to DEFAULTS when the file/repo is absent (found:false), and it never emits
// anything outside the projected shape.
//
// Run: node --test super.reviewing-specs/scripts/__tests__/lite-reentry.test.cjs

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

function run(repoRoot, platform) {
  const args = [SCRIPT, '--repo-root', repoRoot];
  if (platform) args.push('--platform', platform);
  const out = execFileSync('node', args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

test('absent preferences.yml → found:false with safe DEFAULTS', () => {
  const dir = makeRepo(null); // no .superpowers/preferences.yml
  const r = run(dir);
  assert.equal(r.found, false);
  assert.equal(r.capableModel, 'auto'); // null model_tiers.capable → "auto"
});

test('populated file projects exactly the consumed input', () => {
  const dir = makeRepo([
    'workflow:',
    '  auto_commit: false',
    'model_tiers:',
    '  cheap: haiku',
    '  standard: sonnet',
    '  capable: opus',
  ].join('\n'));
  const r = run(dir);
  assert.equal(r.found, true);
  assert.equal(r.capableModel, 'opus');
  // Projection only — no leakage of other preference sections.
  assert.deepEqual(Object.keys(r).sort(), ['capableModel', 'found', 'repoRoot']);
});

test('model_tiers.capable unset → "auto" (harness picks); set → verbatim', () => {
  const unset = run(makeRepo('model_tiers:\n  capable:\n'));
  assert.equal(unset.capableModel, 'auto');

  const explicitAuto = run(makeRepo('model_tiers:\n  capable: auto\n'));
  assert.equal(explicitAuto.capableModel, 'auto');

  const named = run(makeRepo('model_tiers:\n  capable: claude-opus-4-8\n'));
  assert.equal(named.capableModel, 'claude-opus-4-8');
});

test('--platform drops a capable model the running harness cannot serve', () => {
  // preferences.yml is per-REPO, model names are per-HARNESS: `capable: gpt-5` written
  // from Copilot CLI is a model Claude Code does not have. Handing it to the dispatch
  // fails at fan-out time, so it is dropped — and it lands on the platform's own `capable`
  // rung alias, the same place an unset tier lands. Never the word "auto": a dispatch
  // cannot carry it, and a controller handed it resolves it to its own model.
  const foreign = makeRepo('model_tiers:\n  capable: gpt-5\n');
  assert.equal(run(foreign, 'claude-code').capableModel, 'sonnet');
  assert.equal(run(foreign, 'copilot').capableModel, 'gpt-5', 'Copilot CLI does serve it');

  // Omitting the flag must not change anything this script did before: `other` is an
  // open catalog, so the configured name comes back verbatim.
  assert.equal(run(foreign).capableModel, 'gpt-5');

  // And a name we cannot classify is never second-guessed, on any platform.
  const custom = makeRepo('model_tiers:\n  capable: internal-gateway-v2\n');
  assert.equal(run(custom, 'claude-code').capableModel, 'internal-gateway-v2');
});

test('module API: liteReentry() matches the CLI projection', () => {
  const { liteReentry } = require('../lite-reentry.cjs');
  const dir = makeRepo('model_tiers:\n  capable: opus\n');
  const r = liteReentry(dir);
  assert.equal(r.found, true);
  assert.equal(r.capableModel, 'opus');
  assert.equal(r.repoRoot, dir);
});
