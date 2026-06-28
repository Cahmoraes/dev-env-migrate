'use strict';

/**
 * CLI-surface coverage for generate-slugs.cjs: help, usage/arg errors, and the unreadable-file
 * catch. Brings the script to full line/function coverage alongside the existing tests.
 *
 * Run with: node --test super.user-story-verification/scripts/__tests__/generate-slugs-cli.coverage.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'generate-slugs.cjs');

function runRaw(args, opts = {}) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts });
}

test('--help and -h print usage and exit 0', () => {
  assert.match(runRaw(['--help']), /generate-slugs/);
  assert.match(runRaw(['-h']), /generate-slugs/);
});

test('no --prd exits non-zero', () => {
  assert.throws(() => execFileSync('node', [SCRIPT], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('--prd without a value exits non-zero', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--prd'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('unknown argument exits non-zero', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--bogus'], { stdio: ['ignore', 'ignore', 'ignore'] }));
});

test('missing PRD file returns found:false (not an error)', () => {
  const out = runRaw(['--prd', '/nonexistent/prd-x.md']);
  const r = JSON.parse(out);
  assert.equal(r.found, false);
  assert.deepEqual(r.warnings, []);
});

test('unreadable PRD path (a directory) exits non-zero via the read catch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slugs-dir-'));
  // path exists (a directory) → existsSync passes, readFileSync throws EISDIR → catch.
  assert.throws(() => execFileSync('node', [SCRIPT, '--prd', dir], { stdio: ['ignore', 'ignore', 'ignore'] }));
});
