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
  'super.subagent-driven-development/agents/combined-reviewer.md',
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

// parallel-subagent-in-tree's Step 2 delegates its caveman/memory-gate policy
// wholesale to parallel-subagent-development's Step 2 ("Apply the policy...
// verbatim") instead of duplicating it — include the delegated body so the
// guard sees the real content.
const PARALLEL_DEV = 'super.parallel-subagent-development/SKILL.md';
function readSkillBody(rel) {
  const body = readFile(rel);
  return rel === 'super.parallel-subagent-in-tree/SKILL.md' ? body + '\n' + readFile(PARALLEL_DEV) : body;
}

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
    const body = readSkillBody(rel);
    assert.ok(
      body.includes('render-caveman-block.cjs'),
      `${rel} must delegate the caveman block to render-caveman-block.cjs`,
    );
  });

  test(`${rel}: contains no hand-fill placeholder (caveman bug regression guard)`, () => {
    const body = readSkillBody(rel);
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
    const body = readSkillBody(rel);
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

// ─── qa_gate — QA gate runs on, silently skipped off (incl. the PRD step) ─────

test('qa_gate data: on by default, honored when set false', () => {
  const root = mkRepo();
  try {
    writeYaml(root, 'communication:\n  language: pt-BR\n');
    assert.equal(readPrefs(root).workflow.qa_gate, true, 'default must be on');
    writeYaml(root, 'workflow:\n  qa_gate: false\n');
    assert.equal(readPrefs(root).workflow.qa_gate, false, 'false must be honored');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('finish-tail gates the QA gate on session_qa_gate_enabled and silences QA when off', () => {
  const body = readFile('super.subagent-driven-development/references/finish-tail.md');
  assert.ok(body.includes('session_qa_gate_enabled'),
    'finish-tail must gate the QA gate on session_qa_gate_enabled');
  assert.match(body, /skip this entire gate silently/i,
    'finish-tail must skip the whole QA gate silently when the preference is off');
  assert.match(body, /do \*\*not\*\* mention QA anywhere/i,
    'finish-tail must suppress every QA mention (including the PRD step) when off');
});

test('subagent-driven-development delegates the QA gate and keeps it conditional in its index', () => {
  // The full procedure — silent skip, the no-mention rule, PRD discovery, the verdict
  // table — is owned by finish-tail.md and asserted on it directly by the test above.
  // SKILL.md used to carry a second copy, 7.7 KB of it past the 20.000-char compaction
  // window, so on resume the model had neither copy. What must survive here is narrower
  // and load-bearing: the pointer, and enough of the condition that a controller reading
  // only the index never treats the QA gate as unconditional or announces it when off.
  const body = readFile('super.subagent-driven-development/SKILL.md');
  assert.match(body, /references\/finish-tail\.md/,
    'SKILL must point at finish-tail.md, or the QA gate has no owner the controller can reach');
  assert.ok(body.includes('session_qa_gate_enabled'),
    'the five-gate index must still name session_qa_gate_enabled as the QA gate condition');
  assert.match(body, /silent skip/i,
    'the index must say the skip is silent, or QA gets announced before the reference is read');
});

// ─── Corporate artifacts — the file on disk is NOT the consent signal ─────────
//
// The regression these lock out: `context.has_corporate_artifacts` was `false`, yet a
// leftover `.superpowers/corporate-artifacts.yml` (declaring a PRD the pipeline itself had
// written for an unrelated feature) was loaded anyway and handed corporate precedence —
// outranking the spec under review. Presence of a file is not the user declaring anything.

test('using-superpowers loads corporate artifacts only under the flag, never on file presence alone', () => {
  const body = readFile('super.using-superpowers/SKILL.md');
  const section = body.slice(body.indexOf('### Corporate Artifacts'));
  assert.ok(section.length > 0, 'the Corporate Artifacts section must exist in the router');
  assert.doesNotMatch(
    section.split('\n').slice(0, 8).join('\n'),
    /exists?\s+with\s+the\s+flag\s+off\)?,\s*read/i,
    'reading the yml because it "exists with the flag off" is the bug — presence is not consent',
  );
  assert.match(section, /do not load it|do not load them/i,
    'the flag-off + file-present branch must say NOT to load the artifacts');
  assert.match(section, /warn once|warn the user once/i,
    'the mismatch must still be surfaced — silence is the other failure mode');
});

test('reviewing-specs gates Lens 5 on consent + declaration, and reports the mismatch instead', () => {
  const body = readFile('super.reviewing-specs/SKILL.md');
  assert.ok(body.includes('has_corporate_artifacts'),
    'the Lens 5 switch must name the consent flag, not just the yml');
  assert.match(body, /not consent/i,
    'the SKILL must state that the file being on disk is not consent');
  assert.ok(body.includes('declaredButDisabled'),
    'the reviewer needs the field that carries the config mismatch');
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
