#!/usr/bin/env node
'use strict';
/*
 * prd-decision-single-question.test.cjs — the PRD is decided by ONE question, and that
 * question's options must lead to different artifacts.
 *
 * Live failure this closes (Large tier, real session): the fast path's confirming question
 * was raised *after* the spec was approved, worded as ceremony — "I can skip the PRD
 * confirmation question ... Skip the confirmation? (yes / full)". Both answers produce a
 * PRD, so the user who answered "skip" meaning "skip the PRD" got a PRD anyway. Two defects
 * compose into one bad turn:
 *
 *   1. TIMING — the question buys exactly one round trip, the one right after spec approval.
 *      Asked AT that moment it spends the round trip it claims to save, and the user is now
 *      answering a question about a question.
 *   2. FRAMING — the options named ceremony ("skip the confirmation?") rather than outcome,
 *      and no option produced "no PRD", which is the outcome the word "skip" reads as.
 *
 * The fix is a procedure, not a prohibition: the fast path settles the PRD decision AT TRIAGE
 * with outcome-framed options (generate / no PRD / decide later), and both files say what to
 * do when that moment has already passed — ask the normal post-spec question, whose two
 * branches genuinely differ (a PRD, or no PRD and no QA gate).
 *
 * Each case asserts the RULE is present AND the anti-pattern is absent. Without the presence
 * half, a reword would silently retire the guard; without the absence half, the old ceremony
 * wording could be pasted back alongside the new one.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/prd-decision-single-question.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

const FAST_PATH = 'super.using-superpowers/references/large-known-domain-fast-path.md';
const AFTER_DESIGN = 'super.brainstorming/references/after-the-design.md';
const TRIAGE = 'super.using-superpowers/references/triage-sizing.md';

function read(rel) {
  return fs.readFileSync(path.join(SKILLS, rel), 'utf8');
}

/* ── The confirming question is anchored to triage ───────────────────────────── */

test('the fast-path confirming question names WHEN it may be asked', () => {
  const src = read(FAST_PATH);
  assert.match(
    src,
    /##\s+Confirming question - ask it at triage, and only there/,
    `${FAST_PATH}: the heading must carry the timing rule — a section titled only ` +
      '"Confirming question" tells the model what to ask and never when, which is how ' +
      'it drifted to spec-approval time.',
  );
  assert.match(
    src,
    /it is too late - do NOT ask it now/,
    `${FAST_PATH}: must state that a spec already written/approved closes the window.`,
  );
});

test('the fast path routes a missed window to the normal post-spec question', () => {
  const src = read(FAST_PATH);
  assert.match(
    src,
    /Ask `super\.brainstorming`'s normal PRD question instead/,
    `${FAST_PATH}: closing the window must name the replacement question. A rule that ` +
      'only forbids leaves the model with nothing to ask, and it will improvise one.',
  );
  const anchor = read(AFTER_DESIGN);
  assert.match(
    anchor,
    /\*\*PRD Generation \(optional — recommended\):\*\*/,
    `${AFTER_DESIGN}: the section the fast path points at must still exist here.`,
  );
});

/* ── Options name outcomes, and no two options land on the same artifacts ────── */

test('the confirming question offers a real "no PRD" outcome', () => {
  const src = read(FAST_PATH);
  assert.match(
    src,
    /How do you want to proceed\? \(generate \/ no PRD \/ decide later/,
    `${FAST_PATH}: the answer space must include an option that produces no PRD, and it must ` +
      'be pinned to the question line itself — the labels also appear in the prose above it, ' +
      'so a file-wide match would survive the question reverting to "(yes / full)". ' +
      'The old "(yes / full)" had no no-PRD branch, so "skip" could only ever mean ' +
      '"skip the question".',
  );
  assert.match(
    src,
    /decide later — translate these three labels into the session's language/,
    `${FAST_PATH}: the localization cue must sit INSIDE the quoted question. Stated only in ` +
      'the prose above it, simulation showed the model copying the English labels verbatim ' +
      'into a pt-BR message in 1 of 3 trials.',
  );
  assert.match(
    src,
    /\*\*no PRD\*\* - straight from the approved spec to `super\.writing-plans`; the QA gate is skipped too\./,
    `${FAST_PATH}: each option must state the artifacts it produces, including the QA-gate ` +
      'consequence of having no PRD.',
  );
});

test('the ceremony framing is forbidden, and the invariant behind it is stated', () => {
  const src = read(FAST_PATH);
  assert.doesNotMatch(
    src,
    /Skip the confirmation\?/,
    `${FAST_PATH}: "Skip the confirmation?" is the exact wording that produced the double ` +
      'question in a live session. It must not come back as the offered choice.',
  );
  assert.doesNotMatch(
    src,
    /\(yes \/ full\)/,
    `${FAST_PATH}: "(yes / full)" labels ceremony, and both labels produce a PRD.`,
  );
  assert.match(
    src,
    /any option a user can read as "no PRD" must actually produce no PRD/,
    `${FAST_PATH}: the invariant must be written out, not just implied by the new wording — ` +
      'otherwise the next rewrite has nothing to check itself against.',
  );
  assert.match(
    src,
    /no two options offered here may lead to the same artifacts/,
    `${FAST_PATH}: must forbid offering a choice whose branches converge.`,
  );
});

/* ── Eligibility is not consent ──────────────────────────────────────────────── */

test('after-the-design gates the skip on the ANSWER, not on eligibility', () => {
  const src = read(AFTER_DESIGN);
  assert.match(
    src,
    /the user answered `generate` there/,
    `${AFTER_DESIGN}: activation must depend on the user's answer at triage.`,
  );
  assert.match(
    src,
    /Eligibility alone never activates it/,
    `${AFTER_DESIGN}: the old prose skipped the question because eligibility "already implies ` +
      'the user wants full traceability" — inferring consent from a tier read.',
  );
  assert.doesNotMatch(
    src,
    /already implies the user wants full traceability/,
    `${AFTER_DESIGN}: that inference is the bug; it must not survive anywhere in the file.`,
  );
});

test('after-the-design forbids raising the meta-question at step 9', () => {
  const src = read(AFTER_DESIGN);
  assert.match(
    src,
    /it is too late to ask it/,
    `${AFTER_DESIGN}: step 9 is exactly where the model reached for the fast-path question ` +
      'in the live session, so the closing rule has to be readable from this file.',
  );
  assert.match(
    src,
    /Never offer the user a choice whose options both end in a PRD being generated\./,
    `${AFTER_DESIGN}: the convergent-options ban must be stated on the brainstorming side too — ` +
      'this file is in context at step 9; the fast-path reference may not be.',
  );
});

/* ── The triage table points at the moment the question belongs to ───────────── */

test('the tier table says the Large PRD decision happens at triage', () => {
  const src = read(TRIAGE);
  const largeRow = src.split('\n').find((l) => l.startsWith('| **Large** |'));
  assert.ok(largeRow, `${TRIAGE}: the Large row must exist in the tier table.`);
  assert.match(
    largeRow,
    /here at triage/,
    `${TRIAGE}: the row the router reads at triage must say the decision belongs there.`,
  );
  assert.match(
    largeRow,
    /never raise that question after the spec/,
    `${TRIAGE}: and must say where it does NOT belong.`,
  );
});
