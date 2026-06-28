'use strict';

/**
 * Tests for find-feature-files.cjs — locating PRD, spec, tasks index, and QA report.
 *
 * Run with: node --test super.writing-plans/scripts/__tests__/find-feature-files.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'find-feature-files.cjs');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'find-feature-'));
}

function runJson(repoRoot, feature, extraArgs = []) {
  const out = execFileSync(
    'node',
    [SCRIPT, '--feature-name', feature, '--repo-root', repoRoot, ...extraArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return JSON.parse(out);
}

function write(repoRoot, rel, body = '# x\n') {
  const full = path.join(repoRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  return full;
}

test('reports all four artifacts as not found when nothing exists', () => {
  const repo = mkRepo();
  const result = runJson(repo, 'feat');
  assert.equal(result.featureName, 'feat');
  assert.equal(result.prd.found, false);
  assert.equal(result.spec.found, false);
  assert.equal(result.tasksIndex.found, false);
  assert.equal(result.qaReport.found, false);
  assert.equal(result.prd.path, null);
  assert.equal(result.mockups.found, false);
  assert.equal(result.mockups.path, null);
  assert.deepEqual(result.mockups.files, []);
});

test('locates each artifact at its canonical path', () => {
  const repo = mkRepo();
  const specPath = write(repo, 'docs/superpowers/feat/specs/feat-design.md');
  const prdPath = write(repo, 'docs/superpowers/feat/prd/prd-feat.md');
  const tasksPath = write(repo, 'docs/superpowers/feat/plans/tasks-feat.md');
  const qaPath = write(repo, 'docs/superpowers/feat/qa/qa-report-feat.md');

  const result = runJson(repo, 'feat');
  assert.equal(result.spec.found, true);
  assert.equal(result.spec.path, specPath);
  assert.equal(result.prd.found, true);
  assert.equal(result.prd.path, prdPath);
  assert.equal(result.tasksIndex.found, true);
  assert.equal(result.tasksIndex.path, tasksPath);
  assert.equal(result.qaReport.found, true);
  assert.equal(result.qaReport.path, qaPath);
});

test('locates curated visual artifacts in specs/mockups and sorts them', () => {
  const repo = mkRepo();
  write(repo, 'docs/superpowers/feat/specs/mockups/feat-visual.md');
  write(repo, 'docs/superpowers/feat/specs/mockups/checkout-core.tsx');
  const result = runJson(repo, 'feat');
  assert.equal(result.mockups.found, true);
  assert.equal(result.mockups.path, path.join(repo, 'docs/superpowers/feat/specs/mockups'));
  assert.deepEqual(result.mockups.files, ['checkout-core.tsx', 'feat-visual.md']);
});

test('mockups dir present but empty reports not found', () => {
  const repo = mkRepo();
  fs.mkdirSync(path.join(repo, 'docs/superpowers/feat/specs/mockups'), { recursive: true });
  const result = runJson(repo, 'feat');
  assert.equal(result.mockups.found, false);
  assert.equal(result.mockups.path, null);
  assert.deepEqual(result.mockups.files, []);
});

test('mockups dir with only dotfiles reports not found (junk ignored)', () => {
  const repo = mkRepo();
  write(repo, 'docs/superpowers/feat/specs/mockups/.DS_Store', 'junk');
  write(repo, 'docs/superpowers/feat/specs/mockups/.gitkeep', '');
  const result = runJson(repo, 'feat');
  assert.equal(result.mockups.found, false);
  assert.deepEqual(result.mockups.files, []);
});

test('mockups ignores nested subdirectories, keeping only files', () => {
  const repo = mkRepo();
  write(repo, 'docs/superpowers/feat/specs/mockups/feat-visual.md');
  fs.mkdirSync(path.join(repo, 'docs/superpowers/feat/specs/mockups/assets'), { recursive: true });
  const result = runJson(repo, 'feat');
  assert.equal(result.mockups.found, true);
  assert.deepEqual(result.mockups.files, ['feat-visual.md']);
});

test('--base-dir override (relative) resolves against repo root', () => {
  const repo = mkRepo();
  write(repo, 'custom/feat/specs/feat-design.md');
  const result = runJson(repo, 'feat', ['--base-dir', 'custom']);
  assert.equal(result.spec.found, true);
  assert.equal(result.baseDir, path.join(repo, 'custom'));
});

test('partial presence is reported per-artifact', () => {
  const repo = mkRepo();
  write(repo, 'docs/superpowers/feat/specs/feat-design.md');
  const result = runJson(repo, 'feat');
  assert.equal(result.spec.found, true);
  assert.equal(result.prd.found, false);
});

test('missing --feature-name exits non-zero', () => {
  const repo = mkRepo();
  assert.throws(() => {
    execFileSync('node', [SCRIPT, '--repo-root', repo], { stdio: ['ignore', 'ignore', 'ignore'] });
  });
});

test('--help exits 0 and prints usage', () => {
  const out = execFileSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(out, /find-feature-files/);
});

test('unknown argument exits non-zero', () => {
  assert.throws(() => {
    execFileSync('node', [SCRIPT, '--feature-name', 'x', '--bogus'], { stdio: ['ignore', 'ignore', 'ignore'] });
  });
});

test('flags require a value (--feature-name / --repo-root / --base-dir)', () => {
  for (const args of [['--feature-name'], ['--feature-name', 'x', '--repo-root'], ['--feature-name', 'x', '--base-dir']]) {
    assert.throws(
      () => execFileSync('node', [SCRIPT, ...args], { stdio: ['ignore', 'ignore', 'ignore'] }),
      undefined,
      `${args.join(' ')} should fail`,
    );
  }
});

test('absolute --base-dir is honored as-is', () => {
  const repo = mkRepo();
  const abs = path.join(repo, 'abs-base');
  fs.mkdirSync(path.join(abs, 'feat', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(abs, 'feat', 'specs', 'feat-design.md'), '# x\n');
  const result = runJson(repo, 'feat', ['--base-dir', abs]);
  assert.equal(result.baseDir, abs);
  assert.equal(result.spec.found, true);
});

test('no git root and no --repo-root exits non-zero', () => {
  const nonGit = mkRepo(); // not a git repo
  assert.throws(() => {
    execFileSync('node', [SCRIPT, '--feature-name', 'feat'], { cwd: nonGit, stdio: ['ignore', 'ignore', 'ignore'] });
  });
});

// --- Visual-section coverage (spec "Especificação Visual" <-> specs/mockups/ artifact) ---
// The spec section and the curated artifact fire on the SAME condition (a mockup/external
// design informed the feature), so a section present without an artifact silently bypasses
// the visual-fidelity gate. find-feature-files surfaces this deterministically.

test('warnings is always present and empty when nothing to flag', () => {
  const repo = mkRepo();
  const result = runJson(repo, 'feat');
  assert.deepEqual(result.warnings, []);
});

test('flags a spec with an "Especificação Visual" section but no curated mockup artifact', () => {
  const repo = mkRepo();
  write(repo, 'docs/superpowers/feat/specs/feat-design.md', '# Design\n\n## Especificação Visual\nLayout norte.\n');
  const result = runJson(repo, 'feat');
  assert.equal(result.spec.visualSection, true);
  assert.equal(result.mockups.found, false);
  assert.ok(
    result.warnings.some((w) => w.code === 'visual-spec-without-artifact'),
    'must warn when the visual section has no curated artifact',
  );
});

test('no warning when the visual section has a matching curated artifact', () => {
  const repo = mkRepo();
  write(repo, 'docs/superpowers/feat/specs/feat-design.md', '# Design\n\n## Especificação Visual\nLayout norte.\n');
  write(repo, 'docs/superpowers/feat/specs/mockups/feat-visual.md', '# Visual\n');
  const result = runJson(repo, 'feat');
  assert.equal(result.spec.visualSection, true);
  assert.equal(result.mockups.found, true);
  assert.deepEqual(result.warnings, []);
});

test('no warning for an artifact-less spec that has no visual section', () => {
  const repo = mkRepo();
  write(repo, 'docs/superpowers/feat/specs/feat-design.md', '# Design\n\n## Arquitetura\nx\n');
  const result = runJson(repo, 'feat');
  assert.equal(result.spec.visualSection, false);
  assert.deepEqual(result.warnings, []);
});

test('artifact without a spec section is benign (not this warning)', () => {
  const repo = mkRepo();
  write(repo, 'docs/superpowers/feat/specs/feat-design.md', '# Design\n\n## Arquitetura\nx\n');
  write(repo, 'docs/superpowers/feat/specs/mockups/feat-visual.md', '# Visual\n');
  const result = runJson(repo, 'feat');
  assert.equal(result.spec.visualSection, false);
  assert.deepEqual(result.warnings, []);
});

test('detects the visual section regardless of heading level, numbering, or missing accents', () => {
  for (const heading of ['### 4. Especificação Visual', '#### Especificacao Visual', '## Section: Especificação Visual']) {
    const repo = mkRepo();
    write(repo, 'docs/superpowers/feat/specs/feat-design.md', `# Design\n\n${heading}\nx\n`);
    const result = runJson(repo, 'feat');
    assert.equal(result.spec.visualSection, true, `heading not detected: ${heading}`);
  }
});

test('visualSection is false when the spec is absent', () => {
  const repo = mkRepo();
  const result = runJson(repo, 'feat');
  assert.equal(result.spec.found, false);
  assert.equal(result.spec.visualSection, false);
});
