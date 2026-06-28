'use strict';

/**
 * Flow-level guards that every preference is HONORED when on and SKIPPED when off,
 * with no coupling between independent preferences. Companion to
 * native-review-flow.test.cjs (which covers the opt-in native review skills).
 *
 * Three preferences are guarded here:
 *   - optimization.caveman      → the subagent caveman block
 *   - memory.persistent_memory  → the memory gate / persistence steps
 *   - workflow.auto_commit      → the implementer's commit step
 *
 * Two layers, same as the native-review guards:
 *   1. Data layer  — render-caveman-block.cjs and read-preferences.cjs return the
 *      right thing across a matrix of preference values (on/off, every level).
 *   2. Prose layer — the skills and prompt templates keep each preference GUARDED.
 *      The caveman block in particular must be rendered deterministically, never
 *      hand-assembled: the hand-fill placeholder is the exact bug we are locking out
 *      (it was mis-filled as "active" + a contradicting "respond normally", so
 *      dispatched subagents silently ran without caveman).
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/preference-gating.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPTS = path.resolve(__dirname, '..');
const RENDER = path.join(SCRIPTS, 'render-caveman-block.cjs');
const READ = path.join(SCRIPTS, 'read-preferences.cjs');
const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

function readFile(rel) {
  return fs.readFileSync(path.join(SKILLS, rel), 'utf8');
}
function renderJson(args) {
  return JSON.parse(execFileSync('node', [RENDER, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
}
function readPrefs(root) {
  return JSON.parse(execFileSync('node', [READ, '--repo-root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).preferences;
}
function writeYaml(root, yaml) {
  fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), yaml, 'utf8');
}
function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pref-gating-'));
}

// Every file that carries a caveman block for a dispatched subagent.
const CAVEMAN_SURFACES = [
  'super.subagent-driven-development/agents/implementer.md',
  'super.subagent-driven-development/agents/spec-reviewer.md',
  'super.subagent-driven-development/agents/code-quality-reviewer.md',
  'super.subagent-driven-development/SKILL.md',
  'super.parallel-subagent-in-tree/SKILL.md',
  'super.parallel-subagent-development/SKILL.md',
  'super.user-story-verification/SKILL.md',
];

const EXECUTION_SKILLS = [
  'super.subagent-driven-development/SKILL.md',
  'super.parallel-subagent-in-tree/SKILL.md',
  'super.parallel-subagent-development/SKILL.md',
];

// Signatures of the old hand-fill placeholder. None may survive — re-introducing
// any of these is the regression that re-opens the caveman bug.
const HANDFILL_SIGNATURES = [
  'If caveman is active',
  'if not active: omit',
  'if not: omit',
  'if session_caveman_active = true →',
];

// ─── Caveman — data layer (honored on, skipped off, across the level matrix) ──

test('caveman OFF → empty block in every format', () => {
  for (const format of ['section', 'field']) {
    const r = renderJson(['--active', 'false', '--level', 'full', '--format', format]);
    assert.equal(r.active, false);
    assert.equal(r.block, '', `format ${format} must yield no block when caveman is off`);
  }
});

test('caveman ON → directive carrying the exact configured level', () => {
  for (const level of ['lite', 'full', 'ultra', 'wenyan-lite', 'wenyan-full', 'wenyan-ultra']) {
    const r = renderJson(['--active', 'true', '--level', level]);
    assert.equal(r.active, true);
    assert.equal(r.level, level);
    assert.ok(r.block.includes(`/caveman ${level}`), `block must invoke /caveman at ${level}`);
  }
});

test('caveman level passes through verbatim (renderer is not the level authority)', () => {
  // A level the renderer has never heard of must still pass through unchanged,
  // so adding a new caveman level never requires touching this script.
  const r = renderJson(['--active', 'true', '--level', 'future-level-x']);
  assert.ok(r.block.includes('/caveman future-level-x'));
});

// ─── Caveman — prose layer (deterministic, never hand-assembled) ──────────────

for (const rel of CAVEMAN_SURFACES) {
  test(`${rel}: renders the caveman block via the script, not by hand`, () => {
    const body = readFile(rel);
    assert.ok(
      body.includes('render-caveman-block.cjs'),
      `${rel} must delegate the caveman block to render-caveman-block.cjs`,
    );
  });

  test(`${rel}: contains no hand-fill placeholder (caveman bug regression guard)`, () => {
    const body = readFile(rel);
    for (const sig of HANDFILL_SIGNATURES) {
      assert.ok(
        !body.includes(sig),
        `${rel} still contains the hand-fill placeholder "${sig}" — the caveman bug can re-occur`,
      );
    }
  });
}

// ─── persistent_memory — honored on, skipped off ─────────────────────────────

test('persistent_memory data: off by default, honored when set true', () => {
  const root = mkRepo();
  try {
    writeYaml(root, 'communication:\n  language: pt-BR\n');
    assert.equal(readPrefs(root).memory.persistent_memory, false, 'default must be off');
    writeYaml(root, 'memory:\n  persistent_memory: true\n');
    assert.equal(readPrefs(root).memory.persistent_memory, true, 'true must be honored');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const rel of EXECUTION_SKILLS) {
  test(`${rel}: the memory gate is conditioned on session_memory_enabled`, () => {
    const body = readFile(rel);
    assert.ok(
      body.includes('session_memory_enabled'),
      `${rel} must gate memory steps on session_memory_enabled (skip them when off)`,
    );
  });
}

// ─── auto_commit — honored on, skipped off ───────────────────────────────────

test('auto_commit data: on by default, honored when set false', () => {
  const root = mkRepo();
  try {
    writeYaml(root, 'communication:\n  language: pt-BR\n');
    assert.equal(readPrefs(root).workflow.auto_commit, true, 'default must be on');
    writeYaml(root, 'workflow:\n  auto_commit: false\n');
    assert.equal(readPrefs(root).workflow.auto_commit, false, 'false must be honored');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('implementer prompt conditions the commit step on workflow.auto_commit', () => {
  const body = readFile('super.subagent-driven-development/agents/implementer.md');
  assert.ok(body.includes('auto_commit'), 'the implementer must gate its commit on workflow.auto_commit');
  assert.match(
    body,
    /auto_commit.*false.*do NOT commit/is,
    'the implementer must explicitly skip the commit when auto_commit is false',
  );
});

// ─── No coupling — one preference off does not disable another ────────────────

test('preferences are independent: caveman off + memory on + auto_commit off coexist', () => {
  const root = mkRepo();
  try {
    writeYaml(root,
      'workflow:\n  auto_commit: false\n' +
      'memory:\n  persistent_memory: true\n' +
      'optimization:\n  caveman: false\n');
    const p = readPrefs(root);
    assert.equal(p.workflow.auto_commit, false);
    assert.equal(p.memory.persistent_memory, true);
    assert.equal(p.optimization.caveman, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
