'use strict';
/*
 * skillmd-compaction-cap.test.cjs — a SKILL.md that outgrows the re-attach cap loses its tail
 * after the first compaction, and nothing reports it.
 *
 * The mechanism, from code.claude.com/docs/en/skills:
 *
 *   "Claude Code re-attaches the most recent invocation of each skill after the summary,
 *    keeping the FIRST 5,000 TOKENS of each. Re-attached skills share a COMBINED BUDGET OF
 *    25,000 TOKENS [...] so older skills can be dropped entirely."
 *
 * Two separate limits, and both bite this repo:
 *
 *   per skill  — 5,000 tokens. Everything past that offset is gone after a compaction. This
 *                is what the file below enforces.
 *   combined   — 25,000 tokens across every skill re-attached, filled most-recent-first. Our
 *                19 super.* skills sum to ~71k, so a session that walks the whole pipeline
 *                loses roughly two thirds of what it loaded. NOT enforced here: fixing it
 *                means changing how many skills the pipeline keeps alive at once, which is
 *                an architecture decision, not a size check. Documented in CLAUDE.md.
 *
 * Why a ratchet and not a flat fail: one skill is still over (three were when this was written), and the content past the
 * cut is not filler — in super.subagent-driven-development the cut at ~20,000 bytes lands
 * mid-`## Model Selection`, so `## Red Flags` (the rationalization table), `## Review cost
 * control` and `## Integration` all sit past it. Cutting those under time pressure is how a
 * behavioural gate gets deleted to make a number go green. So each known offender carries a
 * ceiling pinned at its measured size: it may shrink, never grow. New skills get the real cap.
 *
 * Token estimate is bytes/4. Deliberately crude and deliberately conservative: the real
 * tokenizer packs prose slightly better than 4 bytes/token, so this overestimates and errs
 * toward flagging. Frontmatter counts — it is part of the re-attached content.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/skillmd-compaction-cap.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..');

/** Per-skill re-attach cap, in estimated tokens. */
const CAP_TOKENS = 5000;
const BYTES_PER_TOKEN = 4;

/**
 * Anti-staleness floor. A walk that stopped finding SKILL.md files would pass forever.
 */
const MIN_SKILLS = 16;

/**
 * Skills already past the cap when this guard was written. The number is a CEILING IN BYTES,
 * pinned at the measured size — shrinking is always allowed, growing is not. Delete the entry
 * once the skill fits under CAP_TOKENS.
 *
 * A ceiling moves UP only with the reason written next to it, on the same commit as the
 * change that needed it. That is the whole discipline: raising a number silently to clear a
 * red test converts this guard into decoration, so the cost of raising it is having to state
 * publicly what was worth more than the bytes.
 */
const OVER_CAP_CEILING = {
  // 2026-09-13: empty. super.subagent-driven-development (the last offender, ceiling 31143)
  // became a router under the cap. A new entry is a new debt: pin its measured size and shrink.
};

function skillMds() {
  return fs.readdirSync(SKILLS)
    .filter((d) => d.startsWith('super.'))
    .map((d) => ({ name: d, abs: path.join(SKILLS, d, 'SKILL.md') }))
    .filter((s) => fs.existsSync(s.abs))
    .map((s) => ({ ...s, bytes: fs.statSync(s.abs).size }))
    .sort((a, b) => b.bytes - a.bytes);
}

const ALL = skillMds();

test('the SKILL.md roster is not silently shrinking', () => {
  assert.ok(
    ALL.length >= MIN_SKILLS,
    `found ${ALL.length} super.* SKILL.md files, expected >= ${MIN_SKILLS}`,
  );
});

test('no SKILL.md outside the known set exceeds the per-skill re-attach cap', () => {
  const over = ALL
    .filter((s) => !(s.name in OVER_CAP_CEILING))
    .filter((s) => s.bytes / BYTES_PER_TOKEN > CAP_TOKENS)
    .map((s) => `${s.name}: ${s.bytes} bytes (~${Math.round(s.bytes / BYTES_PER_TOKEN)} tok, `
      + `cut ${s.bytes - CAP_TOKENS * BYTES_PER_TOKEN} bytes to fit)`);
  assert.deepEqual(
    over, [],
    `content past ~${CAP_TOKENS} tokens does not survive the first auto-compaction. Move what `
    + 'is consulted on demand into references/ — and MOVE it, do not summarise it in place: a '
    + 'summary left behind gets reconstructed from and the pointer never opens.',
  );
});

test('every known over-cap skill is shrinking or flat, never growing', () => {
  const grown = [];
  for (const [name, ceiling] of Object.entries(OVER_CAP_CEILING)) {
    const s = ALL.find((x) => x.name === name);
    if (!s) continue; // covered by the staleness test below
    if (s.bytes > ceiling) {
      grown.push(`${name}: ${s.bytes} bytes, ceiling ${ceiling} (+${s.bytes - ceiling})`);
    }
  }
  assert.deepEqual(
    grown, [],
    'this skill is already past the re-attach cap, so every byte added is a byte that will be '
    + 'dropped after compaction. Put new content in references/ instead, or shrink the file '
    + 'first and lower the ceiling in this test.',
  );
});

test('the over-cap allowlist has no stale entries', () => {
  const stale = [];
  for (const name of Object.keys(OVER_CAP_CEILING)) {
    const s = ALL.find((x) => x.name === name);
    if (!s) { stale.push(`${name}: no longer exists`); continue; }
    if (s.bytes / BYTES_PER_TOKEN <= CAP_TOKENS) {
      stale.push(`${name}: now ${s.bytes} bytes, fits under the cap — remove the entry`);
    }
  }
  assert.deepEqual(
    stale, [],
    'an allowlist entry that no longer needs to be there hides the next regression behind it.',
  );
});
