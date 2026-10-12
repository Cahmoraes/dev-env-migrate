'use strict';
/*
 * intent-writeback-contract.test.cjs — the interview reflects the user's intent back for
 * correction before any approach is proposed, and does it inside the approaches question.
 *
 * Why: measured upstream on a fixed opening ("make a react todo list", undisclosed purpose
 * "learning React"): purpose was discovered in 0/5 sessions with the old wording and 5/5 with a
 * discover-then-write-back step. Knowing the app genre does not say why the user wants it, and
 * a design that never learned the why optimizes the wrong thing.
 *
 * Why the rule rides on the approaches question: the session's invariant is one user decision
 * per round trip. A write-back note that closes the turn on its own adds a gate; riding as the
 * opening of a question already owed, it costs nothing. It was first pinned to the Checkpoint 1
 * slot, but Checkpoint 1 often runs on the raw request before any answer exists; a real
 * Copilot session (2026-09-22) then asked its approaches question with no note, all three
 * options assumed "no backend", and the persistence requirement surfaced only at the spec gate,
 * forcing a rewrite. The approaches question always comes after answers and before any design.
 *
 * Layering: SKILL.md carries the rule (it is the compaction-window layer); the reference carries
 * the procedure (the note's shape, the "Assuming:" line, what to do when the purpose was already
 * supplied). The SKILL.md must not restate the procedure — two copies means one goes stale.
 *
 * Run: node --test super.brainstorming/scripts/__tests__/intent-writeback-contract.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILL, rel), 'utf8');

function step3() {
  const md = read('SKILL.md');
  const start = md.indexOf('\n3. **Grill in rounds');
  const end = md.indexOf('\n4. **Propose 2-3 approaches**', start);
  assert.ok(start > 0 && end > start, 'checklist step 3 must exist');
  return md.slice(start, end);
}

test('step 3 carries the reflect-the-understanding rule, before the deep-research offer', () => {
  const item = step3();
  const reflect = item.indexOf('**Reflect the understanding before proposing anything.**');
  const checkpoint = item.indexOf('**A node no research answered**');
  assert.ok(reflect > 0, 'step 3 must carry the reflect rule');
  assert.ok(checkpoint > reflect, 'the reflect rule must precede the deep-research offer: it opens the approaches message');
});

test('the note opens the approaches question, never as a round trip of its own', () => {
  const item = step3();
  assert.match(item, /as the opening of the approaches question \(step 4\) unless an earlier question already carried it, never as a round trip of its own/);
  assert.match(item, /no approach is proposed before the user has seen the note/);
});

test('a premise every approach shares is surfaced for correction, not baked into the options', () => {
  const md = read('SKILL.md');
  const step4 = md.slice(md.indexOf('\n4. **Propose 2-3 approaches**'), md.indexOf('\n5. **Present the design once**'));
  assert.match(step4, /A premise every option shares[^\n]*is stated in the note for correction, never baked into all of them/);
  const ref = read('references/interview-process.md');
  assert.match(ref, /\*\*A premise every candidate approach shares goes on the "Assuming:" line\*\*/);
});

test('the note separates what the user said from what is assumed, and a supplied purpose is reflected, not re-asked', () => {
  const item = step3();
  assert.match(item, /separating what the user said from what you are assuming/);
  assert.match(item, /already carries its purpose[^\n]*is reflected, not re-asked/);
});

test('SKILL.md points at the procedure by section name and does not restate it', () => {
  const item = step3();
  assert.match(item, /`\.\/references\/interview-process\.md`, "Reflect the understanding"/);
  assert.doesNotMatch(item, /"Assuming:"/, 'the note\'s shape is procedure and lives in the reference');
});

test('the reference carries the procedure: anchor, one purpose question, the note shape, the checkpoint slot, the carry-over', () => {
  const ref = read('references/interview-process.md');
  const at = ref.indexOf('id="reflect-the-understanding"');
  assert.ok(at > 0, 'the reference must anchor the section');
  const section = ref.slice(at, at + 2600);
  assert.match(section, /ask \*\*one\*\* focused question about purpose or intended use before proposing features or an approach/);
  assert.match(section, /\*\*"Assuming:"\*\* listing what you inferred rather than heard/);
  assert.match(section, /The note is the opening of the approaches question \(checklist step 4\)/);
  assert.match(section, /Carry the corrected note into the spec's overview/);
  assert.match(section, /reflect that understanding in the note instead of asking again/);
});
