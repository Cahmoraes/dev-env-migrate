'use strict';

/**
 * skill-heading-structure.test.cjs — cross-skill sweep for prose filed under the wrong heading.
 *
 * The defect class: a refactor drops a heading, and the paragraphs that lived under it become
 * "orphans" — by markdown structure they now belong to whatever heading happens to sit above
 * them. A reader (human or model) that resolves that heading as not-applicable and skips to the
 * next one skips the orphaned content too.
 *
 * This is not hypothetical. Two instances were found by exactly this sweep:
 *   - super.subagent-driven-development: the entire per-task execution loop (~77 lines: tracker,
 *     dispatch/review loop, full-suite checkpoint, final stage, IV gate, done-state gate) sat
 *     under the heading of a conditional *presentation preference*. Preference off + skip section
 *     = skip the whole implementation procedure. Fixed in ed0b243.
 *   - super.finishing-a-development-branch: `### Step 2: Verify Tests` also held the clean-tree
 *     gate — a green suite satisfied only part of the step. Heading renamed to name both.
 *
 * Neither was visible to the suite: 917 tests passed before and after the first fix. Passing
 * tests say nothing about document hierarchy, which is why this sweep is a test now.
 *
 * The signal is a DEEP heading (### or ####) with an unusually large span, since sections in
 * these files are otherwise short. That is a heuristic, so long-but-coherent sections are
 * allowlisted — with a written reason each, and the allowlist is itself checked for staleness
 * so it cannot quietly accumulate rubber stamps.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/skill-heading-structure.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

/** A deep heading is suspicious past this many lines. */
const SPAN_LIMIT = 45;

/**
 * Long sections that are genuinely about their heading, each with the reason it is long.
 * Key: `<skill> :: <exact heading line>`. Adding an entry here is a claim you have read the
 * section and found it coherent — not a way to silence the sweep.
 */
const COHERENT_LONG_SECTIONS = {
  'super.systematic-debugging :: ### Phase 1: Root Cause Investigation':
    'Root-cause investigation throughout: error reading, reproduction, evidence, data tracing.',
};

function skillDirs() {
  return fs
    .readdirSync(SKILLS)
    .filter((d) => d.startsWith('super.'))
    .filter((d) => fs.existsSync(path.join(SKILLS, d, 'SKILL.md')))
    .sort();
}

/** Every heading with the number of lines until the next heading of any level. */
function headingSpans(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const hs = [];
  lines.forEach((line, i) => {
    const m = /^(#{2,4})\s+(.*)$/.exec(line);
    if (m) hs.push({ level: m[1].length, text: m[2].trim(), line: i + 1, raw: `${m[1]} ${m[2].trim()}` });
  });
  hs.forEach((h, i) => {
    h.span = (i + 1 < hs.length ? hs[i + 1].line : lines.length + 1) - h.line;
  });
  return hs;
}

/** Deep headings whose span exceeds the limit, across every skill. */
function longDeepSections() {
  const out = [];
  for (const dir of skillDirs()) {
    for (const h of headingSpans(path.join(SKILLS, dir, 'SKILL.md'))) {
      if (h.level >= 3 && h.span >= SPAN_LIMIT) out.push({ key: `${dir} :: ${h.raw}`, ...h, skill: dir });
    }
  }
  return out;
}

test('no deep heading holds an unexpectedly long run of prose', () => {
  const unexpected = longDeepSections().filter((s) => !(s.key in COHERENT_LONG_SECTIONS));

  assert.deepEqual(
    unexpected.map((s) => `${s.key} (${s.span} lines, from line ${s.line})`),
    [],
    'A deep heading grew past the sweep limit. Read the section: if the subject changes partway '
      + 'through, the tail lost its own heading — give it one. If it is coherent, add it to '
      + 'COHERENT_LONG_SECTIONS with the reason.',
  );
});

test('the allowlist has no stale entries', () => {
  const live = new Set(longDeepSections().map((s) => s.key));
  const stale = Object.keys(COHERENT_LONG_SECTIONS).filter((k) => !live.has(k));

  assert.deepEqual(
    stale,
    [],
    'These allowlist entries no longer match a long deep heading — the heading was renamed, '
      + 'split, or shortened. Delete them so the allowlist keeps meaning what it says.',
  );
});

test('every allowlist entry carries a real justification', () => {
  for (const [key, reason] of Object.entries(COHERENT_LONG_SECTIONS)) {
    assert.equal(typeof reason, 'string', `${key} must have a written reason`);
    assert.ok(
      reason.trim().length >= 40,
      `${key}: the reason must actually explain why the section is coherent, not just say "ok"`,
    );
  }
});

test('the sweep looks at every skill that has a SKILL.md', () => {
  const dirs = skillDirs();
  assert.ok(dirs.length >= 15, `expected the full skill set, saw ${dirs.length}`);
  // The two skills whose real defects motivated this test must be in scope.
  assert.ok(dirs.includes('super.subagent-driven-development'));
  assert.ok(dirs.includes('super.finishing-a-development-branch'));
});
