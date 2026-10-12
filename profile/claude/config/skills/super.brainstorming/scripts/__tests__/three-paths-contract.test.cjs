'use strict';

/**
 * three-paths-contract.test.cjs — the request is sized by three paths (spike / bounded /
 * architectural), classified in prose and said out loud, in the two places a session can
 * enter: the triage (`session-start.md`, option 2) and `super.brainstorming` entered
 * directly. The rule has no script behind it, so the prose IS the mechanism; this guard pins
 * the load-bearing sentences in both files so that neither copy can drift or thin out alone.
 *
 * Why two copies: bounded work leaves at the triage without loading brainstorming (the token
 * saving the old Micro/Small tier existed for), and a session that invokes brainstorming
 * directly never sees the triage (the direct-entry gap the old checkpoint 1 closed).
 *
 * Replaced (2026-09-24) the complexity classifier — assess-complexity.cjs, a capable-tier
 * interpreter subagent and four checkpoints. Mined sessions: the binding checkpoints never
 * moved a feature off the planned pipeline, the interpreter was skipped in half of them, and
 * its dispatches cost ~28.7M tokens. Upstream superpowers 6.4.1 sizes with these three paths.
 *
 * Run: node --test super.brainstorming/scripts/__tests__/three-paths-contract.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const SESSION_START = 'super.using-superpowers/references/session-start.md';
const BRAIN = 'super.brainstorming/SKILL.md';
const INLINE = 'super.using-superpowers/references/bounded-path.md';

// The sentences that make the rule a rule. Each must live in BOTH entry points.
const SHARED = [
  [/\*\*Spike\*\* — a feasibility question/, 'the spike definition'],
  [/\*\*Bounded\*\* — a change to a flow that already exists in this repo to read: no new component, no interface others depend on, no open decision, no user story, reversible, ~1-3 files/, 'the bounded definition, measured on the repo'],
  [/\*\*Architectural\*\* — everything else/, 'the architectural definition'],
  [/When in doubt between two paths, take the heavier one\./, 'the tie-break toward rigor'],
  [/[Rr]eaching for a label to skip work is the doubt/, 'the red flag against labelling to skip'],
  [/The ratchet is one-way: hidden complexity found mid-task upgrades the path — stop, say so, step up\. Nothing downgrades mid-task\./, 'the one-way ratchet'],
  [/The label stays internal: the user sees what the path does/, 'the classification shows as what the path does, overridable'],
];

for (const rel of [SESSION_START, BRAIN]) {
  test(`${rel} carries the three-path rule in full`, () => {
    const body = read(rel);
    for (const [re, what] of SHARED) assert.match(body, re, `${rel} lost ${what}`);
  });
}

test('the triage announces a bounded change and proceeds, with its definition of done', () => {
  const bounded = read(SESSION_START).split('\n').find((l) => l.startsWith('- **Bounded**'));
  assert.match(bounded, /Bounded measures the repo, not your familiarity/);
  assert.match(bounded, /Announced, not asked/);
  assert.match(bounded, /\*\*what closes the work\*\* — the fresh reviewer's verdict, then the final stage/);
});

test('brainstorming sends a bounded request to the inline path, not through the checklist', () => {
  const body = read(BRAIN);
  const section = body.slice(body.indexOf('## Three paths'), body.indexOf('## Checklist'));
  assert.ok(section.length > 0, 'the "Three paths" section must precede the checklist');
  assert.match(section, /It leaves this skill with the bounded announcement and runs `<super\.using-superpowers-base-dir>\/references\/bounded-path\.md`/);
  assert.match(section, /Bounded measures the repo, not your familiarity/);
});

test('the deep review of the spec is always offered at the approval gate, never recommended', () => {
  assert.match(read(BRAIN), /and always a fourth, never recommended: \*\*\(d\) deep review by a subagent first\*\*/);
});

test('the inline path keeps the rigor invariant and a prose tripwire', () => {
  const inline = read(INLINE);
  assert.match(inline, /Verification rigor does not scale down with the path/);
  assert.match(inline, /## Tripwire — the ratchet is one-way/);
});
