'use strict';

// Locks the single-read-path invariant: loadPreferences() called IN-PROCESS must return
// exactly what the read-preferences.cjs CLI prints on stdout (which spawning callers used
// to parse). If the two ever diverge, derive-session-state.cjs / lite-reentry.cjs would
// silently drift from the CLI. Covers repo-absent, file-absent, populated, and malformed.
//
// Run: node --test scripts/__tests__/load-preferences-equivalence.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'read-preferences.cjs');
const { loadPreferences } = require('../read-preferences.cjs');

function cliResult(repoRoot) {
  const args = [CLI];
  if (repoRoot) args.push('--repo-root', repoRoot);
  const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function makeRepo(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadprefs-'));
  if (body != null) {
    fs.mkdirSync(path.join(dir, '.superpowers'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.superpowers', 'preferences.yml'), body, 'utf8');
  }
  return dir;
}

test('in-process result === CLI stdout — file absent', () => {
  const dir = makeRepo(null);
  assert.deepEqual(loadPreferences(dir).result, cliResult(dir));
});

test('in-process result === CLI stdout — populated (with clamped effort + upcased level)', () => {
  const dir = makeRepo([
    'communication:', '  language: en-US',
    'optimization:', '  caveman: true', '  caveman_level: ULTRA',
    'claude_code:', '  code_review_effort: ultra',
    'model_tiers:', '  capable: opus',
  ].join('\n'));
  assert.deepEqual(loadPreferences(dir).result, cliResult(dir));
});

test('in-process result === CLI stdout — malformed', () => {
  const dir = makeRepo('optimization:\n  caveman: [oops\n  bad line\n');
  const inProc = loadPreferences(dir);
  assert.deepEqual(inProc.result, cliResult(dir));
  assert.equal(inProc.result.malformed, true);
  // The malformed note is surfaced as a warning (the CLI writes it to stderr).
  assert.ok(inProc.warnings.some((w) => /malformed/.test(w)));
});
