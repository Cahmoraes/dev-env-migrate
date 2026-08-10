#!/usr/bin/env node
'use strict';
/*
 * section-pointers.test.cjs — a pointer that names a SECTION must land where that
 * section actually lives.
 *
 * `reference-pointers.test.cjs` is the sibling guard: it proves every pointer RESOLVES
 * on disk. It says so itself — the bare-pointer check "would not catch a pointer aimed
 * at the wrong skill". This file covers the failure mode one level up: the file exists,
 * so no tool call fails, but the content promised is not in it. The model spends the
 * read, finds nothing, and then improvises or reports itself blocked — the same cost as
 * a dead pointer, with none of the noise that makes a dead pointer easy to spot.
 *
 * Both cases below were live: content moved between progressive-disclosure tiers and the
 * prose pointing at it stayed behind.
 *
 *   - The visual-companion render-debt rules: `visual-companion-operation.md` sent the
 *     reader to `SKILL.md` for the three rules that sit 19 lines further down in that same
 *     file — while `visual-companion-contract.test.cjs` FORBIDS them from SKILL.md
 *     ("the numbered rules are NOT restated in the always-paid tier"). Following the
 *     pointer was guaranteed to come up empty.
 *   - The tier table: `medium-inline-path.md` sent the reader to `SKILL.md` after
 *     `skillmd-eager-cost.test.cjs` had moved ownership to `references/triage-sizing.md`
 *     ("the tier table must NOT be pasted back into SKILL.md").
 *
 * Each case asserts TWO things, and the first one matters as much as the second:
 *   1. the POINTER phrase is still present in the source file, and
 *   2. the ANCHOR is present in the destination file.
 * Without (1) this test would silently pass forever once someone rewords the prose —
 * a guard that survives by no longer testing anything. Rewording is fine; it just has
 * to come with updating the pattern here, which is the moment to re-check the target.
 *
 * Adding a case: only for pointers that name a specific section/table/rule set, where
 * another guard already pins WHERE that content must live. A pointer to a whole file is
 * `reference-pointers.test.cjs`'s job, not this one.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/section-pointers.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

const CASES = [
  {
    what: 'the three render-debt rules',
    source: 'super.brainstorming/references/visual-companion-operation.md',
    pointer: /The three rules are numbered below \(`SKILL\.md` carries only the trigger\)/,
    destination: 'super.brainstorming/references/visual-companion-operation.md',
    anchor: /^1\. \*\*Launch and first render belong to the same turn/m,
    pinnedBy: 'visual-companion-contract.test.cjs — "the numbered rules are NOT restated in the always-paid tier"',
  },
  {
    what: 'the tier table',
    source: 'super.using-superpowers/references/medium-inline-path.md',
    pointer: /see the tier table in `triage-sizing\.md`/,
    destination: 'super.using-superpowers/references/triage-sizing.md',
    anchor: /^\| \*\*Micro\*\* \|/m,
    pinnedBy: 'skillmd-eager-cost.test.cjs — "the tier table lives in the reference, not in the eager SKILL.md"',
  },
  // The execution-loop decomposition points the OTHER way — SKILL.md naming a section of a
  // reference — which the sweep below does not cover (it reads references pointing INTO
  // SKILL.md). Three named sections, three hand-written cases, because the pointers are the
  // only thing standing between a resumed session and mechanics it cannot see: the loop ends
  // past the 20.000-char compaction cut, so a reader who follows a dead pointer here has no
  // second copy to fall back on.
  {
    what: 'the deterministic tracker writes',
    source: 'super.subagent-driven-development/SKILL.md',
    pointer: /`\.\/references\/execution-loop\.md`, "Tracker writes are physical edits on disk"/,
    destination: 'super.subagent-driven-development/references/execution-loop.md',
    anchor: /^## Tracker writes are physical edits on disk$/m,
    pinnedBy: 'compaction-survival-window.test.cjs — the mechanics moved out of the over-cap SKILL.md',
  },
  {
    what: 'the two dispatch failure modes',
    source: 'super.subagent-driven-development/SKILL.md',
    pointer: /`\.\/references\/execution-loop\.md`, "Dispatch failure modes"/,
    destination: 'super.subagent-driven-development/references/execution-loop.md',
    anchor: /^## Dispatch failure modes$/m,
    pinnedBy: 'compaction-survival-window.test.cjs — the mechanics moved out of the over-cap SKILL.md',
  },
  {
    what: 'the review-loop caps and reviewShape',
    source: 'super.subagent-driven-development/SKILL.md',
    pointer: /`\.\/references\/execution-loop\.md`, "Review loop bounds"/,
    destination: 'super.subagent-driven-development/references/execution-loop.md',
    anchor: /^## Review loop bounds$/m,
    pinnedBy: 'compaction-survival-window.test.cjs — the mechanics moved out of the over-cap SKILL.md',
  },
];

function read(rel) {
  const abs = path.join(SKILLS, rel);
  assert.ok(fs.existsSync(abs), `${rel} does not exist — fix the path in this test's CASES`);
  return fs.readFileSync(abs, 'utf8');
}

for (const c of CASES) {
  test(`pointer to ${c.what} still exists in ${path.basename(c.source)}`, () => {
    // Anti-staleness: if the prose was reworded, this guard must fail loudly rather than
    // keep passing against a phrase nobody writes anymore.
    assert.match(
      read(c.source),
      c.pointer,
      `the pointer to ${c.what} is gone from ${c.source}. If it moved or was reworded, update CASES here and re-verify the destination.`,
    );
  });

  test(`${c.what} actually lives in ${path.basename(c.destination)}`, () => {
    assert.match(
      read(c.destination),
      c.anchor,
      `${c.source} points at ${c.destination} for ${c.what}, but it is not there. Ownership is pinned by ${c.pinnedBy}.`,
    );
  });
}

// --- sweep: every reference that NAMES a SKILL.md section must find it there ---------
//
// This does not subsume CASES above, it covers the adjacent population. The two live bugs
// pointed at SKILL.md for content they described in prose ("the three rules", "the tier
// table") without naming a section, so only a hand-written anchor can check them. The
// sweep catches the shape that IS mechanically decidable: `SKILL.md`, "Some Section" —
// 17 of them today, none of which any test looked at before.

const SECTION_POINTER =
  /`?SKILL\.md`?(?:.s)?[,\s]+(?:["“]([^"”\n]{3,60})["”]|(Step\s+\d+))/g;

function collectReferences() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.md')) out.push(p);
    }
  };
  for (const skill of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    const refDir = path.join(SKILLS, skill, 'references');
    if (fs.existsSync(refDir)) walk(refDir);
  }
  return out;
}

// A pointer may aim at another skill's SKILL.md: "consults `super.design-doc-mermaid`'s
// own Decision Tree (that skill's `SKILL.md`, "Decision Tree" section)". The skill named
// last before the mention on that line is the target; with none, it is the owning skill.
function resolveTargetSkill(line, upto, owningSkill) {
  const named = [...line.slice(0, upto).matchAll(/super\.[a-z0-9-]+/g)].pop();
  return named ? named[0] : owningSkill;
}

function hasHeading(md, section) {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Skills number their steps as headings (`## 2. Fan out the review lenses`), so a
  // pointer reading "SKILL.md Step 2" resolves against the heading numeral, not the word.
  const stepMatch = /^Step\s+(\d+)$/i.exec(section);
  if (stepMatch) return new RegExp(`^#{1,6}\\s*${stepMatch[1]}\\.\\s`, 'm').test(md);
  return new RegExp(`^#{1,6}\\s.*${escaped}`, 'mi').test(md);
}

function collectSectionPointers() {
  const found = [];
  for (const file of collectReferences()) {
    const owningSkill = path.relative(SKILLS, file).split(path.sep)[0];
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, idx) => {
      for (const m of line.matchAll(SECTION_POINTER)) {
        found.push({
          file: path.relative(SKILLS, file),
          line: idx + 1,
          section: (m[1] || m[2]).replace(/\s+section$/i, '').trim(),
          targetSkill: resolveTargetSkill(line, m.index, owningSkill),
        });
      }
    });
  }
  return found;
}

test('the section-pointer sweep still finds pointers to check', () => {
  // Anti-staleness, and it is the load-bearing half. A sweep whose pattern stops matching
  // reports zero violations over zero inputs and passes forever. 17 pointers today; the
  // floor is deliberately below that so ordinary prose edits do not trip it, but deleting
  // the whole convention does.
  const n = collectSectionPointers().length;
  assert.ok(
    n >= 10,
    `expected the sweep to still match section pointers, found ${n}. ` +
    'If the prose convention changed shape, update SECTION_POINTER — do not delete this floor.',
  );
});

test('every reference naming a SKILL.md section finds that section there', () => {
  const broken = [];
  for (const p of collectSectionPointers()) {
    const skillMd = path.join(SKILLS, p.targetSkill, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      broken.push(`${p.file}:${p.line} aims at ${p.targetSkill}/SKILL.md, which does not exist`);
      continue;
    }
    if (!hasHeading(fs.readFileSync(skillMd, 'utf8'), p.section)) {
      broken.push(`${p.file}:${p.line} sends the reader to ${p.targetSkill}/SKILL.md for "${p.section}", which has no such heading`);
    }
  }
  assert.deepEqual(
    broken,
    [],
    'A pointer resolves on disk but the section it names is not in the destination — ' +
    'the read is spent and comes up empty:\n  ' + broken.join('\n  '),
  );
});

test('no reference sends the reader to SKILL.md for content another guard forbids there', () => {
  // The concrete regression both cases above shared: prose naming SKILL.md as the owner
  // of something the eager tier is explicitly not allowed to carry.
  const forbidden = [
    { rel: 'super.brainstorming/references/visual-companion-operation.md', re: /three rules[^.]*in `SKILL\.md`/i, what: 'render-debt rules' },
    { rel: 'super.using-superpowers/references/medium-inline-path.md', re: /tier table in `SKILL\.md`/i, what: 'tier table' },
  ];
  for (const f of forbidden) {
    assert.doesNotMatch(
      read(f.rel),
      f.re,
      `${f.rel} points at SKILL.md for the ${f.what}, which SKILL.md is guarded against carrying.`,
    );
  }
});
