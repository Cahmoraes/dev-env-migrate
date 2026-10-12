#!/usr/bin/env node
'use strict';
/*
 * restated-counts.test.cjs — a SKILL.md that restates HOW MANY items live in a reference
 * owns an untested contract, and it has drifted twice.
 *
 * The shape: SKILL.md says "run these five checks" while the canonical list lives in a
 * `references/*.md` that has since grown to eight. Nothing fails. The suite is green
 * because no test reads the two files against each other, and a model reading strictly
 * runs five — silently switching OFF the trailing items, which are exactly the ones most
 * recently added and therefore least redundant with everything else.
 *
 * Two live instances, in different skills:
 *   - super.brainstorming said "five" while design-spec-structure.md's "Self-review
 *     additions" had grown to 8. The three unreachable checks were close-every-end,
 *     phantom-mechanism and used-vs-declared-absent — backstops the same branch had just
 *     added.
 *   - super.writing-plans said "all five steps" while self-review-checklist.md had 6.
 *     The unreachable one was visual coverage, half the mockup safety net.
 *
 * This guard is cross-skill on purpose: the failure is a class, not a skill's quirk, and
 * the sweep below is what makes it a class. It has two halves:
 *
 *   1. CASES pins each restated counter that is deliberately kept, against the reference
 *      it cites and that reference's own counting shape.
 *   2. the sweep fails on any counter NOT in CASES. Adding one is allowed — it just has
 *      to be registered here, which is the moment someone decides whether the number is
 *      worth its maintenance cost at all. The cheaper fix is usually to not restate it:
 *      "run every check defined in X" never drifts.
 *
 * super.writing-plans keeps its own local copy of the same check
 * (`restated-step-count.test.cjs`). That is not accidental duplication: skills ship
 * separately, so a consumer running only that skill's tests still gets the guard.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/restated-counts.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

const WORD_TO_NUMBER = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Deliberately broad on the noun and narrow on the frame: we want to catch a new
// "run these seven lenses" without firing on every numeral in prose.
const RESTATED_COUNT =
  /\b(?:these|those|all|through|run)\s+(?:the\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:additional\s+|numbered\s+)?(checks|steps|lenses|rules|questions|gates|families|items|criteria)\b/gi;

function toNumber(token) {
  return WORD_TO_NUMBER[String(token).toLowerCase()] ?? Number(token);
}

function sectionOf(md, heading) {
  const start = md.indexOf(heading);
  if (start === -1) return null;
  const rest = md.slice(start + heading.length);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

// `1.` at the start of a line. Sub-items (`4b.`) refine a parent and are not counted
// separately, matching how a reader would number the list.
function countNumberedItems(text) {
  const seen = new Set();
  for (const m of text.matchAll(/^(\d+)\.\s/gm)) seen.add(Number(m[1]));
  return seen.size;
}

// Empty since 2026-09-01: super.brainstorming stopped restating "Run these eight
// additional checks" (the self-review now points at the section without a number,
// the preferred fix). Register a case here the day a SKILL.md restates a count again.
const CASES = [];

function read(rel) {
  const abs = path.join(SKILLS, rel);
  assert.ok(fs.existsSync(abs), `${rel} does not exist — fix the path in CASES`);
  return fs.readFileSync(abs, 'utf8');
}

for (const c of CASES) {
  test(`${c.what}: the reference is still a numbered list`, () => {
    // Anti-staleness. Restructure the reference away from `N.` items and the comparison
    // below would quietly measure against 0 and agree with nothing.
    const section = sectionOf(read(c.reference), c.heading);
    assert.ok(section, `"${c.heading}" is gone from ${c.reference} — the counter in ${c.skill}/SKILL.md now cites a section that does not exist`);
    const n = c.count(section);
    assert.ok(n >= c.floor, `expected ${c.heading} to still hold several numbered items, counted ${n}`);
  });

  test(`${c.what}: SKILL.md's count matches the reference`, () => {
    const claim = c.counter.exec(read(`${c.skill}/SKILL.md`));
    assert.ok(claim, `the restated counter is gone from ${c.skill}/SKILL.md. If it was reworded, update CASES; if it was dropped, delete this case — dropping the number is the preferred fix.`);
    const claimed = toNumber(claim[1]);
    const actual = c.count(sectionOf(read(c.reference), c.heading));
    assert.equal(
      claimed,
      actual,
      `${c.skill}/SKILL.md claims ${claimed} for ${c.what}, but ${path.basename(c.reference)} has ${actual}. ` +
      `A stale count switches off the trailing items — prefer "every check defined in ..." over a number.`,
    );
  });
}

// The brainstorming self-review still points at this section by heading (no count).
// Keep the anti-staleness half: the heading must exist and still be a numbered list.
test('after-the-design.md points at a "Self-review additions" section that still exists', () => {
  const pointer = read('super.brainstorming/references/after-the-design.md');
  assert.ok(pointer.includes('"Self-review additions"'), 'the self-review no longer points at the section — drop this test or fix the pointer');
  const section = sectionOf(read('super.brainstorming/references/design-spec-structure.md'), '## Self-review additions');
  assert.ok(section, '"## Self-review additions" is gone from design-spec-structure.md');
  assert.ok(countNumberedItems(section) >= 5, 'expected the section to still hold several numbered items');
});

test('no SKILL.md restates a count that this guard does not check', () => {
  const registered = new Set(CASES.map((c) => c.skill));
  const unregistered = [];

  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    const md = path.join(SKILLS, skill, 'SKILL.md');
    if (!fs.existsSync(md)) continue;
    fs.readFileSync(md, 'utf8').split('\n').forEach((line, idx) => {
      for (const m of line.matchAll(RESTATED_COUNT)) {
        if (registered.has(skill) && CASES.some((c) => c.skill === skill && c.counter.test(line))) continue;
        unregistered.push(`${skill}/SKILL.md:${idx + 1} restates "${m[0]}"`);
      }
    });
  }

  assert.deepEqual(
    unregistered,
    [],
    'A SKILL.md hard-codes how many items a reference has, with nothing comparing the two.\n  ' +
    unregistered.join('\n  ') +
    '\n  Either drop the number ("run every check defined in ...") or add a case to CASES above.',
  );
});
