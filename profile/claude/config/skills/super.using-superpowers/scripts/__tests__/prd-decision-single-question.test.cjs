#!/usr/bin/env node
'use strict';
/*
 * prd-decision-single-question.test.cjs — the spec approval and the PRD decision are ONE
 * question, and that question's options must lead to different artifacts.
 *
 * Two live failures this closes:
 *
 *   1. A Large-tier session raised a "skip the PRD confirmation question? (yes / full)" meta-
 *      question at spec-approval time — both answers produced a PRD, so "skip" meaning "skip
 *      the PRD" got a PRD anyway. FRAMING: options must name outcomes, never ceremony, and no
 *      two options may converge on the same artifacts.
 *   2. Measured across 54 real sessions: the design was approved section by section ("Essa
 *      visão está correta?" ×4 → "Sim, pode seguir" ×4), then the written spec was approved
 *      again, then the PRD was asked about, then the PRD was approved — four to six round trips
 *      for one decision. The written spec gets ONE approval gate whose options carry the PRD
 *      decision; the PRD itself is not re-approved.
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

const BRAINSTORM = 'super.brainstorming/SKILL.md';
const AFTER_DESIGN = 'super.brainstorming/references/after-the-design.md';
const INTERVIEW = 'super.brainstorming/references/interview-process.md';
const PRD = 'super.generating-prd/SKILL.md';
const TRIAGE = 'super.using-superpowers/references/session-start.md';

function read(rel) {
  return fs.readFileSync(path.join(SKILLS, rel), 'utf8');
}

/* ── One gate: spec approval + PRD decision ───────────────────────────────────── */

