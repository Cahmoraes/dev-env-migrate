'use strict';
/**
 * Contract: the spec self-review (Checklist step 7) is OBSERVABLE, and the user gate
 * cannot open without its outcome.
 *
 * Measured failure (session e9e13a82, 2026-09-02): the spec was written at 19:53:29,
 * committed at 19:53:53 and handed to the user at 19:53:55 — three shell commands, no
 * read of the spec, no text. Asked "did you self-review?", the model answered "yes, a
 * mental pass against the checklist", then re-read the file for real and found two
 * defects. The prose at the time said "the spec is already in context, so it costs one
 * read" and "re-run them from memory, no second read" — i.e. it licensed a pass that
 * leaves no trace, so skipping and declaring were indistinguishable.
 *
 * Second measured failure, same session: the spec said "extends use case `GetWeather`".
 * The real name (`GetCurrentWeatherByCityUseCase`) never entered the session before the
 * spec was written — the codebase exploration covered only `apps/frontend`, and the
 * backend component was named from plausibility during step 5. No coherence check can
 * catch an internally consistent fabrication; only resolving the name against the repo can.
 *
 * Two files, one rule:
 *   1. after-the-design.md — read the file back from disk; "from memory" is not a review;
 *      fixes committed; the gate message opens with the `Self-review:` outcome line.
 *   2. SKILL.md — step 7 and the After the Design bullet restate the same three verbs
 *      (read back, fix, report) and no longer grant "from memory".
 *
 * Deliberately NOT added (user call, 2026-09-02, "não precisamos sobrecarregar"): a
 * grep-based existence check of every symbol the spec claims exists, and one exploration
 * dispatch per surface. The fabricated-name class stays with `super.reviewing-specs`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILL_DIR, rel), 'utf8');

const skillMd = read('SKILL.md');
const afterDesign = read(path.join('references', 'after-the-design.md'));

function section(md, startMarker, endMarker) {
  const a = md.indexOf(startMarker);
  assert.ok(a >= 0, `anchor "${startMarker}" exists`);
  const b = md.indexOf(endMarker, a + startMarker.length);
  assert.ok(b > a, `anchor "${endMarker}" follows "${startMarker}"`);
  return md.slice(a, b);
}

const selfReview = section(afterDesign, '**Spec Self-Review:**', '**Approval Gate (one question');
const gate = section(afterDesign, '**Approval Gate (one question', '**Resume hint');

// ---------------------------------------------------------------------------
// 1. after-the-design.md
// ---------------------------------------------------------------------------

test('the self-review reads the committed file back from disk, with the tool', () => {
  assert.match(selfReview, /read the committed file back from disk with the file-reading tool/);
  assert.match(selfReview, /not the draft still in context/);
});

test('a pass "from memory" is named as NOT a review, and as not reportable', () => {
  assert.match(selfReview, /A pass "from memory" is not a review and is never reported as one/);
  // The observable criterion: a read call between the commit and the gate.
  assert.match(selfReview, /no read of the spec file between the commit and the user gate/);
  assert.match(selfReview, /the step did not run/);
});

test('the prose no longer licenses skipping the read ("already in context" / "from memory")', () => {
  assert.doesNotMatch(selfReview, /already in context, so it costs one read/);
  assert.doesNotMatch(selfReview, /re-run them from memory/);
  assert.doesNotMatch(skillMd, /from memory\./, 'SKILL.md must not grant a from-memory pass');
});

test('calibration keeps its scope', () => {
  assert.match(selfReview, /only fix what would lead to a flawed plan/);
  assert.match(selfReview, /do not re-review your own fixes/);
});

test('the Boundaries check leaves a line: each crossing value with its written meaning', () => {
  // Measured: a real spec passed "no fixes needed" in ~10s with a DateTime start date, a
  // toggle endpoint and an unnamed toggle failure; all three became Important findings in
  // execution. A check that must print what it walked cannot be reported without walking it.
  assert.match(selfReview, /Write each such value with its meaning on the gate's `Boundaries:` line/);
  assert.match(gate, /`Boundaries: <value> = <written meaning>; \.\.\.`/);
  assert.match(gate, /`Boundaries: none cross a layer`/);
  assert.match(gate, /an entry you cannot fill from the spec is a fix, not a line/);
});

test('every fix is committed before the gate opens', () => {
  assert.match(selfReview, /Commit every fix before opening the gate below/);
});

test('the gate message opens with one of the two outcome lines, and without it the gate is not open', () => {
  assert.match(gate, /opens with the self-review outcome/);
  assert.match(gate, /`Self-review: <N> fixes applied — <one short clause per fix>`/);
  assert.match(gate, /`Self-review: no fixes needed`/);
  assert.match(gate, /session language/, 'the line follows the session language');
  assert.match(gate, /Without that line the gate is not open/);
  assert.match(gate, /> "Self-review: <outcome>\.\n> Boundaries: <value> = <meaning>; \.\.\.\n> Spec written and committed to `<path>`/);
});

test('the Self-review block still carries the markers other tests anchor on', () => {
  // visual-companion-contract.test.cjs positions the companion shutdown on this marker;
  // restated-counts.test.cjs checks the quoted pointer to design-spec-structure.md.
  assert.ok(afterDesign.includes('**Spec Self-Review:**'));
  assert.ok(afterDesign.includes('"Self-review additions"'));
  const stopAt = afterDesign.indexOf('Close the visual companion');
  const reviewAt = afterDesign.indexOf('**Spec Self-Review:**');
  assert.ok(stopAt > 0 && stopAt < reviewAt, 'companion shutdown still precedes the self-review');
});

// ---------------------------------------------------------------------------
// 2. SKILL.md
// ---------------------------------------------------------------------------

test('SKILL.md step 7 states the three verbs: read back, fix, report', () => {
  const step7 = skillMd.split('\n').find((l) => /^7\. \*\*Spec self-review\*\*/.test(l));
  assert.ok(step7, 'step 7 exists');
  assert.match(step7, /read the committed spec back, fix, report the outcome/);
});

test('SKILL.md step 7 carries the core checks inline, boundaries included', () => {
  // Measured (S11, resume at step 7): 0/3 runs read after-the-design.md when the checks
  // lived only there, and none walked the boundaries; the reference is lost on a resume or a
  // compaction, SKILL.md is not. Upstream keeps its four checks inline for the same reason.
  const step7 = skillMd.split('\n').find((l) => /^7\. \*\*Spec self-review\*\*/.test(l));
  assert.match(step7, /\*\*boundaries\*\* — every value crossing a layer has one written meaning/);
  assert.match(step7, /a status change names its target state or is declared a toggle/);
  assert.match(step7, /`\.\/references\/after-the-design\.md`, "Spec Self-Review"/);
  const step8 = skillMd.split('\n').find((l) => /^8\. \*\*Approval gate/.test(l));
  assert.match(step8, /then `Boundaries: <value> = <meaning>; \.\.\.`/);
});

test('SKILL.md After-the-Design bullet requires the read and the outcome line', () => {
  const bullet = skillMd.split('\n').find((l) => /^- \*\*Spec self-review \(step 7\):\*\*/.test(l));
  assert.ok(bullet, 'the step-7 bullet exists');
  assert.match(bullet, /read the spec file back \(a pass from memory is not a review\)/);
    assert.match(bullet, /open the user gate with the `Self-review:` outcome line — never without it/);
});

test('the process-flow line reflects the observable step', () => {
  assert.match(skillMd, /spec self-review \(read back, fix, report\)/);
});

