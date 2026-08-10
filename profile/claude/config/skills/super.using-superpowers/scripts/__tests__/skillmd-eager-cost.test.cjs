'use strict';

/**
 * skillmd-eager-cost.test.cjs — content that the ROUTER does not need must stay pay-on-read.
 *
 * Why this is worth a test: an invoked SKILL.md is charged to the context TWICE — once as the
 * `user` message ("Base directory for this skill: …") and again inside the `invoked_skills`
 * attachment. Measured on a real transcript, one `/super.using-superpowers` invocation cost
 * ~43.5k chars (~10.9k tokens), not the ~8.4k the file size suggests. So every byte left in the
 * eager SKILL.md is paid at roughly double rate, on every session, whether or not it gets used.
 *
 * The tier table and the verification-rigor invariant describe what a tier *provisions* — they
 * are consumed after routing, by brainstorming/planning/execution, not by the router deciding
 * where to send the user. They were moved to references/triage-sizing.md. This test keeps them
 * there: a future edit that pastes them back would silently re-inflate every session.
 *
 * The "Classification checklist" signal rubric used to stay eager for one reason only: the
 * router fills `assess-complexity.cjs --signals` at checkpoint 0, so deferring it would have
 * traded tokens for an extra round trip. That premise is gone — the bootstrap now `cat`s
 * references/session-start.md in the SAME call as the state read, so the rubric is already in
 * context when checkpoint 0 runs, at zero extra round trips. What the test guards is therefore
 * the invariant, not the location: the rubric and its invocation must be reachable without a
 * second round trip, which means SKILL.md has to keep `cat`ing that file from the bootstrap.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const ROUTER = 'super.using-superpowers/SKILL.md';
const REF = 'super.using-superpowers/references/triage-sizing.md';
const SESSION_START = 'super.using-superpowers/references/session-start.md';

test('the tier table lives in the reference, not in the eager SKILL.md', () => {
  const body = read(ROUTER);
  const ref = read(REF);

  const TABLE_HEADER = '| Tier | Criteria | Spec/PRD | Design | Tasks | Execution + Gates |';
  assert.ok(ref.includes(TABLE_HEADER),
    'references/triage-sizing.md must own the tier table');
  assert.ok(!body.includes(TABLE_HEADER),
    'the tier table must NOT be pasted back into SKILL.md — it is charged twice per invocation');

  // The router still has to be told where it went, or the content is simply lost.
  assert.match(body, /references\/triage-sizing\.md/,
    'SKILL.md must point at the reference it deferred the table to');
});

test('the verification-rigor invariant is deferred, not deleted', () => {
  // Deferring is only safe if the content survives. Dropping a normative invariant
  // while "optimizing tokens" is the failure mode this guards.
  const ref = read(REF);
  assert.match(ref, /Verification rigor does not scale down with the tier/,
    'the rigor invariant must survive in the reference');
  assert.match(ref, /author ≠ verifier/,
    'the four lenses must survive with it');
  assert.ok(!read(ROUTER).includes('Verification rigor does not scale down'),
    'the invariant must not also sit in the eager SKILL.md (that is duplication, at 2x cost)');
});

test('the signal rubric costs no round trip — it rides the bootstrap call', () => {
  // Counterpart to the tests above: moving it is only safe while the bootstrap keeps
  // reading the file in the same call the state read already pays for. Drop the `cat`
  // and this content becomes a second round trip at checkpoint 0 — the regression the
  // original "stays eager" assertion was really protecting against.
  const body = read(ROUTER);
  const sessionStart = read(SESSION_START);
  // Anchored on the signal table itself, not on the heading: a mutation run showed the
  // heading alone passes even when renamed, so it proved nothing about the rubric.
  assert.ok(sessionStart.includes('| Tier | `fileScope` | `abstraction` | `prd` | `decision` | `steps` |'),
    'references/session-start.md must own the signal rubric table');
  assert.match(sessionStart, /assess-complexity\.cjs --checkpoint 0/,
    'the checkpoint-0 invocation must travel with its rubric');
  assert.ok(!body.includes('| Tier | `fileScope` | `abstraction` | `prd` | `decision` | `steps` |'),
    'the rubric must NOT be pasted back into SKILL.md — it is charged twice per invocation');
  // The load-bearing half: the bootstrap snippet must still pull the file in-call.
  assert.match(body, /cat \$B\/references\/session-start\.md/,
    'the bootstrap must cat references/session-start.md, or the rubric costs a round trip');
  assert.match(body, /references\/session-start\.md/,
    'SKILL.md must point at the reference it deferred the rubric to');
});
