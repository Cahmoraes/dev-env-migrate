'use strict';

// Tests build-review-dispatch.cjs — emits a capable-tier dispatch manifest that
// super.dispatching-parallel-agents' validate-dispatch.cjs accepts. The key
// invariants: every reviewer is tier "capable" with an explicit model, Lens 3 is
// present iff tasks exist, and the emitted manifest actually passes validate-dispatch.
//
// Run: node --test scripts/__tests__/build-review-dispatch.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'build-review-dispatch.cjs');
// validate-dispatch.cjs lives in the sibling super.dispatching-parallel-agents skill.
const VALIDATE = path.resolve(
  __dirname, '..', '..', '..',
  'super.dispatching-parallel-agents', 'scripts', 'validate-dispatch.cjs',
);

function build(targets, extraArgs = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-dispatch-'));
  const targetsPath = path.join(dir, 'targets.json');
  fs.writeFileSync(targetsPath, JSON.stringify(targets), 'utf8');
  const out = execFileSync('node', [SCRIPT, '--targets', targetsPath, ...extraArgs], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { dir, manifest: JSON.parse(out) };
}

function validate(manifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-validate-'));
  const p = path.join(dir, 'manifest.json');
  fs.writeFileSync(p, JSON.stringify(manifest), 'utf8');
  try {
    const out = execFileSync('node', [VALIDATE, '--dispatch', p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const targetsWithTasks = {
  featureName: 'broker-fanout',
  spec: { found: true, path: '/repo/docs/superpowers/broker-fanout/specs/broker-fanout-design.md' },
  prd: { found: true, path: '/repo/docs/superpowers/broker-fanout/prd/prd-broker-fanout.md' },
  tasksIndex: { found: true, path: '/repo/docs/superpowers/broker-fanout/plans/tasks-broker-fanout.md' },
  taskFiles: [
    '/repo/docs/superpowers/broker-fanout/plans/task-01.md',
    '/repo/docs/superpowers/broker-fanout/plans/task-02.md',
  ],
};

const targetsNoTasks = {
  featureName: 'greenfield',
  spec: { found: true, path: '/repo/docs/superpowers/greenfield/specs/greenfield-design.md' },
  prd: { found: false, path: null },
  tasksIndex: { found: false, path: null },
  taskFiles: [],
};

// Same as targetsWithTasks but also declaring corporate artifacts (one local file, one URL).
const targetsWithCorporate = {
  ...targetsWithTasks,
  corporateArtifacts: {
    found: true,
    configPath: '/repo/.superpowers/corporate-artifacts.yml',
    entries: [
      { kind: 'path', value: 'docs/corp/prd-x.md', resolvedPath: '/repo/docs/corp/prd-x.md', exists: true },
      { kind: 'url', value: 'https://wiki.empresa.com/x', resolvedPath: null, exists: null, fetchable: false },
    ],
  },
};

test('every reviewer is tier "capable" with an explicit resolved model', () => {
  const { dir, manifest } = build(targetsWithTasks, ['--capable-model', 'sonnet']);
  try {
    assert.ok(manifest.agents.length >= 3);
    for (const a of manifest.agents) {
      assert.equal(a.tier, 'capable', `${a.label} must be capable`);
      assert.equal(a.model, 'sonnet', `${a.label} must carry the explicit model`);
      assert.ok(typeof a.goal === 'string' && a.goal.length > 0);
    }
    assert.equal(manifest.modelTiers.capable, 'sonnet');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Lens 3 (spec ↔ tasks) is included when tasks exist', () => {
  const { dir, manifest } = build(targetsWithTasks, ['--capable-model', 'sonnet']);
  try {
    assert.equal(manifest.reviewIncludesTasks, true);
    assert.equal(manifest.agents.length, 4);
    const lens3 = manifest.agents.find((a) => a.label.startsWith('lens-3'));
    assert.ok(lens3, 'lens-3 present');
    // lens 3 reads the tasks it must cross-check
    assert.ok(lens3.readFiles.some((f) => /task-01\.md$/.test(f)));
    assert.ok(lens3.readFiles.some((f) => /task-02\.md$/.test(f)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Lens 3 is omitted for a pure spec review (no tasks)', () => {
  const { dir, manifest } = build(targetsNoTasks, ['--capable-model', 'sonnet']);
  try {
    assert.equal(manifest.reviewIncludesTasks, false);
    assert.equal(manifest.agents.length, 3);
    assert.ok(!manifest.agents.some((a) => a.label.startsWith('lens-3')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--no-tasks forces Lens 3 out even when tasks are present', () => {
  const { dir, manifest } = build(targetsWithTasks, ['--capable-model', 'sonnet', '--no-tasks']);
  try {
    assert.equal(manifest.reviewIncludesTasks, false);
    assert.ok(!manifest.agents.some((a) => a.label.startsWith('lens-3')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Lens 5 (spec ↔ corporate) is included when corporate artifacts exist', () => {
  const { dir, manifest } = build(targetsWithCorporate, ['--capable-model', 'sonnet']);
  try {
    assert.equal(manifest.reviewIncludesCorporate, true);
    // tasks (lens 3) + corporate (lens 5) both present → all five lenses
    assert.equal(manifest.agents.length, 5);
    const lens5 = manifest.agents.find((a) => a.label.startsWith('lens-5'));
    assert.ok(lens5, 'lens-5 present');
    // reads the LOCAL corporate artifact it must cross-check
    assert.ok(lens5.readFiles.some((f) => /docs\/corp\/prd-x\.md$/.test(f)));
    // a URL is not fetchable by a read-only reviewer, so it is NOT added as a readFile
    assert.ok(!lens5.readFiles.some((f) => /^https?:/.test(f)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Lens 5 is omitted when no corporate artifacts are declared', () => {
  const { dir, manifest } = build(targetsWithTasks, ['--capable-model', 'sonnet']);
  try {
    assert.equal(manifest.reviewIncludesCorporate, false);
    assert.ok(!manifest.agents.some((a) => a.label.startsWith('lens-5')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--no-corporate forces Lens 5 out even when corporate artifacts are present', () => {
  const { dir, manifest } = build(targetsWithCorporate, ['--capable-model', 'sonnet', '--no-corporate']);
  try {
    assert.equal(manifest.reviewIncludesCorporate, false);
    assert.ok(!manifest.agents.some((a) => a.label.startsWith('lens-5')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the corporate-inclusive manifest still passes validate-dispatch', () => {
  const { dir, manifest } = build(targetsWithCorporate, ['--capable-model', 'sonnet']);
  try {
    const v = validate(manifest);
    assert.equal(v.valid, true, `validate-dispatch errors: ${JSON.stringify(v.errors)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the emitted manifest passes validate-dispatch (explicit model, tier↔model equality)', () => {
  const { dir, manifest } = build(targetsWithTasks, ['--capable-model', 'sonnet']);
  try {
    const v = validate(manifest);
    assert.equal(v.valid, true, `validate-dispatch errors: ${JSON.stringify(v.errors)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('"auto" capable model resolves to auto and still passes validate-dispatch', () => {
  const { dir, manifest } = build(targetsWithTasks, ['--capable-model', 'auto']);
  try {
    for (const a of manifest.agents) assert.equal(a.model, 'auto');
    assert.equal(manifest.modelTiers.capable, 'auto');
    const v = validate(manifest);
    // "auto" is a legitimate harness-picks: equality gate skipped, model non-empty.
    assert.equal(v.valid, true, `validate-dispatch errors: ${JSON.stringify(v.errors)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
