#!/usr/bin/env node
'use strict';
/*
 * cross-skill-base-dir.test.cjs — a skill that invokes ANOTHER skill's script must say how
 * to find it, and must say that failing to find it is a STOP.
 *
 * `<super.X-base-dir>` is a placeholder the harness never fills in. It injects the base
 * directory of the skill it just invoked — never its siblings'. So the moment a SKILL.md
 * says `node <super.using-superpowers-base-dir>/scripts/derive-session-state.cjs`, a
 * controller that entered THAT skill directly has a command it cannot run and no rule for
 * turning the placeholder into a path.
 *
 * Measured, Copilot CLI 1.0.77, session 8bf714be (kimi-k2.7-code, direct entry into
 * super.subagent-driven-development): the controller went hunting.
 *
 *     glob **\/derive-session-state.cjs   -> "No files matched the pattern."
 *     glob .claude/skills/**\/*.cjs       -> "No files matched the pattern."
 *     glob .claude/**\/*                  -> "No files matched the pattern."
 *
 * Copilot's `glob` does not descend into hidden directories, and `.claude/` is hidden. All
 * three probes answered "not there" about files that were there. The controller then
 * proceeded without a word: session state never derived, memory gate never run, caveman
 * (configured `ultra`) never rendered, parse-waves/parse-tasks never run. Nothing in the
 * transcript recorded a skipped gate. Later in the same session it stated a script was
 * "not available in this environment" while that script's absolute path sat in its own
 * skill-context header — a failed `glob` outweighed the evidence on screen.
 *
 * Hence one sentence carrying both halves, verbatim:
 *   - the RESOLUTION removes the reason to hunt (siblings: parent of your base dir + /super.X);
 *   - the STOP removes the silence when a gate script still will not run.
 *
 * Prose-only would rot: the two halves are worth nothing apart, and one skill quietly
 * dropping the sentence is invisible. This sweep pins it.
 *
 * BLOCKED is the tracked-debt half, and it is self-expiring. A skill carries a
 * cross-skill placeholder and sits within a few hundred characters of the 20.000-char
 * compaction cap, where adding the sentence would push load-bearing content out of the
 * window — a worse trade than the gap it closes. The entry records that, and the test
 * asserts the claim is STILL TRUE: compress one of those files and this fails, demanding
 * the sentence be added rather than letting the exemption outlive its reason.
 *
 * Run: node --test super.using-superpowers/scripts/__tests__/cross-skill-base-dir.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.resolve(__dirname, '..', '..', '..'); // .../artifacts/superpowers/skills

/** The harness's per-skill re-injection cap, in characters. See compaction-survival-window. */
const CAP = 20000;

/**
 * The sentence, verbatim. Both halves in one line on purpose: a resolution rule without the
 * STOP still lets a failed lookup pass silently, and a STOP without the resolution rule
 * fires on a problem the model had no way to avoid.
 */
const CANON =
  "> **Resolving `<super.X-base-dir>`:** the skills are siblings — parent of your header's "
  + 'base directory + `/super.X`. Never `glob` for one (`glob` misses dotdirs); a gate script '
  + 'that will not run is a **STOP**, never a skipped gate.';

/** Cost of the sentence as written into a file: the line plus its trailing blank line. */
const CANON_COST = CANON.length + 2;

/** Skills that invoke another skill's script and must carry CANON. */
const COVERED = [
  'super.subagent-driven-development',
  'super.parallel-subagent-development',
  'super.parallel-subagent-in-tree',
  'super.finishing-a-development-branch',
  'super.reviewing-specs',
  'super.writing-plans',
  // Was BLOCKED on budget until 2026-08-11. Two things closed it: the feature index moved
  // out of SKILL.md into the recall subagent, and the compaction-layout rationale — which
  // governs how WE arrange the file and does nothing at runtime — moved to the dev-only
  // CLAUDE.md. The exemption expired the moment the room existed, which is what the
  // still-true assertion below exists to force.
  //
  // Worth keeping from that entry: this sweep reads SKILL.md ONLY, and the cross-skill call
  // that actually misfired lived in a reference (research-fan-out.md, the lessons.py load).
  // Two measured sessions collapsed it into the brainstorming base-dir and spent 2-3 calls
  // hunting the file. That class is pinned by base-dir-collapse.test.cjs, which does sweep
  // references — this sentence is the upstream rule, not a replacement for it.
  'super.brainstorming',
];

/**
 * Skills whose SKILL.md carries a cross-skill placeholder but has no room for CANON.
 *
 * `reason` — why the exemption is the better trade today, not an approval of the gap.
 */
const BLOCKED = {
  'super.user-story-verification': {
    reason:
      'Tightest file in the set (~41 chars of headroom). Its cross-skill call is PRD '
      + 'discovery, which already has an explicit no-PRD path that reports and returns '
      + 'control — the silent-skip failure this sentence prevents cannot happen there.',
  },
};

const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

/** Every skill directory holding a SKILL.md. */
const allSkills = () =>
  fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && e.name.startsWith('super.'))
    .map((e) => e.name)
    .filter((n) => fs.existsSync(path.join(SKILLS, n, 'SKILL.md')))
    .sort();

/** Placeholders in `skill`'s SKILL.md that point at a DIFFERENT skill, with their offsets. */
const crossRefs = (skill) => {
  const text = read(`${skill}/SKILL.md`);
  const out = [];
  for (const m of text.matchAll(/<(super\.[a-z-]+)-base-dir>/g)) {
    if (m[1] !== skill) out.push({ target: m[1], at: m.index });
  }
  return out;
};

