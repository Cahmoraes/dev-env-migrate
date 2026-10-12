'use strict';

/**
 * reviewer-spec-context.test.cjs — the task reviewer must receive the SAME design-spec
 * context the implementer is bound to, so it can verify architectural conformance
 * ("right feature, wrong way"), not just functional-requirement coverage.
 *
 * Regression guard for the implementer<->reviewer asymmetry: the implementer prompt has
 * always carried the design spec's architecture & decisions; the reviewer prompt once
 * carried only the requirements, so it could not check whether the code honored the
 * decisions the implementer was bound to. Both must carry the section.
 *
 * Since 2026-09-02 the section is handed over BY PATH, not inline: the controller passes the
 * absolute task/spec/PRD paths and the subagent reads them in full. Measured (A/B, n=3 small
 * fixture + realistic-size fixture): quality parity 17/17, controller context -16% / -45%,
 * prompt chars -23% / -64%, cost -3% / -51%. A pasted "curated slice" was the drift the old
 * rule caused in practice: controllers condensed and translated the documents.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/reviewer-spec-context.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

const IMPLEMENTER = 'super.subagent-driven-development/agents/implementer.md';
const TASK_REVIEWER = 'super.subagent-driven-development/agents/task-reviewer.md';

// Heading shape tolerant to em-dash vs hyphen.
const DESIGN_SPEC_SECTION = /Design Spec\s*[—-]\s*Architecture & Decisions/;

test('task-reviewer prompt carries design spec context by path (parity with the implementer)', () => {
  const body = read(TASK_REVIEWER);
  assert.match(body, DESIGN_SPEC_SECTION,
    'task-reviewer must receive the design spec (architecture & decisions) section');
  assert.match(body, /\*\*Design spec:\*\* \{SPEC_PATH\}/,
    'task-reviewer hands the design spec over as a path slot');
  assert.match(body, /\*\*PRD — Functional Requirements:\*\* \{PRD_PATH\}/,
    'task-reviewer receives the PRD — the requirement authority the task file argues from');
  assert.match(body, /Read it in full/i,
    'task-reviewer must tell the reviewer to read the spec in full');
  assert.match(body, /Architectural conformance/i,
    'task-reviewer must keep the architectural-conformance check group');
  assert.match(body, /right feature.{0,5}wrong way/i,
    'the architectural-conformance check must cover the "right feature, wrong way" case');
});

test('implementer prompt inlines the design spec architecture & decisions', () => {
  assert.match(read(IMPLEMENTER), DESIGN_SPEC_SECTION,
    'implementer must receive the design spec (architecture & decisions) inline');
});

test('implementer and reviewer hand the task and spec over BY PATH and order a full read first', () => {
  for (const rel of [IMPLEMENTER, TASK_REVIEWER]) {
    const body = read(rel);
    assert.match(body, /\*\*Task file:\*\*\s*\{TASK_FILES\}/,
      `${rel} must carry the task file as a path slot`);
    assert.match(body, /\{SPEC_PATH\}/,
      `${rel} must carry the design spec as a path slot`);
    assert.doesNotMatch(body, /FULL TEXT/,
      `${rel} must not ask the controller to paste document text into the prompt`);
  }
  assert.match(read(IMPLEMENTER), /read these files in full before anything else/i,
    'implementer must be told to read its brief files in full before starting');
  assert.match(read(IMPLEMENTER), /PRD — Functional Requirements:\*\*\s*\{PRD_PATH\}/,
    'implementer must carry the PRD as a path slot (or N/A)');
  assert.match(read(TASK_REVIEWER), /Read the task file in full/i,
    'task-reviewer must be told to read the task file in full before reviewing');
});
