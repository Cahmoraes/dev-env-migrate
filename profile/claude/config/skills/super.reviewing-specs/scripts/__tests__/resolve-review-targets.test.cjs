'use strict';

// Tests resolve-review-targets.cjs — deterministic discovery of a spec's companion
// artifacts (PRD, tasks index, individual task files, mockups) from the spec path.
//
// Run: node --test super.reviewing-specs/scripts/__tests__/resolve-review-targets.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'resolve-review-targets.cjs');

function run(args) {
  const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

// Build a canonical feature layout under a temp dir. Returns { root, featureDir, specPath }.
// `corporateYml` (optional): raw contents to write to <root>/.superpowers/corporate-artifacts.yml.
// `corporateFiles` (optional): repo-relative paths to create as real files (so a declared
// `path:` entry resolves to an existing file).
// `corporateEnabled` (optional): when not null, writes <root>/.superpowers/preferences.yml with
// `context.has_corporate_artifacts` set to it — the OWNER'S CONSENT, which is a separate signal
// from the yml merely being on disk. `null` writes no preferences file at all.
function makeFeature(name, {
  withPrd = true, withIndex = true, taskCount = 0, withMockup = false,
  corporateYml = null, corporateFiles = [], corporateEnabled = null,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-targets-'));
  const featureDir = path.join(root, 'docs', 'superpowers', name);
  fs.mkdirSync(path.join(featureDir, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(featureDir, 'prd'), { recursive: true });
  fs.mkdirSync(path.join(featureDir, 'plans'), { recursive: true });
  const specPath = path.join(featureDir, 'specs', `${name}-design.md`);
  fs.writeFileSync(specPath, `# ${name} design\n`, 'utf8');
  if (withPrd) fs.writeFileSync(path.join(featureDir, 'prd', `prd-${name}.md`), '# prd\n', 'utf8');
  if (withIndex) fs.writeFileSync(path.join(featureDir, 'plans', `tasks-${name}.md`), '# index\n', 'utf8');
  for (let i = 1; i <= taskCount; i += 1) {
    const nn = String(i).padStart(2, '0');
    fs.writeFileSync(path.join(featureDir, 'plans', `task-${nn}.md`), `# task ${nn}\n`, 'utf8');
  }
  if (withMockup) {
    fs.mkdirSync(path.join(featureDir, 'specs', 'mockups'), { recursive: true });
    fs.writeFileSync(path.join(featureDir, 'specs', 'mockups', `${name}-visual.md`), '# mock\n', 'utf8');
  }
  for (const rel of corporateFiles) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '# corporate source\n', 'utf8');
  }
  if (corporateYml != null) {
    fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
    fs.writeFileSync(path.join(root, '.superpowers', 'corporate-artifacts.yml'), corporateYml, 'utf8');
  }
  if (corporateEnabled != null) {
    fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.superpowers', 'preferences.yml'),
      `workflow:\n  auto_commit: true\ncontext:\n  has_corporate_artifacts: ${corporateEnabled}\n`,
      'utf8',
    );
  }
  return { root, featureDir, specPath };
}