test('the sweep still finds cross-skill script invocations to govern', () => {
  const withCross = allSkills().filter((s) => crossRefs(s).length > 0);
  // Anti-staleness floor: if the placeholder syntax ever changes, this sweep would find
  // nothing, report zero violations over zero entries, and pass forever.
  assert.ok(
    withCross.length >= 8,
    `expected at least 8 SKILL.md invoking another skill's script, found ${withCross.length}: `
      + withCross.join(', '),
  );
});

test('every skill with a cross-skill call is either covered or registered as blocked', () => {
  const withCross = allSkills().filter((s) => crossRefs(s).length > 0);
  const unclassified = withCross.filter(
    (s) => !COVERED.includes(s) && !Object.hasOwn(BLOCKED, s),
  );
  assert.deepEqual(
    unclassified,
    [],
    'These SKILL.md invoke another skill\'s script with no resolution rule and no registered '
      + 'reason. Add CANON before the first cross-skill placeholder, or add a BLOCKED entry '
      + `saying why not:\n    ${unclassified.join('\n    ')}`,
  );
});

for (const skill of COVERED) {
  test(`${skill}: carries the resolution + STOP sentence verbatim`, () => {
    const text = read(`${skill}/SKILL.md`);
    const at = text.indexOf(CANON);
    assert.notEqual(
      at,
      -1,
      `${skill}/SKILL.md no longer states the sentence verbatim. A reworded copy is how the `
        + 'set drifts apart one skill at a time — restore it, or move the skill to BLOCKED '
        + 'with a reason.',
    );
    assert.equal(
      text.indexOf(CANON, at + 1),
      -1,
      `${skill}/SKILL.md states the sentence more than once — it is paid every session.`,
    );
  });

  test(`${skill}: states it BEFORE the first cross-skill call`, () => {
    const text = read(`${skill}/SKILL.md`);
    const refs = crossRefs(skill);
    assert.ok(refs.length > 0, `${skill} is in COVERED but has no cross-skill placeholder`);
    assert.ok(
      text.indexOf(CANON) < refs[0].at,
      `${skill}/SKILL.md states the rule at char ${text.indexOf(CANON)}, after the first `
        + `<${refs[0].target}-base-dir> at char ${refs[0].at}. A rule the model reads after `
        + 'it has already gone hunting is a rule that did not fire.',
    );
  });

  test(`${skill}: the sentence survives a compaction`, () => {
    const text = read(`${skill}/SKILL.md`);
    assert.ok(
      text.indexOf(CANON) + CANON.length <= CAP,
      `${skill}/SKILL.md pushes the sentence past the ${CAP}-char compaction cut, so a `
        + 'resumed run — exactly when a controller re-derives paths — no longer has it.',
    );
  });
}

for (const [skill, entry] of Object.entries(BLOCKED)) {
  test(`${skill}: the no-room exemption is still true`, () => {
    const size = read(`${skill}/SKILL.md`).length;
    assert.ok(
      entry.reason && entry.reason.length > 80,
      `${skill} is exempt with no written reason.`,
    );
    assert.ok(
      size + CANON_COST > CAP,
      `${skill}/SKILL.md is now ${size} chars, so the sentence (${CANON_COST}) fits under `
        + `${CAP} with ${CAP - size - CANON_COST} to spare. The budget that justified this `
        + 'exemption is gone: add CANON before the first cross-skill placeholder and move '
        + 'the skill into COVERED.',
    );
  });
}

/*
 * A second failure mode of the same placeholder, found by simulating a real entry into
 * super.subagent-driven-development against a consumer's tasks index.
 *
 * The controller resolved all six `<super.X-base-dir>` placeholders correctly and ran all
 * six commands. Then it flagged, unprompted, two commands that carried NO placeholder:
 *
 *     node scripts/parse-tasks.cjs --tasks-index <path>
 *     node scripts/setup-qa-tsconfig.cjs --ensure-templates ...
 *
 * A bare relative `scripts/` path only resolves when the process cwd is the skill's own
 * directory. It never is: the cwd is the repository being worked on. So the command is
 * wrong wherever it is pasted, and — unlike an unresolved placeholder, which at least looks
 * unfinished — it looks perfectly runnable. It fails with ENOENT, which reads as "the script
 * is missing from this environment" rather than "the path was built wrong".
 *
 * Scope is SKILL.md: that is the copy the model has in context while executing, and the copy
 * it pastes from. A prose MENTION of a filename (`see \`scripts/foo.cjs\``) is left alone —
 * it names a file, it does not hand over a command.
 */
test('no SKILL.md hands over a runnable command with a bare relative scripts/ path', () => {
  const INVOCATION = /(?:^|[\s`>|(])(node|python3|python|sh|bash)\s+scripts\//gm;
  const offenders = [];
  for (const dir of fs.readdirSync(SKILLS).filter((d) => d.startsWith('super.'))) {
    const abs = path.join(SKILLS, dir, 'SKILL.md');
    if (!fs.existsSync(abs)) continue;
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, i) => {
      INVOCATION.lastIndex = 0;
      if (INVOCATION.test(line)) offenders.push(`${dir}/SKILL.md:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(
    offenders, [],
    'a relative `scripts/` path resolves only if the cwd is the skill directory, and it never '
    + 'is — the cwd is the repo being worked on. Qualify it with the skill\'s own '
    + '`<super.X-base-dir>` placeholder, the same form used for a sibling. This fails as '
    + 'ENOENT, which the model reads as a missing script rather than a bad path.',
  );
});
