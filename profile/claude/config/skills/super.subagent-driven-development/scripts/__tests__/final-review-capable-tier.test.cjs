'use strict';

/**
 * Prose-guard: the whole-branch final review runs on `capable`, always.
 *
 * The drift this locks: `model-selection.md` wrote the gate policy PER TASK ("a gate runs at
 * the task's tier floored at `standard`") and listed the final review among those gates, while
 * `single-implementer-mode.md` sent the same review to `capable`. The two could not both hold,
 * and the per-task rule does not even decide for a gate that spans the branch — it has no task.
 *
 * Measured (docs/benchmarks/superpowers-sync-v6.4.1-ab/s7.0/, both tiers over the SAME nine
 * HEADs): at `standard` the final reviewer returned `approve` on 7 of 9 branches that `capable`
 * returned `request_changes` on. It both downgrades what it finds and misses what needs the whole
 * picture; the final-stage re-grade rule recovers only the first. Cost delta: one dispatch per
 * branch.
 *
 * The boundary matters in BOTH directions: per-task review stays at the `standard` floor
 * (gate-standard-floor.test.cjs locks that side), and the model must be named where the dispatch
 * happens — a tier that lives only in a neighbouring file is a cross-file pointer, and those are
 * exactly what the controller forgets.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/final-review-capable-tier.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const SDD = 'super.subagent-driven-development';
const FINAL_STAGE = `${SDD}/references/final-stage.md`;
const MODEL_SELECTION = `${SDD}/references/model-selection.md`;
const SINGLE_IMPL = `${SDD}/references/single-implementer-mode.md`;
const SDD_SKILL = `${SDD}/SKILL.md`;
const REQUESTING_REVIEW = 'super.requesting-code-review/SKILL.md';

// --- The tier is named where the dispatch happens -------------------------------

test(`${FINAL_STAGE}: gate 1 names the capable tier on the final review dispatch`, () => {
  const body = read(FINAL_STAGE);
  const gate1 = body.slice(body.indexOf('### 1. Final code review'), body.indexOf('### 2.'));
  assert.notEqual(gate1.length, 0, 'gate 1 section must exist in final-stage.md');
  assert.match(gate1, /Model: [`]?capable[`]?, always/i,
    'final-stage gate 1 must state the final review runs on capable, at the dispatch itself');
  assert.match(gate1, /session_model_tier_capable/,
    'final-stage gate 1 must name the preference key the tier resolves through');
  assert.match(gate1, /never floor it at the tasks?['’]? tier/i,
    'final-stage gate 1 must say the per-task floor does not govern this gate');
});

// --- model-selection carves it out, and no longer lists it under the floor ------

test(`${MODEL_SELECTION}: the whole-branch final review is carved out of the per-task floor`, () => {
  const body = read(MODEL_SELECTION);
  assert.match(body, /The one gate above the floor: the whole-branch final review/i,
    'model-selection must carry the carve-out paragraph for the whole-branch final review');
  assert.match(body, /It runs on [`]?capable[`]?, whatever tier the tasks carried/i,
    'the carve-out must state the tier plainly, independent of the tasks');
  assert.match(body, /this gate has no task/i,
    'the carve-out must give the reason: the rule is per task and this gate has none');
});

test(`${MODEL_SELECTION}: the per-task floor sentence no longer enumerates the final review`, () => {
  const body = read(MODEL_SELECTION);
  const floorSentence = body.slice(body.indexOf('**Validation gates run one family above'));
  const upToNextPara = floorSentence.slice(0, floorSentence.indexOf('\n\n'));
  assert.doesNotMatch(upToNextPara, /final review/i,
    'the per-task floor sentence must not list the final review among the gates it governs');
  // the standard floor itself must survive — the other half of the boundary
  assert.match(upToNextPara, /floored at [`]?standard/i,
    'per-task gates keep the standard floor');
});

// --- The capable tier is the rule, not a privilege of one mode ------------------

test(`${SINGLE_IMPL}: capable is presented as the rule for every run, not a mode privilege`, () => {
  const body = read(SINGLE_IMPL);
  assert.match(body, /whole-branch final review on the [`]?capable[`]? tier/i,
    'single-implementer mode keeps the capable tier for the final review');
  assert.match(body, /the rule for every run, not a privilege of this mode/i,
    'the mode must not read as buying capable for itself — it inherits the general rule');
});

test(`${SDD_SKILL}: the Model Selection paragraph states the exception`, () => {
  const body = read(SDD_SKILL);
  assert.match(body, /whole-branch final review is the exception: [`]?capable[`]?, always/i,
    'SKILL.md must state the whole-branch final review runs on capable regardless of task tier');
  assert.match(body, /Per-task reviewers and QA run at the task's tier floored at [`]?standard/i,
    'SKILL.md must keep the per-task floor for everything else');
});

test(`${REQUESTING_REVIEW}: scoped review and whole-branch review carry different tiers`, () => {
  const body = read(REQUESTING_REVIEW);
  assert.match(body, /scoped\*{0,2} review[^.]*floored at [`]?standard/i,
    'a scoped review keeps the standard floor');
  assert.match(body, /whole-branch final review\*{0,2} runs on [`]?capable[`]?/i,
    'the whole-branch final review must be named as capable in the skill that hosts its template');
});

// --- Boundary by mutation: per-task reviewer templates do NOT claim capable -----

for (const rel of [
  `${SDD}/agents/task-reviewer.md`,
]) {
  test(`${rel}: a per-task reviewer does not claim the capable tier for itself`, () => {
    const body = read(rel);
    assert.match(body, /floored at [`]?standard/i,
      `${rel} must keep the standard floor`);
    assert.doesNotMatch(body, /runs on [`]?capable[`]?, (always|whatever)/i,
      `${rel} must not inherit the whole-branch final review's exception`);
  });
}
