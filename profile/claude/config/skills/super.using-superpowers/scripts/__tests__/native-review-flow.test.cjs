'use strict';

/**
 * Flow-level guards for the opt-in native review skills (/code-review, Copilot
 * `review`).
 *
 * Prose layer only: the three execution skills must keep the broad final reviewer
 * UNCONDITIONAL and every native pass GUARDED by its session flag. If a future edit makes
 * a native pass run unconditionally (the "runs even when disabled" regression) or drops the
 * "gates always run" guarantee, these assertions fail.
 *
 * The data layer (flags absent/false read back OFF, one platform never bleeding into the
 * other) is derive-session-state.test.cjs + preferences-options-matrix.test.cjs.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/native-review-flow.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

// The execution skill delegates its
// Step 5 final-stage prose (final reviewer, /code-review, Copilot review,
// per-task-gates-unaffected) to final-stage.md instead of duplicating it — so
// its body must include it here too, or every guard below sees it as missing.
// final-stage.md hard-wraps its prose at ~100 cols, so a sentence checked by a
// literal-space regex can straddle a line break; collapse whitespace runs to a
// single space so wrapping never masks content that is actually present.
const FINAL_STAGE = fs
  .readFileSync(path.join(SKILLS, 'super.subagent-driven-development', 'references', 'final-stage.md'), 'utf8')
  .replace(/\s+/g, ' ');
// The sequential skill's inline copy of the tail lived past the 20.000-char compaction
// window and was dropped on resume, so it was replaced by a pointer to the canonical file.
const DELEGATES_FINAL_STAGE = new Set([
  'super.subagent-driven-development',
]);

const EXECUTION_SKILLS = [
  'super.subagent-driven-development',
].map((name) => ({
  name,
  body: fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8') + (DELEGATES_FINAL_STAGE.has(name) ? '\n' + FINAL_STAGE : ''),
}));

/** Lines mentioning `needle`, so each can be checked for its guard on the same line. */
function linesWith(body, needle) {
  return body.split('\n').filter((line) => line.includes(needle));
}

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
// invokes /code-review or the Copilot `review` skill duplicates the
// controller-owned final pass and defeats the no-overlap design. Each per-task
// reviewer prompt must forbid it in prose.

const PER_TASK_REVIEW_PROMPTS = [
  'super.subagent-driven-development/agents/task-reviewer.md',
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