test('resolves prd, index, and every individual task file from the spec path', () => {
  const { root, specPath } = makeFeature('broker-fanout', { taskCount: 3 });
  try {
    const r = run(['--spec', specPath]);
    assert.equal(r.featureName, 'broker-fanout');
    assert.equal(r.spec.found, true);
    assert.equal(r.prd.found, true);
    assert.equal(r.tasksIndex.found, true);
    assert.equal(r.taskFiles.length, 3, 'enumerates task-01..03 individually');
    assert.ok(r.taskFiles.every((p) => /task-\d+\.md$/.test(p)));
    // the tasks-<feature>.md INDEX must not be counted as an individual task file
    assert.ok(!r.taskFiles.some((p) => /tasks-broker-fanout\.md$/.test(p)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('derives the feature dir by climbing out of specs/', () => {
  const { root, featureDir, specPath } = makeFeature('rate-limit', { taskCount: 0 });
  try {
    const r = run(['--spec', specPath]);
    assert.equal(r.featureDir, featureDir);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a pure spec review (no tasks) reports empty taskFiles, not an error', () => {
  const { root, specPath } = makeFeature('greenfield', { withIndex: false, taskCount: 0 });
  try {
    const r = run(['--spec', specPath]);
    assert.equal(r.spec.found, true);
    assert.equal(r.tasksIndex.found, false);
    assert.deepEqual(r.taskFiles, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a missing spec is reported as found:false, not crashed', () => {
  const r = run(['--spec', path.join(os.tmpdir(), 'nope', 'ghost-design.md')]);
  assert.equal(r.spec.found, false);
  assert.equal(r.featureName, 'ghost');
});

test('mockups directory with a curated file is surfaced', () => {
  const { root, specPath } = makeFeature('with-ui', { withMockup: true });
  try {
    const r = run(['--spec', specPath]);
    assert.equal(r.mockups.found, true);
    assert.ok(r.mockups.files.includes('with-ui-visual.md'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('resolves corporate artifacts: local path (exists) + url (not fetchable)', () => {
  const yml = [
    '# Corporate Artifacts',
    'artifacts:',
    '  - path: docs/corp/prd-x.md   # a real local doc',
    '  - url: https://wiki.empresa.com/specs/feature-x',
  ].join('\n');
  const { root, specPath } = makeFeature('with-corp', {
    corporateYml: yml,
    corporateFiles: ['docs/corp/prd-x.md'],
    corporateEnabled: true,
  });
  try {
    // repoRoot must be passed explicitly: the temp dir is not a git repo, so gitToplevel
    // would return null and corporate resolution would have no root to resolve against.
    const r = run(['--spec', specPath, '--repo-root', root]);
    assert.equal(r.corporateArtifacts.found, true);
    assert.equal(r.corporateArtifacts.enabled, true);
    assert.equal(r.corporateArtifacts.declaredButDisabled, false);
    assert.equal(r.corporateArtifacts.entries.length, 2);
    const local = r.corporateArtifacts.entries.find((e) => e.kind === 'path');
    assert.equal(local.exists, true, 'declared local path that exists resolves to exists:true');
    assert.ok(path.isAbsolute(local.resolvedPath));
    assert.equal(local.value, 'docs/corp/prd-x.md', 'inline comment is stripped from the value');
    const url = r.corporateArtifacts.entries.find((e) => e.kind === 'url');
    assert.equal(url.fetchable, false, 'a URL is flagged not fetchable by a read-only reviewer');
    assert.equal(url.resolvedPath, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a declared corporate path that does not exist is reported exists:false, not crashed', () => {
  const yml = 'artifacts:\n  - path: docs/corp/ghost.md\n';
  const { root, specPath } = makeFeature('corp-ghost', { corporateYml: yml, corporateEnabled: true });
  try {
    const r = run(['--spec', specPath, '--repo-root', root]);
    assert.equal(r.corporateArtifacts.found, true, 'declared → found even if the file is missing');
    assert.equal(r.corporateArtifacts.entries[0].exists, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no corporate-artifacts.yml → found:false with empty entries (Lens 5 will not run)', () => {
  const { root, specPath } = makeFeature('no-corp', {});
  try {
    const r = run(['--spec', specPath, '--repo-root', root]);
    assert.equal(r.corporateArtifacts.found, false);
    assert.deepEqual(r.corporateArtifacts.entries, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// --- consent gate -----------------------------------------------------------
// Presence of the yml is NOT consent. A leftover/stale corporate-artifacts.yml must never
// grant another feature's document precedence over the spec under review: Lens 5 runs only
// when the repo owner declared `context.has_corporate_artifacts: true` in preferences.yml.

test('flag off + yml declaring artifacts → found:false, but entries are preserved for the config observation', () => {
  const yml = 'artifacts:\n  - path: docs/superpowers/other-feature/prd/prd-other-feature.md\n';
  const { root, specPath } = makeFeature('corp-flag-off', {
    corporateYml: yml,
    corporateFiles: ['docs/superpowers/other-feature/prd/prd-other-feature.md'],
    corporateEnabled: false,
  });
  try {
    const r = run(['--spec', specPath, '--repo-root', root]);
    assert.equal(r.corporateArtifacts.found, false, 'Lens 5 must NOT run without the owner consent');
    assert.equal(r.corporateArtifacts.enabled, false);
    assert.equal(r.corporateArtifacts.declaredButDisabled, true, 'the mismatch is surfaced, not swallowed');
    assert.equal(r.corporateArtifacts.entries.length, 1, 'entries stay visible so the caller can report the config problem');
    assert.ok(r.corporateArtifacts.configPath, 'the caller needs the path to tell the user what to fix');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no preferences.yml at all + yml declaring artifacts → found:false (absent file is not consent)', () => {
  const yml = 'artifacts:\n  - path: docs/corp/prd-x.md\n';
  const { root, specPath } = makeFeature('corp-no-prefs', { corporateYml: yml });
  try {
    const r = run(['--spec', specPath, '--repo-root', root]);
    assert.equal(r.corporateArtifacts.found, false);
    assert.equal(r.corporateArtifacts.enabled, false);
    assert.equal(r.corporateArtifacts.declaredButDisabled, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('flag on but no corporate-artifacts.yml → found:false and declaredButDisabled:false (nothing declared)', () => {
  const { root, specPath } = makeFeature('corp-flag-only', { corporateEnabled: true });
  try {
    const r = run(['--spec', specPath, '--repo-root', root]);
    assert.equal(r.corporateArtifacts.found, false);
    assert.equal(r.corporateArtifacts.enabled, true);
    assert.equal(r.corporateArtifacts.declaredButDisabled, false, 'no entries → no config mismatch to report');
    assert.deepEqual(r.corporateArtifacts.entries, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('has_corporate_artifacts is only honored under the context: key, not from a lookalike line', () => {
  const yml = 'artifacts:\n  - path: docs/corp/prd-x.md\n';
  const { root, specPath } = makeFeature('corp-lookalike', { corporateYml: yml });
  try {
    // a top-level (unindented) lookalike must not be read as the context flag
    fs.writeFileSync(
      path.join(root, '.superpowers', 'preferences.yml'),
      'has_corporate_artifacts: true\nworkflow:\n  auto_commit: true\n',
      'utf8',
    );
    const r = run(['--spec', specPath, '--repo-root', root]);
    assert.equal(r.corporateArtifacts.enabled, false, 'the flag lives at context.has_corporate_artifacts');
    assert.equal(r.corporateArtifacts.found, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('feature-name + base-dir fallback resolves the canonical spec path', () => {
  const { root, specPath } = makeFeature('fallback-feat', { taskCount: 1 });
  const baseDir = path.join(root, 'docs', 'superpowers');
  try {
    const r = run(['--feature-name', 'fallback-feat', '--base-dir', baseDir]);
    assert.equal(r.spec.found, true);
    assert.equal(path.resolve(r.spec.path), path.resolve(specPath));
    assert.equal(r.taskFiles.length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
