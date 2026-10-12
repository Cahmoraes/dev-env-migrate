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
 * The three path definitions (spike / bounded / architectural), the bounded announcement and the
 * user pauses per path are consumed only when a request is being sized. They live in
 * references/session-start.md, which the bootstrap already `cat`s in the SAME call as the state
 * read — so they are in context at zero extra round trips. What the test guards is that
 * invariant: SKILL.md keeps `cat`ing that file, and the definitions are not pasted back into the
 * eager tier. The verification-rigor invariant is consumed by execution; it lives with the
 * inline path (references/bounded-path.md), deferred, never deleted.
 *
 * Run with: node --test super.using-superpowers/scripts/__tests__/skillmd-eager-cost.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const ROUTER = 'super.using-superpowers/SKILL.md';
const INLINE = 'super.using-superpowers/references/bounded-path.md';
const SESSION_START = 'super.using-superpowers/references/session-start.md';

test('the path definitions ride the bootstrap call, not the eager SKILL.md', () => {
  const body = read(ROUTER);
  const sessionStart = read(SESSION_START);
  // Anchored on the definitions themselves, not on the heading: a heading alone passes even
  // when the content under it is gone.
  for (const def of [/^- \*\*Spike\*\* — a feasibility question/m, /^- \*\*Bounded\*\* — a change to a flow that already exists in this repo to read/m, /^- \*\*Architectural\*\* — everything else/m]) {
    assert.match(sessionStart, def, 'references/session-start.md must own the path definitions');
    assert.doesNotMatch(body, def, 'the definitions must NOT be pasted back into SKILL.md — it is charged twice per invocation');
  }
  assert.match(sessionStart, /\*\*User pauses per path — the whole list\.\*\*/,
    'the closed list of user pauses travels with the definitions');
  // The load-bearing half: the bootstrap snippet must still pull the file in-call.
  assert.match(body, /cat \$B\/references\/session-start\.md/,
    'the bootstrap must cat references/session-start.md, or the definitions cost a round trip');
  assert.match(body, /\.\/references\/session-start\.md/,
    'SKILL.md must point at the reference that owns the path definitions');
});

test('the verification-rigor invariant is deferred, not deleted', () => {
  // Deferring is only safe if the content survives. Dropping a normative invariant
  // while "optimizing tokens" is the failure mode this guards.
  const ref = read(INLINE);
  assert.match(ref, /Verification rigor does not scale down with the path/,
    'the rigor invariant must survive in the bounded-path reference');
  assert.match(ref, /author ≠ reviewer/,
    'the four lenses must survive with it');
  assert.ok(!read(ROUTER).includes('Verification rigor does not scale down'),
    'the invariant must not also sit in the eager SKILL.md (that is duplication, at 2x cost)');
});
