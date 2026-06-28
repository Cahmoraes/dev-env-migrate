'use strict';

/**
 * reviewer-spec-context.test.cjs — the spec-compliance reviewer must receive the SAME
 * design-spec context the implementer is bound to, so it can verify architectural
 * conformance ("right feature, wrong way"), not just functional-requirement coverage.
 *
 * Regression guard for the implementer<->spec-reviewer asymmetry: the implementer prompt
 * has always inlined the design spec's architecture & decisions; the spec-reviewer prompt
 * inlined only the requirements, so it could not check whether the code honored the
 * decisions the implementer was bound to. Both must carry the section, INLINE (full text),
 * never via a path (a path makes the subagent read the whole doc; inline the curated slice).
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
const SPEC_REVIEWER = 'super.subagent-driven-development/agents/spec-reviewer.md';

// Heading shape tolerant to em-dash vs hyphen.
const DESIGN_SPEC_SECTION = /Design Spec\s*[—-]\s*Architecture & Decisions/;

test('implementer prompt inlines the design spec architecture & decisions', () => {
  assert.match(read(IMPLEMENTER), DESIGN_SPEC_SECTION,
    'implementer must receive the design spec (architecture & decisions) inline');
});

test('spec-reviewer prompt inlines the same design spec context (parity with implementer)', () => {
  assert.match(read(SPEC_REVIEWER), DESIGN_SPEC_SECTION,
    'spec-reviewer must receive the design spec inline so it can verify architectural conformance');
});

test('both reviewers/implementer inline FULL TEXT, never hand the subagent a path', () => {
  for (const rel of [IMPLEMENTER, SPEC_REVIEWER]) {
    assert.match(read(rel), /FULL TEXT/,
      `${rel} must inline FULL TEXT of the spec, not depend on the subagent reading a file`);
  }
  // The inline-not-path rule is stated explicitly somewhere in each prompt.
  assert.match(read(IMPLEMENTER), /don.t make subagent read.{0,8}file/i,
    'implementer must state the inline-not-path rule');
  assert.match(read(SPEC_REVIEWER), /do not hand\s+the reviewer\s+a path/i,
    'spec-reviewer must state the inline-not-path rule');
});

test('spec-reviewer checks architectural conformance, not only functional requirements', () => {
  const body = read(SPEC_REVIEWER);
  assert.match(body, /Architectural conformance/i,
    'spec-reviewer must have an architectural-conformance check group');
  assert.match(body, /right feature.{0,5}wrong way/i,
    'the architectural-conformance check must cover the "right feature, wrong way" case');
});
