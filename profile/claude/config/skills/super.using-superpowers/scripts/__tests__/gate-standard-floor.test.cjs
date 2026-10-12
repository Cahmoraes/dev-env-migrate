'use strict';

/**
 * Prose-guard: the "cheap implementers, standard-floor gates" contract.
 *
 * Implementation runs on the cheapest tier. The compensating review is targeted and
 * proportionate, NOT the most-expensive tier: a per-task validation gate runs at the
 * task's tier floored at `standard`, so a `cheap` (mechanical) task is reviewed ONE
 * FAMILY UP by the `standard` tier — not raised to `capable`. A `standard`-class
 * reviewer already catches a weak model's loose ends (the eval bore this out); paying
 * the top model to read mechanical code is overkill, and onboarding keeps `standard`
 * a family above `cheap` so the floor is a real step up. `capable` is reserved for
 * architecture. QA floors at `standard`.
 *
 * This guard locks that shape so a future edit cannot re-flatten gates to `capable`
 * (cost) or drop the standard floor into a `cheap`-reviews-`cheap` collision.
 * It also locks the feedback loop (`## Review Findings to Address`).
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/gate-standard-floor.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const MODEL_SELECTION = 'super.subagent-driven-development/references/model-selection.md';
const SDD_SKILL = 'super.subagent-driven-development/SKILL.md';
const TASK_REVIEWER = 'super.subagent-driven-development/agents/task-reviewer.md';
const IMPLEMENTER = 'super.subagent-driven-development/agents/implementer.md';
const REQUESTING_REVIEW = 'super.requesting-code-review/SKILL.md';
const USER_STORY_QA = 'super.user-story-verification/SKILL.md';

// --- Per-task gates: floor at standard, review cheap ONE FAMILY UP (not capable) ---

const PER_TASK_GATES = [TASK_REVIEWER, REQUESTING_REVIEW];

for (const rel of PER_TASK_GATES) {
  test(`${rel}: per-task gate is floored at standard`, () => {
    assert.match(read(rel), /floored at [`]?standard/i,
      `${rel} must floor its validation-gate model at standard`);
  });

  test(`${rel}: reviews a cheap task one family up (standard), not raised to capable`, () => {
    const body = read(rel);
    assert.match(body, /one family up/i,
      `${rel} must say a cheap task is reviewed one family up (by standard)`);
    assert.doesNotMatch(body, /raised to [`]?capable/i,
      `${rel} must NOT raise a cheap task's gate to capable (standard is the reviewer, not the top tier)`);
  });
}

test(`${USER_STORY_QA}: QA floors at standard`, () => {
  const body = read(USER_STORY_QA);
  assert.match(body, /floor it at [`]?standard/i,
    'QA must floor at standard — broad fan-out backed by executable acceptance tests');
});

test(`${MODEL_SELECTION}: states the standard-floor / cheap-reviewed-one-family-up policy`, () => {
  const body = read(MODEL_SELECTION);
  assert.match(body, /Implementation runs cheap by default/i,
    'model-selection must state implementation defaults to cheap');
  assert.match(body, /escalation ladder/i,
    'model-selection must name the escalation ladder for BLOCKED cheap implementers');
  assert.match(body, /floored at [`]?standard/i,
    'model-selection must floor gates at standard');
  assert.match(body, /one family up/i,
    'model-selection must state a cheap task is reviewed one family up (by standard)');
  assert.doesNotMatch(body, /raised to [`]?capable/i,
    'model-selection must not raise cheap-task gates to capable');
});

test(`${SDD_SKILL}: "Model Selection" section encodes standard floor + cheap reviewed one family up`, () => {
  const body = read(SDD_SKILL);
  assert.match(body, /floored at [`]?standard/i,
    'SKILL "Model Selection" section must floor gates at standard');
  assert.match(body, /one family up/i,
    'SKILL "Model Selection" section must say a cheap task is reviewed one family up');
  assert.doesNotMatch(body, /raised to [`]?capable/i,
    'SKILL "Model Selection" section must not raise cheap-task gates to capable');
});

// --- Final-reviewer tier binding: a tier is not a model (capable may be sonnet) ----
// A controller that reads "capable" as "the most capable model" instead of resolving it via
// model_tiers over-provisions the final gate. Lock the resolve language.

const BOUNDED_PATH = 'super.using-superpowers/references/bounded-path.md';

test(`${BOUNDED_PATH}: final-reviewer tier routing says tiers are not models`, () => {
  const body = read(BOUNDED_PATH);
  assert.match(body, /tiers, not models/i,
    'bounded-path final-reviewer tier routing must state tiers are not models');
  assert.match(body, /resolve the chosen tier via[\s\S]{0,20}model_tiers/i,
    'bounded-path must instruct resolving the chosen tier via model_tiers.<tier>');
});

// --- Hard-stop guard: an architectural feature must never run the inline path ----
// An architectural feature routed inline silently drops the per-task implementer + task-reviewer
// fan-out and the separate final code review. This
// guard is the safety net that stops that; it was prose-only (found untested by the
// v10 simulation). Lock its load-bearing phrasing so a future edit cannot weaken it.

test(`${BOUNDED_PATH}: hard-stop guard blocks routing an architectural feature inline`, () => {
  const body = read(BOUNDED_PATH);
  assert.match(body, /Hard stop\b[\s\S]{0,30}path mismatch guard/i,
    'bounded-path must carry the hard-stop path-mismatch guard heading');
  assert.match(body, /classified \*\*architectural\*\*[\s\S]{0,120}\*\*STOP/i,
    'guard 1 must STOP when the feature is classified architectural — the path that plans');
  assert.match(body, /Check for a plan on disk[\s\S]{0,200}find-feature-files\.cjs[\s\S]{0,80}\*\*STOP/i,
    'guard 2 must STOP when a tasks index exists for the feature — a written plan is executed by dispatch');
  assert.match(body, /~3 steps or ~3 files[\s\S]{0,160}\*\*STOP/i,
    'guard 3 must STOP when the atomic step list outgrows the bounded size');
  assert.match(body, /not optional/i,
    'the guard must be marked not optional');
  assert.match(body, /not overridable by the controller/i,
    'the guard must be non-overridable by controller judgment');
  assert.match(body, /silently drops the execution gate the user is owed[\s\S]{0,200}final code review/i,
    'the guard must name what inline execution of a planned feature silently drops (the execution gate first)');
});

// --- Feedback loop: findings are handed back to the implementer -------------

test(`${IMPLEMENTER}: has a Review Findings to Address section for fix re-dispatch`, () => {
  assert.match(read(IMPLEMENTER), /##\s*Review Findings to Address/,
    'implementer template must carry a `## Review Findings to Address` section so fix rounds paste the gate verdict');
});

test(`${SDD_SKILL}: per-task and final review loops pass findings back to the implementer`, () => {
  const body = read(SDD_SKILL);
  const hits = body.match(/Review Findings to Address/g) || [];
  assert.ok(hits.length >= 2,
    'SKILL must reference `## Review Findings to Address` in both the per-task fix loop and the final review fix loop');
  assert.match(body, /the task is not complete while any finding is open/i,
    'SKILL must state a task stays incomplete while a finding is open (gate does not let it pass)');
});
