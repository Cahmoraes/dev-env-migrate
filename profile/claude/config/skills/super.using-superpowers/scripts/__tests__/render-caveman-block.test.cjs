'use strict';

/**
 * Tests for render-caveman-block.cjs — the deterministic Caveman Mode renderer
 * that replaced the hand-filled placeholder in subagent prompts.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/render-caveman-block.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'render-caveman-block.cjs');
const { buildDirective, renderBlock, readOptimizationPrefs, VALID_FORMATS } = require('../render-caveman-block.cjs');

function run(args, opts = {}) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', ...opts });
}
function runJson(args, opts = {}) {
  return JSON.parse(run(args, opts));
}
function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ─── Module: buildDirective / renderBlock (pure) ──────────────────────────────

test('buildDirective embeds the level in both the statement and the command', () => {
  const d = buildDirective('ultra');
  assert.match(d, /level: `ultra`/);
  assert.match(d, /`\/caveman ultra`/);
  assert.match(d, /Do not revert to normal mode\./);
});

test('renderBlock returns empty string when inactive (section and field)', () => {
  assert.equal(renderBlock(false, 'full', 'section'), '');
  assert.equal(renderBlock(false, 'full', 'field'), '');
});

test('renderBlock section format includes the markdown header', () => {
  const block = renderBlock(true, 'full', 'section');
  assert.match(block, /^## Caveman Mode\n\n/);
  assert.match(block, /`\/caveman full`/);
});

test('renderBlock field format is the bare directive (no header)', () => {
  const block = renderBlock(true, 'lite', 'field');
  assert.ok(!block.includes('## Caveman Mode'));
  assert.equal(block, buildDirective('lite'));
});

test('VALID_FORMATS is exactly section and field', () => {
  assert.deepEqual(VALID_FORMATS, ['section', 'field']);
});

// ─── Module: readOptimizationPrefs ────────────────────────────────────────────

test('readOptimizationPrefs returns file values when the file exists', () => {
  const dir = mkTmp('cav-prefs-');
  fs.mkdirSync(path.join(dir, '.superpowers'));
  fs.writeFileSync(
    path.join(dir, '.superpowers', 'preferences.yml'),
    'optimization:\n  caveman: true\n  caveman_level: ultra\n'
  );
  const opt = readOptimizationPrefs(dir);
  assert.equal(opt.caveman, true);
  assert.equal(opt.caveman_level, 'ultra');
});

test('readOptimizationPrefs returns defaults when the file is missing', () => {
  const dir = mkTmp('cav-noprefs-');
  const opt = readOptimizationPrefs(dir);
  assert.equal(opt.caveman, false);
  assert.equal(opt.caveman_level, 'full');
});

test('readOptimizationPrefs returns defaults when the file is unreadable (EISDIR)', () => {
  const dir = mkTmp('cav-eisdir-');
  fs.mkdirSync(path.join(dir, '.superpowers'));
  // Make preferences.yml a directory → existsSync passes, readFileSync throws.
  fs.mkdirSync(path.join(dir, '.superpowers', 'preferences.yml'));
  const opt = readOptimizationPrefs(dir);
  assert.equal(opt.caveman, false);
});

test('readOptimizationPrefs falls back to git detection when no root is given', () => {
  // Called with no repoRoot: detectGitRoot() runs against this repo (a git repo
  // with no .superpowers/) → returns defaults. Exercises the detectGitRoot branch.
  const opt = readOptimizationPrefs();
  assert.equal(typeof opt.caveman, 'boolean');
});

// ─── CLI: explicit flags ──────────────────────────────────────────────────────

test('CLI --active true --level ultra → section block with header', () => {
  const r = runJson(['--active', 'true', '--level', 'ultra']);
  assert.equal(r.active, true);
  assert.equal(r.level, 'ultra');
  assert.equal(r.format, 'section');
  assert.match(r.block, /^## Caveman Mode/);
  assert.match(r.block, /`\/caveman ultra`/);
});

test('CLI --active false → empty block', () => {
  const r = runJson(['--active', 'false', '--level', 'full']);
  assert.equal(r.active, false);
  assert.equal(r.block, '');
});

test('CLI --format field → bare directive', () => {
  const r = runJson(['--active', 'true', '--level', 'full', '--format', 'field']);
  assert.equal(r.format, 'field');
  assert.ok(!r.block.includes('## Caveman Mode'));
  assert.match(r.block, /Caveman is active at level/);
});

// ─── CLI: preferences-file fallback + precedence ──────────────────────────────

test('CLI with no --active/--level reads the preferences file', () => {
  const dir = mkTmp('cav-cli-file-');
  fs.mkdirSync(path.join(dir, '.superpowers'));
  fs.writeFileSync(
    path.join(dir, '.superpowers', 'preferences.yml'),
    'optimization:\n  caveman: true\n  caveman_level: wenyan-full\n'
  );
  const r = runJson(['--repo-root', dir]);
  assert.equal(r.active, true);
  assert.equal(r.level, 'wenyan-full');
});

test('CLI --active false overrides a file that says caveman:true', () => {
  const dir = mkTmp('cav-cli-override-');
  fs.mkdirSync(path.join(dir, '.superpowers'));
  fs.writeFileSync(
    path.join(dir, '.superpowers', 'preferences.yml'),
    'optimization:\n  caveman: true\n  caveman_level: ultra\n'
  );
  const r = runJson(['--repo-root', dir, '--active', 'false']);
  assert.equal(r.active, false);
  assert.equal(r.block, '');
});

test('CLI run from a non-git dir with no flags → defaults (caveman off)', () => {
  const dir = mkTmp('cav-nogit-');
  const r = runJson([], { cwd: dir });
  assert.equal(r.active, false);
  assert.equal(r.level, 'full');
});

// ─── CLI: help and errors ─────────────────────────────────────────────────────

test('CLI --help and -h print usage and exit 0', () => {
  assert.match(run(['--help']), /render-caveman-block/);
  assert.match(run(['-h']), /render-caveman-block/);
});

test('CLI rejects a non-boolean --active', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--active', 'maybe', '--level', 'full'], { stdio: 'ignore' }));
});

test('CLI rejects an invalid --format', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--active', 'true', '--level', 'full', '--format', 'weird'], { stdio: 'ignore' }));
});

test('CLI rejects an unknown argument', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--bogus'], { stdio: 'ignore' }));
});

test('CLI rejects a flag given without a value', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--active'], { stdio: 'ignore' }));
});
