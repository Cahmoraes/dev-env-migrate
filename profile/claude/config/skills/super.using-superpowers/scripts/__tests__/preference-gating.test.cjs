'use strict';

/**
 * Flow-level guards that every preference is HONORED when on and SKIPPED when off,
 * with no coupling between independent preferences. Companion to
 * native-review-flow.test.cjs (which covers the opt-in native review skills).
 *
 * Preferences guarded here, plus one retired key that must stay retired:
 *   - optimization.caveman        → the subagent caveman block
 *   - workflow.auto_commit        → the implementer's commit step
 *   - workflow.visual_companion   → super.brainstorming's companion offer
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

// parallel-subagent-in-tree's Step 2 delegates its caveman policy
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

// ─── a retired preference stays retired ──────────────────────────────────────
//
// `memory.persistent_memory` gated a memory database that no longer exists; recall now
// derives from `docs/superpowers/` on every session with nothing to configure. The key
// survives in the preferences.yml of every repo that ran the old onboarding, so the
// contract is: read it, ignore it, never resurrect it as a session variable.

test('a legacy memory: key is dropped by the loader instead of read back', () => {
  const root = mkRepo();
  try {
    writeYaml(root, 'communication:\n  language: pt-BR\nmemory:\n  persistent_memory: true\n');
    const prefs = readPrefs(root);
    assert.ok(!('memory' in prefs), 'the retired key must not come back through the loader');
    assert.equal(prefs.communication.language, 'pt-BR', 'the rest of the file still parses');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const rel of EXECUTION_SKILLS) {
  test(`${rel}: carries no memory gate to condition`, () => {
    const body = readSkillBody(rel);
    assert.ok(
      !/session_memory_enabled|persistent_memory|pmem/.test(body),
      `${rel} still references the retired memory mechanism`,
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

// ─── visual_companion — offered when on, silently absent when off ────────────
//
// Two layers, because either one alone lets the preference through: the data layer
// (the key exists, defaults on, honors false) and the prose layer (super.brainstorming
// actually consults it BEFORE the visual-signals checklist that makes the offer
// mandatory — a gate written after the checklist would never be reached).

test('visual_companion data: on by default, honored when set false', () => {
  const root = mkRepo();
  try {
    writeYaml(root, 'communication:\n  language: pt-BR\n');
    assert.equal(readPrefs(root).workflow.visual_companion, true, 'default must be on');
    writeYaml(root, 'workflow:\n  visual_companion: false\n');
    assert.equal(readPrefs(root).workflow.visual_companion, false, 'false must be honored');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Checklist item 2 is where the gate has to live: a blind-executor probe (arm with
// visual_companion:false) read a gate written only as prose in the Visual Companion section,
// listed "run the preference gate" as a future action, and offered the companion in the SAME
// turn. What changed the behaviour was the gate becoming item 2's first executable step, with
// the command in a fence — a described command gets improvised, a fenced one gets run.
function brainstormingItem2() {
  const body = readFile('super.brainstorming/SKILL.md');
  const start = body.indexOf('2. **Offer visual companion**');
  assert.ok(start >= 0, 'checklist item 2 must exist');
  return body.slice(start, body.indexOf('\n3. **Ask clarifying questions**', start));
}

test('checklist item 2 resolves the preference BEFORE evaluating any visual signal', () => {
  const item2 = brainstormingItem2();
  const gate = item2.indexOf('**Preference gate');
  const checklist = item2.indexOf('**Visual signals**');
  assert.ok(gate >= 0, 'item 2 must carry the preference gate — the offer is mandatory without it');
  assert.ok(checklist > gate,
    'the gate must precede the signals checklist inside item 2, or the offer fires before it is consulted');
  assert.ok(item2.includes('session_visual_companion_enabled'),
    'the gate must name the session variable a routed session already has');
  assert.ok(item2.includes('workflow.visual_companion'),
    'the gate must name the preference key it reads from the script output');
});

test('the gate carries the command as a runnable fence, not as a description', () => {
  const item2 = brainstormingItem2();
  const fence = item2.match(/```\n([\s\S]*?)```/);
  assert.ok(fence, 'the gate needs a fenced command — a described command gets improvised, not run');
  assert.match(fence[1], /read-preferences\.cjs/,
    'the fenced command must be the preferences read');
  assert.match(item2, /this turn/i,
    'the read must happen in the same turn as the decision, or the offer goes out before the answer');
});

test('a disabled companion is skipped silently — no offer, no browser mentioned, on any re-run', () => {
  const item2 = brainstormingItem2();
  assert.match(item2, /no signal fires/i,
    'with the companion off no visual signal may fire, or the checklist still makes the offer mandatory');
  assert.match(item2, /no offer/i, 'the offer must be skipped');
  assert.match(item2, /no mention of the browser/i,
    'silence is part of the skip — announcing a disabled companion is the same defect');
  assert.match(item2, /re-run/i,
    'the checklist is permanent, so the gate must hold on every re-run, not just the first evaluation');
  assert.match(item2, /default/i,
    'an absent preferences file must keep the current behaviour (enabled), never disable by omission');
});

test('the Visual Companion section defers to the gate instead of restating it', () => {
  const body = readFile('super.brainstorming/SKILL.md');
  const section = body.slice(body.indexOf('## Visual Companion'));
  const head = section.slice(0, section.indexOf('- The feature has a'));
  assert.match(head, /preference gate \(checklist item 2\)/i,
    'the section must name the gate that decides whether it applies at all');
  assert.match(head, /workflow\.visual_companion/,
    'a reader entering at this section must still learn which preference switches it off');
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

test('the mismatch is warned by the summary row, not by a question ahead of the triage', () => {
  // The other half of "presence is not consent": the branch has to be REACHABLE and it has
  // to be CHEAP. It was neither. Nothing looked at the disk, so the warning never fired at
  // all; and the written remedy was a yes/no question before the triage, which would have
  // charged a round trip every session for a config state that does not change between them.
  // The Session Summary already prints, so the row carries the warning for free.
  const body = readFile('super.using-superpowers/SKILL.md');
  const section = body.slice(body.indexOf('### Corporate Artifacts'));
  const section_end = section.indexOf('\n## ');
  const corporate = section_end > 0 ? section.slice(0, section_end) : section;

  assert.match(corporate, /declaredButDisabled/,
    'the router must branch on the disk probe, or it never learns the file is there');
  assert.match(corporate, /Session Summary/,
    'the router must name where the warning is delivered');
  assert.match(corporate, /do not also ask before the triage|not also ask/i,
    'the router must forbid stacking a question on top of the row');
  assert.match(corporate, /triage option 0|option 0/,
    'declining to ask only works if the user is told how to turn it on');

  const ref = readFile('super.using-superpowers/references/session-start.md');
  assert.match(ref, /não carregados/,
    'the summary row must state that declared-but-unconsented artifacts are NOT loaded');
});

test('the bootstrap probe reports presence and count, never the declared paths', () => {
  // A path list in the controller's context is an invitation to act on a declaration the
  // user never made — the same failure the consent flag exists to prevent, one layer down.
  const script = readFile('super.using-superpowers/scripts/derive-session-state.cjs');
  const probe = script.slice(script.indexOf('function probeCorporateArtifacts'));
  const body = probe.slice(0, probe.indexOf('\n}\n'));
  assert.doesNotMatch(body, /\bentries\b/,
    'probeCorporateArtifacts must not return the entries — count and path only');
  assert.match(script, /never carries the declared entries|does NOT\n \* {2}report the entries/i,
    'the omission must be documented as deliberate, or someone re-adds it as a convenience');
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

test('preferences are independent: caveman off + qa_gate on + auto_commit off coexist', () => {
  const root = mkRepo();
  try {
    writeYaml(root,
      'workflow:\n  auto_commit: false\n  qa_gate: true\n' +
      'optimization:\n  caveman: false\n');
    const p = readPrefs(root);
    assert.equal(p.workflow.auto_commit, false);
    assert.equal(p.workflow.qa_gate, true);
    assert.equal(p.optimization.caveman, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
