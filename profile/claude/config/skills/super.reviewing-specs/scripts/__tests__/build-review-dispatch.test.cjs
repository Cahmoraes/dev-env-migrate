'use strict';

// Tests build-review-dispatch.cjs — emits a capable-tier dispatch manifest that
// super.dispatching-parallel-agents' validate-dispatch.cjs accepts. The key
// invariants: every reviewer is tier "capable" with an explicit model, Lens 3 is
// present iff tasks exist, and the emitted manifest actually passes validate-dispatch.
//
// Run: node --test super.reviewing-specs/scripts/__tests__/build-review-dispatch.test.cjs

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
  let args = extraArgs.includes('--language') ? extraArgs : ['--language', 'pt-BR', ...extraArgs];
  if (!args.includes('--prompt-dir')) args = [...args, '--prompt-dir', path.join(dir, 'prompts')];
  const out = execFileSync('node', [SCRIPT, '--targets', targetsPath, ...args], {
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

// ---- rendered dispatches -------------------------------------------------------------
// A cheap controller built the manifest, saw valid:true, then reviewed inline or sent
// subagents with `model:` omitted (15 eval runs, 2026-09-10). So the script renders the
// prompts; these tests pin what "ready to send" means. The rendered prompt lives in a file
// and the entry carries only short fields: a block printed on the controller's stdout was
// narrated, retyped without `model:`, or run inline (QA, 2026-09-11).

const specOnly = () => ({
  featureName: 'x', repoRoot: '/repo',
  spec: { path: '/repo/docs/superpowers/x/specs/x-design.md', found: true },
  prd: { found: false }, tasksIndex: { found: false }, taskFiles: [],
  corporateArtifacts: { found: false, entries: [] },
});

const promptOf = (d) => fs.readFileSync(d.promptFile, 'utf8');

test('dispatches[]: description, model and a one-line pointer per agent; the filled prompt lives in promptFile', () => {
  const { dir, manifest } = build(specOnly(), ['--capable-model', 'sonnet', '--domain-expertise', 'rate limiting / NestJS']);
  assert.equal(manifest.dispatches.length, manifest.agents.length);
  assert.equal(manifest.promptDir, path.join(dir, 'prompts'));
  manifest.dispatches.forEach((d, i) => {
    assert.deepEqual(Object.keys(d).sort(), ['description', 'label', 'model', 'prompt', 'promptFile'], 'no rendered block on stdout');
    assert.equal(d.label, manifest.agents[i].label);
    assert.equal(d.model, 'sonnet');
    assert.equal(d.description, `Review spec — ${manifest.agents[i].label.replace(/^lens-\d-/, '')}`);
    assert.ok(path.isAbsolute(d.promptFile) && d.promptFile.startsWith(manifest.promptDir));
    assert.ok(!d.prompt.includes('\n') && d.prompt.includes(d.promptFile), 'prompt is a one-line pointer to the file');
    const body = promptOf(d);
    assert.equal((body.match(/\{[A-Z_]+\}/g) || []).length, 0, `placeholders left in ${d.label}`);
    assert.ok(!/^Subagent \(|^ {2}model:|^ {2}description:/m.test(body), 'the file is the prompt body, not the dispatch header');
    assert.match(body, /^You are a principal-level software architect/, 'body dedented out of the prompt: | scalar');
    assert.ok(body.includes('rate limiting / NestJS'), 'domain expertise filled');
    assert.ok(body.includes('in pt-BR'), 'language filled');
    assert.ok(body.includes('/repo/docs/superpowers/x/specs/x-design.md'), 'spec path filled');
    assert.ok(body.includes('- PRD:          none'), 'absent companions read "none"');
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('each prompt file carries the probes of ITS lens, from references/review-lenses.md', () => {
  const { dir, manifest } = build(specOnly(), ['--capable-model', 'sonnet']);
  const byLabel = Object.fromEntries(manifest.dispatches.map((d) => [d.label, promptOf(d)]));
  const lens1 = byLabel['lens-1-Coerência interna & completude'];
  const lens2 = byLabel['lens-2-Spec ↔ realidade do código'];
  assert.ok(lens1.includes('Every named decision is closed'), 'lens 1 probe present in lens 1');
  assert.ok(!lens2.includes('Every named decision is closed'), 'lens 1 probe absent from lens 2');
  assert.ok(lens1.includes('## Your lens: Coerência interna & completude'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('without --prompt-dir the prompt files go to a fresh temp directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-dispatch-'));
  const targetsPath = path.join(dir, 'targets.json');
  fs.writeFileSync(targetsPath, JSON.stringify(specOnly()), 'utf8');
  const manifest = JSON.parse(execFileSync('node', [SCRIPT, '--targets', targetsPath, '--capable-model', 'sonnet', '--language', 'pt-BR'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  try {
    assert.ok(path.basename(manifest.promptDir).startsWith('superpowers-review-dispatch-'));
    assert.ok(manifest.dispatches.every((d) => fs.existsSync(d.promptFile)));
  } finally {
    fs.rmSync(manifest.promptDir, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('with tasks and corporate artifacts the companion lines are filled and the URL entries are marked not fetchable', () => {
  const targets = {
    ...specOnly(),
    tasksIndex: { found: true, path: '/repo/plans/tasks-x.md' },
    taskFiles: ['/repo/plans/task-01.md'],
    corporateArtifacts: { found: true, entries: [
      { kind: 'path', exists: true, resolvedPath: '/repo/corp/policy.md' },
      { kind: 'url', url: 'https://intranet/policy' },
    ] },
  };
  const { manifest } = build(targets, ['--capable-model', 'sonnet']);
  const lens3 = promptOf(manifest.dispatches.find((d) => d.label.startsWith('lens-3')));
  assert.ok(lens3.includes('- Tasks index:  /repo/plans/tasks-x.md'));
  assert.ok(lens3.includes('- Task files:   /repo/plans/task-01.md'));
  const lens5 = promptOf(manifest.dispatches.find((d) => d.label.startsWith('lens-5')));
  assert.ok(lens5.includes('/repo/corp/policy.md'));
  assert.ok(lens5.includes('https://intranet/policy (URL: not fetchable'));
  assert.equal(validate(manifest).valid, true, 'dispatches[] does not break validate-dispatch');
});

test('--language is required; --domain-expertise defaults to generic', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-dispatch-'));
  const targetsPath = path.join(dir, 'targets.json');
  fs.writeFileSync(targetsPath, JSON.stringify(specOnly()), 'utf8');
  assert.throws(
    () => execFileSync('node', [SCRIPT, '--targets', targetsPath, '--capable-model', 'sonnet'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    (e) => /--language <lang> is required/.test(e.stderr),
  );
  const { manifest } = build(specOnly(), ['--capable-model', 'auto']);
  assert.ok(promptOf(manifest.dispatches[0]).includes('Domain expertise for this review: generic.'));
  assert.equal(manifest.dispatches[0].model, 'auto');
});
