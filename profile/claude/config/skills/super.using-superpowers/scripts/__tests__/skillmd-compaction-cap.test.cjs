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
 * Why a ratchet and not a flat fail: three skills are already over, and the content past the
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
const MIN_SKILLS = 18;

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
  // Cut lands mid-`## Model Selection`; `## Red Flags`, `## Review cost control` and
  // `## Integration` are all past it. Reduction needs section-by-section review against
  // references/, which already holds longer versions of several of these sections.
  //
  // 31370 -> 31415 (+45): qualified `node scripts/parse-tasks.cjs` with the skill's own
  // base-dir placeholder. The bare relative path only resolved if the cwd happened to be the
  // skill directory, which it never is — a command that fails as ENOENT everywhere it is
  // pasted. Correctness beat 45 bytes in a file whose tail is already truncated.
  //
  // 31415 -> 31395 (-20): the Branch Guard resume fix cost +104, paid for by dropping the
  // rationale sentence under `## Prompt Templates` (why the templates embed the code-search
  // ladder). Rationale belongs in CLAUDE.md, and that paragraph sits past the compaction cut
  // anyway, so it was already lost in exactly the long sessions it was meant to help.
  //
  // 31395 -> 31582 (+187): two entry-path fixes in the same region. (a) Both entry guards
  // read "if triage classified the feature Micro/Small/Medium", a condition that is simply
  // FALSE on the two paths that skip triage (direct invocation, and option 5 on a plan
  // already on disk) — a guard whose condition never evaluates is not a guard, and the
  // reader has to infer what the silence means. (b) "Validation gates run one family up,
  // floored at standard" contradicted the canonical references/model-selection.md ("the
  // task's tier, floored at standard") exactly on `standard` tasks, which are the majority;
  // the session that stopped at this file reviewed a `standard` task at `capable`. Both sit
  // where the reader actually is, which is the point.
  'super.subagent-driven-development': 31582,
  // 20168 -> 20250 (+82) for the same path fix, then back down to 20084 by trimming mechanism
  // out of the description. `compaction-survival-window.test.cjs` is what forced the trim: the
  // +82 pushed `## Red Flags` across the window boundary, so the fix had to be paid for rather
  // than waved through. The ceiling follows the file down.
  //
  // 20084 -> 20174 (+90): the two inputs this gate reads from the PRD were prose-only and
  // both were re-decided per session. (1) The US->FR mapping is required at four points of
  // the procedure and was produced by nothing — two runs over the same PRD mapped it
  // differently. (2) "Is the story UI-facing?" chooses between two branches that write the
  // same field and opposite statuses; the same backend feature came back 3/3 PASSED on one
  // run and PARTIAL on another. Both now read a datum (`requirements`, `uiFacing`) with a
  // stated fallback. A gate whose verdict is not reproducible is not a gate.
  //
  // Most of the +755 was paid back on the same commit: Step 3's acceptance-test-location
  // paragraph and its TypeScript note both restated what Task 2 already hands the subagent,
  // and `compaction-survival-window.test.cjs` is what forced the trim — the additions had
  // pushed `## Red Flags` across the window boundary.
  'super.user-story-verification': 20174,
  // 20073 -> 20059 (-14): `visual-companion.md` and `visual-companion-reference.md` moved from
  // the skill root into `references/`, so the Layout-gate pointer grew by 11 bytes twice. Paid
  // for on the same edit by collapsing that pointer's duplicated markdown link into the bare
  // backtick form the rest of this file already uses. The ceiling follows the file down.
  'super.brainstorming': 20059,
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
