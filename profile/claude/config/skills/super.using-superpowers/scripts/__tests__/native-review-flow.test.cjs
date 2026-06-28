'use strict';

/**
 * Flow-level guards for the opt-in native review skills (/simplify, /code-review,
 * Copilot `review`).
 *
 * Two layers are tested:
 *   1. Data layer  — when the flags are absent or false, the preferences object
 *      reads back with every native pass OFF, so the flow runs the pre-existing
 *      gates only (no regression). Enabling one platform never bleeds into the other.
 *   2. Prose layer — the three execution skills must keep the broad final reviewer
 *      UNCONDITIONAL and every native pass GUARDED by its session flag. If a future
 *      edit makes a native pass run unconditionally (the "runs even when disabled"
 *      regression) or drops the "gates always run" guarantee, these assertions fail.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPTS = path.resolve(__dirname, '..');
const READ = path.join(SCRIPTS, 'read-preferences.cjs');
const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

const EXECUTION_SKILLS = [
  'super.subagent-driven-development',
  'super.parallel-subagent-in-tree',
  'super.parallel-subagent-development',
].map((name) => ({ name, body: fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8') }));

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'native-flow-'));
}

function read(root) {
  const out = execFileSync('node', [READ, '--repo-root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out);
}

function writeYaml(root, yaml) {
  fs.mkdirSync(path.join(root, '.superpowers'), { recursive: true });
  fs.writeFileSync(path.join(root, '.superpowers', 'preferences.yml'), yaml, 'utf8');
}

/** Lines mentioning `needle`, so each can be checked for its guard on the same line. */
function linesWith(body, needle) {
  return body.split('\n').filter((line) => line.includes(needle));
}

// ─── Layer 1: data — the disabled path is clean ──────────────────────────────

test('a preferences file with NO platform sections reads back with every native pass off', () => {
  const root = mkRepo();
  try {
    // A minimal real-world file: the user only set the basics, never touched
    // copilot:/claude_code:. The flow must see all native passes disabled.
    writeYaml(root, 'workflow:\n  auto_commit: true\ncommunication:\n  language: pt-BR\n');
    const p = read(root).preferences;
    assert.equal(p.claude_code.simplify, false);
    assert.equal(p.claude_code.code_review_final, false);
    assert.equal(p.claude_code.code_review_effort, 'medium');
    assert.equal(p.copilot.review_final, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit false flags are never coerced to true', () => {
  const root = mkRepo();
  try {
    writeYaml(root,
      'claude_code:\n  simplify: false\n  code_review_final: false\n' +
      'copilot:\n  review_final: false\n');
    const p = read(root).preferences;
    assert.equal(p.claude_code.simplify, false);
    assert.equal(p.claude_code.code_review_final, false);
    assert.equal(p.copilot.review_final, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('enabling Claude Code passes does not bleed into Copilot, and vice-versa', () => {
  const root = mkRepo();
  try {
    writeYaml(root, 'claude_code:\n  simplify: true\n  code_review_final: true\n  code_review_effort: high\n');
    let p = read(root).preferences;
    assert.equal(p.claude_code.code_review_final, true);
    assert.equal(p.copilot.review_final, false, 'Copilot stays off when only Claude Code is enabled');

    writeYaml(root, 'copilot:\n  review_final: true\n');
    p = read(root).preferences;
    assert.equal(p.copilot.review_final, true);
    assert.equal(p.claude_code.code_review_final, false, 'Claude Code stays off when only Copilot is enabled');
    assert.equal(p.claude_code.code_review_effort, 'medium', 'effort stays at its inert default');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── Layer 2: prose — guards survive future edits ────────────────────────────

for (const { name, body } of EXECUTION_SKILLS) {
  test(`${name}: the broad final reviewer is dispatched unconditionally`, () => {
    assert.match(
      body,
      /Always dispatch the final code reviewer/,
      'the broad final reviewer must run regardless of the native flags — losing this is the regression',
    );
  });

  test(`${name}: every /code-review invocation is guarded by its session flag`, () => {
    // Match the parameterized invocation form, not bare cross-references like
    // "(`/code-review` on Claude Code, `review` on Copilot CLI)".
    const hits = linesWith(body, '/code-review <session_code_review_effort>');
    assert.ok(hits.length > 0, 'expected at least one /code-review invocation');
    for (const line of hits) {
      assert.ok(
        line.includes('session_code_review_final_enabled'),
        `unguarded /code-review would run even when disabled:\n  ${line.trim()}`,
      );
    }
  });

  test(`${name}: the native Copilot review pass is guarded by its session flag`, () => {
    const hits = linesWith(body, 'native `review` skill');
    assert.ok(hits.length > 0, 'expected the final-review step to mention the native review skill');
    for (const line of hits) {
      assert.ok(
        line.includes('session_copilot_review_final_enabled'),
        `unguarded Copilot review would run even when disabled:\n  ${line.trim()}`,
      );
    }
  });

  test(`${name}: /simplify is guarded by session_simplify_enabled`, () => {
    const hits = linesWith(body, '`/simplify`');
    const invocation = hits.filter((l) => l.includes('If `session_simplify_enabled`'));
    assert.ok(
      invocation.length > 0,
      '/simplify must only run when session_simplify_enabled is set',
    );
  });

  test(`${name}: states the per-task spec + quality gates are unaffected`, () => {
    assert.match(
      body,
      /per-task spec \+ quality gates already ran and are unaffected/,
      'the always-on gates guarantee must stay documented in the final-review step',
    );
  });
}

// ─── Entry point invariants (super.using-superpowers/SKILL.md) ───────────────

test('SKILL.md declares the native session variables with safe defaults', () => {
  const skill = fs.readFileSync(path.join(SKILLS, 'super.using-superpowers', 'SKILL.md'), 'utf8');
  for (const v of [
    'session_simplify_enabled',
    'session_code_review_final_enabled',
    'session_code_review_effort',
    'session_copilot_review_final_enabled',
  ]) {
    assert.ok(skill.includes(v), `missing session variable ${v}`);
  }
  assert.match(skill, /default final reviewer always runs/i,
    'the entry point must document that the broad reviewer always runs');
});

// ─── Per-task review gates must not invoke native review skills ───────────────
// Regression guard for the "task-02 leak": a per-task spec/quality reviewer that
// invokes /code-review, /simplify, or the Copilot `review` skill duplicates the
// controller-owned final pass and defeats the no-overlap design. Each per-task
// reviewer prompt must forbid it in prose.

const PER_TASK_REVIEW_PROMPTS = [
  'super.subagent-driven-development/agents/spec-reviewer.md',
  'super.subagent-driven-development/agents/code-quality-reviewer.md',
  'super.requesting-code-review/agents/code-reviewer.md',
];

for (const rel of PER_TASK_REVIEW_PROMPTS) {
  test(`${rel}: forbids invoking native review skills from a per-task gate`, () => {
    const body = fs.readFileSync(path.join(SKILLS, rel), 'utf8');
    assert.match(
      body,
      /Do not invoke native review skills/,
      `${rel} must forbid native review skills — invoking one per-task duplicates the final pass (the task-02 leak)`,
    );
  });
}