test('the checklist has exactly one approval gate, and it carries the PRD decision', () => {
  const src = read(BRAINSTORM);
  assert.match(
    src,
    /\*\*Approval gate — one question, outcomes named\.\*\*/,
    `${BRAINSTORM}: the checklist must name the single approval gate.`,
  );
  assert.match(
    src,
    /\(a\) approve and generate the PRD\*\*.*\(b\) approve without PRD\*\*.*\(c\) adjust the spec\*\*/s,
    `${BRAINSTORM}: the gate's three options must be spelled out where the model reads the checklist.`,
  );
  assert.match(
    src,
    /Never split this into a "review the spec" question followed by a PRD question\./,
    `${BRAINSTORM}: the two-question anti-pattern must be forbidden by name.`,
  );
  assert.doesNotMatch(
    src,
    /get user approval after each|Approve this section\?|User reviews written spec|Suggest PRD \(optional/,
    `${BRAINSTORM}: per-section approval and the separate spec-review / PRD-suggestion steps are the ` +
      'round trips this gate replaces; none may come back.',
  );
});

test('the design is presented once — no per-section approval', () => {
  assert.match(
    read(BRAINSTORM),
    /\*\*Present the design once\*\* — one message/,
    `${BRAINSTORM}: step 5 must present the design in one message.`,
  );
  assert.match(
    read(INTERVIEW),
    /No per-section approval — the written spec gets one approval gate/,
    `${INTERVIEW}: the interview guide must not reintroduce "ask after each section".`,
  );
  assert.doesNotMatch(
    read(INTERVIEW),
    /Ask after each section whether it looks right/,
    `${INTERVIEW}: the old per-section cadence must not survive.`,
  );
});

/* ── Options name outcomes, and no two options land on the same artifacts ────── */

test('the approval gate offers a real "no PRD" outcome, pinned to the question line', () => {
  const src = read(AFTER_DESIGN);
  assert.match(
    src,
    /How do you want to proceed\? \(approve \+ PRD \/ approve without PRD \/ adjust \/ deep review first\)/,
    `${AFTER_DESIGN}: the answer space must include an option that produces no PRD, pinned to the ` +
      'question line itself — a file-wide match would survive the question reverting to "(yes / full)".',
  );
  assert.match(
    src,
    /\*\*approve without PRD\*\* — straight to the implementation plan from the spec; the plan traces the spec's AC\/INV instead of FR\/US, and the QA gate is skipped\./,
    `${AFTER_DESIGN}: each option must state the artifacts it produces, including the QA-gate ` +
      'consequence of having no PRD.',
  );
  assert.match(
    src,
    /the labels are meanings to translate, not literal tokens/,
    `${AFTER_DESIGN}: the localization cue must sit next to the quoted question.`,
  );
});

test('the ceremony framing is forbidden, and the invariant behind it is stated', () => {
  const src = read(AFTER_DESIGN);
  assert.doesNotMatch(
    src,
    /Skip the confirmation\?|\(yes \/ full\)/,
    `${AFTER_DESIGN}: "Skip the confirmation? (yes / full)" is the exact wording that produced the ` +
      'double question in a live session. It must not come back as the offered choice.',
  );
  assert.match(
    src,
    /any option a user can read as "no PRD" must actually produce no PRD/,
    `${AFTER_DESIGN}: the invariant must be written out, not just implied by the new wording.`,
  );
  assert.match(
    src,
    /no two options offered here may lead to the same artifacts/,
    `${AFTER_DESIGN}: must forbid offering a choice whose branches converge.`,
  );
  assert.match(
    src,
    /Never offer the user a choice whose options both end in a PRD being generated\./,
    `${AFTER_DESIGN}: the convergent-options ban must be stated on the brainstorming side.`,
  );
});

/* ── The gate is the go-ahead: nothing re-asks after it ──────────────────────── */

test('the gate is the only consent at the brainstorming→planning boundary', () => {
  const src = read(AFTER_DESIGN);
  assert.match(
    src,
    /This one answer is the only consent gate at the brainstorming→planning boundary/,
    `${AFTER_DESIGN}: the boundary rule must be stated.`,
  );
  assert.match(
    src,
    /do NOT ask a separate "please review the spec" question before it/,
    `${AFTER_DESIGN}: the separate spec-review question is the round trip this gate absorbs.`,
  );
  assert.match(
    src,
    /`\{ continue_planning: boolean \}` prompt after it/,
    `${AFTER_DESIGN}: the model-invented continue_planning gate stays forbidden by name.`,
  );
  assert.match(
    src,
    /opens its own single approval gate \(approve and plan \/ adjust\)/,
    `${AFTER_DESIGN}: the PRD branch must point at the PRD's own single gate, not a second spec-style review.`,
  );
});

test('generating-prd has one approval gate whose options name outcomes, and no second confirmation', () => {
  const src = read(PRD);
  assert.match(
    src,
    /### 5\. Approval Gate \(one question — outcomes named\)/,
    `${PRD}: step 5 must be a single approval gate — the user reviews the PRD once, like the spec.`,
  );
  assert.match(
    src,
    /How do you want to proceed\? \(approve and plan \/ adjust\)/,
    `${PRD}: the options must name what each produces, pinned to the question line.`,
  );
  assert.match(
    src,
    /\*\*approve and plan\*\* → invoke `super\.writing-plans` in the same turn/,
    `${PRD}: approval is the go-ahead — planning starts in the same turn.`,
  );
  assert.match(
    src,
    /no further "proceed to planning\?" confirmation/,
    `${PRD}: the second confirmation is the round trip this gate absorbs.`,
  );
  assert.match(
    src,
    /The resume hint lives inside that same message — never as a second question\./,
    `${PRD}: a resume hint phrased as an offer to stop turns one decision into two.`,
  );
  assert.doesNotMatch(
    src,
    /Wait for approval\.|Only proceed once approved\.|Any changes before we proceed to planning\?/,
    `${PRD}: the old "review, then wait, then proceed" wording must not survive.`,
  );
});

/* ── The triage's pause list points at where the decision lives ──────────────── */

test('the pauses list says the architectural PRD decision is one option of the approval gate', () => {
  const src = read(TRIAGE);
  const largeRow = src.split('\n').find((l) => l.startsWith('**User pauses per path — the whole list.**'));
  assert.ok(largeRow, `${TRIAGE}: the closed list of user pauses per path must exist.`);
  assert.match(
    largeRow,
    /one option of brainstorming's single approval gate/,
    `${TRIAGE}: the row must say the decision belongs to the approval gate.`,
  );
  assert.match(
    largeRow,
    /never a question of its own/,
    `${TRIAGE}: and must say it is never a separate question.`,
  );
  assert.ok(
    !fs.existsSync(path.join(SKILLS, 'super.using-superpowers/references/large-known-domain-fast-path.md')),
    'the triage-time PRD question (large-known-domain-fast-path.md) was retired; its round trip no longer exists.',
  );
});
