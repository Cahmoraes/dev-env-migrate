'use strict';

/**
 * execution-loop-heading.test.cjs — the unconditional execution loop must live under its own
 * `### Execution Loop` heading, never nested inside a pre-flight gate.
 *
 * Regression guard for a structural defect found by a heading-span sweep: the entire core of
 * this skill (tracker handling, the per-task dispatch/review loop, the full-suite checkpoint,
 * the final stage) once sat with no heading of its own, so by markdown structure it read as a
 * sub-step of the conditional gate above it. A controller that resolved that gate to a no-op and
 * skipped to the next heading would jump the entire implementation procedure.
 *
 * The suite was blind to this: 917 tests passed both before and after the fix. This test exists
 * so the structure cannot silently regress — it asserts the *nearest preceding heading* of each
 * execution-loop marker is the loop's own heading.
 *
 * Run: node --test super.subagent-driven-development/scripts/__tests__/execution-loop-heading.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills
const SKILL = path.join(SKILLS, 'super.subagent-driven-development', 'SKILL.md');
const body = fs.readFileSync(SKILL, 'utf8');

/** Every markdown heading in the file, with its character offset. */
function headings(text) {
  const out = [];
  const re = /^(#{1,6})\s+(.*)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ offset: m.index, level: m[1].length, text: m[2].trim() });
  }
  return out;
}

/** The heading a given offset sits under. */
function enclosingHeading(text, offset) {
  const before = headings(text).filter((h) => h.offset < offset);
  return before.length ? before[before.length - 1] : null;
}

// Markers that are unmistakably part of the unconditional execution procedure.
const EXECUTION_MARKERS = [
  '**If a tracker exists:**',
  '**Per task (sequential):**',
  // The final stage moved to references/final-stage.md; what stays here is the five-gate
  // index that points at it. Its opening phrase is the marker now — the structural claim
  // is unchanged (this step must sit under the loop's own heading), only the anchor moved.
  '**After all tasks done — the final stage.**',
];

test('the execution loop markers sit under the Execution Loop heading, not a pre-flight gate', () => {
  for (const marker of EXECUTION_MARKERS) {
    const at = body.indexOf(marker);
    assert.notEqual(at, -1, `expected the execution loop to contain ${marker}`);

    const heading = enclosingHeading(body, at);
    assert.ok(heading, `${marker} must sit under some heading`);
    assert.equal(
      heading.text,
      'Execution Loop',
      `${marker} is unconditional but sits under "${heading.text}" — a controller that ` +
        'skips that section would skip the execution procedure',
    );
  }
});

test('the execution loop has its own heading inside The Process', () => {
  const loop = body.indexOf('**If a tracker exists:**');
  const heading = enclosingHeading(body, loop);
  assert.equal(heading.level, 3, 'the execution loop heading must be a ### step of The Process');

  // It comes after the pre-flight gates, which must still run first.
  for (const gate of ['### Session State Re-Entry Guard', '### Branch Guard']) {
    const at = body.indexOf(gate);
    assert.notEqual(at, -1, `missing pre-flight gate ${gate}`);
    assert.ok(at < heading.offset, `${gate} must precede the execution loop heading`);
  }
});

test('the execution loop is marked unconditional so no preference can gate it', () => {
  const heading = enclosingHeading(body, body.indexOf('**If a tracker exists:**'));

  // Scope to the blockquote that immediately follows the heading — NOT to the whole section.
  // A section-wide match can pass on unrelated wording elsewhere in the section even when
  // this preamble is deleted, so the assertion reads only the blockquote.
  const afterHeading = body.slice(heading.offset).split('\n').slice(1);
  const preamble = [];
  for (const line of afterHeading) {
    if (line.trim() === '') { if (preamble.length) break; continue; }
    if (!line.startsWith('>')) break;
    preamble.push(line);
  }

  assert.ok(preamble.length, 'the execution loop heading must be followed by a note blockquote');
  assert.match(
    preamble.join('\n'),
    /unconditional/i,
    'the note under the execution loop heading must state the section is unconditional, ' +
      'so no preference ever gates it',
  );
});
