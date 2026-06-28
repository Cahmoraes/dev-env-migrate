'use strict';

/**
 * Prose-guard: caveman activation must be IDEMPOTENT — `/caveman` is invoked at
 * most once per active window, guarded by `session_caveman_in_effect`.
 *
 * Without this guard there were two double-fire windows that re-loaded the caveman
 * skill for nothing (correct behavior, wasted tokens):
 *   (a) the gate policy + an execution skill's Step 2 both activating;
 *   (b) the post-compaction re-activation followed by the execution skill's own
 *       caveman check.
 *
 * These tests fail if a future edit drops the liveness flag or its guard.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/caveman-idempotency.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const ROUTER = 'super.using-superpowers/SKILL.md';
const EXECUTION_SKILLS = [
  'super.subagent-driven-development/SKILL.md',
  'super.parallel-subagent-in-tree/SKILL.md',
  'super.parallel-subagent-development/SKILL.md',
];

test('router declares the session_caveman_in_effect liveness flag', () => {
  const body = read(ROUTER);
  assert.match(body, /session_caveman_in_effect/, 'the liveness flag must be declared in the router');
});

test('router states the idempotency rule (skip re-invoking when already in effect)', () => {
  const body = read(ROUTER);
  // The rule must tie "in effect" to NOT re-invoking.
  assert.match(
    body,
    /idempotent/i,
    'the router must call the activation idempotent',
  );
  assert.match(
    body,
    /(skip|do not|never).{0,80}(invoke|re-invoke|re-load)/is,
    'the router must instruct skipping the invocation when caveman is already in effect',
  );
});

for (const rel of EXECUTION_SKILLS) {
  test(`${rel}: caveman activation is guarded by session_caveman_in_effect`, () => {
    const body = read(rel);
    assert.match(
      body,
      /session_caveman_in_effect/,
      `${rel} must guard its caveman activation with the liveness flag (no unconditional re-invoke)`,
    );
  });

  test(`${rel}: deactivation resets session_caveman_in_effect to false`, () => {
    const body = read(rel);
    assert.match(
      body,
      /session_caveman_in_effect\s*=\s*false/,
      `${rel} must reset the liveness flag on deactivation so a later session can re-activate`,
    );
  });
}
