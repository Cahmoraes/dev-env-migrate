'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_MD = path.join(__dirname, '..', '..', 'SKILL.md');
const REFERENCE_MD = path.join(__dirname, '..', '..', 'references', 'diagram-enrichment.md');

const skillMd = fs.readFileSync(SKILL_MD, 'utf8');
const referenceMd = fs.readFileSync(REFERENCE_MD, 'utf8');

test('SKILL.md gates step 6 (write design doc) on the Diagram Enrichment checklist', () => {
  assert.match(skillMd, /Diagram Enrichment checklist in `\.\/references\/diagram-enrichment\.md`/);
});

test('SKILL.md "After the Design" documents Diagram Enrichment as its own bullet, distinct from the Visual Companion', () => {
  assert.match(skillMd, /\*\*Diagram Enrichment:\*\*/);
  assert.match(skillMd, /separate from the Visual Companion/);
  assert.match(skillMd, /never creates a `specs\/mockups\/` artifact/);
});

test('SKILL.md tells Diagram Enrichment where to save its .mmd output (spec-relative diagrams/)', () => {
  assert.match(skillMd, /docs\/superpowers\/<feature-name>\/specs\/diagrams\//);
});

test('Visual Companion signal cross-references Diagram Enrichment (both directions linked)', () => {
  assert.match(skillMd, /see \*\*Diagram Enrichment\*\* under "After the Design"/);
});

test('reference file states when a diagram is warranted (non-trivial signals)', () => {
  for (const signal of [
    /new integration/i,
    /new components/i,
    /complex refactor/i,
    /ETL/,
    /state machine/i,
  ]) {
    assert.match(referenceMd, signal);
  }
});

test('reference file explicitly excludes trivial changes', () => {
  assert.match(referenceMd, /\*\*Skip it\*\* for trivial demands/);
});

test('reference file uses super.design-doc-mermaid with --no-image and validates before embedding', () => {
  assert.match(referenceMd, /super\.design-doc-mermaid/);
  assert.match(referenceMd, /--no-image/);
  assert.match(referenceMd, /resilient_diagram\.py/);
});

test('reference file instructs embedding raw Mermaid, not a PNG image reference', () => {
  assert.match(referenceMd, /do \*\*not\*\* add an `!\[\]\(\)` image reference/);
});

test('reference file sets an explicit model floor for the dispatch (never inherits controller model)', () => {
  assert.match(referenceMd, /explicit `model:`/);
  assert.match(referenceMd, /floor at `standard`/);
});

test('reference file states the diagram complements the prose and must never replace it', () => {
  assert.match(referenceMd, /complements the prose — it never replaces it/);
});

test('reference file forbids narrating the diagram\'s own production (subagent/tooling) inside the spec', () => {
  assert.match(referenceMd, /Never narrate the diagram's own production inside the spec/);
});

test('reference file forbids the diagram from asserting specific mechanisms the prose only gestures at generically', () => {
  assert.match(referenceMd, /The diagram must not assert anything the prose doesn't/);
  assert.match(referenceMd, /does not license the diagram to invent the \*specific mechanism\*/);
});
