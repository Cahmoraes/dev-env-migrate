'use strict';

// Tests build-review-lead-dispatch.cjs — the single capable review-lead dispatch the
// controller sends. Pins the entry shape (file + one-line pointer), the rendered prompt
// (every placeholder and base-dir token resolved, lens table present), and the junction the
// lead depends on: the build-review-dispatch + validate-dispatch commands rendered into its
// prompt actually run against the same targets and produce a valid lens manifest.
//
// Run: node --test super.reviewing-specs/scripts/__tests__/build-review-lead-dispatch.test.cjs

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'build-review-lead-dispatch.cjs');

function fixture(targetsOverride = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-lead-'));
  const spec = path.join(dir, 'docs', 'superpowers', 'rate-limit', 'specs', 'rate-limit-design.md');
  fs.mkdirSync(path.dirname(spec), { recursive: true });
  fs.writeFileSync(spec, '# Rate limit\n');
  const targets = {
    featureName: 'rate-limit', repoRoot: dir,
    spec: { found: true, path: spec }, prd: { found: false }, tasksIndex: { found: false }, taskFiles: [],
    corporateArtifacts: { found: false, entries: [] },
    ...targetsOverride,
  };
  const targetsPath = path.join(dir, 'targets.json');
  fs.writeFileSync(targetsPath, JSON.stringify(targets));
  return { dir, targetsPath, spec };
}

function build(args) {
  return JSON.parse(execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

test('one capable entry: description, model and a one-line pointer; the prompt, lens prompts, manifest and report live under promptDir', () => {
  const { dir, targetsPath } = fixture();
  try {
    const out = build(['--targets', targetsPath, '--capable-model', 'sonnet', '--language', 'pt-BR', '--domain-expertise', 'rate limiting / NestJS', '--prompt-dir', path.join(dir, 'p')]);
    assert.equal(out.tier, 'capable');
    assert.equal(out.model, 'sonnet');
    assert.equal(out.promptDir, path.join(dir, 'p'));
    assert.equal(out.reportPath, path.join(dir, 'p', 'review-report.md'));
    assert.equal(out.dispatches.length, 1);
    const d = out.dispatches[0];
    assert.deepEqual(Object.keys(d).sort(), ['description', 'label', 'model', 'prompt', 'promptFile']);
    assert.equal(d.label, 'review-lead');
    assert.equal(d.description, 'Lead spec review — rate-limit');
    assert.equal(d.model, 'sonnet');
    assert.ok(!d.prompt.includes('\n') && d.prompt.includes(d.promptFile));
    assert.equal(path.dirname(d.promptFile), out.promptDir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the rendered prompt resolves every placeholder and base-dir token, names the report, carries the lens table and the declared fallback', () => {
  const { dir, targetsPath, spec } = fixture();
  try {
    const out = build(['--targets', targetsPath, '--capable-model', 'sonnet', '--language', 'pt-BR', '--prompt-dir', path.join(dir, 'p')]);
    const body = fs.readFileSync(out.dispatches[0].promptFile, 'utf8');
    assert.equal((body.match(/\{[A-Z_]+\}/g) || []).length, 0, 'no placeholder left');
    assert.equal((body.match(/<super\.[a-z-]+-base-dir>/g) || []).length, 0, 'no base-dir token left');
    assert.ok(!/^Subagent \(|^ {2}model:/m.test(body), 'the file is the prompt body, not the dispatch header');
    assert.ok(body.includes(`Spec under review: ${spec}`));
    assert.ok(body.includes(`Report file to write: ${out.reportPath}`));
    assert.ok(body.includes('Domain expertise: generic'), '--domain-expertise defaults to generic');
    assert.match(body, /closed \*unambiguously\*/, 'Lens 1 row names the unambiguity angle');
    assert.match(body, /an unhappy path for every flow step/, 'Lens 4 row names the per-step unhappy path');
    assert.match(body, /`Lenses: sequential \(no dispatch available\)`/, 'a lead that cannot dispatch declares it');
    assert.match(body, /never ask a question/);
    for (const script of [/"(\/[^"]+\/build-review-dispatch\.cjs)"/, /"(\/[^"]+\/validate-dispatch\.cjs)"/]) {
      const m = body.match(script);
      assert.ok(m && fs.existsSync(m[1]), `rendered command points at a real script: ${m && m[1]}`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('junction: the commands rendered into the lead prompt run as written and yield a valid capable lens manifest', () => {
  const { dir, targetsPath } = fixture();
  try {
    const out = build(['--targets', targetsPath, '--capable-model', 'opus', '--language', 'pt-BR', '--prompt-dir', path.join(dir, 'p')]);
    const body = fs.readFileSync(out.dispatches[0].promptFile, 'utf8');
    const commands = body.split('\n').filter((l) => /^ {4}node "/.test(l)).map((l) => l.trim());
    assert.equal(commands.length, 2, 'build + validate');
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const b = spawnSync('bash', ['-c', commands[0]], { encoding: 'utf8', env });
    assert.equal(b.status, 0, b.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'p', 'lens-manifest.json'), 'utf8'));
    assert.equal(manifest.agents.length, 3, 'spec-only review: lenses 1, 2, 4');
    assert.ok(manifest.dispatches.every((d) => d.model === 'opus' && d.promptFile.startsWith(path.join(dir, 'p', 'lenses'))));
    const v = spawnSync('bash', ['-c', commands[1]], { encoding: 'utf8', env });
    assert.equal(JSON.parse(v.stdout).valid, true, v.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('"auto" stays auto; default prompt dir is a fresh temp dir', () => {
  const { dir, targetsPath } = fixture();
  const out = build(['--targets', targetsPath, '--capable-model', '', '--language', 'en']);
  try {
    assert.equal(out.model, 'auto');
    assert.ok(path.basename(out.promptDir).startsWith('superpowers-review-lead-dispatch-'));
    assert.ok(fs.readFileSync(out.dispatches[0].promptFile, 'utf8').includes('--capable-model "auto"'));
  } finally {
    fs.rmSync(out.promptDir, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses stdin targets, a targets file without spec.path, and values that would break the quoted shell argument', () => {
  const { dir, targetsPath } = fixture();
  const noSpec = path.join(dir, 'nospec.json');
  fs.writeFileSync(noSpec, JSON.stringify({ featureName: 'x' }));
  const fails = (args, re) => {
    const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, re);
  };
  try {
    fails(['--targets', '-', '--capable-model', 'sonnet', '--language', 'pt-BR'], /must be a file path/);
    fails(['--targets', noSpec, '--capable-model', 'sonnet', '--language', 'pt-BR'], /no spec\.path/);
    fails(['--targets', targetsPath, '--capable-model', 'sonnet', '--language', 'pt-BR', '--domain-expertise', 'say "hi"'], /must not contain/);
    fails(['--targets', targetsPath, '--capable-model', 'sonnet'], /--language <lang> is required/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
