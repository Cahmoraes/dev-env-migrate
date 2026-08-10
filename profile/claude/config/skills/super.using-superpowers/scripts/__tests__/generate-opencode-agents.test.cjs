'use strict';

/**
 * Guards generate-opencode-agents.cjs — the bridge that lets opencode honor the
 * binding-tier invariant.
 *
 * WHY THIS MATTERS
 *   opencode's `task` tool has no `model` argument, so a tier cannot be resolved at
 *   dispatch time the way it is on Claude Code / Copilot CLI. The model lives on the
 *   AGENT DEFINITION, which means one agent per tier must exist before the first
 *   dispatch or every subagent silently inherits the controller's model — the exact
 *   over-provisioning bug references/model-selection.md exists to prevent.
 *
 *   These tests pin: the tier→model mapping, the read-only toolset split, the "auto"
 *   (null tier) degradation, and the fact that side effects are opt-in.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/generate-opencode-agents.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '..', 'generate-opencode-agents.cjs');

const TIERS_SET =
  'model_tiers:\n' +
  '  cheap: prov/cheap-model\n' +
  '  standard: prov/standard-model\n' +
  '  capable: prov/capable-model\n';

function mkRepo(yaml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-agents-'));
  fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), yaml, 'utf8');
  return root;
}

function run(root, extra = []) {
  const out = execFileSync('node', [SCRIPT, '--repo-root', root, ...extra], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

function byName(result, name) {
  const a = result.agents.find((x) => x.name === name);
  assert.ok(a, `roster must contain ${name}`);
  return a;
}

test('each execution tier gets its own agent, resolved to that tier\'s model', () => {
  const root = mkRepo(TIERS_SET);
  try {
    const r = run(root);
    // The tier is what `subagent_type` will carry, so the mapping must be exact.
    assert.equal(byName(r, 'sp-implementer-cheap').model, 'prov/cheap-model');
    assert.equal(byName(r, 'sp-implementer-standard').model, 'prov/standard-model');
    assert.equal(byName(r, 'sp-implementer-capable').model, 'prov/capable-model');
    // Gates floor at standard — there is deliberately no cheap reviewer.
    assert.equal(byName(r, 'sp-reviewer-standard').model, 'prov/standard-model');
    assert.equal(byName(r, 'sp-reviewer-capable').model, 'prov/capable-model');
    assert.ok(!r.agents.some((a) => a.name === 'sp-reviewer-cheap'),
      'a cheap reviewer would break the standard review floor');
    // Exploration/research is not a gate — it floors at cheap.
    assert.equal(byName(r, 'sp-explorer').model, 'prov/cheap-model');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a dry run reports the plan and writes absolutely nothing', () => {
  const root = mkRepo(TIERS_SET);
  try {
    const r = run(root);
    assert.equal(r.wrote, false);
    assert.ok(r.agents.every((a) => a.status === 'would-write'));
    assert.equal(fs.existsSync(path.join(root, '.opencode', 'agent')), false,
      'the default run must not create the agent directory');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('--write materializes every agent where opencode discovers them', () => {
  const root = mkRepo(TIERS_SET);
  try {
    const r = run(root, ['--write']);
    assert.equal(r.wrote, true);
    assert.equal(r.outDir, path.join(root, '.opencode', 'agent'));
    for (const a of r.agents) {
      assert.equal(a.status, 'written');
      assert.ok(fs.existsSync(a.path), `${a.name} must exist on disk`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an existing agent file is never clobbered without --force', () => {
  const root = mkRepo(TIERS_SET);
  try {
    run(root, ['--write']);
    const target = path.join(root, '.opencode', 'agent', 'sp-implementer-cheap.md');
    fs.writeFileSync(target, 'HAND EDITED', 'utf8');

    const again = run(root, ['--write']);
    assert.equal(byName(again, 'sp-implementer-cheap').status, 'exists');
    assert.equal(fs.readFileSync(target, 'utf8'), 'HAND EDITED',
      'a user-tuned agent must survive a re-run');

    const forced = run(root, ['--write', '--force']);
    assert.equal(byName(forced, 'sp-implementer-cheap').status, 'overwritten');
    assert.notEqual(fs.readFileSync(target, 'utf8'), 'HAND EDITED');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('an unset tier degrades to "auto": no model line, so the harness picks', () => {
  // null = auto is the documented contract, not a failure. Emitting a bogus model
  // would be worse than emitting none.
  const root = mkRepo('workflow:\n  auto_commit: true\n');
  try {
    const r = run(root, ['--write']);
    const cheap = byName(r, 'sp-implementer-cheap');
    assert.equal(cheap.model, null);
    assert.equal(cheap.auto, true);
    assert.equal(r.modelTiers.cheap, null);
    const body = fs.readFileSync(cheap.path, 'utf8');
    assert.ok(!/^model:/m.test(body), 'an auto tier must emit NO model: line');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('read-only agents deny edit/write/task; implementers keep write access', () => {
  const root = mkRepo(TIERS_SET);
  try {
    const r = run(root, ['--write']);

    for (const name of ['sp-reviewer-standard', 'sp-reviewer-capable', 'sp-explorer']) {
      const a = byName(r, name);
      assert.equal(a.readOnly, true, `${name} must be read-only`);
      const body = fs.readFileSync(a.path, 'utf8');
      assert.match(body, /^\s+edit: deny$/m, `${name} must deny edit`);
      assert.match(body, /^\s+write: deny$/m, `${name} must deny write`);
      assert.match(body, /^\s+task: deny$/m, `${name} must not re-dispatch`);
    }

    for (const name of ['sp-implementer-cheap', 'sp-implementer-standard', 'sp-implementer-capable']) {
      const a = byName(r, name);
      assert.equal(a.readOnly, false, `${name} must be able to write`);
      const body = fs.readFileSync(a.path, 'utf8');
      assert.match(body, /^\s+edit: allow$/m, `${name} must allow edit`);
      assert.match(body, /^\s+write: allow$/m, `${name} must allow write`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('EVERY agent denies `question` — a subagent must never prompt the user', () => {
  // The named consent gates (Branch Guard, QA gate, auto-commit, mode election)
  // belong to the orchestrator alone. A subagent that can ask turns an autonomous
  // per-task dispatch into a spurious approval prompt.
  const root = mkRepo(TIERS_SET);
  try {
    const r = run(root, ['--write']);
    for (const a of r.agents) {
      const body = fs.readFileSync(a.path, 'utf8');
      assert.match(body, /^\s+question: deny$/m, `${a.name} must deny question`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('every emitted agent declares mode: subagent', () => {
  const root = mkRepo(TIERS_SET);
  try {
    const r = run(root, ['--write']);
    for (const a of r.agents) {
      const body = fs.readFileSync(a.path, 'utf8');
      assert.match(body, /^mode: subagent$/m,
        `${a.name} must be a subagent, never a primary agent`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('--out-dir redirects the output without touching .opencode/agent', () => {
  const root = mkRepo(TIERS_SET);
  const alt = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-alt-'));
  try {
    const r = run(root, ['--write', '--out-dir', alt]);
    assert.equal(r.outDir, alt);
    assert.ok(fs.existsSync(path.join(alt, 'sp-explorer.md')));
    assert.equal(fs.existsSync(path.join(root, '.opencode', 'agent')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(alt, { recursive: true, force: true });
  }
});

test('an unknown flag fails loudly (exit 1) rather than silently doing the default', () => {
  const root = mkRepo(TIERS_SET);
  try {
    assert.throws(() => run(root, ['--wipe']), /exited with code 1|Command failed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
