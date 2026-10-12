#!/usr/bin/env node
'use strict';
/*
 * prd-template-contract.test.cjs — first tests for super.generating-prd.
 *
 * This skill had zero coverage: no scripts, so nothing to unit-test, and no textual
 * contract either. It is not a peripheral skill — it sits on the critical path
 * (brainstorming -> generating-prd -> writing-plans) and it is where the identifiers the
 * rest of the pipeline keys on are minted. `US-NN` is what the QA gate traces; `FR-NNN`
 * is what the coverage validator demands each task cover. A drift here does not fail
 * loudly, it produces a PRD that later scripts read as empty.
 *
 * Two contracts are pinned, both mechanically decidable:
 *
 *   1. SKILL.md restates the template's seven section names inline. That is the
 *      "restated enumeration" drift class, which has already bitten twice elsewhere in
 *      this repo — add a section to prd-template.md and SKILL.md's list goes stale with
 *      the suite green. The list is also what a model reproduces when it drafts without
 *      opening the template, so a stale list is a PRD with a missing section.
 *
 *   2. The template's `US-NN` line shape is a CROSS-SKILL contract it declares out loud:
 *      "Use this exact line shape so generate-slugs.cjs can extract and trace each
 *      story". That the shape actually parses is checked end-to-end by the junction
 *      harness (super.using-superpowers .../e2e), which feeds this very template to
 *      generate-slugs.cjs. Here we pin the half that is local: the template still
 *      carries the shape and still says who consumes it.
 *
 * Run: node --test super.generating-prd/scripts/__tests__/prd-template-contract.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const skillMd = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const template = fs.readFileSync(path.join(SKILL_DIR, 'references', 'prd-template.md'), 'utf8');

function templateSections() {
  return [...template.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
}

function restatedSections() {
  // "... sections (in Portuguese): A, B, C. The template also defines ..."
  const m = /sections \(in Portuguese\):\s*([^.]+?)\.\s+The template/.exec(skillMd);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

test('SKILL.md still enumerates the template sections inline', () => {
  // Anti-staleness. If the sentence is reworded or the list is dropped in favour of
  // "reproduce the sections from the template", this guard must say so rather than
  // keep passing against a comparison it can no longer make. Dropping the list is a
  // fine outcome — it is the fix that cannot drift — it just has to be deliberate.
  assert.ok(
    restatedSections(),
    'the inline section list is gone from SKILL.md. If it was removed on purpose, delete this test; if it was reworded, update the pattern and re-verify against prd-template.md.',
  );
});

test("SKILL.md's section list matches prd-template.md exactly, in order", () => {
  assert.deepEqual(
    restatedSections(),
    templateSections(),
    'SKILL.md lists different PRD sections than prd-template.md defines. A model drafting from the ' +
    'inline list (rather than opening the template) would emit a PRD with the wrong sections.',
  );
});

test('the template still declares the US-NN line shape and names its consumer', () => {
  assert.match(
    template,
    /generate-slugs\.cjs/,
    'prd-template.md no longer names generate-slugs.cjs as the consumer of the US-NN line shape — ' +
    'the cross-skill contract became invisible to whoever edits the template next.',
  );
  const exemplos = [...template.matchAll(/^- \*\*US-(\d{2})\*\* — Como .+ para que .+$/gm)];
  assert.ok(
    exemplos.length >= 2,
    `expected the template to keep at least two literal US-NN example lines, found ${exemplos.length}. ` +
    'The examples are the shape: generate-slugs.cjs is matched against them by the e2e junction harness.',
  );
});

test('the template still declares the FR-NNN numbering the coverage validator keys on', () => {
  assert.match(
    template,
    /`FR-` prefix \(FR-001, FR-002/,
    'prd-template.md no longer shows the FR-NNN numbering. `validate-tasks --prd` scans the PRD for ' +
    'these tokens and demands a task cover each one; without the shape in the template, coverage silently drops to zero.',
  );
});
